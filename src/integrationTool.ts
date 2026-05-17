import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';

// ── HTTP helper ───────────────────────────────────────────────────────────────

interface HttpResponse { status: number; data: unknown; }

function makeHttpRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: unknown
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try { parsed = new URL(url); } catch { reject(new Error(`Invalid URL: ${url}`)); return; }

    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...headers,
    };
    if (bodyStr) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr).toString();
    }

    const port = parsed.port ? parseInt(parsed.port, 10) : isHttps ? 443 : 80;
    const req = transport.request(
      { hostname: parsed.hostname, port, path: parsed.pathname + (parsed.search || ''), method, headers: reqHeaders },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try { resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode ?? 0, data: raw }); }
        });
      }
    );
    req.on('error', reject);
    if (bodyStr) { req.write(bodyStr); }
    req.end();
  });
}

function getAuthHeader(email: string, token: string): string {
  if (email) {
    return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
  }
  return `Bearer ${token}`;
}

// ── Jira helpers ─────────────────────────────────────────────────────────────

async function textToAdf(text: string) {
  try {
    const mod = await import('markdown-to-adf');
    return mod.markdownToAdf(text);
  } catch (e) {
    // Fallback if import fails
    return {
      type: 'doc', version: 1,
      content: text.split('\n\n').filter(p => p.trim()).map(para => ({
        type: 'paragraph',
        content: [{ type: 'text', text: para.trim() }]
      }))
    };
  }
}

function extractAdfText(adf: unknown): string {
  if (typeof adf === 'string') { return adf; }
  const node = adf as Record<string, unknown>;
  if (!node) { return ''; }
  if (node.type === 'text') { return String(node.text || ''); }
  if (Array.isArray(node.content)) {
    return (node.content as unknown[]).map(extractAdfText).join(' ');
  }
  return '';
}

function fmtIssue(issue: Record<string, unknown>, base: string): string {
  const f = (issue.fields || {}) as Record<string, unknown>;
  const status = (f.status as Record<string, unknown>)?.name ?? 'Unknown';
  const priority = (f.priority as Record<string, unknown>)?.name ?? 'None';
  const issueType = (f.issuetype as Record<string, unknown>)?.name ?? 'Unknown';
  const assignee = (f.assignee as Record<string, unknown>)?.displayName ?? 'Unassigned';
  const labels = Array.isArray(f.labels) ? (f.labels as string[]).join(', ') : '';
  const lines = [
    `**${issue.key}**: ${f.summary ?? ''}`,
    `Type: ${issueType} | Status: ${status} | Priority: ${priority}`,
    `Assignee: ${assignee}${labels ? ` | Labels: ${labels}` : ''}`,
    f.description ? `Description: ${extractAdfText(f.description)}` : '',
    `URL: ${base}/browse/${issue.key}`,
  ];
  return lines.filter(Boolean).join('\n');
}

// ── Jira operations ───────────────────────────────────────────────────────────

type JiraInput =
  | { op: 'search'; jql: string; maxResults?: number }
  | { op: 'get'; issueKey: string }
  | { op: 'create'; project: string; summary: string; description?: string; issueType?: string; priority?: string; assignee?: string; labels?: string[] }
  | { op: 'update'; issueKey: string; summary?: string; description?: string; priority?: string; assignee?: string; labels?: string[] }
  | { op: 'comment'; issueKey: string; body: string }
  | { op: 'listTransitions'; issueKey: string }
  | { op: 'transition'; issueKey: string; transitionId: string };

