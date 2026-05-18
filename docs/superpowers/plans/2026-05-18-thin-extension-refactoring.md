# Thin Extension Refactoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor shane-skills-copilot from a heavy orchestration extension (custom participants, LM tools, subagents, integrations) to a thin installer that copies skills to `.github/skills/` and provides lightweight `@superpowers` slash commands.

**Architecture:** Extension only does two things at runtime — (1) on activation, offer to install skill files + agent files + copilot-instructions.md into the workspace, (2) provide a minimal `@superpowers` chat participant that reads SKILL.md from `.github/skills/` (fallback to bundled) and injects it as context. All other code (LM tools, subagent tool, Jira/Confluence integration, settings panel) is deleted. Skill discovery in natural language happens via workspace `.github/skills/` files that Copilot's RAG reads directly.

**Tech Stack:** TypeScript, VS Code Extension API, GitHub Copilot

---

## File Change Map

| Action | File | Responsibility |
|--------|------|----------------|
| MODIFY | `package.json` | Remove languageModelTools, @shane-skills participant, Jira/Confluence configs, deps |
| MODIFY | `src/extension.ts` | Remove tool registrations, @shane-skills participant, Jira/Confluence tools |
| REWRITE | `src/participant.ts` | Lightweight — only slash commands, read skill from .github/skills/, no bootstrap/tools |
| SIMPLIFY | `src/workspaceSetup.ts` | Add skill file copying to .github/skills/, dynamic copilot-instructions generation |
| SIMPLIFY | `src/skillRegistry.ts` | Remove isSkillEnabled/getEnabledSkills, keep only enumeration |
| REWRITE | `templates/copilot-instructions.md` | File-based skill discovery, no #loadSkill references |
| UPDATE | `README.md` | Reflect new architecture |
| DELETE | `src/tools.ts` | LM tools no longer needed |
| DELETE | `src/subagentTool.ts` | Subagent orchestration no longer needed |
| DELETE | `src/integrationTool.ts` | Jira/Confluence HTTP calls removed |
| DELETE | `src/settingsPanel.ts` | Webview config panel removed |
| KEEP | `src/agentBrowserPanel.ts` | Already read-only, no changes |
| KEEP | `templates/agents/*.agent.md` | Agent files unchanged |

---

### Task 1: Clean package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove @shane-skills chat participant**

Remove the `shane-skills.agent` entry from `contributes.chatParticipants`. The `superpowers.agent` participant stays but with simplified commands.

```diff
"contributes": {
  "chatParticipants": [
    {
      "id": "superpowers.agent",
      "name": "superpowers",
-     "fullName": "Superpowers Agent",
-     "description": "Superpowers methodology agent — brainstorming, TDD, debugging, planning, subagent-driven development.",
+     "fullName": "Superpowers Skills",
+     "description": "Quick-access slash commands for Superpowers skills.",
      "isSticky": false,
      "commands": [
+       {
+         "name": "skills",
+         "description": "List all available Superpowers skills"
+       },
        {
          "name": "brainstorm",
          "description": "Explore your idea collaboratively before writing code"
        },
        {
          "name": "plan",
          "description": "Write a bite-sized implementation plan"
        },
        {
          "name": "debug",
          "description": "Apply systematic 4-phase debugging"
        },
        {
          "name": "tdd",
          "description": "Follow Red-Green-Refactor TDD cycle"
        },
        {
          "name": "review",
          "description": "Request a pre-merge code review"
        },
        {
          "name": "setup",
          "description": "Install Shane Skills files into your workspace"
        }
      ]
-   },
-   {
-     "id": "shane-skills.agent",
-     "name": "shane-skills",
-     "fullName": "Shane Skills",
-     "description": "Shane Skills integrations agent by Shane Shou — search, create, update, and manage Jira issues and Confluence pages.",
-     "isSticky": false,
-     "commands": [
-       { "name": "jira", "description": "Manage Jira issues" },
-       { "name": "confluence", "description": "Manage Confluence pages" }
-     ]
    }
  ],
```

- [ ] **Step 2: Remove all languageModelTools**

