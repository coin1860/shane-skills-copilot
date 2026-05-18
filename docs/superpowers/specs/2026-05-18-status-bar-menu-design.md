# Status Bar Menu & Agent Browser UI Unification

**Goal:** Add a QuickPick menu to the status bar "Shane Skills" entry point and unify the Agent Browser UI with the Skills Browser visual style.

**Architecture:** Minimal changes to `src/extension.ts` (status bar command routing) and `src/agentBrowserPanel.ts` (HTML/CSS restyling). No new files, no new webview infrastructure.

---

## Part 1: Status Bar → QuickPick Menu

### Behavior

| State | Click behavior |
|-------|---------------|
| **Not configured** (`isConfigured() === false`) | Directly trigger `superpowers.setupWorkspace` |
| **Configured** | Show QuickPick with 4 items |

### QuickPick Items

| Label | Description | Command |
|-------|-------------|---------|
| `$(zap) Open Skills Browser` | Browse all 16 Shane Skills | `superpowers.openSkillsPanel` |
| `$(robot) Open Agent Browser` | View and open agent templates | `superpowers.openAgentsBrowser` |
| `$(refresh) Reload Skills` | Reload skills from disk | `superpowers.reloadSkills` |
| `$(gear) Setup Workspace` | Install skills & agents to `.github/` | `superpowers.setupWorkspace` |

### Files Changed

- **Modify:** `src/extension.ts`
  - Remove `statusBar.command = 'superpowers.openSkillsPanel'` (line 52)
  - Add new command `superpowers.showQuickMenu`
  - Update `updateStatusBar` tooltip for each state
  - Calling `superpowers.setupWorkspace` should refresh the QuickPick (or close it, user can reopen)

## Part 2: Agent Browser Visual Unification

### Changes to `src/agentBrowserPanel.ts`

- Rewrite `buildAgentsBrowserHtml` CSS to use same variable pattern as `buildSkillsPanelHtml`
- Keep existing functionality (install status, agent card details) but re-skin layout
- Title: `⚡ Shane Skills — Agent Browser` to visually match Skills Browser
- Grid layout: same `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))` and card styles
- Badge colors preserved: green for installed, purple for template

---

## Files Summary

| File | Change |
|------|--------|
| `src/extension.ts` | Change status bar command, add QuickPick handler |
| `src/agentBrowserPanel.ts` | Restyle HTML/CSS to match Skills Browser |

## Non-Goals

- No new webview panel types
- No merging Skills + Agent browsers into a single tabbed panel
- No changes to `src/participant.ts` or `src/workspaceSetup.ts`
