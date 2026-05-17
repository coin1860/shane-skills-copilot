---
name: confluence
description: Search, create, update and read Confluence pages using the Confluence REST API
author: Shane Shou
---

# Confluence Skill

Use the `#confluence` LM tool (`shane_skills_confluence`) to interact with Confluence. Always call this tool rather than trying to access Confluence directly.

## Prerequisites

The user must have configured Confluence credentials in **Shane Skills → Configure Skills & Agents → Integrations**:
- **Base URL** — e.g. `https://yourcompany.atlassian.net` (Cloud) or `https://confluence.yourcompany.com` (Server/DC)
- **Email** — the email for the account (Cloud only; leave empty for Server/DC PAT)
- **Personal Access Token** — API token (Cloud) or PAT (Server/DC)

If credentials are missing, the tool will return a configuration error. Ask the user to open the settings panel.

---

## Content Format

You can provide the page `body` in **Markdown** format when using the `create` and `update` operations. The tool will automatically parse the Markdown and convert it into Confluence Storage Format (XHTML) before sending it to the API.

You can use standard Markdown features like:
- Headings (`# Heading`)
- Lists (`- item` or `1. item`)
- Bold and italic text (`**bold**`, `*italic*`)
- Code blocks (```` ```python ... ``` ````)
- Links (`[Text](url)`)

> **Note**: For complex Confluence macros, you can embed raw HTML/Storage Format within your Markdown if strictly necessary, but standard Markdown is preferred.

---

## Available Operations

### 1. Search Pages

Search using CQL (Confluence Query Language).

```json
{
  "op": "search",
  "cql": "space = 'ENG' AND title ~ 'architecture' ORDER BY lastmodified DESC",
  "limit": 10
}
```

**Common CQL patterns:**
- `space = 'KEY'` — filter by space
- `title ~ "keyword"` — title contains keyword
- `text ~ "database"` — full-text search
- `type = page` — only pages (not blog posts)
- `label = "runbook"` — pages with a label
- `ancestor = 12345` — children of a specific page
- `lastmodified >= "2024-01-01"` — recently modified

---

### 2. Get Page by ID

Retrieve a specific page including its full content (storage format) and version info.

```json
{
  "op": "get",
  "pageId": "123456789"
}
```

Returns: title, space, version number, URL, and full content body.

> **Important**: Note the `version` number returned — you'll need it for updates.

---

### 3. Get Page by Title

Find a page by its exact title within a space.

```json
{
  "op": "getByTitle",
  "spaceKey": "ENG",
  "title": "API Design Guidelines"
}
```

Returns the same detail as `get`. Use this when you don't know the page ID.

---

### 4. Create Page ✨

Create a new Confluence page in a specified space.

```json
{
  "op": "create",
  "spaceKey": "ENG",
  "title": "Authentication Service Architecture",
  "body": "<h1>Overview</h1><p>The authentication service handles all OAuth2 flows for the platform.</p><h2>Components</h2><ul><li>Token issuer</li><li>Session manager</li><li>LDAP bridge</li></ul>",
  "parentId": "98765432"
}
```

- `spaceKey` — the space key (e.g. `ENG`, `TEAM`, `DOC`)
- `title` — must be unique within the space
- `body` — storage format XML
- `parentId` — optional; creates as a child of that page

Returns the new page ID and URL.

---

### 5. Update Page ✏️

Update an existing page's title and/or content. **Version must be incremented** by 1 from the current version.

```json
{
  "op": "update",
  "pageId": "123456789",
  "title": "Authentication Service Architecture (v2)",
  "body": "<h1>Overview</h1><p>Updated content after the migration to OAuth2.1.</p>",
  "version": 4
}
```

> Always call `get` first to retrieve the current `version` number, then pass `version + 1` here.

---

### 6. List Spaces

Get a list of all available Confluence spaces.

```json
{
  "op": "getSpaces"
}
```

Returns space keys, names and descriptions. Use this to find the correct `spaceKey` for other operations.

---

## Typical Workflows

### Workflow: Document a new feature
1. `getSpaces` — find the right space key
2. `search` — check if a similar page already exists
3. `create` — create the documentation page (optionally under a parent)
4. Share the returned URL with the user

### Workflow: Update existing documentation
1. `getByTitle` or `search` — find the page
2. Note the `pageId` and `version` from the result
3. `update` — provide updated content with `version + 1`

### Workflow: Research / read documentation
1. `search` — `cql: "space = 'ENG' AND text ~ 'deployment'"`
2. `get` — read the full content of relevant pages
3. Summarize or extract information for the user

### Workflow: Audit pages in a space
1. `search` — `cql: "space = 'TEAM' AND type = page ORDER BY lastmodified ASC"`
2. `get` — review individual outdated pages
3. `update` — refresh stale content

---

## Tips

- Always call `get` before `update` to retrieve the current version number
- Space keys are case-sensitive (usually uppercase: `ENG`, `DOC`, `TEAM`)
- When `create` returns a 200 (not 201), the page was successfully created
- For Jira-linked content: reference Jira issues using `[PROJ-123|https://company.atlassian.net/browse/PROJ-123]` in the page body
- Large pages: split into multiple child pages for better organization
- The storage format XML must be valid — unclosed tags will cause API errors