async function handleJiraOp(baseUrl: string, authHeader: string, input: JiraInput): Promise<string> {
  const base = baseUrl.replace(/\/$/, '');
  const api = `${base}/rest/api/3`;
  const h = { Authorization: authHeader };

  switch (input.op) {

    case 'search': {
      const qs = new URLSearchParams({
        jql: input.jql,
        maxResults: String(input.maxResults ?? 20),
        fields: 'summary,status,assignee,priority,issuetype,labels,created,updated',
      });
      const r = await makeHttpRequest(`${api}/search?${qs}`, 'GET', h);
      if (r.status !== 200) { return `Error ${r.status}: ${JSON.stringify(r.data)}`; }
      const d = r.data as Record<string, unknown>;
      const issues = (d.issues as unknown[]) ?? [];
      if (!issues.length) { return 'No issues found.'; }
      return `Found ${d.total} issue(s) (showing ${issues.length}):\n\n` +
        issues.map(i => fmtIssue(i as Record<string, unknown>, base)).join('\n\n---\n\n');
    }

    case 'get': {
      const fields = 'summary,status,assignee,priority,issuetype,description,comment,labels,created,updated';
      const r = await makeHttpRequest(`${api}/issue/${input.issueKey}?fields=${fields}`, 'GET', h);
      if (r.status !== 200) { return `Error ${r.status}: ${JSON.stringify(r.data)}`; }
      const issue = r.data as Record<string, unknown>;
      const f = (issue.fields || {}) as Record<string, unknown>;
      const commentsObj = f.comment as Record<string, unknown> | undefined;
      const recentComments = ((commentsObj?.comments as unknown[]) ?? []).slice(-3);
      const commentText = recentComments.length > 0
        ? '\n\nRecent comments:\n' + recentComments.map((c: unknown) => {
            const co = c as Record<string, unknown>;
            const author = (co.author as Record<string, unknown>)?.displayName ?? 'Unknown';
            return `  [${author}]: ${extractAdfText(co.body)}`;
          }).join('\n')
        : '';
      return fmtIssue(issue, base) + commentText;
    }

    case 'create': {
      const fields: Record<string, unknown> = {
        project: { key: input.project },
        summary: input.summary,
        issuetype: { name: input.issueType ?? 'Task' },
      };
      if (input.description) { fields['description'] = await textToAdf(input.description); }
      if (input.priority) { fields['priority'] = { name: input.priority }; }
      if (input.assignee) { fields['assignee'] = { accountId: input.assignee }; }
      if (input.labels?.length) { fields['labels'] = input.labels; }
      const r = await makeHttpRequest(`${api}/issue`, 'POST', h, { fields });
      if (r.status !== 201) { return `Error ${r.status}: ${JSON.stringify(r.data)}`; }
      const d = r.data as Record<string, unknown>;
      return `✅ Issue created: **${d.key}**\nURL: ${base}/browse/${d.key}`;
    }

    case 'update': {
      const fields: Record<string, unknown> = {};
      if (input.summary) { fields['summary'] = input.summary; }
      if (input.description) { fields['description'] = await textToAdf(input.description); }
      if (input.priority) { fields['priority'] = { name: input.priority }; }
      if (input.assignee) { fields['assignee'] = { accountId: input.assignee }; }
      if (input.labels) { fields['labels'] = input.labels; }
      const r = await makeHttpRequest(`${api}/issue/${input.issueKey}`, 'PUT', h, { fields });
      if (r.status !== 204) { return `Error ${r.status}: ${JSON.stringify(r.data)}`; }
      return `✅ Issue **${input.issueKey}** updated.\nURL: ${base}/browse/${input.issueKey}`;
    }

    case 'comment': {
      const body = await textToAdf(input.body);
      const r = await makeHttpRequest(`${api}/issue/${input.issueKey}/comment`, 'POST', h, { body });
      if (r.status !== 201) { return `Error ${r.status}: ${JSON.stringify(r.data)}`; }
      return `✅ Comment added to **${input.issueKey}**.`;
    }

    case 'listTransitions': {
      const r = await makeHttpRequest(`${api}/issue/${input.issueKey}/transitions`, 'GET', h);
      if (r.status !== 200) { return `Error ${r.status}: ${JSON.stringify(r.data)}`; }
      const d = r.data as Record<string, unknown>;
      const transitions = (d.transitions as unknown[]) ?? [];
      return `Available transitions for ${input.issueKey}:\n` +
        transitions.map((t: unknown) => {
          const tr = t as Record<string, unknown>;
          return `  id: ${tr.id} → ${(tr.to as Record<string, unknown>)?.name ?? tr.name}`;
        }).join('\n');
    }

    case 'transition': {
      const r = await makeHttpRequest(
        `${api}/issue/${input.issueKey}/transitions`, 'POST', h,
        { transition: { id: input.transitionId } }
      );
      if (r.status !== 204) { return `Error ${r.status}: ${JSON.stringify(r.data)}`; }
      return `✅ Issue **${input.issueKey}** transitioned successfully.`;
    }

    default:
      return `Unknown op: ${(input as { op: string }).op}`;
  }
}

