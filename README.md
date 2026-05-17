# Shane Skills for GitHub Copilot

**Bring composable development skills into GitHub Copilot in VS Code.**

Shane Skills is a curated VS Code extension that supercharges GitHub Copilot with a rich set of composable methodology skills — TDD, brainstorming, systematic debugging, subagent-driven development, and more. The first batch of bundled skills comes from the Superpowers methodology; more skills will be added over time.

> **Author:** Shane H SHOU

## Features

- **@superpowers agent** — A dedicated chat participant that loads and follows skills automatically
- **Skill-aware responses** — The agent checks for relevant skills before every response
- **Slash commands** — Quick access to core skills: `/brainstorm`, `/plan`, `/debug`, `/tdd`, `/review`
- **LM Tools** — `#loadSkill` and `#listSkills` tools work in Copilot Agent mode
- **Skills Browser** — Visual panel showing all available skills
- **Local skills support** — Point to your own skills clone for custom or bleeding-edge skills

## Installation

You can install the compiled `.vsix` extension file directly into VS Code:

### Option 1: Install from GitHub Releases (Recommended)
1. Go to the [Releases](https://github.com/coin1860/shane-skills-copilot/releases) page on GitHub.
2. Download the latest `shane-skills-1.0.0.vsix` file under **Assets**.
3. In VS Code, open the Extensions view (`Cmd+Shift+X` on macOS, `Ctrl+Shift+X` on Windows/Linux).
4. Click the `...` (More Actions) button at the top-right of the Extensions view panel.
5. Select **Install from VSIX...**.
6. Choose the downloaded `shane-skills-1.0.0.vsix` file and click **Install**.

### Option 2: Install via Command Line
If you have the `code` CLI command installed in your terminal, run:
```bash
code --install-extension shane-skills-1.0.0.vsix
```

## Quick Start

1. Once installed, open Copilot Chat (`Cmd+Shift+I` on macOS, `Ctrl+Shift+I` on Windows/Linux).
2. Type `@superpowers` and start a conversation.

**Acceptance test:**
```
@superpowers Let's make a React todo list
```
The agent should initiate the **brainstorming** skill before writing any code.

## Slash Commands

| Command | Skill | When to use |
|---------|-------|-------------|
| `/brainstorm` | brainstorming | Before starting any new feature |
| `/plan` | writing-plans | After brainstorming, before coding |
| `/debug` | systematic-debugging | When stuck on a bug |
| `/tdd` | test-driven-development | During implementation |
| `/review` | requesting-code-review | Before submitting code |
| `/skills` | — | List all available skills |

## LM Tools (Agent Mode)

In Copilot Agent mode, these tools are available:

- **`#listSkills`** — List all available skills
- **`#loadSkill`** — Load a specific skill's instructions
- **`#runSubagent`** — Dispatch an isolated subagent for a single task

## Workflow

The bundled Superpowers skills follow this flow:

```
brainstorming → writing-plans → subagent-driven-development
     ↓                               ↓
  design doc                 test-driven-development
                                       ↓
                              requesting-code-review
                                       ↓
                           finishing-a-development-branch
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `superpowers.skillsSource` | `bundled` | `bundled` or `local` |
| `superpowers.localSkillsPath` | `""` | Path to a local skills repo (for `local` source) |
| `superpowers.autoSetupWorkspace` | `true` | Offer to create workspace files on activation |

### Using a local skills clone

```json
{
  "superpowers.skillsSource": "local",
  "superpowers.localSkillsPath": "/Users/you/Dev/shane-skills"
}
```

## Commands

- `Superpowers: Open Skills Browser` — View all skills in a webview panel
- `Superpowers: Reload Skills` — Reload skills from disk (useful after updating a local clone)
- `Superpowers: Setup Workspace` — Install copilot-instructions and agent files into your workspace

## How It Works

1. **Bootstrap injection** — On every `@superpowers` chat turn, the `using-superpowers` skill is injected as context, telling Copilot to check for relevant skills before responding.
2. **Skill loading** — The `#loadSkill` LM tool reads `SKILL.md` files from the bundled or local skills directory.
3. **Tool mapping** — Each loaded skill includes a Copilot-specific tool mapping so Claude Code tool names (`TodoWrite`, `Bash`, etc.) are understood in the VS Code context.

## Requirements

- VS Code 1.100.0 or later
- GitHub Copilot extension with Chat enabled

## License

MIT — see [LICENSE](LICENSE)
