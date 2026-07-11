# @mypenny/codex

Codex plugin shell for MyPenny memory. It installs the MyPenny MCP server
definition, MyPenny skill, and lifecycle hooks; hook behavior lives in
`@mypenny/core`.
Codex exposes the installed plugin directory through `CODEX_PLUGIN_ROOT`.

## Relationship To The ChatGPT App

The ChatGPT App and Codex plugin share the MyPenny MCP server, but they do not
provide the same behavior guarantees.

- ChatGPT App V1 uses MCP instructions, tool descriptions, listing copy, and
  the ChatGPT Memory Setup widget.
- Codex uses this plugin for a stronger lane: bundled MCP configuration, the
  MyPenny skill, and lifecycle hooks.
- Installing the ChatGPT App does not automatically make this Codex plugin
  active, and installing this Codex plugin does not automatically install the
  ChatGPT App.

## Install (once published)
```
codex plugin marketplace add HelperLabs/mypenny-plugin
```

Then open the Codex plugin browser and install `mypenny-codex`:

```
codex
/plugins
```

## Upgrade

Refresh the marketplace source, then restart Codex so the bundled skill, MCP
configuration, and hooks are reloaded:

```
codex plugin marketplace upgrade HelperLabs/mypenny-plugin
```

If Codex still shows the old plugin version, open `/plugins`, uninstall
`mypenny-codex`, install it again from the refreshed marketplace, and
start a new thread.

## SharedSpace Scope

The per-project subconscious block does not need configuration; Codex passes the
current working directory and MyPenny derives `subconscious:<projectKey>` from
the repo.

Do not set local SharedSpace or workspace id environment variables in Codex.
SharedSpace routing is server-side only: Peter or Aaron enables the hidden mode
on the Convex deployment and manually marks selected plugin-token grants as
server defaults. Unselected tokens stay private. Orgs are inferred from the
selected SharedSpace row on the server.
