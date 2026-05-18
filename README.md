# Shane Skills for GitHub Copilot

**Bring composable development skills into GitHub Copilot in VS Code.**

Shane Skills is a curated VS Code extension that supercharges GitHub Copilot with a rich set of composable methodology skills — TDD, brainstorming, systematic debugging, subagent-driven development, and more. Skills are installed as workspace files so Copilot discovers them naturally.

> **Author:** Shane H SHOU

## Features

- **Skill workspace files** — On setup, copies all skills to `.github/skills/` for Copilot's native discovery
- **Agent workspace files** — Copies `.agent.md` files to `.github/agents/` for Copilot custom agents
- **@superpowers slash commands** — Quick access: `/tdd`, `/brainstorm`, `/plan`, `/debug`, `/review`
- **Skills Browser** — Read-only visual panel showing all available skills
- **Agent Browser** — Read-only visual panel showing all available agents
- **Natural language skill discovery** — Copilot reads `.github/skills/*/SKILL.md` directly in chat

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
2. The extension will prompt you to set up the workspace. Choose "Set Up Now".
3. Start chatting naturally — Copilot discovers skills from `.github/skills/` automatically.
4. Or use `@superpowers /tdd` for quick skill loading.

**Acceptance test:**
```
Write in natural language: "Let's make a React todo list using TDD"
Copilot should find and follow the test-driven-development skill from `.github/skills/`.
```

## Slash Commands

| Command | Skill | When to use |
|---------|-------|-------------|
| `/brainstorm` | brainstorming | Before starting any new feature |
| `/plan` | writing-plans | After brainstorming, before coding |
| `/debug` | systematic-debugging | When stuck on a bug |
| `/tdd` | test-driven-development | During implementation |
| `/review` | requesting-code-review | Before submitting code |
| `/skills` | — | List all available skills |

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

- `Shane-Skills: Setup Workspace` — Install skill files, agent files, and copilot-instructions into your workspace
- `Shane-Skills: Open Skills Browser` — View all skills in a read-only webview panel
- `Shane-Skills: Open Agent Browser` — View all agents in a read-only webview panel
- `Shane-Skills: Reload Skills` — Reload skills from disk (useful after updating a local clone)

## How It Works

1. **Workspace Setup** — On activation (or via command), the extension copies:
   - All `skills/*/SKILL.md` → `.github/skills/*/SKILL.md`
   - Selected `.agent.md` files → `.github/agents/*.agent.md`
   - Generates `.github/copilot-instructions.md` with skill listing
2. **Natural language discovery** — Copilot reads `.github/skills/*/SKILL.md` when a skill applies
3. **@superpowers** — Chat participant with slash commands (reads SKILL.md from `.github/skills/` with bundled fallback)

## Requirements

- VS Code 1.100.0 or later
- GitHub Copilot extension with Chat enabled

## License

MIT — see [LICENSE](LICENSE)
