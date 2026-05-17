import * as vscode from 'vscode';
import { SkillRegistry } from './skillRegistry';

/**
 * Builds the bootstrap system prompt injected into every @superpowers chat session.
 * Mirrors what the OpenCode plugin does: load using-superpowers SKILL.md content
 * and prepend it so the agent always has context.
 */
export function buildBootstrapPrompt(registry: SkillRegistry): string {
  const bootstrapSkill = registry.getSkill('using-superpowers');
  const content = bootstrapSkill?.content ?? '';

  return `<EXTREMELY_IMPORTANT>
You have Superpowers.

**IMPORTANT: The using-superpowers skill content is included below. It is ALREADY LOADED — you are currently following it. Do NOT use the loadSkill tool to load "using-superpowers" again.**

${content}

## Tool Mapping for GitHub Copilot (VS Code)

Skills use Claude Code tool names. When you encounter these, use the GitHub Copilot equivalent:

| Skill references | GitHub Copilot / VS Code equivalent |
|-----------------|-------------------------------------|
| \`Read\` (file reading) | \`#file\` references or read files via chat |
| \`Write\` / \`Edit\` | Edit via chat suggestions or workspace edits |
| \`Bash\` (run commands) | VS Code Terminal or task execution |
| \`Grep\` / \`Glob\` | \`#codebase\` search |
| \`TodoWrite\` | Track tasks in chat or as code comments |
| \`Skill\` tool | \`#loadSkill\` tool reference |
| \`Task\` subagent | \`#runSubagent\` (if available) or isolated chat |

## Available Skills

Use \`#listSkills\` to see all skills, or \`#loadSkill\` with a skill name to read its instructions.

The core workflow skills are:
1. **brainstorming** — Before writing ANY code, explore requirements
2. **writing-plans** — Create bite-sized implementation plans
3. **subagent-driven-development** — Execute plans with fresh subagents per task
4. **test-driven-development** — RED-GREEN-REFACTOR cycle
5. **systematic-debugging** — 4-phase root cause process
6. **requesting-code-review** — Pre-review checklist
7. **finishing-a-development-branch** — Wrap up and merge
</EXTREMELY_IMPORTANT>`;
}

/**
 * Builds the bootstrap system prompt for the @shane-skills participant.
 */
export function buildShaneBootstrapPrompt(registry: SkillRegistry, command?: string): string {
  const jiraSkill = registry.getSkill('jira');
  const confluenceSkill = registry.getSkill('confluence');

  let skillInstructions = '';
  if (command === 'jira') {
    skillInstructions = jiraSkill?.content ?? '';
  } else if (command === 'confluence') {
    skillInstructions = confluenceSkill?.content ?? '';
  } else {
    skillInstructions = `### Jira Integration\n${jiraSkill?.content ?? ''}\n\n### Confluence Integration\n${confluenceSkill?.content ?? ''}`;
  }

  return `<EXTREMELY_IMPORTANT>
You are Shane Skills, an integration assistant created by Shane Shou (not superpowers).
You help the user interact with Atlassian Jira and Confluence using standard tools.

Always use your designated tools (jira and confluence) to perform operations. Do not make up results.

${skillInstructions}
</EXTREMELY_IMPORTANT>`;
}

/**
 * Maps /command names to the corresponding skill name.
 */
const COMMAND_TO_SKILL: Record<string, string> = {
  skills: '',                          // special: list skills
  brainstorm: 'brainstorming',
  plan: 'writing-plans',
  debug: 'systematic-debugging',
  tdd: 'test-driven-development',
  review: 'requesting-code-review',
};

/**
 * Creates and returns the @superpowers chat participant handler.
 */
