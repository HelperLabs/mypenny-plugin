# @mypenny/claude

Claude Code plugin shell for MyPenny memory. It bundles the MyPenny MCP
server definition, the MyPenny skill, and hook config files; hook behavior
lives in `@mypenny/core`.

The bundled MCP server points at `https://app.mypenny.ai/mcp` — a literal
URL, because surfaces like the Claude desktop app pass the config through
without shell-style env expansion (a `${VAR:-default}` template reaches the
connector dialog verbatim and fails URL validation). To point a dev install
at another engine, add a manual MCP server instead. On first use the host runs the
server's OAuth flow — approve it via `/mcp` in an interactive session. This is
separate from the hook auth below: the hooks and the MCP server authenticate
independently.

## Install (once published)
```
/plugin install mypenny-claude@mypenny
```

## Upgrade

Refresh the `mypenny` marketplace/source, then reinstall
`mypenny-claude` from the plugin browser or rerun:

```
/plugin install mypenny-claude@mypenny
```

After upgrading, restart Claude Code or open a fresh session so the bundled
MyPenny skill and hooks reload.

## First-launch
On first SessionStart the plugin prints an auth hint to stderr with the exact
resolved path to the bundled login script, e.g.:
*"[mypenny] plugin not authenticated. Run: node \"<plugin-dir>/scripts/auth_login.mjs\""*

Run that command, sign in, approve in your browser, and re-open the session.

## SharedSpace Scope

The per-project subconscious block does not need configuration; Claude Code
passes the current working directory and MyPenny derives
`subconscious:<projectKey>` from the repo.

Do not set local SharedSpace or workspace id environment variables in Claude
Code. SharedSpace routing is server-side only: Peter or Aaron enables the
hidden mode on the Convex deployment and manually marks selected plugin-token
grants as server defaults. Unselected tokens stay private. Orgs are inferred
from the selected SharedSpace row on the server.
