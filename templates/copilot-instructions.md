<!-- SUPERPOWERS_BOOTSTRAP_v2 — managed by Shane Skills for GitHub Copilot -->

# Superpowers Methodology Skills

这个 workspace 已安装 Superpowers 方法论 skill。所有 skill 文件在 `.github/skills/` 目录中，每个子目录下有一个 `SKILL.md` 文件。

## How to Use

1. 用户请求构建/调试/修复/规划/审查时，检查是否有匹配的 skill
2. 如果有（哪怕只有 1% 可能），用 `#file` 引用读取 `.github/skills/<name>/SKILL.md`
3. 严格按照 skill 的指示执行

## Tool Mapping

Skills reference Claude Code tool names. VS Code Copilot equivalents:
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