export function createParticipantHandler(
  registry: SkillRegistry
): vscode.ChatRequestHandler {
  return async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    // Handle /skills command — list all skills
    if (request.command === 'skills') {
      return handleListSkills(registry, stream);
    }

    // Handle /setup command — delegate to the workspace setup command
    if (request.command === 'setup') {
      await vscode.commands.executeCommand('superpowers.setupWorkspace');
      stream.markdown('✅ Workspace setup launched. Check the notification or status bar for details.');
      return {};
    }

    // Handle other slash commands that map to skills
    const mappedSkill = request.command ? COMMAND_TO_SKILL[request.command] : undefined;

    // If a skill is mapped but disabled, inform the user
    if (mappedSkill && !registry.isSkillEnabled(mappedSkill)) {
      stream.markdown(
        `> ⚠️ The **${mappedSkill}** skill is currently disabled.\n>\n` +
        `> Enable it via **Superpowers: Configure Skills & Agents** in the Command Palette.`
      );
      return {};
    }

    // Build messages for the LLM
    const messages: vscode.LanguageModelChatMessage[] = [];

    // System-like context: bootstrap the superpowers methodology
    const config = vscode.workspace.getConfiguration('superpowers');
    const autoInject = config.get<boolean>('autoInjectBootstrap', true);

    if (autoInject) {
      const bootstrap = buildBootstrapPrompt(registry);
      messages.push(
        vscode.LanguageModelChatMessage.User(bootstrap)
      );
      messages.push(
        vscode.LanguageModelChatMessage.Assistant(
          'I have Superpowers. I\'ll follow the skill system and check for relevant skills before responding to any request.'
        )
      );
    }

    // If a specific skill was requested via slash command, pre-load it
    if (mappedSkill) {
      const skill = registry.getSkill(mappedSkill);
      if (skill) {
        messages.push(
          vscode.LanguageModelChatMessage.User(
            `Please load and follow the "${mappedSkill}" skill for this request:\n\n---\n${skill.content}\n---`
          )
        );
        messages.push(
          vscode.LanguageModelChatMessage.Assistant(
            `I'll follow the ${mappedSkill} skill for this request.`
          )
        );
      }
    }

    // Add previous conversation history
    for (const turn of context.history) {
      if (turn instanceof vscode.ChatRequestTurn) {
        messages.push(
          vscode.LanguageModelChatMessage.User(turn.prompt)
        );
      } else if (turn instanceof vscode.ChatResponseTurn) {
        const responseText = turn.response
          .filter((p): p is vscode.ChatResponseMarkdownPart => p instanceof vscode.ChatResponseMarkdownPart)
          .map(p => p.value.value)
          .join('');
        if (responseText) {
          messages.push(
            vscode.LanguageModelChatMessage.Assistant(responseText)
          );
        }
      }
    }

    // Add the current user message, including any file/variable references
    const userContent = buildUserMessage(request);
    messages.push(vscode.LanguageModelChatMessage.User(userContent));

    // Stream response from the model
    try {
      const model = request.model;
      const tools = collectTools();

      const response = await model.sendRequest(messages, { tools }, token);

      let toolCallsInProgress = false;
      const toolCallBuffer: Map<string, { name: string; argsText: string }> = new Map();

      for await (const chunk of response.stream) {
        if (chunk instanceof vscode.LanguageModelTextPart) {
          stream.markdown(chunk.value);
        } else if (chunk instanceof vscode.LanguageModelToolCallPart) {
          toolCallsInProgress = true;
          toolCallBuffer.set(chunk.callId, {
            name: chunk.name,
            argsText: JSON.stringify(chunk.input),
          });

          // Execute the tool call
          await handleToolCall(chunk, request.toolInvocationToken, registry, stream, token);
        }
      }

      if (!toolCallsInProgress) {
        // No tool calls — response was streamed directly
      }
    } catch (err) {
      if (err instanceof vscode.LanguageModelError) {
        if (err.code === vscode.LanguageModelError.Blocked.name) {
          stream.markdown('> ⚠️ The request was blocked by the content policy.');
          return { metadata: { blocked: true } };
        }
        stream.markdown(`> ⚠️ Language model error: ${err.message}`);
      } else {
        throw err;
      }
    }

    return {};
  };
}

/**
 * Handles the /skills command by listing all skills.
 */
async function handleListSkills(
  registry: SkillRegistry,
  stream: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
  const skills = registry.getEnabledSkills().sort((a, b) =>
    a.metadata.name.localeCompare(b.metadata.name)
  );

  stream.markdown('## ⚡ Available Shane Skills\n\n');
  stream.markdown('Use `/brainstorm`, `/plan`, `/debug`, `/tdd`, `/review` for quick access, or mention any skill name in your message.\n\n');

  for (const skill of skills) {
    stream.markdown(`**${skill.metadata.name}**`);
    if (skill.metadata.description) {
      stream.markdown(` — ${skill.metadata.description}`);
    }
    stream.markdown('\n\n');
  }

  stream.markdown('\n💡 **Tip:** Shane Skills automatically checks relevant skills before responding. You can also explicitly ask to "use the brainstorming skill" or "follow test-driven-development".\n');


  return {};
}

