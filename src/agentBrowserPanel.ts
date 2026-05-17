import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { readAgents, AgentInfo } from './settingsPanel';

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
    <div class="card" onclick="openAgent('${esc(a.id)}', ${installed})" title="Click to open ${esc(a.displayName)}">
      <div class="card-head">
        <span class="card-icon">🤖</span>
        <div class="card-title-wrap">
          <h3>${esc(a.displayName)}</h3>
          <code class="card-id">${esc(a.id)}.agent.md</code>
        </div>
        ${badgeHtml}
      </div>
      <p class="card-desc">${esc(a.description || 'No description.')}</p>
      <div class="card-foot">
        <span class="card-hint">📂 ${hint}</span>
        <span class="card-open">Open →</span>
      </div>
    </div>`;
  }).join('\n');

  const total = agents.length;
  const installed = agents.filter(a => installedIds.has(a.id)).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Shane Skills — Agent Browser</title>
  <style>
    :root {
      --bg:     var(--vscode-editor-background);
      --fg:     var(--vscode-editor-foreground);
      --card:   var(--vscode-editorWidget-background,#1e1e2e);
      --border: var(--vscode-panel-border,#3b3b52);
      --accent: var(--vscode-focusBorder,#7c3aed);
      --muted:  var(--vscode-descriptionForeground,#888);
      --ok:     #22c55e;
      --code:   var(--vscode-textCodeBlock-background,#0d1117);
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:var(--vscode-font-family,'Segoe UI',sans-serif);background:var(--bg);color:var(--fg);padding:28px 36px;max-width:900px;margin:0 auto}
    .header{display:flex;align-items:center;gap:12px;margin-bottom:6px}
    .header h1{font-size:1.5rem;font-weight:700}
    .subtitle{color:var(--muted);font-size:.85rem;margin-bottom:6px}
    .stats{font-size:.8rem;color:var(--muted);margin-bottom:28px}
    .stats strong{color:var(--fg)}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:18px;cursor:pointer;transition:border-color .2s,box-shadow .2s}
    .card:hover{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
    .card-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}
    .card-icon{font-size:1.6rem;flex-shrink:0;margin-top:2px}
    .card-title-wrap{flex:1;min-width:0}
    .card-title-wrap h3{font-size:.95rem;font-weight:600;color:var(--accent);margin-bottom:3px}
    .card-id{font-size:.72rem;background:var(--code);padding:1px 6px;border-radius:3px;color:var(--muted);font-family:monospace}
    .badge{border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:600;white-space:nowrap;flex-shrink:0;margin-top:2px}
    .badge-ok{background:rgba(34,197,94,.12);color:var(--ok);border:1px solid rgba(34,197,94,.3)}
    .badge-tpl{background:rgba(124,58,237,.15);color:#a78bfa;border:1px solid rgba(124,58,237,.3)}
    .card-desc{font-size:.82rem;line-height:1.5;color:var(--muted);margin-bottom:12px}
    .card-foot{display:flex;justify-content:space-between;align-items:center}
    .card-hint{font-size:.74rem;color:var(--muted);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%}
    .card-open{font-size:.75rem;color:var(--accent);font-weight:600;opacity:0;transition:opacity .15s}
    .card:hover .card-open{opacity:1}
    .empty{text-align:center;padding:60px 20px;color:var(--muted)}
  </style>
</head>
<body>
  <div class="header">
    <span style="font-size:2rem">🤖</span>
    <h1>Agent Browser</h1>
  </div>
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
