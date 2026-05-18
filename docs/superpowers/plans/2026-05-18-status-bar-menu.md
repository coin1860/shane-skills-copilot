# Status Bar Menu & Agent Browser UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add QuickPick menu to "Shane Skills" status bar entry point and unify Agent Browser HTML/CSS with Skills Browser.

**Architecture:** Two independent changes: (1) modify `src/extension.ts` to route status bar click to a QuickPick (or direct setup if unconfigured), (2) rewrite CSS in `src/agentBrowserPanel.ts` to match the Skills Browser visual style. No new files, no new dependencies.

**Tech Stack:** VS Code Extension API (StatusBarItem, window.showQuickPick, commands), TypeScript.

---

### Task 1: Status Bar QuickPick Menu

**Files:**
- Modify: `src/extension.ts:50-120`

- [ ] **Step 1: Change status bar command binding**

Replace line 52 `statusBar.command = 'superpowers.openSkillsPanel'` with `statusBar.command = 'superpowers.showQuickMenu'`:

```typescript
  // Status bar — click shows QuickPick menu (or direct setup if unconfigured)
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'superpowers.showQuickMenu';
  updateStatusBar(statusBar, workspaceSetup);
  context.subscriptions.push(statusBar);
```

- [ ] **Step 2: Register the showQuickMenu command**

Add `superpowers.showQuickMenu` command registration in the command block (after `superpowers.reloadSkills`):

```typescript
    // QuickPick menu
    vscode.commands.registerCommand('superpowers.showQuickMenu', async () => {
      if (!workspaceSetup!.isConfigured()) {
        const workspace = vscode.workspace.workspaceFolders?.[0];
        if (!workspace) {
          vscode.window.showWarningMessage('Shane Skills: Open a workspace folder first.');
          return;
        }
        await workspaceSetup!.install(workspace);
        updateStatusBar(statusBar, workspaceSetup!);
        return;
      }

      const items: vscode.QuickPickItem[] = [
        { label: '$(zap) Open Skills Browser', description: 'Browse all Shane Skills' },
        { label: '$(robot) Open Agent Browser', description: 'View and open agent templates' },
        { label: '$(refresh) Reload Skills', description: 'Reload skills from disk' },
        { label: '$(gear) Setup Workspace', description: 'Install skills & agents to .github/' },
      ];

      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select an action...',
      });

      if (!pick) return;

      switch (pick.label) {
        case items[0].label:
          vscode.commands.executeCommand('superpowers.openSkillsPanel');
          break;
        case items[1].label:
          vscode.commands.executeCommand('superpowers.openAgentsBrowser');
          break;
        case items[2].label:
          vscode.commands.executeCommand('superpowers.reloadSkills');
          break;
        case items[3].label:
          vscode.commands.executeCommand('superpowers.setupWorkspace');
          await workspaceSetup!.install(vscode.workspace.workspaceFolders![0]);
          updateStatusBar(statusBar, workspaceSetup!);
          break;
      }
    }),
```

- [ ] **Step 3: Update tooltip in updateStatusBar**

Change `updateStatusBar` to reflect the new behavior:

```typescript
function updateStatusBar(bar: vscode.StatusBarItem, setup: WorkspaceSetup): void {
  if (setup.isConfigured()) {
    bar.text = '$(zap) Shane Skills';
    bar.tooltip = 'Shane Skills — click for options';
    bar.backgroundColor = undefined;
  } else {
    bar.text = '$(zap) Shane Skills: Setup needed';
    bar.tooltip = 'Click to set up Shane Skills in this workspace';
    bar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  bar.show();
}
```

- [ ] **Step 4: Build and verify**

Run:
```bash
npm run compile
```

Expected: No TypeScript errors. The extension compiles cleanly.

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts
git commit -m "feat: add QuickPick menu to status bar entry point"
```

---

### Task 2: Agent Browser UI Unification

**Files:**
- Modify: `src/agentBrowserPanel.ts:77-167`

- [ ] **Step 1: Rewrite buildAgentsBrowserHtml CSS and HTML**

Replace the entire `buildAgentsBrowserHtml` function body. Keep the same logic (agent list, install status detection, openAgent messaging) but adopt the Skills Browser's visual style:

```typescript
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildAgentsBrowserHtml(agents: AgentInfo[], installedIds: Set<string>): string {
  const cards = agents
    .map(a => {
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
        <div class="title">${esc(a.displayName)}</div>
        ${badgeHtml}
      </div>
      <div class="desc">${esc(a.description || 'No description.')}</div>
      <div class="actions">
        <span class="badge agent-badge">🤖 agent</span>
        <span class="cmd">${esc(hint)}</span>
        <span class="open-hint">Open →</span>
      </div>
    </div>`;
    })
    .join('\n');

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
    .subtitle { opacity:.65; margin-bottom:24px; font-size:.9rem; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:16px; }
    .agent-card { background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:16px; cursor:pointer; transition:border-color .2s, box-shadow .2s; }
    .agent-card:hover { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent); }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; }
    .title { margin:0; font-size:1rem; font-weight:600; color:var(--accent); }
    .desc { margin:0 0 12px; font-size:.85rem; line-height:1.5; opacity:.8; }
    .actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .badge { border-radius:4px; padding:2px 8px; font-size:.75rem; }
    .agent-badge { background:var(--badge-bg); color:var(--badge-fg); }
    .badge-ok { background:rgba(34,197,94,.12); color:var(--ok); border:1px solid rgba(34,197,94,.3); border-radius:20px; padding:2px 10px; font-weight:600; }
    .badge-tpl { background:rgba(124,58,237,.15); color:#a78bfa; border:1px solid rgba(124,58,237,.3); border-radius:20px; padding:2px 10px; font-weight:600; }
    .cmd { background:var(--cmd-bg); color:var(--fg); border-radius:4px; padding:2px 8px; font-size:.75rem; font-family:monospace; opacity:.9; }
    .open-hint { margin-left:auto; font-size:.75rem; color:var(--accent); font-weight:600; opacity:0; transition:opacity .15s; }
    .agent-card:hover .open-hint { opacity:1; }
    .stats { margin-bottom:24px; font-size:.85rem; opacity:.65; }
    .stats strong { color:var(--fg); opacity:1; }
  </style>
</head>
<body>
  <h1>🤖 Shane Skills — Agent Browser</h1>
  <p class="subtitle">Click any agent to open its definition file.</p>
  <p class="stats"><strong>${installed}</strong> installed in workspace &nbsp;·&nbsp; <strong>${total}</strong> total available</p>
  ${agents.length === 0 ? '<div class="stats">No agents found.</div>' : `<div class="grid">${cards}</div>`}
  <script>
    const vscode = acquireVsCodeApi();
    function openAgent(id, installed) {
      vscode.postMessage({ type: 'openAgent', agentId: id, installed });
    }
  </script>
</body>
</html>`;
}
```

- [ ] **Step 2: Build and verify**

Run:
```bash
npm run compile
```

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/agentBrowserPanel.ts
git commit -m "feat: unify Agent Browser UI with Skills Browser style"
```
