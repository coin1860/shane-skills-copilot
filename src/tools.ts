import * as vscode from 'vscode';
import { SkillRegistry } from './skillRegistry';

/**
 * Registers the `superpowers_list_skills` language model tool.
 * This tool lists all available superpowers skills with names and descriptions.
 */
export function registerListSkillsTool(
  context: vscode.ExtensionContext,
  registry: SkillRegistry
): vscode.Disposable {
  return vscode.lm.registerTool<Record<string, never>>(
    'superpowers_list_skills',
    {
      async invoke(options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>, _token: vscode.CancellationToken) {
        const skills = registry.getEnabledSkills();

        if (skills.length === 0) {
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(
              'No skills found in Shane Skills. Check your extension configuration.'
            ),
          ]);
        }

        const lines: string[] = [
          '# Available Shane Skills\n',
          'Use the `superpowers_load_skill` tool to load any of these skills.\n',
        ];

        for (const skill of skills.sort((a, b) =>
          a.metadata.name.localeCompare(b.metadata.name)
        )) {
          lines.push(`## ${skill.metadata.name}`);
          if (skill.metadata.description) {
            lines.push(skill.metadata.description);
          }
          lines.push('');
        }

        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(lines.join('\n')),
        ]);
      },
    }
  );
}

interface LoadSkillInput {
  skillName: string;
}

/**
 * Registers the `superpowers_load_skill` language model tool.
 * Loads the full content of a named skill.
 */
export function registerLoadSkillTool(
  context: vscode.ExtensionContext,
  registry: SkillRegistry
): vscode.Disposable {
  return vscode.lm.registerTool<LoadSkillInput>(
    'superpowers_load_skill',
    {
      async invoke(options: vscode.LanguageModelToolInvocationOptions<LoadSkillInput>, _token: vscode.CancellationToken) {
        const skillName = options.input.skillName?.trim();
        if (!skillName) {
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(
              'Error: skillName is required. Use superpowers_list_skills to see available skills.'
            ),
          ]);
        }

        const skill = registry.getSkill(skillName);
        if (!skill) {
          const available = registry
            .getEnabledSkills()
            .map(s => s.metadata.name)
            .join(', ');
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(
              `Skill "${skillName}" not found. Available skills: ${available}`
            ),
          ]);
        }

        // Check if the skill is enabled
        if (!registry.isSkillEnabled(skillName)) {
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(
              `Skill "${skillName}" is disabled. Enable it in Shane Skills settings (Superpowers: Configure Skills & Agents).`
            ),
          ]);
        }

        const toolMapping = buildCopilotToolMapping();
        const content = `# Superpowers Skill: ${skill.metadata.name}\n\n${skill.content}\n\n---\n${toolMapping}`;

        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(content),
        ]);
      },
    }
  );
}

/**
 * Generates the Copilot tool mapping reference appended to every loaded skill.
 */
function buildCopilotToolMapping(): string {
  return `## Tool Mapping for GitHub Copilot (VS Code)

Skills use Claude Code tool names. When you encounter these in a skill, use your GitHub Copilot / VS Code equivalent:

| Skill references | GitHub Copilot / VS Code equivalent |
|-----------------|-------------------------------------|
| \`Read\` (file reading) | Use \`#file\` references or \`vscode.workspace.openTextDocument\` |
| \`Write\` / \`Edit\` (file editing) | Edit files via the chat interface or use \`WorkspaceEdit\` |
| \`Bash\` (run commands) | Use the VS Code Terminal tool or \`vscode.tasks.executeTask\` |
| \`Grep\` / \`Glob\` (search) | Use \`#codebase\` search or \`vscode.workspace.findFiles\` |
| \`TodoWrite\` (task tracking) | Track tasks in the chat conversation or as comments |
| \`Skill\` tool (invoke a skill) | Use \`#loadSkill\` tool reference |
| \`Task\` tool (dispatch subagent) | Use \`#runSubagent\` if available, or describe the subagent task clearly |
| \`WebSearch\` | Use the \`@github\` participant or search via browser |

When a skill mentions creating subagents: Copilot supports \`#runSubagent\` for isolated task delegation. Use it to keep context clean when implementing independent tasks.`;
}