/**
 * Builds a user message string from a ChatRequest, including references.
 */
function buildUserMessage(request: vscode.ChatRequest): string {
  let content = request.prompt;

  // Append reference summaries if present
  if (request.references.length > 0) {
    const refSummaries: string[] = [];
    for (const ref of request.references) {
      if (ref.value instanceof vscode.Uri) {
        refSummaries.push(`[file: ${ref.value.fsPath}]`);
      } else if (typeof ref.value === 'string') {
        refSummaries.push(`[${ref.id}: ${ref.value}]`);
      }
    }
    if (refSummaries.length > 0) {
      content += `\n\nContext references: ${refSummaries.join(', ')}`;
    }
  }

  return content;
}

/**
 * Returns LM tools that the model can call during the chat request.
 */
function collectTools(): vscode.LanguageModelToolInformation[] {
  return vscode.lm.tools.filter(
    t => t.name === 'superpowers_load_skill' || t.name === 'superpowers_list_skills'
  );
}

/**
 * Returns Shane LM tools that the model can call during the chat request.
 */
function collectShaneTools(): vscode.LanguageModelToolInformation[] {
  return vscode.lm.tools.filter(
    t => t.name === 'shane_skills_jira' || t.name === 'shane_skills_confluence'
  );
}

/**
 * Creates and returns the @shane-skills chat participant handler.
 */
export function createShaneParticipantHandler(
  registry: SkillRegistry
): vscode.ChatRequestHandler {
  return async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    const messages: vscode.LanguageModelChatMessage[] = [];

    // Bootstrap Shane Skills context
    const bootstrap = buildShaneBootstrapPrompt(registry, request.command);
    messages.push(vscode.LanguageModelChatMessage.User(bootstrap));
    messages.push(
      vscode.LanguageModelChatMessage.Assistant(
        'I am Shane Skills, created by Shane Shou. I will help you manage Jira and Confluence using standard tools.'
      )
    );

    // Add previous conversation history
    for (const turn of context.history) {
      if (turn instanceof vscode.ChatRequestTurn) {
        messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
      } else if (turn instanceof vscode.ChatResponseTurn) {
        const responseText = turn.response
          .filter((p): p is vscode.ChatResponseMarkdownPart => p instanceof vscode.ChatResponseMarkdownPart)
          .map(p => p.value.value)
          .join('');
        if (responseText) {
          messages.push(vscode.LanguageModelChatMessage.Assistant(responseText));
        }
      }
    }

    // Add the current user message, including any references
    const userContent = buildUserMessage(request);
    messages.push(vscode.LanguageModelChatMessage.User(userContent));

    // Stream response from the model
    try {
      const model = request.model;
      const tools = collectShaneTools();

      const response = await model.sendRequest(messages, { tools }, token);

      let toolCallsInProgress = false;
      for await (const chunk of response.stream) {
        if (chunk instanceof vscode.LanguageModelTextPart) {
          stream.markdown(chunk.value);
        } else if (chunk instanceof vscode.LanguageModelToolCallPart) {
          toolCallsInProgress = true;
          // Execute the Jira/Confluence tool call
          await handleToolCall(chunk, request.toolInvocationToken, registry, stream, token);
        }
      }
    } catch (err) {
      if (err instanceof vscode.LanguageModelError) {
        if (err.code === vscode.LanguageModelError.Blocked.name) {
          stream.markdown('> ⚠️ The request was blocked by the content policy.');
          return { metadata: { blocked: true } };
        }
        stream.markdown(`> ⚠️ Language model error: ${err.message}`);
      } else {
        throw err;
      }
    }

    return {};
  };
}

/**
 * Executes a tool call and streams the result back into the response.
 */
async function handleToolCall(
  call: vscode.LanguageModelToolCallPart,
  toolInvocationToken: vscode.ChatParticipantToolToken | undefined,
  registry: SkillRegistry,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<void> {
  try {
    const result = await vscode.lm.invokeTool(
      call.name,
      { input: call.input, toolInvocationToken },
      token
    );

    for (const part of result.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        // Show list-skills output directly; load-skill results stay in LLM context
        if (call.name === 'superpowers_list_skills') {
          stream.markdown(part.value);
        }
      }
    }
  } catch (err) {
    console.error(`[Shane Skills] Tool call ${call.name} failed:`, err);
  }
}
