import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SkillRegistry } from './skillRegistry';
import { registerListSkillsTool, registerLoadSkillTool } from './tools';
import { registerRunSubagentTool } from './subagentTool';
import { createParticipantHandler, createShaneParticipantHandler } from './participant';
import { WorkspaceSetup } from './workspaceSetup';
import { openSettingsPanel } from './settingsPanel';
import { openAgentsBrowserPanel } from './agentBrowserPanel';
import { registerJiraTool, registerConfluenceTool } from './integrationTool';

let registry: SkillRegistry | undefined;
let workspaceSetup: WorkspaceSetup | undefined;

/**
 * Resolves the skills directory based on user configuration.
 */
function resolveSkillsDir(context: vscode.ExtensionContext): string {
  const config = vscode.workspace.getConfiguration('superpowers');
  const source = config.get<string>('skillsSource', 'bundled');

  if (source === 'local') {
    const localPath = config.get<string>('localSkillsPath', '').trim();
    if (localPath) {
      return path.join(localPath, 'skills');
    }
    vscode.window.showWarningMessage(
      '[Shane Skills] localSkillsPath is empty. Falling back to bundled skills.'
    );
  }

  return path.join(context.extensionPath, 'skills');
}

export function activate(context: vscode.ExtensionContext): void {
  console.log('[Shane Skills] Activating...');

  // ── 1. Skill registry ──────────────────────────────────────────────────────
  const skillsDir = resolveSkillsDir(context);
  registry = new SkillRegistry(skillsDir);
  console.log(`[Shane Skills] Skills directory: ${skillsDir}`);

  // ── 2. LM Tools ────────────────────────────────────────────────────────────
  context.subscriptions.push(
    registerListSkillsTool(context, registry),
    registerLoadSkillTool(context, registry),
    registerRunSubagentTool(context, registry),
    registerJiraTool(context),
    registerConfluenceTool(context)
  );

  // ── 3. @superpowers Chat Participant ───────────────────────────────────────
  const handler = createParticipantHandler(registry);
  const participant = vscode.chat.createChatParticipant('superpowers.agent', handler);
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'assets', 'superpowers-icon.png');
  context.subscriptions.push(participant);

  // ── 3b. @shane-skills Chat Participant ──────────────────────────────────────
  const shaneHandler = createShaneParticipantHandler(registry);
  const shaneParticipant = vscode.chat.createChatParticipant('shane-skills.agent', shaneHandler);
  shaneParticipant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'assets', 'superpowers-icon.png');
  context.subscriptions.push(shaneParticipant);

  // ── 4. Workspace Setup ─────────────────────────────────────────────────────
  workspaceSetup = new WorkspaceSetup(context.extensionPath);
  workspaceSetup.checkAndPrompt(context).catch(console.error);

  // Status bar — click opens the quick menu
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'superpowers.openMenu';
  updateStatusBar(statusBar, workspaceSetup);
  context.subscriptions.push(statusBar);

  // ── 5. Commands ────────────────────────────────────────────────────────────
  context.subscriptions.push(
    // Setup Workspace
    vscode.commands.registerCommand('superpowers.setupWorkspace', async () => {
      const workspace = vscode.workspace.workspaceFolders?.[0];
      if (!workspace) {
        vscode.window.showWarningMessage('Shane Skills: Open a workspace folder first.');
        return;
      }
      await workspaceSetup!.install(workspace);
      updateStatusBar(statusBar, workspaceSetup!);
    }),

    // Skills Browser
    vscode.commands.registerCommand('superpowers.openSkillsPanel', () => {
      openSkillsPanel(context, registry!);
    }),

    // Agent Browser
    vscode.commands.registerCommand('superpowers.openAgentsBrowser', () => {
      openAgentsBrowserPanel(context);
    }),

    // Reload Skills
    vscode.commands.registerCommand('superpowers.reloadSkills', () => {
      registry?.invalidate();
      vscode.window.showInformationMessage('[Shane Skills] Skills reloaded.');
    }),

    // Configure Skills & Agents settings panel
    vscode.commands.registerCommand('superpowers.openSettings', () => {
      openSettingsPanel(context, registry!);
    }),

    // Status-bar quick menu
    vscode.commands.registerCommand('superpowers.openMenu', async () => {
      const configured = workspaceSetup?.isConfigured() ?? false;

      interface MenuAction { label: string; description: string; cmd: string }
      const items: MenuAction[] = [];

      if (!configured) {
        items.push({
          label: '$(zap) Setup Workspace',
          description: 'Create copilot-instructions.md and agent files',
          cmd: 'superpowers.setupWorkspace',
        });
      }

      items.push(
        { label: '$(gear) Configure Skills & Agents', description: 'Choose which skills and agents are enabled', cmd: 'superpowers.openSettings' },
        { label: '$(book) Open Skills Browser', description: 'Browse and open available skill files', cmd: 'superpowers.openSkillsPanel' },
        { label: '$(hubot) Open Agent Browser', description: 'Browse and open available agent files', cmd: 'superpowers.openAgentsBrowser' },
        { label: '$(refresh) Reload Skills', description: 'Re-read skills from disk', cmd: 'superpowers.reloadSkills' },
      );

      if (configured) {
        items.push({
          label: '$(tools) Setup Workspace',
          description: 'Re-run workspace setup',
          cmd: 'superpowers.setupWorkspace',
        });
      }

      const pick = await vscode.window.showQuickPick(items, {
        title: 'Shane Skills — Quick Menu',
        placeHolder: 'Choose an action…',
      });
      if (pick) {
        vscode.commands.executeCommand(pick.cmd);
      }
    })
  );

  // ── 6. Config change handler ───────────────────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('superpowers')) {
        const newSkillsDir = resolveSkillsDir(context);
        registry = new SkillRegistry(newSkillsDir);
        console.log(`[Shane Skills] Config changed. Reloaded from: ${newSkillsDir}`);
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      updateStatusBar(statusBar, workspaceSetup!);
    })
  );

  console.log('[Shane Skills] Activated successfully.');
}

