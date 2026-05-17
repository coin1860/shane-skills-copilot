import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SkillRegistry, Skill } from './skillRegistry';

// ── Agent metadata ────────────────────────────────────────────────────────────

export interface AgentInfo {
  /** Filename stem, e.g. "superpowers-implementer" */
  id: string;
  /** Human-readable name from frontmatter */
  displayName: string;
  /** Description from frontmatter */
  description: string;
}

/**
 * Parses the YAML frontmatter of a .agent.md file to extract name and description.
 */
function parseAgentFrontmatter(raw: string): { name: string; description: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: '', description: '' };

  const fm = match[1];
  const result: Record<string, string> = {};
  for (const line of fm.split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const key = line.slice(0, colon).trim();
      const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
      result[key] = val;
    }
  }
  return { name: result['name'] ?? '', description: result['description'] ?? '' };
}

/**
 * Reads all .agent.md template files and returns structured AgentInfo objects.
 */
export function readAgents(extensionPath: string): AgentInfo[] {
  const agentsDir = path.join(extensionPath, 'templates', 'agents');
  if (!fs.existsSync(agentsDir)) return [];

  return fs
    .readdirSync(agentsDir)
    .filter(f => f.endsWith('.agent.md'))
    .map(f => {
      const id = f.replace('.agent.md', '');
      let displayName = id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      let description = '';

      try {
        const content = fs.readFileSync(path.join(agentsDir, f), 'utf8');
        const fm = parseAgentFrontmatter(content);
        if (fm.name) displayName = fm.name;
        if (fm.description) description = fm.description;
      } catch { /* ignore */ }

      return { id, displayName, description };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ── Panel entry-point ─────────────────────────────────────────────────────────

let currentPanel: vscode.WebviewPanel | undefined;

export async function openSettingsPanel(
  context: vscode.ExtensionContext,
  registry: SkillRegistry
): Promise<void> {
  // Reuse existing panel if open
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'shaneSkillsSettings',
    'Shane Skills — Configure',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  currentPanel.onDidDispose(() => { currentPanel = undefined; }, null, context.subscriptions);

  const config = vscode.workspace.getConfiguration('superpowers');
  const enabledSkills = config.get<string[]>('enabledSkills', []);
  const enabledAgents = config.get<string[]>('enabledAgents', []);

  const allSkills = registry.getAllSkills().sort((a, b) =>
    a.metadata.name.localeCompare(b.metadata.name)
  );
  const allAgents = readAgents(context.extensionPath);

  // Read integration config
  const jiraBaseUrl = config.get<string>('jira.baseUrl', '');
  const jiraEmail = config.get<string>('jira.email', '');
  const confluenceBaseUrl = config.get<string>('confluence.baseUrl', '');
  const confluenceEmail = config.get<string>('confluence.email', '');
  const jiraTokenSet = !!(await context.secrets.get('superpowers.jira.token'));
  const confluenceTokenSet = !!(await context.secrets.get('superpowers.confluence.token'));

  currentPanel.webview.html = buildSettingsHtml(
    allSkills, allAgents, enabledSkills, enabledAgents,
    { jiraBaseUrl, jiraEmail, jiraTokenSet, confluenceBaseUrl, confluenceEmail, confluenceTokenSet }
  );

  // Handle messages from the webview
  currentPanel.webview.onDidReceiveMessage(
    async (msg: {
      type: string;
      enabledSkills: string[];
      enabledAgents: string[];
      jiraBaseUrl?: string;
      jiraEmail?: string;
      jiraToken?: string;
      confluenceBaseUrl?: string;
      confluenceEmail?: string;
      confluenceToken?: string;
    }) => {
      if (msg.type === 'save') {
        const cfg = vscode.workspace.getConfiguration('superpowers');
        await cfg.update('enabledSkills', msg.enabledSkills, vscode.ConfigurationTarget.Global);
        await cfg.update('enabledAgents', msg.enabledAgents, vscode.ConfigurationTarget.Global);

        // Save integration URLs/emails
        if (msg.jiraBaseUrl !== undefined) {
          await cfg.update('jira.baseUrl', msg.jiraBaseUrl.trim(), vscode.ConfigurationTarget.Global);
        }
        if (msg.jiraEmail !== undefined) {
          await cfg.update('jira.email', msg.jiraEmail.trim(), vscode.ConfigurationTarget.Global);
        }
        if (msg.confluenceBaseUrl !== undefined) {
          await cfg.update('confluence.baseUrl', msg.confluenceBaseUrl.trim(), vscode.ConfigurationTarget.Global);
        }
        if (msg.confluenceEmail !== undefined) {
          await cfg.update('confluence.email', msg.confluenceEmail.trim(), vscode.ConfigurationTarget.Global);
        }

        // Save tokens to SecretStorage (only if non-empty)
        if (msg.jiraToken) {
          await context.secrets.store('superpowers.jira.token', msg.jiraToken);
        }
        if (msg.confluenceToken) {
          await context.secrets.store('superpowers.confluence.token', msg.confluenceToken);
        }

        vscode.window.showInformationMessage(
          `✅ Shane Skills configuration saved — ${msg.enabledSkills.length === 0 ? 'all' : msg.enabledSkills.length} skill(s) and ${msg.enabledAgents.length === 0 ? 'all' : msg.enabledAgents.length} agent(s) enabled.`
        );
        currentPanel?.dispose();
      } else if (msg.type === 'clearToken') {
        const key = (msg as unknown as { key: string }).key;
        if (key === 'jira') { await context.secrets.delete('superpowers.jira.token'); }
        if (key === 'confluence') { await context.secrets.delete('superpowers.confluence.token'); }
        vscode.window.showInformationMessage(`🗑️ ${key.charAt(0).toUpperCase() + key.slice(1)} token cleared.`);
        // Refresh panel
        currentPanel?.dispose();
        openSettingsPanel(context, registry);
      } else if (msg.type === 'cancel') {
        currentPanel?.dispose();
      }
    },
    undefined,
    context.subscriptions
  );
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface IntegrationConfig {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraTokenSet: boolean;
  confluenceBaseUrl: string;
  confluenceEmail: string;
  confluenceTokenSet: boolean;
}

function buildSettingsHtml(
  skills: Skill[],
  agents: AgentInfo[],
  enabledSkills: string[],
  enabledAgents: string[],
  integrations: IntegrationConfig
): string {
  const allSkillsEnabled = enabledSkills.length === 0;
  const allAgentsEnabled = enabledAgents.length === 0;

  const skillRows = skills.map(s => {
    const checked = allSkillsEnabled || enabledSkills.includes(s.metadata.name) ? 'checked' : '';
    const desc = esc(s.metadata.description || 'No description.');
    const name = esc(s.metadata.name);
    return `
      <label class="item-row">
        <input type="checkbox" class="skill-cb" value="${name}" ${checked} />
        <div class="item-info">
          <span class="item-name">${name}</span>
          <span class="item-desc">${desc}</span>
        </div>
      </label>`;
  }).join('\n');

  const agentRows = agents.map(a => {
    const checked = allAgentsEnabled || enabledAgents.includes(a.id) ? 'checked' : '';
    const desc = esc(a.description || 'No description.');
    const name = esc(a.displayName);
    return `
      <label class="item-row">
        <input type="checkbox" class="agent-cb" value="${esc(a.id)}" ${checked} />
        <div class="item-info">
          <span class="item-name">${name}</span>
          <span class="item-desc">${desc}</span>
        </div>
      </label>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Shane Skills — Configure</title>
  <style>
    :root {
      --bg:       var(--vscode-editor-background);
      --fg:       var(--vscode-editor-foreground);
      --card:     var(--vscode-editorWidget-background, #1e1e2e);
      --border:   var(--vscode-panel-border, #3b3b52);
      --accent:   var(--vscode-focusBorder, #7c3aed);
      --muted:    var(--vscode-descriptionForeground, #888);
      --badge:    var(--vscode-badge-background, #7c3aed);
      --badge-fg: var(--vscode-badge-foreground, #fff);
      --hover:    var(--vscode-list-hoverBackground, rgba(255,255,255,0.05));
      --success:  #22c55e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      background: var(--bg); color: var(--fg);
      padding: 32px 40px; max-width: 900px; margin: 0 auto;
    }
    .page-header {
      display: flex; align-items: center; gap: 12px;
      margin-bottom: 8px;
    }
    .page-header h1 { font-size: 1.6rem; font-weight: 700; }
    .page-subtitle { color: var(--muted); font-size: .9rem; margin-bottom: 36px; line-height: 1.6; }

    /* Section */
    .section { margin-bottom: 40px; }
    .section-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px; padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
    }
    .section-header h2 { font-size: 1.1rem; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .badge-count {
      background: var(--badge); color: var(--badge-fg);
      border-radius: 20px; padding: 2px 10px; font-size: .75rem; font-weight: 600;
    }
    .section-actions { display: flex; gap: 8px; }
    .link-btn {
      background: none; border: none; color: var(--accent);
      cursor: pointer; font-size: .82rem; padding: 4px 8px;
      border-radius: 4px; transition: background .15s;
    }
    .link-btn:hover { background: var(--hover); }
    .section-hint { color: var(--muted); font-size: .82rem; margin-bottom: 14px; }

    /* Item list */
    .item-list { display: flex; flex-direction: column; gap: 4px; }
    .item-row {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 10px 14px; border-radius: 8px;
      cursor: pointer; transition: background .15s;
      border: 1px solid transparent;
    }
    .item-row:hover { background: var(--hover); border-color: var(--border); }
    .item-row input[type="checkbox"] {
      margin-top: 3px; flex-shrink: 0;
      width: 16px; height: 16px; cursor: pointer;
      accent-color: var(--accent);
    }
    .item-info { display: flex; flex-direction: column; gap: 3px; }
    .item-name { font-size: .92rem; font-weight: 600; }
    .item-desc { font-size: .8rem; color: var(--muted); line-height: 1.4; }

    /* Footer bar */
    .footer {
      position: sticky; bottom: 0;
      background: var(--bg); border-top: 1px solid var(--border);
      padding: 16px 0; margin-top: 32px;
      display: flex; gap: 12px; align-items: center;
    }
    .btn-save {
      background: var(--accent); color: #fff;
      border: none; border-radius: 6px;
      padding: 10px 28px; font-size: .95rem; font-weight: 600;
      cursor: pointer; transition: opacity .15s;
    }
    .btn-save:hover { opacity: .88; }
    .btn-cancel {
      background: none; border: 1px solid var(--border);
      border-radius: 6px; color: var(--fg);
      padding: 10px 20px; font-size: .9rem; cursor: pointer;
      transition: background .15s;
    }
    .btn-cancel:hover { background: var(--hover); }
    .footer-hint { color: var(--muted); font-size: .82rem; }

    /* Info box */
    .info-box {
      border-left: 3px solid var(--accent);
      background: var(--card); border-radius: 0 6px 6px 0;
      padding: 10px 14px; margin-bottom: 20px;
      font-size: .85rem; color: var(--muted); line-height: 1.5;
    }
    .info-box strong { color: var(--fg); }

    /* ── Integration cards ── */
    .integration-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 650px) { .integration-grid { grid-template-columns: 1fr; } }
    .int-card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 10px; padding: 18px 20px;
    }
    .int-card-header {
      display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
    }
    .int-logo {
      width: 32px; height: 32px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 1rem; font-weight: 800; flex-shrink: 0;
    }
    .int-logo.jira { background: #0052CC; color: #fff; }
    .int-logo.confluence { background: #0065FF; color: #fff; }
    .int-title { font-size: .95rem; font-weight: 700; }
    .int-subtitle { font-size: .78rem; color: var(--muted); }
    .int-status {
      margin-left: auto; font-size: .72rem; font-weight: 600;
      padding: 3px 10px; border-radius: 20px;
    }
    .int-status.set { background: rgba(34,197,94,.15); color: #22c55e; border: 1px solid rgba(34,197,94,.3); }
    .int-status.unset { background: rgba(255,255,255,.05); color: var(--muted); border: 1px solid var(--border); }

    .field-group { display: flex; flex-direction: column; gap: 10px; }
    .field label { display: block; font-size: .75rem; font-weight: 600; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: .04em; }
    .field input[type="text"],
    .field input[type="password"],
    .field input[type="url"] {
      width: 100%; background: var(--bg); color: var(--fg);
      border: 1px solid var(--border); border-radius: 6px;
      padding: 7px 10px; font-size: .85rem;
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      transition: border-color .15s;
    }
    .field input:focus { outline: none; border-color: var(--accent); }
    .token-row { display: flex; gap: 6px; }
    .token-row input { flex: 1; }
    .btn-clear {
      background: none; border: 1px solid var(--border); border-radius: 6px;
      color: var(--muted); font-size: .78rem; padding: 4px 10px;
      cursor: pointer; white-space: nowrap; transition: all .15s;
      flex-shrink: 0;
    }
    .btn-clear:hover { border-color: #ef4444; color: #ef4444; }
  </style>
</head>
<body>
  <div class="page-header">
    <span style="font-size:1.8rem;">⚡</span>
    <h1>Shane Skills — Configure</h1>
  </div>
  <p class="page-subtitle">
    Choose which skills and agents are active, and configure integrations.
    <strong>All skills and agents are enabled by default</strong> — uncheck any you don't want loaded.
  </p>

  <div class="info-box">
    💡 <strong>How it works:</strong> If you disable a skill, it won't be returned by 
    <code>#loadSkill</code> or slash commands like <code>/tdd</code>. 
    If you disable an agent, it won't be copied during <em>Workspace Setup</em>.
    Tokens are stored in VS Code's encrypted <strong>SecretStorage</strong> — never in plain settings.json.
  </div>

  <!-- ── Integrations ── -->
  <div class="section">
    <div class="section-header">
      <h2>🔗 Integrations</h2>
    </div>
    <p class="section-hint">
      Connect Jira and Confluence. Use <code>#jira</code> and <code>#confluence</code> tools in Copilot Chat once configured.
      For Atlassian Cloud: enter your email + API token. For Server/Data Center: leave email blank and use a Personal Access Token.
    </p>
    <div class="integration-grid">

      <!-- Jira -->
      <div class="int-card">
        <div class="int-card-header">
          <div class="int-logo jira">J</div>
          <div>
            <div class="int-title">Jira</div>
            <div class="int-subtitle">Issues, sprints &amp; workflows</div>
          </div>
          <span class="int-status ${integrations.jiraTokenSet ? 'set' : 'unset'}" id="jira-status">
            ${integrations.jiraTokenSet ? '● Connected' : '○ Not set'}
          </span>
        </div>
        <div class="field-group">
          <div class="field">
            <label>Base URL</label>
            <input type="url" id="jira-base-url" placeholder="https://yourcompany.atlassian.net"
              value="${esc(integrations.jiraBaseUrl)}" />
          </div>
          <div class="field">
            <label>Email (Cloud only)</label>
            <input type="text" id="jira-email" placeholder="you@company.com"
              value="${esc(integrations.jiraEmail)}" />
          </div>
          <div class="field">
            <label>Personal Access Token</label>
            <div class="token-row">
              <input type="password" id="jira-token"
                placeholder="${integrations.jiraTokenSet ? 'Token set — type to replace' : 'Paste your API token'}" />
              ${integrations.jiraTokenSet ? `<button class="btn-clear" onclick="clearToken('jira')">Clear</button>` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Confluence -->
      <div class="int-card">
        <div class="int-card-header">
          <div class="int-logo confluence">C</div>
          <div>
            <div class="int-title">Confluence</div>
            <div class="int-subtitle">Pages, spaces &amp; docs</div>
          </div>
          <span class="int-status ${integrations.confluenceTokenSet ? 'set' : 'unset'}" id="confluence-status">
            ${integrations.confluenceTokenSet ? '● Connected' : '○ Not set'}
          </span>
        </div>
        <div class="field-group">
          <div class="field">
            <label>Base URL</label>
            <input type="url" id="confluence-base-url" placeholder="https://yourcompany.atlassian.net"
              value="${esc(integrations.confluenceBaseUrl)}" />
          </div>
          <div class="field">
            <label>Email (Cloud only)</label>
            <input type="text" id="confluence-email" placeholder="you@company.com"
              value="${esc(integrations.confluenceEmail)}" />
          </div>
          <div class="field">
            <label>Personal Access Token</label>
            <div class="token-row">
              <input type="password" id="confluence-token"
                placeholder="${integrations.confluenceTokenSet ? 'Token set — type to replace' : 'Paste your API token'}" />
              ${integrations.confluenceTokenSet ? `<button class="btn-clear" onclick="clearToken('confluence')">Clear</button>` : ''}
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- ── Skills ── -->
  <div class="section">
    <div class="section-header">
      <h2>🎯 Skills <span class="badge-count" id="skill-count">0 / ${skills.length}</span></h2>
      <div class="section-actions">
        <button class="link-btn" onclick="toggleAll('skill-cb', true)">Select All</button>
        <button class="link-btn" onclick="toggleAll('skill-cb', false)">Deselect All</button>
      </div>
    </div>
    <p class="section-hint">
      Disabled skills are hidden from <code>#listSkills</code> and ignored when invoked via slash commands or <code>#loadSkill</code>.
    </p>
    <div class="item-list" id="skill-list">
      ${skillRows}
    </div>
  </div>

  <!-- ── Agents ── -->
  <div class="section">
    <div class="section-header">
      <h2>🤖 Agents <span class="badge-count" id="agent-count">0 / ${agents.length}</span></h2>
      <div class="section-actions">
        <button class="link-btn" onclick="toggleAll('agent-cb', true)">Select All</button>
        <button class="link-btn" onclick="toggleAll('agent-cb', false)">Deselect All</button>
      </div>
    </div>
    <p class="section-hint">
      Only selected agents will be offered during <em>Workspace Setup</em> (copied to <code>.github/agents/</code>).
    </p>
    <div class="item-list" id="agent-list">
      ${agentRows}
    </div>
  </div>

  <!-- ── Footer ── -->
  <div class="footer">
    <button class="btn-save" onclick="save()">Save Configuration</button>
    <button class="btn-cancel" onclick="cancel()">Cancel</button>
    <span class="footer-hint" id="footer-hint"></span>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function getChecked(cls) {
      return [...document.querySelectorAll('.' + cls)]
        .filter(cb => cb.checked)
        .map(cb => cb.value);
    }

    function updateCounts() {
      const skillChecked = getChecked('skill-cb').length;
      const agentChecked = getChecked('agent-cb').length;
      document.getElementById('skill-count').textContent = skillChecked + ' / ${skills.length}';
      document.getElementById('agent-count').textContent = agentChecked + ' / ${agents.length}';
    }

    function toggleAll(cls, checked) {
      document.querySelectorAll('.' + cls).forEach(cb => cb.checked = checked);
      updateCounts();
    }

    function clearToken(service) {
      vscode.postMessage({ type: 'clearToken', key: service });
    }

    function save() {
      const enabledSkills = getChecked('skill-cb');
      const enabledAgents = getChecked('agent-cb');
      const allSkills = document.querySelectorAll('.skill-cb').length;
      const allAgents = document.querySelectorAll('.agent-cb').length;

      vscode.postMessage({
        type: 'save',
        enabledSkills: enabledSkills.length === allSkills ? [] : enabledSkills,
        enabledAgents: enabledAgents.length === allAgents ? [] : enabledAgents,
        jiraBaseUrl:        document.getElementById('jira-base-url')?.value ?? '',
        jiraEmail:          document.getElementById('jira-email')?.value ?? '',
        jiraToken:          document.getElementById('jira-token')?.value ?? '',
        confluenceBaseUrl:  document.getElementById('confluence-base-url')?.value ?? '',
        confluenceEmail:    document.getElementById('confluence-email')?.value ?? '',
        confluenceToken:    document.getElementById('confluence-token')?.value ?? '',
      });
    }

    function cancel() {
      vscode.postMessage({ type: 'cancel' });
    }

    document.querySelectorAll('.skill-cb, .agent-cb').forEach(cb =>
      cb.addEventListener('change', updateCounts)
    );

    updateCounts();
  </script>
</body>
</html>`;
}
