import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { readAgents, AgentInfo } from './workspaceSetup';

let currentPanel: vscode.WebviewPanel | undefined;

export function openAgentsBrowserPanel(context: vscode.ExtensionContext): void {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'shaneSkillsAgents',
    'Shane Skills — Agent Browser',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  currentPanel.onDidDispose(() => { currentPanel = undefined; }, null, context.subscriptions);

  const allAgents = readAgents(context.extensionPath);

  // Check which agents are installed in the current workspace
  const workspace = vscode.workspace.workspaceFolders?.[0];
  const installedIds = new Set<string>();
  if (workspace) {
    const wsAgentsDir = path.join(workspace.uri.fsPath, '.github', 'agents');
    if (fs.existsSync(wsAgentsDir)) {
      fs.readdirSync(wsAgentsDir)
        .filter(f => f.endsWith('.agent.md'))
        .forEach(f => installedIds.add(f.replace('.agent.md', '')));
    }
  }

  currentPanel.webview.html = buildAgentsBrowserHtml(allAgents, installedIds);

  currentPanel.webview.onDidReceiveMessage(
    async (msg: { type: string; agentId: string; installed: boolean }) => {
      if (msg.type === 'openAgent') {
        let filePath: string | undefined;

        // Prefer the workspace-installed version
        if (msg.installed && workspace) {
          const wsPath = path.join(
            workspace.uri.fsPath, '.github', 'agents', msg.agentId + '.agent.md'
          );
          if (fs.existsSync(wsPath)) filePath = wsPath;
        }

        // Fall back to the bundled template
        if (!filePath) {
          const tplPath = path.join(
            context.extensionPath, 'templates', 'agents', msg.agentId + '.agent.md'
          );
          if (fs.existsSync(tplPath)) filePath = tplPath;
        }

        if (filePath) {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
          await vscode.window.showTextDocument(doc, { preview: false });
        }
      }
    },
    undefined,
    context.subscriptions
  );
}

// ── HTML ─────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildAgentsBrowserHtml(agents: AgentInfo[], installedIds: Set<string>): string {
  const cards = agents.map(a => {
    const installed = installedIds.has(a.id);
    const badgeHtml = installed
      ? `<span class="badge badge-ok">✓ Installed</span>`
      : `<span class="badge badge-tpl">Template</span>`;
    const hint = installed
      ? `.github/agents/${esc(a.id)}.agent.md`
      : `bundled template`;

    return `
    <div class="agent-card" onclick="openAgent('${esc(a.id)}', ${installed})">
      <div class="header">
        <div class="title">
          <span>🤖 ${esc(a.displayName)}</span>
          <code class="agent-id">${esc(a.id)}.agent.md</code>
        </div>
        ${badgeHtml}
      </div>
      <div class="desc">${esc(a.description || 'No description.')}</div>
      <div class="actions">
        <span class="badge badge-type">🤖 agent</span>
        <span class="cmd">${hint}</span>
        <span class="open-hint">Open →</span>
      </div>
    </div>`;
  }).join('\n');

  const total = agents.length;
  const installed = agents.filter(a => installedIds.has(a.id)).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Shane Skills — Agent Browser</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --card-bg: var(--vscode-editorWidget-background, #1e1e2e);
      --accent: var(--vscode-focusBorder, #7c3aed);
      --badge-bg: var(--vscode-badge-background, #7c3aed);
      --badge-fg: var(--vscode-badge-foreground, #fff);
      --border: var(--vscode-panel-border, #3b3b52);
      --cmd-bg: var(--vscode-textCodeBlock-background, #0d1117);
      --muted: var(--vscode-descriptionForeground, #888);
      --ok: #22c55e;
    }
    body { font-family: var(--vscode-font-family,'Segoe UI',sans-serif); background:var(--bg); color:var(--fg); padding:24px; margin:0; }
    h1 { font-size:1.5rem; margin-bottom:4px; }
    .subtitle { opacity:.65; margin-bottom:6px; font-size:.9rem; }
    .stats { font-size:.8rem; opacity:.65; margin-bottom:24px; }
    .stats strong { color:var(--fg); opacity:1; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:16px; }
    .agent-card { background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:16px; cursor:pointer; transition:border-color .2s, box-shadow .2s; }
    .agent-card:hover { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent); }
    .header { display:flex; align-items:flex-start; gap:8px; margin-bottom:8px; }
    .title { flex:1; min-width:0; }
    .title span { font-size:1rem; font-weight:600; color:var(--accent); }
    .title .agent-id { font-size:.72rem; background:var(--cmd-bg); padding:1px 6px; border-radius:3px; color:var(--muted); font-family:monospace; margin-left:6px; }
    .desc { font-size:.85rem; line-height:1.5; opacity:.8; margin-bottom:12px; }
    .actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .badge { border-radius:20px; padding:2px 10px; font-size:.72rem; font-weight:600; white-space:nowrap; flex-shrink:0; }
    .badge-ok { background:rgba(34,197,94,.12); color:var(--ok); border:1px solid rgba(34,197,94,.3); }
    .badge-tpl { background:rgba(124,58,237,.15); color:#a78bfa; border:1px solid rgba(124,58,237,.3); }
    .badge-type { background:var(--badge-bg); color:var(--badge-fg); border-radius:4px; padding:2px 8px; font-size:.75rem; }
    .cmd { background:var(--cmd-bg); color:var(--fg); border-radius:4px; padding:2px 8px; font-size:.75rem; font-family:monospace; opacity:.9; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:50%; }
    .open-hint { margin-left:auto; font-size:.75rem; color:var(--accent); font-weight:600; opacity:0; transition:opacity .15s; }
    .agent-card:hover .open-hint { opacity:1; }
    .empty { text-align:center; padding:60px 20px; opacity:.65; }
  </style>
</head>
<body>
  <h1>🤖 Shane Skills — Agent Browser</h1>
  <p class="subtitle">Click any agent to open its definition file.</p>
  <p class="stats"><strong>${installed}</strong> installed in workspace &nbsp;·&nbsp; <strong>${total}</strong> total available</p>
  ${agents.length === 0 ? '<div class="empty">No agents found.</div>' : `<div class="grid">${cards}</div>`}
  <script>
    const vscode = acquireVsCodeApi();
    function openAgent(id, installed) {
      vscode.postMessage({ type: 'openAgent', agentId: id, installed });
    }
  </script>
</body>
</html>`;
}