export function deactivate(): void {
  console.log('[Shane Skills] Deactivating.');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function updateStatusBar(bar: vscode.StatusBarItem, setup: WorkspaceSetup): void {
  if (setup.isConfigured()) {
    bar.text = '$(zap) Shane Skills';
    bar.tooltip = 'Shane Skills active — click for quick menu';
    bar.backgroundColor = undefined;
  } else {
    bar.text = '$(zap) Shane Skills: Setup needed';
    bar.tooltip = 'Click to set up Shane Skills in this workspace';
    bar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  bar.show();
}

// ── Skills Browser panel ──────────────────────────────────────────────────────

interface SkillInfo {
  metadata: { name: string; description: string };
  dirName: string;
}

let skillsPanelRef: vscode.WebviewPanel | undefined;

function openSkillsPanel(context: vscode.ExtensionContext, reg: SkillRegistry): void {
  if (skillsPanelRef) {
    skillsPanelRef.reveal(vscode.ViewColumn.One);
    return;
  }

  skillsPanelRef = vscode.window.createWebviewPanel(
    'shaneSkills',
    'Shane Skills — Skills Browser',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  skillsPanelRef.onDidDispose(() => { skillsPanelRef = undefined; }, null, context.subscriptions);

  const skills = reg.getAllSkills().sort((a, b) =>
    a.metadata.name.localeCompare(b.metadata.name)
  );

  skillsPanelRef.webview.html = buildSkillsPanelHtml(skills);

  // Handle click-to-open messages from the webview
  skillsPanelRef.webview.onDidReceiveMessage(
    async (msg: { type: string; dirName: string }) => {
      if (msg.type === 'openSkill') {
        const filePath = path.join(reg.getSkillsDir(), msg.dirName, 'SKILL.md');
        if (fs.existsSync(filePath)) {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
          await vscode.window.showTextDocument(doc, { preview: false });
        }
      }
    },
    undefined,
    context.subscriptions
  );
}

function buildSkillsPanelHtml(skills: SkillInfo[]): string {
  const skillCards = skills
    .map(s => {
      const isShaneSkill = s.metadata.name === 'jira' || s.metadata.name === 'confluence';
      const participant = isShaneSkill ? '@shane-skills' : '@superpowers';
      const command = isShaneSkill ? `/${s.metadata.name}` : `#loadSkill ${escapeHtml(s.metadata.name)}`;

      return `
    <div class="skill-card" onclick="openSkill('${escapeHtml(s.dirName)}')">
      <div class="header">
        <div class="title">${escapeHtml(s.metadata.name)}</div>
      </div>
      <div class="desc">${escapeHtml(s.metadata.description || 'No description.')}</div>
      <div class="actions">
        <span class="badge">${participant}</span>
        <span class="cmd">${command}</span>
        <span class="open-hint">Open →</span>
      </div>
    </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Shane Skills</title>
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
    }
    body { font-family: var(--vscode-font-family,'Segoe UI',sans-serif); background:var(--bg); color:var(--fg); padding:24px; margin:0; }
    h1 { font-size:1.5rem; margin-bottom:4px; }
    .subtitle { opacity:.65; margin-bottom:24px; font-size:.9rem; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:16px; }
    .skill-card { background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:16px; cursor:pointer; transition:border-color .2s, box-shadow .2s; }
    .skill-card:hover { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent); }
    .skill-card h3 { margin:0 0 8px; font-size:1rem; color:var(--accent); }
    .skill-card p { margin:0 0 12px; font-size:.85rem; line-height:1.5; opacity:.8; }
    .actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .badge { background:var(--badge-bg); color:var(--badge-fg); border-radius:4px; padding:2px 8px; font-size:.75rem; }
    .cmd { background:var(--cmd-bg); color:var(--fg); border-radius:4px; padding:2px 8px; font-size:.75rem; font-family:monospace; opacity:.9; }
    .open-hint { margin-left:auto; font-size:.75rem; color:var(--accent); font-weight:600; opacity:0; transition:opacity .15s; }
    .skill-card:hover .open-hint { opacity:1; }
    .tip { margin-top:32px; padding:12px 16px; border-left:3px solid var(--accent); opacity:.8; font-size:.9rem; }
    code { background:var(--cmd-bg); padding:1px 6px; border-radius:3px; font-size:.9em; }
  </style>
</head>
<body>
  <h1>⚡ Shane Skills</h1>
  <p class="subtitle">
    Click any skill card to open its <code>SKILL.md</code> file.
    Install workspace files with <code>Shane-Skills: Setup Workspace</code> to auto-enable in all Copilot chats.
  </p>
  <div class="grid">${skillCards}</div>
  <div class="tip">
    💡 <strong>Quick start:</strong> Open Copilot Chat and type <code>@superpowers /brainstorm Let's build a React todo list</code>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function openSkill(dirName) {
      vscode.postMessage({ type: 'openSkill', dirName });
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