Remove the entire `contributes.languageModelTools` array (4 entries: `superpowers_load_skill`, `superpowers_list_skills`, `superpowers_run_subagent`, `shane_skills_jira`, `shane_skills_confluence`).

```diff
- "languageModelTools": [
-   { "name": "superpowers_load_skill", ... },
-   { "name": "superpowers_list_skills", ... },
-   { "name": "superpowers_run_subagent", ... },
-   { "name": "shane_skills_jira", ... },
-   { "name": "shane_skills_confluence", ... }
- ],
```

- [ ] **Step 3: Remove Jira/Confluence config and enabledSkills/enabledAgents**

```diff
"configuration": {
  "title": "Shane Skills for Copilot",
  "properties": {
    "superpowers.skillsSource": {
      "type": "string",
      "enum": ["bundled", "local"],
      "default": "bundled",
      "description": "Where to load skills from."
    },
    "superpowers.localSkillsPath": {
      "type": "string",
      "default": "",
      "description": "Path to a local shane-skills repository."
    },
    "superpowers.autoSetupWorkspace": {
      "type": "boolean",
      "default": true,
      "description": "On activation, automatically offer workspace setup."
    },
-   "superpowers.enabledSkills": { ... },
-   "superpowers.enabledAgents": { ... },
-   "superpowers.jira.baseUrl": { ... },
-   "superpowers.jira.email": { ... },
-   "superpowers.confluence.baseUrl": { ... },
-   "superpowers.confluence.email": { ... }
  }
}
```

- [ ] **Step 4: Remove dependencies and update commands**

```diff
- "dependencies": {
-   "markdown-to-adf": "^0.2.20",
-   "marked": "^18.0.3"
- }
+ "dependencies": {}
```

Update commands list to remove `openSettings` and `configureSkills`:

```diff
"commands": [
  { "command": "superpowers.setupWorkspace", ... },
  { "command": "superpowers.openSkillsPanel", ... },
  { "command": "superpowers.openAgentsBrowser", ... },
  { "command": "superpowers.reloadSkills", ... },
- { "command": "superpowers.openSettings", ... },
- { "command": "superpowers.openMenu", ... }
]
```

- [ ] **Step 5: Verify package.json is valid JSON**

Run: `cat package.json | python3 -m json.tool > /dev/null`
Expected: No output (valid JSON)

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "chore: clean package.json — remove tools, integrations, unused configs"
```

---

### Task 2: Simplify skillRegistry.ts

**Files:**
- Modify: `src/skillRegistry.ts`

- [ ] **Step 1: Remove enable/disable methods and import**

Remove `isSkillEnabled()` and `getEnabledSkills()` methods. Remove `vscode` import (no longer needed).

```diff
- import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
```

Delete these two methods:

```diff
- isSkillEnabled(name: string): boolean {
-   const enabled = vscode.workspace
-     .getConfiguration('superpowers')
-     .get<string[]>('enabledSkills', []);
-   if (enabled.length === 0) return true;
-   const lower = name.toLowerCase();
-   return enabled.some(e => e.toLowerCase() === lower);
- }

- getEnabledSkills(): Skill[] {
-   return this.getAllSkills().filter(s => this.isSkillEnabled(s.metadata.name));
- }
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors (the removed methods are not referenced outside skillRegistry.ts)

- [ ] **Step 3: Commit**

```bash
git add src/skillRegistry.ts
git commit -m "refactor: remove enable/disable logic from skillRegistry"
```

---

### Task 3: Move shared code out of settingsPanel.ts (pre-deletion)

**Files:**
- Modify: `src/workspaceSetup.ts`
- Modify: `src/agentBrowserPanel.ts`

settingsPanel.ts defines `readAgents()` and `AgentInfo` that are imported by workspaceSetup.ts and agentBrowserPanel.ts. Before deleting settingsPanel.ts, move these into workspaceSetup.ts.

- [ ] **Step 1: Add AgentInfo interface and readAgents function to workspaceSetup.ts**

Append to `src/workspaceSetup.ts` after the `WorkspaceSetup` class:

```typescript
// ── Agent helpers (moved from settingsPanel.ts) ────────────────────────────────

export interface AgentInfo {
  /** Filename stem, e.g. "superpowers-implementer" */
  id: string;
  /** Human-readable name from frontmatter */
  displayName: string;
  /** Description from frontmatter */
  description: string;
}

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
```

- [ ] **Step 2: Update agentBrowserPanel.ts import**

Change import from `settingsPanel` to `workspaceSetup`:

```diff
// src/agentBrowserPanel.ts
- import { readAgents, AgentInfo } from './settingsPanel';
+ import { readAgents, AgentInfo } from './workspaceSetup';
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/workspaceSetup.ts src/agentBrowserPanel.ts
git commit -m "refactor: move readAgents from settingsPanel to workspaceSetup"
```

---

### Task 4: Delete obsolete source files

**Files:**
- Delete: `src/tools.ts`
- Delete: `src/subagentTool.ts`
- Delete: `src/integrationTool.ts`
- Delete: `src/settingsPanel.ts`

- [ ] **Step 1: Delete the four files**

```bash
rm src/tools.ts src/subagentTool.ts src/integrationTool.ts src/settingsPanel.ts
```

- [ ] **Step 2: Verify compilation (should fail due to lingering imports)**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: Errors about missing modules in `extension.ts` and `participant.ts` — these will be fixed in next tasks. No errors from `agentBrowserPanel.ts` or `workspaceSetup.ts`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove LM tools, subagent, integration, settings panel"
```

---

### Task 4: Rewrite participant.ts (lightweight)

**Files:**
- Rewrite: `src/participant.ts`

Replace the entire file (~399 lines) with a minimal participant that only supports slash commands by reading SKILL.md from `.github/skills/` (with bundled fallback).

- [ ] **Step 1: Write the new participant.ts**

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const COMMAND_TO_SKILL: Record<string, string> = {
  brainstorm: 'brainstorming',
  plan: 'writing-plans',
  debug: 'systematic-debugging',
  tdd: 'test-driven-development',
  review: 'requesting-code-review',
};

const TOOL_MAPPING = `
## Tool Mapping for GitHub Copilot (VS Code)

Skills use Claude Code tool names. VS Code Copilot equivalents:
| Skill references | GitHub Copilot / VS Code equivalent |
|-----------------|-------------------------------------|
| \`Read\` | \`#file\` references |
| \`Write\` / \`Edit\` | Chat edit suggestions |
| \`Bash\` | VS Code Terminal |
| \`Grep\` / \`Glob\` | \`#codebase\` search |
| \`TodoWrite\` | Track tasks as markdown checkboxes |
| \`Skill\` | Read SKILL.md from \`.github/skills/\` |
| \`Task\` subagent | Use \`.github/agents/\` custom agents |
`;

/**
 * Register the extension ID for resolving bundled skill paths.
 * Must match publisher.name in package.json.
 */
const EXTENSION_ID = 'shane-h-shou.shane-skills';

function resolveExtensionPath(): string | null {
  try {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    return ext?.extensionPath ?? null;
  } catch {
    return null;
  }
}

function readSkillContent(skillDirName: string): { content: string; source: string } | null {
  // 1. Try workspace .github/skills/
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (workspace) {
    const wsPath = path.join(workspace.uri.fsPath, '.github', 'skills', skillDirName, 'SKILL.md');
    if (fs.existsSync(wsPath)) {
      return { content: fs.readFileSync(wsPath, 'utf8'), source: wsPath };
    }
  }

  // 2. Fallback to bundled skills
  const extPath = resolveExtensionPath();
  if (extPath) {
    const bundledPath = path.join(extPath, 'skills', skillDirName, 'SKILL.md');
    if (fs.existsSync(bundledPath)) {
      return { content: fs.readFileSync(bundledPath, 'utf8'), source: bundledPath };
    }
  }

  return null;
}