// ── Confluence helpers ────────────────────────────────────────────────────────

function fmtPage(page: Record<string, unknown>, base: string): string {
  const space = (page.space as Record<string, unknown>)?.key ?? '';
  const ver = (page.version as Record<string, unknown>)?.number ?? '';
  const lines = [
    `**${page.title}** (ID: ${page.id})`,
    `Space: ${space} | Version: ${ver}`,
    `URL: ${base}/wiki${page._links ? (page._links as Record<string, unknown>).webui ?? '' : ''}`,
  ];
  return lines.filter(Boolean).join('\n');
}

// ── Confluence operations ─────────────────────────────────────────────────────

type ConfluenceInput =
  | { op: 'search'; cql: string; limit?: number }
  | { op: 'get'; pageId: string }
  | { op: 'getByTitle'; spaceKey: string; title: string }
  | { op: 'create'; spaceKey: string; title: string; body: string; parentId?: string }
  | { op: 'update'; pageId: string; title: string; body: string; version: number }
  | { op: 'getSpaces' };

async function handleConfluenceOp(baseUrl: string, authHeader: string, input: ConfluenceInput): Promise<string> {
  const base = baseUrl.replace(/\/$/, '');
  const api = `${base}/wiki/rest/api`;
  const h = { Authorization: authHeader };

  switch (input.op) {

    case 'search': {
      const qs = new URLSearchParams({
        cql: input.cql,
        limit: String(input.limit ?? 20),
        expand: 'space,version',
      });
      const r = await makeHttpRequest(`${api}/content/search?${qs}`, 'GET', h);
      if (r.status !== 200) { return `Error ${r.status}: ${JSON.stringify(r.data)}`; }
      const d = r.data as Record<string, unknown>;
      const results = (d.results as unknown[]) ?? [];
      if (!results.length) { return 'No pages found.'; }
      return `Found ${d.totalSize ?? results.length} result(s):\n\n` +
        results.map(p => fmtPage(p as Record<string, unknown>, base)).join('\n\n---\n\n');
    }

    case 'get': {
      const r = await makeHttpRequest(`${api}/content/${input.pageId}?expand=body.storage,version,space`, 'GET', h);
      if (r.status !== 200) { return `Error ${r.status}: ${JSON.stringify(r.data)}`; }
      const page = r.data as Record<string, unknown>;
      const bodyVal = ((page.body as Record<string, unknown>)?.storage as Record<string, unknown>)?.value ?? '';
      return fmtPage(page, base) + `\n\nContent (storage format):\n${bodyVal}`;
    }

    case 'getByTitle': {
      const qs = new URLSearchParams({
        spaceKey: input.spaceKey,
        title: input.title,
        expand: 'body.storage,version,space',
      });
      const r = await makeHttpRequest(`${api}/content?${qs}`, 'GET', h);
      if (r.status !== 200) { return `Error ${r.status}: ${JSON.stringify(r.data)}`; }
      const d = r.data as Record<string, unknown>;
      const results = (d.results as unknown[]) ?? [];
      if (!results.length) { return `No page found with title "${input.title}" in space ${input.spaceKey}.`; }
      const page = results[0] as Record<string, unknown>;
      const bodyVal = ((page.body as Record<string, unknown>)?.storage as Record<string, unknown>)?.value ?? '';
      return fmtPage(page, base) + `\n\nContent (storage format):\n${bodyVal}`;
    }

    case 'create': {
      let storageBody = input.body;
      try {
        const { marked } = await import('marked');
        storageBody = await marked.parse(input.body);
      } catch (e) { /* fallback to plain body if marked fails */ }

      const payload: Record<string, unknown> = {
        type: 'page',
        title: input.title,
        space: { key: input.spaceKey },
        body: { storage: { value: storageBody, representation: 'storage' } },
      };
      if (input.parentId) { payload['ancestors'] = [{ id: input.parentId }]; }
      const r = await makeHttpRequest(`${api}/content`, 'POST', h, payload);
      if (r.status !== 200) { return `Error ${r.status}: ${JSON.stringify(r.data)}`; }
      const page = r.data as Record<string, unknown>;
      const links = (page._links as Record<string, unknown>) ?? {};
      return `✅ Page created: **${page.title}** (ID: ${page.id})\nURL: ${base}/wiki${links.webui ?? ''}`;
    }

    case 'update': {
      let storageBody = input.body;
      try {
        const { marked } = await import('marked');
        storageBody = await marked.parse(input.body);
      } catch (e) { /* fallback to plain body if marked fails */ }

      const payload = {
        type: 'page',
        title: input.title,
        version: { number: input.version },
        body: { storage: { value: storageBody, representation: 'storage' } },
      };
      const r = await makeHttpRequest(`${api}/content/${input.pageId}`, 'PUT', h, payload);
      if (r.status !== 200) { return `Error ${r.status}: ${JSON.stringify(r.data)}`; }
      const page = r.data as Record<string, unknown>;
      const links = (page._links as Record<string, unknown>) ?? {};
      return `✅ Page updated: **${page.title}** (ID: ${page.id}, v${(page.version as Record<string, unknown>)?.number})\nURL: ${base}/wiki${links.webui ?? ''}`;
    }

    case 'getSpaces': {
      const r = await makeHttpRequest(`${api}/space?limit=50&expand=description.plain`, 'GET', h);
      if (r.status !== 200) { return `Error ${r.status}: ${JSON.stringify(r.data)}`; }
      const d = r.data as Record<string, unknown>;
      const spaces = (d.results as unknown[]) ?? [];
      return `Available spaces (${spaces.length}):\n` +
        spaces.map((s: unknown) => {
          const sp = s as Record<string, unknown>;
          const desc = ((sp.description as Record<string, unknown>)?.plain as Record<string, unknown>)?.value ?? '';
          return `  **${sp.key}** — ${sp.name}${desc ? `: ${desc}` : ''}`;
        }).join('\n');
    }

    default:
      return `Unknown op: ${(input as { op: string }).op}`;
  }
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerJiraTool(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.lm.registerTool<JiraInput>('shane_skills_jira', {
    async invoke(options, _token) {
      const input = options.input;
      const cfg = vscode.workspace.getConfiguration('superpowers');
      const baseUrl = cfg.get<string>('jira.baseUrl', '').trim();
      const email = cfg.get<string>('jira.email', '').trim();
      const apiToken = await context.secrets.get('superpowers.jira.token');

      if (!baseUrl || !apiToken) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            '❌ Jira is not configured. Open **Shane Skills → Configure Skills & Agents**, scroll to Integrations, and enter your Jira Base URL and Personal Access Token.'
          ),
        ]);
      }

      try {
        const result = await handleJiraOp(baseUrl, getAuthHeader(email, apiToken), input);
        return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(result)]);
      } catch (err) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(`❌ Jira API error: ${err instanceof Error ? err.message : String(err)}`),
        ]);
      }
    },
  });
}

export function registerConfluenceTool(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.lm.registerTool<ConfluenceInput>('shane_skills_confluence', {
    async invoke(options, _token) {
      const input = options.input;
      const cfg = vscode.workspace.getConfiguration('superpowers');
      const baseUrl = cfg.get<string>('confluence.baseUrl', '').trim();
      const email = cfg.get<string>('confluence.email', '').trim();
      const apiToken = await context.secrets.get('superpowers.confluence.token');

      if (!baseUrl || !apiToken) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            '❌ Confluence is not configured. Open **Shane Skills → Configure Skills & Agents**, scroll to Integrations, and enter your Confluence Base URL and Personal Access Token.'
          ),
        ]);
      }

      try {
        const result = await handleConfluenceOp(baseUrl, getAuthHeader(email, apiToken), input);
        return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(result)]);
      } catch (err) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(`❌ Confluence API error: ${err instanceof Error ? err.message : String(err)}`),
        ]);
      }
    },
  });
}
