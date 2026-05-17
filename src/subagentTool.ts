import * as vscode from 'vscode';
import { SkillRegistry } from './skillRegistry';

interface RunSubagentInput {
  task: string;
  context?: string;
  role: 'implementer' | 'spec-reviewer' | 'code-reviewer';
}

/**
 * System prompts for each subagent role.
 * These mirror the .agent.md files but are used when calling the LM directly
 * (rather than using the VS Code custom agents UI).
 */
const ROLE_SYSTEM_PROMPTS: Record<RunSubagentInput['role'], string> = {
  implementer: `You are a Superpowers Implementer — a focused subagent dispatched to complete ONE task from an implementation plan.

Your constraints:
- Implement ONLY what the task specifies. Not more. Not less. (YAGNI)  
- Follow TDD: write failing test → confirm failure → implement → confirm passing → commit
- Do NOT ask what to build — the task text tells you exactly what to do
- End with a STATUS report: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED

You have fresh context. You do NOT know anything from the coordinator's session except what is provided here.`,

  'spec-reviewer': `You are a Superpowers Spec Reviewer — you verify that the implementation matches the task specification exactly.

Check for:
1. Missing requirements — anything in the spec not implemented
2. Extra work — anything implemented beyond what the spec asked (scope creep)
3. Interface mismatches — wrong function signatures, method names, return types
4. Missing test coverage for spec behaviors

Respond with: SPEC REVIEW: ✅ COMPLIANT or SPEC REVIEW: ❌ ISSUES FOUND (with details)`,

  'code-reviewer': `You are a Superpowers Code Reviewer — spec compliance is confirmed, now review code quality.

Classify issues as Critical / Important / Minor.
Check: correctness, edge cases, error handling, test quality, naming clarity, DRY/YAGNI.

Respond with: CODE REVIEW: ✅ APPROVED or CODE REVIEW: ❌ ISSUES (with details by severity)`,
};

/**
 * Registers the superpowers_run_subagent LM tool.
 *
 * This is the VS Code equivalent of the Task tool used in subagent-driven-development.
 * It creates an isolated LM call with fresh context — the subagent only sees
 * what the coordinator explicitly provides.
 */
export function registerRunSubagentTool(
  context: vscode.ExtensionContext,
  registry: SkillRegistry
): vscode.Disposable {
  return vscode.lm.registerTool<RunSubagentInput>(
    'superpowers_run_subagent',
    {
      async invoke(
        options: vscode.LanguageModelToolInvocationOptions<RunSubagentInput>,
        token: vscode.CancellationToken
      ) {
        const { task, context: taskContext, role } = options.input;

        if (!task?.trim()) {
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart('Error: task is required.'),
          ]);
        }

        const validRoles: RunSubagentInput['role'][] = ['implementer', 'spec-reviewer', 'code-reviewer'];
        if (!validRoles.includes(role)) {
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(
              `Error: role must be one of: ${validRoles.join(', ')}`
            ),
          ]);
        }

        // Select the best available model for this role
        const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        if (!models.length) {
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart('Error: No Copilot language models available.'),
          ]);
        }
        const model = models[0];

        // Build the isolated subagent context
        const systemPrompt = ROLE_SYSTEM_PROMPTS[role];
        const messages: vscode.LanguageModelChatMessage[] = [
          vscode.LanguageModelChatMessage.User(systemPrompt),
          vscode.LanguageModelChatMessage.Assistant(
            `Understood. I am acting as the ${role} subagent with fresh, isolated context. I will only use information provided below.`
          ),
        ];

        if (taskContext?.trim()) {
          messages.push(
            vscode.LanguageModelChatMessage.User(
              `## Context from Coordinator\n\n${taskContext}`
            )
          );
          messages.push(
            vscode.LanguageModelChatMessage.Assistant('Context received.')
          );
        }

        messages.push(
          vscode.LanguageModelChatMessage.User(
            `## Your Task\n\n${task}\n\nPlease proceed.`
          )
        );

        // Stream the subagent response
        let result = '';
        try {
          const response = await model.sendRequest(messages, {}, token);
          for await (const chunk of response.text) {
            result += chunk;
            if (token.isCancellationRequested) break;
          }
        } catch (err) {
          if (err instanceof vscode.LanguageModelError) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(
                `Subagent error: ${err.message}`
              ),
            ]);
          }
          throw err;
        }

        const header = `## Subagent Result (${role})\n\n`;
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(header + result),
        ]);
      },
    }
  );
}