export function createParticipantHandler(): vscode.ChatRequestHandler {
  return async (
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    // /skills — list all available skills
    if (request.command === 'skills') {
      const skillNames = Object.entries(COMMAND_TO_SKILL).map(
        ([cmd, name]) => `**/${cmd}** — ${name}`
      );
      stream.markdown(
        '## ⚡ Superpowers Skills\n\n' +
        'Use a slash command to load a skill:\n\n' +
        skillNames.join('\n') +
        '\n\n**/setup** — Install workspace files\n' +
        '\n💡 In natural language Chat, skills are auto-discovered from `.github/skills/`.'
      );
      return {};
    }

    // /setup — launch workspace setup
    if (request.command === 'setup') {
      await vscode.commands.executeCommand('superpowers.setupWorkspace');
      stream.markdown('✅ Workspace setup launched.');
      return {};
    }

    // Map slash command to skill directory name
    const skillName = request.command ? COMMAND_TO_SKILL[request.command] : undefined;
    if (!skillName) {
      stream.markdown(
        'Use a slash command: `/braimstorm`, `/plan`, `/debug`, `/tdd`, `/review`, `/skills`, or `/setup`.\n\n' +
        'Or just describe what you want — I can discover skills from `.github/skills/`.'
      );
      return {};
    }

    // Read skill content
    const skill = readSkillContent(skillName);
    if (!skill) {
      stream.markdown(
        `⚠️ Skill **${skillName}** not found. ` +
        'Run `/setup` to install workspace files, then try again.'
      );
      return {};
    }

    // Inject skill content + tool mapping + user prompt
    const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User(
        `Please load and follow the "${skillName}" skill for this request:\n\n---\n${skill.content}\n---\n${TOOL_MAPPING}`
      ),
      vscode.LanguageModelChatMessage.Assistant(
        `I'll follow the ${skillName} skill for this request.`
      ),
      vscode.LanguageModelChatMessage.User(request.prompt),
    ];

    try {
      const model = request.model;
      const response = await model.sendRequest(messages, {}, token);

      for await (const chunk of response.stream) {
        if (chunk instanceof vscode.LanguageModelTextPart) {
          stream.markdown(chunk.value);
        }
      }
    } catch (err) {
      if (err instanceof vscode.LanguageModelError) {
        if (err.code === vscode.LanguageModelError.Blocked.name) {
          stream.markdown('> ⚠️ Request blocked by content policy.');
          return { metadata: { blocked: true } };
        }
        stream.markdown(`> ⚠️ Model error: ${err.message}`);
      } else {
        throw err;
      }
    }

    return {};
  };
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors, or only errors about `extension.ts` still importing old code

- [ ] **Step 3: Commit**

```bash
git add src/participant.ts
git commit -m "refactor: lightweight participant — no bootstrap, no tools, file-based skills"
```

---

### Task 5: Simplify extension.ts

**Files:**
- Modify: `src/extension.ts`

Remove registrations for LM tools, @shane-skills participant, settings panel, integration tools, quick menu. Keep only @superpowers participant, workspace setup, read-only panels, status bar.

- [ ] **Step 1: Remove unused imports**

```diff
- import { registerListSkillsTool, registerLoadSkillTool } from './tools';
- import { registerRunSubagentTool } from './subagentTool';
- import { createParticipantHandler, createShaneParticipantHandler } from './participant';
+ import { createParticipantHandler } from './participant';
- import { openSettingsPanel } from './settingsPanel';
- import { registerJiraTool, registerConfluenceTool } from './integrationTool';
```

- [ ] **Step 2: Replace the activate function body**

Remove these from `activate()`:
- `registerListSkillsTool`, `registerLoadSkillTool`, `registerRunSubagentTool` calls
- `registerJiraTool`, `registerConfluenceTool` calls
- `createShaneParticipantHandler` + participant registration
- `openSettingsPanel` command (`superpowers.openSettings`)
- `openMenu` command (`superpowers.openMenu`)
- WorkshopSetup `checkAndPrompt` — KEEP

The simplified activate function:

```typescript
export function activate(context: vscode.ExtensionContext): void {
  console.log('[Shane Skills] Activating...');

  // ── 1. Skill registry (for read-only browser, not for participant) ──────────
  const skillsDir = resolveSkillsDir(context);
  registry = new SkillRegistry(skillsDir);
  console.log(`[Shane Skills] Skills directory: ${skillsDir}`);

  // ── 2. @superpowers Chat Participant (lightweight — file-based skills) ──────
  const handler = createParticipantHandler();
  const participant = vscode.chat.createChatParticipant('superpowers.agent', handler);
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'assets', 'superpowers-icon.png');
  context.subscriptions.push(participant);

  // ── 3. Workspace Setup ──────────────────────────────────────────────────────
  workspaceSetup = new WorkspaceSetup(context.extensionPath, skillsDir);
  workspaceSetup.checkAndPrompt(context).catch(console.error);

  // Status bar — click opens setup (if needed) or skills browser
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'superpowers.openSkillsPanel';
  updateStatusBar(statusBar, workspaceSetup);
  context.subscriptions.push(statusBar);

  // ── 4. Commands ─────────────────────────────────────────────────────────────
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

    // Skills Browser (read-only, from bundled skills)
    vscode.commands.registerCommand('superpowers.openSkillsPanel', () => {
      openSkillsPanel(context, registry!);
    }),

    // Agent Browser (read-only)
    vscode.commands.registerCommand('superpowers.openAgentsBrowser', () => {
      openAgentsBrowserPanel(context);
    }),

    // Reload Skills
    vscode.commands.registerCommand('superpowers.reloadSkills', () => {
      registry?.invalidate();
      vscode.window.showInformationMessage('[Shane Skills] Skills reloaded.');
    }),
  );

  // ── 5. Config change handler ───────────────────────────────────────────────
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
```

- [ ] **Step 3: Keep the rest of extension.ts as-is**

After the `activate` function, keep:
- `deactivate()` — no change
- `updateStatusBar()` — no change
- `openSkillsPanel()` — no change (still reads from bundled registry)
- `buildSkillsPanelHtml()` — no change
- `escapeHtml()` — no change

Update the `resolveSkillsDir` function if needed (keep as-is, already correct).

Update the `WorkspaceSetup` constructor call to accept the new parameter:
```typescript
workspaceSetup = new WorkspaceSetup(context.extensionPath, skillsDir);
```

This means we modify `src/workspaceSetup.ts` to accept `skillsDir` in constructor (done in Task 6).

- [ ] **Step 4: Remove unused variable**

If the `openSkillsPanel` function now only uses `reg.getSkillsDir()` for file path resolution, ensure it still compiles.

