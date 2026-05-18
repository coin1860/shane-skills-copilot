import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const BOOTSTRAP_MARKER = 'SUPERPOWERS_BOOTSTRAP_v1';

/**
 * WorkspaceSetup handles creating the .github/copilot-instructions.md and
 * .github/agents/*.agent.md files in the user's workspace.
 *
 * This is the VS Code equivalent of how superpowers injects itself via
 * AGENTS.md (Claude Code) or CLAUDE.md (Claude Code) or GEMINI.md (Gemini CLI).
 *
 * VS Code Copilot auto-reads .github/copilot-instructions.md in every workspace
 * and includes its content in every chat request — no user action required.
 */
export class WorkspaceSetup {
  constructor(private readonly extensionPath: string) {}

  /**
   * On activation, check if setup is needed and offer to install.
   * Called automatically when extension activates — never modifies files without consent.
   */
  async checkAndPrompt(context: vscode.ExtensionContext): Promise<void> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) return;

    const config = vscode.workspace.getConfiguration('superpowers');
    if (!config.get<boolean>('autoSetupWorkspace', true)) return;

    const instructionsPath = path.join(workspace.uri.fsPath, '.github', 'copilot-instructions.md');

    // Don't prompt if already set up
    if (fs.existsSync(instructionsPath)) {
      const content = fs.readFileSync(instructionsPath, 'utf8');
      if (content.includes(BOOTSTRAP_MARKER)) return;
    }

    // Don't prompt again if dismissed recently
    const dismissedKey = 'superpowers.setupDismissed';
    const dismissed = context.workspaceState.get<number>(dismissedKey, 0);
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - dismissed < oneWeek) return;

    const choice = await vscode.window.showInformationMessage(
      '⚡ Shane Skills: Set up this workspace? Creates .github/copilot-instructions.md and .agent.md files so GitHub Copilot automatically uses Superpowers skills.',
      'Set Up Now',
      'Not Now',
      'Never for This Workspace'
    );

    if (choice === 'Set Up Now') {
      await this.install(workspace);
    } else if (choice === 'Never for This Workspace') {
      await context.workspaceState.update(dismissedKey, Date.now() + 365 * 24 * 60 * 60 * 1000);
    } else {
      await context.workspaceState.update(dismissedKey, Date.now());
    }
  }

  /**
   * Install all Shane Skills workspace files.
   * Called by the setupWorkspace command or from checkAndPrompt.
   */
  async install(workspace: vscode.WorkspaceFolder): Promise<void> {
    try {
      const results: string[] = [];

      // 1. Create .github/copilot-instructions.md
      const instructionsResult = await this.installCopilotInstructions(workspace);
      results.push(instructionsResult);

      // 2. Create .github/agents/*.agent.md
      const agentResults = await this.installAgentFiles(workspace);
      results.push(...agentResults);

      // Show success summary
      const summary = results.join('\n');
      const action = await vscode.window.showInformationMessage(
        `⚡ Shane Skills workspace setup complete!\n\n${summary}`,
        'Open copilot-instructions.md',
        'OK'
      );

      if (action === 'Open copilot-instructions.md') {
        const instructionsPath = path.join(workspace.uri.fsPath, '.github', 'copilot-instructions.md');
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(instructionsPath));
        await vscode.window.showTextDocument(doc);
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Shane Skills setup failed: ${err}`);
    }
  }

  /**
   * Creates or appends to .github/copilot-instructions.md.
   * This file is auto-read by VS Code Copilot for every chat request.
   */
  private async installCopilotInstructions(workspace: vscode.WorkspaceFolder): Promise<string> {
    const githubDir = path.join(workspace.uri.fsPath, '.github');
    const instructionsPath = path.join(githubDir, 'copilot-instructions.md');

    fs.mkdirSync(githubDir, { recursive: true });

    const templatePath = path.join(this.extensionPath, 'templates', 'copilot-instructions.md');
    const bootstrapContent = fs.readFileSync(templatePath, 'utf8');

    if (fs.existsSync(instructionsPath)) {
      const existing = fs.readFileSync(instructionsPath, 'utf8');
      if (existing.includes(BOOTSTRAP_MARKER)) {
        return '✅ .github/copilot-instructions.md — already configured';
      }
      // Append to existing file
      fs.writeFileSync(instructionsPath, existing + '\n\n---\n\n' + bootstrapContent, 'utf8');
      return '✅ .github/copilot-instructions.md — Shane Skills section appended';
    }

    fs.writeFileSync(instructionsPath, bootstrapContent, 'utf8');
    return '✅ .github/copilot-instructions.md — created';
  }

  /**
   * Shows a multi-select QuickPick for agents, then copies selected ones to .github/agents/.
   * Respects the global enabledAgents setting — only enabled agents appear as options.
   */
  private async installAgentFiles(workspace: vscode.WorkspaceFolder): Promise<string[]> {
    const agentsDir = path.join(workspace.uri.fsPath, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const templatesAgentsDir = path.join(this.extensionPath, 'templates', 'agents');
    const results: string[] = [];

    // Determine which agents are globally enabled
    const enabledAgentsCfg = vscode.workspace
      .getConfiguration('superpowers')
      .get<string[]>('enabledAgents', []);

    const allAgents = readAgents(this.extensionPath);

    // Filter by global enabled setting (empty = all enabled)
    const availableAgents = enabledAgentsCfg.length === 0
      ? allAgents
      : allAgents.filter(a => enabledAgentsCfg.includes(a.id));

    if (availableAgents.length === 0) {
      return ['⚠️  No agents available — all agents are disabled in Shane Skills settings.'];
    }

    // Already-installed agents (pre-check)
    const existingIds = new Set(
      availableAgents
        .map(a => a.id + '.agent.md')
        .filter(f => fs.existsSync(path.join(agentsDir, f)))
        .map(f => f.replace('.agent.md', ''))
    );

    // Build QuickPick items
    const picks = availableAgents.map(a => ({
      label: a.displayName,
      description: a.id,
      detail: a.description,
      picked: !existingIds.has(a.id), // default checked if not already installed
      id: a.id,
    }));

    const selected = await vscode.window.showQuickPick(picks, {
      canPickMany: true,
      placeHolder: 'Select agent files to copy to .github/agents/ (pre-selected = not yet installed)',
      title: 'Shane Skills — Install Agents',
    });

    // User cancelled
    if (selected === undefined) {
      return ['⏭️  Agent installation skipped.'];
    }

    for (const pick of selected) {
      const templateFile = pick.id + '.agent.md';
      const srcPath = path.join(templatesAgentsDir, templateFile);
      const destPath = path.join(agentsDir, templateFile);

      if (!fs.existsSync(srcPath)) continue;

      if (fs.existsSync(destPath)) {
        results.push(`⚠️  .github/agents/${templateFile} — already exists, skipped`);
        continue;
      }

      fs.copyFileSync(srcPath, destPath);
      results.push(`✅ .github/agents/${templateFile} — created`);
    }

    if (results.length === 0) {
      results.push('ℹ️  No new agent files were installed.');
    }

    return results;
  }

  /**
   * Check if the current workspace has Shane Skills configured.
   */
  isConfigured(): boolean {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) return false;
    const instructionsPath = path.join(workspace.uri.fsPath, '.github', 'copilot-instructions.md');
    if (!fs.existsSync(instructionsPath)) return false;
    return fs.readFileSync(instructionsPath, 'utf8').includes(BOOTSTRAP_MARKER);
  }
}

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
