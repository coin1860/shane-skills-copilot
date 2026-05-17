---
name: jira
description: Search, create, update and manage Jira issues using the Jira REST API
author: Shane Shou
---

# Jira Skill

Use the `#jira` LM tool (`shane_skills_jira`) to interact with Jira. Always call this tool rather than trying to access Jira directly.

## Prerequisites

The user must have configured Jira credentials in **Shane Skills → Configure Skills & Agents → Integrations**:
- **Base URL** — e.g. `https://yourcompany.atlassian.net` (Cloud) or `https://jira.yourcompany.com` (Server/DC)
- **Email** — the email for the account (Cloud only; leave empty for Server/DC PAT)
- **Personal Access Token** — API token (Cloud) or PAT (Server/DC)

If credentials are missing, the tool will return a configuration error. Ask the user to open the settings panel.

---

## Available Operations

### 1. Search Issues

Search using JQL (Jira Query Language).

```json
{
  "op": "search",
  "jql": "project = MYPROJ AND status = 'In Progress' ORDER BY created DESC",
  "maxResults": 10
}
```

**Common JQL patterns:**
- `project = KEY` — filter by project
- `assignee = currentUser()` — issues assigned to me
- `status in ('To Do', 'In Progress')` — by status
- `priority = High` — by priority
- `text ~ "login bug"` — full-text search
- `sprint in openSprints()` — current sprint
- `updated >= -7d` — updated in last 7 days

---

### 2. Get Issue Details

Retrieve a specific issue including description, comments, and metadata.

```json
{
  "op": "get",
  "issueKey": "PROJ-123"
}
```

Returns: summary, status, type, priority, assignee, description, and last 3 comments.

---

### 3. Create Issue ✨

Create a new issue in a project.

```json
{
  "op": "create",
  "project": "PROJ",
  "summary": "Fix login button not responding on mobile",
  "description": "Steps to reproduce:\n\n1. Open the app on iOS\n2. Tap the login button\n3. Nothing happens",
  "issueType": "Bug",
  "priority": "High",
  "assignee": "5b10a2844c20165700ede21g",
  "labels": ["mobile", "urgent"]
}
```

**issueType options** (common): `Bug`, `Story`, `Task`, `Epic`, `Subtask`  
**priority options**: `Highest`, `High`, `Medium`, `Low`, `Lowest`  
**assignee**: Use the Jira account ID (from user search or profile URL)

Returns the new issue key and URL.

---

### 4. Update Issue ✏️

Update an existing issue's fields. Only include fields you want to change.

```json
{
  "op": "update",
  "issueKey": "PROJ-123",
  "summary": "Updated summary text",
  "description": "Revised description with more detail.",
  "priority": "Medium",
  "assignee": "5b10a2844c20165700ede21g",
  "labels": ["backend", "api"]
}
```

All fields are optional — only provided fields will be updated.

---

### 5. Add Comment

Add a comment to an existing issue.

```json
{
  "op": "comment",
  "issueKey": "PROJ-123",
  "body": "I've investigated this. The root cause is the null check missing in the auth middleware. Fix is being deployed in the next release."
}
```

Multi-paragraph comments: use `\n\n` to separate paragraphs.

---

### 6. List Available Transitions

Get all available status transitions for an issue (needed before calling `transition`).

```json
{
  "op": "listTransitions",
  "issueKey": "PROJ-123"
}
```

Returns transition IDs and target status names.

---

### 7. Transition Issue (Change Status)

Move an issue to a new status. Use `listTransitions` first to get the correct transition ID.

```json
{
  "op": "transition",
  "issueKey": "PROJ-123",
  "transitionId": "31"
}
```

---

## Typical Workflows

### Workflow: Triage a bug report
1. `search` — find recent open bugs: `jql: "project = PROJ AND issuetype = Bug AND status = 'To Do' ORDER BY created DESC"`
2. `get` — read the details of specific issues
3. `update` — set priority and assignee
4. `comment` — leave a triage note
5. `transition` — move to "In Progress"

### Workflow: Create and track a story
1. `create` — create the story with description and acceptance criteria
2. `comment` — add implementation notes as work progresses
3. `listTransitions` → `transition` — advance the status

### Workflow: Sprint review
1. `search` — `jql: "sprint in openSprints() ORDER BY status ASC"`
2. `get` — review individual issues
3. `update` or `comment` — document findings

---

## Tips

- Always use `search` before `create` to avoid duplicates
- Use `listTransitions` before `transition` — IDs vary by project workflow
- For Jira Cloud: the `assignee` field requires a **Jira account ID** (UUID), not a username
- Large descriptions: break them into paragraphs separated by blank lines (`\n\n`)