Also remove the `SkillInfo` interface if it becomes unused (it's used by `openSkillsPanel` and `buildSkillsPanelHtml`, so keep it).

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit 2>&1`
Expected: No type errors. If errors exist, fix them (likely missing imports or type mismatches).

- [ ] **Step 6: Commit**

```bash
git add src/extension.ts
git commit -m "refactor: strip extension.ts — no tools, no integrations, no settings panel"
```

---

### Task 6: Add skill copying to workspaceSetup.ts

**Files:**
- Modify: `src/workspaceSetup.ts`

Add constructor parameter for `skillsDir`, add `installSkillFiles()` method, update `installCopilotInstructions()` to generate dynamic content.

- [ ] **Step 1: Update constructor and class properties**

```diff
export class WorkspaceSetup {
- constructor(private readonly extensionPath: string) {}
+ constructor(
+   private readonly extensionPath: string,
+   private readonly skillsDir: string
+ ) {}
```

- [ ] **Step 2: Add installSkillFiles method**

After `installAgentFiles()`, add:

```typescript
private async installSkillFiles(workspace: vscode.WorkspaceFolder): Promise<string[]> {
  const skillsDestDir = path.join(workspace.uri.fsPath, '.github', 'skills');
  fs.mkdirSync(skillsDestDir, { recursive: true });

  const results: string[] = [];
  const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const srcFile = path.join(this.skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(srcFile)) continue;

    const destFile = path.join(skillsDestDir, entry.name, 'SKILL.md');
    fs.mkdirSync(path.dirname(destFile), { recursive: true });

    if (fs.existsSync(destFile)) {
      results.push(`⚠️  .github/skills/${entry.name}/SKILL.md — already exists, skipped`);
      continue;
    }

    fs.copyFileSync(srcFile, destFile);
    results.push(`✅ .github/skills/${entry.name}/SKILL.md — created`);
  }

  if (results.length === 0) {
    results.push('ℹ️  No skill files were copied.');
  }
  return results;
}
```

- [ ] **Step 3: Add generateInstructionsContent method**

After `installSkillFiles()`, add:

```typescript
private generateInstructionsContent(): string {
  const skillRows: string[] = [];
  const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const srcFile = path.join(this.skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(srcFile)) continue;
    const raw = fs.readFileSync(srcFile, 'utf8');
    const nameMatch = raw.match(/^---\n[\s\S]*?\nname:\s*(.+)\n[\s\S]*?\n---\n/);
    const name = nameMatch ? nameMatch[1].trim() : entry.name;
    const descMatch = raw.match(/^---\n[\s\S]*?\ndescription:\s*(.+)\n[\s\S]*?\n---\n/);
    const desc = descMatch ? descMatch[1].trim() : '';
    skillRows.push(`| ${name} | .github/skills/${entry.name}/SKILL.md | ${desc} |`);
  }
  skillRows.sort();

  return `<!-- SUPERPOWERS_BOOTSTRAP_v2 — managed by Shane Skills for GitHub Copilot -->

# Superpowers Methodology Skills

这个 workspace 已安装 Superpowers 方法论 skill 文件到 \`.github/skills/\`。Copilot 会读取这些文件来指导开发流程。

## Available Skills

| Skill | File | Description |
|-------|------|-------------|
${skillRows.join('\n')}

## How to Use

When the user asks to build, debug, fix, plan, or review:
1. Check if any skill below applies to the task
2. If there is even a **1% chance** a skill applies, read its SKILL.md file (use \`#file:.github/skills/<name>/SKILL.md\`)
3. Follow its instructions exactly — the skill tells you HOW, the user tells you WHAT

## Agents

Custom agents available at \`.github/agents/\`:
- superpowers-implementer.agent.md
- superpowers-spec-reviewer.agent.md
- superpowers-code-reviewer.agent.md

These are automatically available as Copilot custom agents. Use them with \`@superpowers-implementer\` etc.

## Tool Mapping

Skills reference Claude Code tool names. VS Code Copilot equivalents:
| Skill references | GitHub Copilot / VS Code equivalent |
|-----------------|-------------------------------------|
| \`Read\` | \`#file\` references |
| \`Write\` / \`Edit\` | Chat edit suggestions |
| \`Bash\` | VS Code Terminal |
| \`Grep\` / \`Glob\` | \`#codebase\` search |
| \`TodoWrite\` | Track tasks as markdown checkboxes |
| \`Skill\` | Read \`.github/skills/<name>/SKILL.md\` |
| \`Task\` subagent | Copilot custom agents in \`.github/agents/\` |
`;
}
```

- [ ] **Step 4: Update installCopilotInstructions to use dynamic content**

Replace the `templatePath` reference with the generated content:

```diff
private async installCopilotInstructions(workspace: vscode.WorkspaceFolder): Promise<string> {
  const githubDir = path.join(workspace.uri.fsPath, '.github');
  const instructionsPath = path.join(githubDir, 'copilot-instructions.md');

  fs.mkdirSync(githubDir, { recursive: true });

- const templatePath = path.join(this.extensionPath, 'templates', 'copilot-instructions.md');
- const bootstrapContent = fs.readFileSync(templatePath, 'utf8');
+ const bootstrapContent = this.generateInstructionsContent();

  // ... rest unchanged
```

- [ ] **Step 5: Update the install method to also copy skills**

In the `install()` method, add skill file installation after copilot-instructions:

```diff
async install(workspace: vscode.WorkspaceFolder): Promise<void> {
  try {
    const results: string[] = [];

    const instructionsResult = await this.installCopilotInstructions(workspace);
    results.push(instructionsResult);

+   const skillResults = await this.installSkillFiles(workspace);
+   results.push(...skillResults);

    const agentResults = await this.installAgentFiles(workspace);
    results.push(...agentResults);
```

- [ ] **Step 6: Update BOOTSTRAP_MARKER to v2**

Update the marker constant at the top of workspaceSetup.ts:

```diff
- const BOOTSTRAP_MARKER = 'SUPERPOWERS_BOOTSTRAP_v1';
+ const BOOTSTRAP_MARKER = 'SUPERPOWERS_BOOTSTRAP_v2';
```

This ensures `isConfigured()` correctly detects the new-format copilot-instructions.md.

- [ ] **Step 7: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors

- [ ] **Step 8: Commit**

```bash
git add src/workspaceSetup.ts
git commit -m "feat: copy skills to .github/skills/ on workspace setup"
```

---

### Task 7: Rewrite copilot-instructions.md template

**Files:**
- Rewrite: `templates/copilot-instructions.md`

The old template referenced `#loadSkill` and `#listSkills`. Replace with file-based discovery instructions. This file is no longer copied directly (workspaceSetup generates it dynamically in Task 6), but keep it as a reference template.

- [ ] **Step 1: Replace with minimal reference template**

Note: After Task 6, the template file is no longer used in `installCopilotInstructions()` — the content is generated dynamically. Keep this file as a reference for the generated format.

```markdown
<!-- SUPERPOWERS_BOOTSTRAP_v2 — managed by Shane Skills for GitHub Copilot -->

# Superpowers Methodology Skills

这个 workspace 安装了 Superpowers 方法论 skill。所有 skill 文件在 `.github/skills/` 目录中，每个子目录下有一个 `SKILL.md` 文件。

## How to Use

1. 用户请求构建/调试/修复/规划/审查时，检查是否有匹配的 skill
2. 如果有（哪怕只有 1% 可能），用 `#file` 引用读取 `.github/skills/<name>/SKILL.md`
3. 严格按照 skill 的指示执行

## Tool Mapping

| Skill references | VS Code Copilot equivalent |
|-----------------|---------------------------|
| `Read` | `#file` references |
| `Write` / `Edit` | Chat edit suggestions |
| `Bash` | VS Code Terminal |
| `Grep` / `Glob` | `#codebase` search |
| `TodoWrite` | Markdown checkboxes |
| `Skill` | Read `.github/skills/<name>/SKILL.md` |

## Agents

- `.github/agents/superpowers-implementer.agent.md`
- `.github/agents/superpowers-spec-reviewer.agent.md`
- `.github/agents/superpowers-code-reviewer.agent.md`
```

- [ ] **Step 2: Commit**

```bash
git add templates/copilot-instructions.md
git commit -m "docs: update copilot-instructions template for file-based skills"
```

---

### Task 8: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite features section**

```diff
-## Features
-
-- **@superpowers agent** — A dedicated chat participant that loads and follows skills automatically
-- **Skill-aware responses** — The agent checks for relevant skills before every response
-- **Slash commands** — Quick access to core skills: `/brainstorm`, `/plan`, `/debug`, `/tdd`, `/review`
-- **LM Tools** — `#loadSkill` and `#listSkills` tools work in Copilot Agent mode
-- **Skills Browser** — Visual panel showing all available skills
-- **Local skills support** — Point to your own skills clone for custom or bleeding-edge skills
+## Features
+
+- **Skill workspace files** — On setup, copies all skills to `.github/skills/` for Copilot's native discovery
+- **Agent workspace files** — Copies `.agent.md` files to `.github/agents/` for Copilot custom agents
+- **@superpowers slash commands** — Quick access: `/tdd`, `/brainstorm`, `/plan`, `/debug`, `/review`
+- **Skills Browser** — Read-only visual panel showing all available skills
+- **Agent Browser** — Read-only visual panel showing all available agents
+- **Natural language skill discovery** — Copilot reads `.github/skills/*/SKILL.md` directly in chat
```

- [ ] **Step 2: Remove LM Tools and How It Works sections**

```diff
-## LM Tools (Agent Mode)
-
-In Copilot Agent mode, these tools are available:
-- **`#listSkills`** — List all available skills
-- **`#loadSkill`** — Load a specific skill's instructions
-- **`#runSubagent`** — Dispatch an isolated subagent for a single task
```

Remove or rewrite "How It Works" to reflect new architecture:

```markdown
## How It Works

1. **Workspace Setup** — On activation (or via command), the extension copies:
   - All `skills/*/SKILL.md` → `.github/skills/*/SKILL.md`
   - Selected `.agent.md` files → `.github/agents/*.agent.md`
   - Generates `.github/copilot-instructions.md` with skill listing
2. **Natural language discovery** — Copilot reads `.github/skills/*/SKILL.md` when a skill applies
3. **@superpowers** — Chat participant with slash commands (reads SKILL.md from `.github/skills/` with bundled fallback)
```

- [ ] **Step 3: Update Quick Start**

```diff
## Quick Start

1. Once installed, open Copilot Chat (`Cmd+Shift+I`).
-2. Type `@superpowers` and start a conversation.
+2. The extension will prompt you to set up the workspace. Choose "Set Up Now".
+3. Start chatting naturally — Copilot discovers skills from `.github/skills/` automatically.
+4. Or use `@superpowers /tdd` for quick skill loading.

**Acceptance test:**
-@superpowers Let's make a React todo list
-The agent should initiate the **brainstorming** skill before writing any code.
+Write in natural language: "Let's make a React todo list using TDD"
+Copilot should find and follow the test-driven-development skill from `.github/skills/`.
```

- [ ] **Step 4: Update Configuration section**

Remove Jira/Confluence and enabledSkills/enabledAgents configs:

```diff
| `superpowers.skillsSource` | `bundled` | `bundled` or `local` |
| `superpowers.localSkillsPath` | `""` | Path to a local skills repo (for `local` source) |
| `superpowers.autoSetupWorkspace` | `true` | Offer to create workspace files on activation |
```

- [ ] **Step 5: Update Commands section**

```diff
## Commands

- `Superpowers: Open Skills Browser` — View all skills in a webview panel
- `Superpowers: Open Agent Browser` — View all agents in a webview panel
- `Superpowers: Reload Skills` — Reload skills from disk
- `Superpowers: Setup Workspace` — Install skill files, agent files, and copilot-instructions into your workspace
```

- [ ] **Step 6: Verify file is well-formed**

Run: `cat README.md | wc -l`
Expected: Output shows a file length (no errors)

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: update README for thin extension architecture"
```

---

### Task 9: Full verification

**Files:**
- Any remaining compilation issues

- [ ] **Step 1: Run TypeScript compiler**

```bash
npx tsc --noEmit 2>&1
```

Expected: No output (clean compilation).
If errors appear, fix them — likely candidates:
- `extension.ts` still imports `createShaneParticipantHandler` → update import
- `extension.ts` references `superpowers.openSettings` or `superpowers.openMenu` → remove references
- `settingsPanel.ts` still imported in `agentBrowserPanel.ts` → verify `agentBrowserPanel.ts` only imports from `settingsPanel`'s `readAgents` function, which was in that file

- [ ] **Step 2: Run ESLint**

```bash
npx eslint src 2>&1
```

Expected: No errors. Fix any lint issues.

- [ ] **Step 3: Build the extension**

```bash
npm run compile 2>&1
```

Expected: No errors, `out/` directory updated.

- [ ] **Step 4: Remove unused dependencies from node_modules**

```bash
npm uninstall marked markdown-to-adf
```

Expected: Packages removed from node_modules and package-lock.json updated.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup after thin extension refactoring"
```

---

## Verification Checklist

After all tasks:

1. `npm run compile` — compiles without errors ✅
2. `npm run lint` — lint passes ✅
3. `code --install-extension shane-skills-1.0.0.vsix` — extension installs (after packaging) ✅
4. Extension activates without errors on VS Code startup ✅
5. Workspace Setup creates `.github/skills/` with all 16 skills ✅
6. Workspace Setup creates `.github/agents/` with 3 agents ✅
7. Workspace Setup generates `.github/copilot-instructions.md` with dynamic skill list ✅
8. `@superpowers /tdd` loads TDD skill content ✅
9. `@superpowers /skills` lists all skills ✅
10. Natural language "use TDD" in Copilot chat discovers skill from workspace files ✅
11. Skills Browser shows all skills (read-only) ✅
12. Agent Browser shows all agents (read-only) ✅
