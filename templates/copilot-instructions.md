<!-- SUPERPOWERS_BOOTSTRAP_v1 — managed by Superpowers for GitHub Copilot extension -->
# Superpowers Methodology

You have Superpowers — a complete software development methodology built on composable skills.

## The Fundamental Rule

**Before responding to ANY task that involves building, debugging, or implementing: check whether a Superpowers skill applies, and if so, load and follow it.**

Use the `#loadSkill` tool to read skill instructions. Use `#listSkills` to discover all skills.

If there is even a **1% chance** a skill might apply, you MUST load it first.

## When Skills Apply

| Situation | Skill to load |
|-----------|---------------|
| "Let's build X" / new feature | `brainstorming` — BEFORE any code |
| Have approved design | `writing-plans` — create implementation plan |
| Ready to implement | `subagent-driven-development` — dispatch subagents |
| Implementing each task | `test-driven-development` — RED→GREEN→REFACTOR |
| Stuck on a bug | `systematic-debugging` — 4-phase root cause |
| Before PR/merge | `requesting-code-review` |
| After code review | `receiving-code-review` |
| Finishing feature branch | `finishing-a-development-branch` |
| Need parallel execution | `dispatching-parallel-agents` |

## Skill Access in VS Code Copilot

- **`#loadSkill`** — Load any skill by name (e.g. `#loadSkill brainstorming`)
- **`#listSkills`** — List all available skills
- **`#runSubagent`** — Dispatch an isolated subagent for a single task
- **`@superpowers`** — Chat participant with slash commands (`/brainstorm`, `/plan`, `/debug`, `/tdd`, `/review`)

## Tool Mapping

Skills reference Claude Code tool names. Use these VS Code Copilot equivalents:

| Skill tool | VS Code Copilot equivalent |
|-----------|---------------------------|
| `Read` / file reading | `#file` references in chat |
| `Write` / `Edit` | Suggest edits through chat |
| `Bash` | VS Code Terminal / `#terminalLastCommand` |
| `Grep` / `Glob` | `#codebase` search |
| `TodoWrite` | Track tasks as markdown checkboxes in plan files |
| `Skill` tool | `#loadSkill` tool |
| `Task` (subagent) | `#runSubagent` tool |

## Sub-Agent Pattern (Subagent-Driven Development)

VS Code Copilot supports running subagents via `#runSubagent`. Follow this pattern:

1. Extract all tasks from the plan upfront
2. For each task: dispatch `implementer` subagent → `spec-reviewer` subagent → `code-reviewer` subagent
3. Fix issues and re-review before marking task done
4. Never skip review stages

See the `subagent-driven-development` and `dispatching-parallel-agents` skills for full workflow.

## Red Flags — Stop and Load the Skill

These thoughts mean you're rationalizing your way out of using a skill:

- "This is too simple for a skill"
- "Let me just start coding"
- "I know what this skill says"
- "This is just a quick fix"

**The skill tells you HOW. The user tells you WHAT. Always load the skill.**

## Custom Agents

This workspace has Superpowers `.agent.md` files in `.github/agents/`:
- `superpowers-implementer.agent.md` — implements individual tasks
- `superpowers-spec-reviewer.agent.md` — checks spec compliance
- `superpowers-code-reviewer.agent.md` — reviews code quality

These are automatically available as subagents when using `#runSubagent`.
