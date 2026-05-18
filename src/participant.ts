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
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (workspace) {
    const wsPath = path.join(workspace.uri.fsPath, '.github', 'skills', skillDirName, 'SKILL.md');
    if (fs.existsSync(wsPath)) {
      return { content: fs.readFileSync(wsPath, 'utf8'), source: wsPath };
    }
  }

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

    if (request.command === 'setup') {
      await vscode.commands.executeCommand('superpowers.setupWorkspace');
      stream.markdown('✅ Workspace setup launched.');
      return {};
    }

    const skillName = request.command ? COMMAND_TO_SKILL[request.command] : undefined;
    if (!skillName) {
      stream.markdown(
        'Use a slash command: `/brainstorm`, `/plan`, `/debug`, `/tdd`, `/review`, `/skills`, or `/setup`.\n\n' +
        'Or just describe what you want — I can discover skills from `.github/skills/`.'
      );
      return {};
    }

    const skill = readSkillContent(skillName);
    if (!skill) {
      stream.markdown(
        `⚠️ Skill **${skillName}** not found. ` +
        'Run `/setup` to install workspace files, then try again.'
      );
      return {};
    }

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
