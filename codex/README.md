# @mypenny/codex

Codex plugin shell for Penny memory. It installs the Penny MCP server
definition, a `start-penny` pointer skill, and lifecycle hooks; hook behavior
lives in `@mypenny/core`. The pointer tells the AI to read the Penny skill from
Penny, so the plugin carries no copy of it.
Codex exposes the installed plugin directory to hooks through `PLUGIN_ROOT`
(and `CLAUDE_PLUGIN_ROOT`, for compatibility). It does not set
`CODEX_PLUGIN_ROOT`; hooks that used that name failed on every Codex install
until 2026-10-06. The hooks that inject guidance raise Codex's per-hook
`additionalContextLimit`, because the default (2,500 tokens, about 10 KB)
sends a longer block to a file the model has to go read.

The bundled MCP server URL is `https://app.mypenny.ai/mcp/codex`, a literal in
`.mcp.json` with **no environment override** — `${VAR}` templating there breaks
installation on some hosts (#814). The host is resolved when the plugin is built
(each distribution channel swaps in its own base) and the `/codex` path is this
shell's own. To point Codex at another engine, add your own MCP server to
`~/.codex/config.toml` instead of editing the installed plugin, which the next
update would overwrite.

## Relationship To The ChatGPT App

The ChatGPT App and Codex plugin share the Penny MCP server, but they do not
provide the same behavior guarantees.

- ChatGPT App V1 uses MCP instructions, tool descriptions, listing copy, and
  the ChatGPT Memory Setup widget.
- Codex uses this plugin for a stronger lane: bundled MCP configuration, the
  `start-penny` pointer skill, and lifecycle hooks.
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

The bundled MCP server needs its own sign-in once:

```
codex mcp login MyPenny
```

That sign-in is separate from the hooks' device-flow token (`~/.mypenny/token`):
the Penny tools in chat use the MCP sign-in, the hooks use the token.

## Upgrade

Refresh the marketplace source, then restart Codex so the `start-penny`
skill, MCP configuration, and hooks are reloaded:

```
codex plugin marketplace upgrade HelperLabs/mypenny-plugin
```

If Codex still shows the old plugin version, open `/plugins`, uninstall
`mypenny-codex`, install it again from the refreshed marketplace, and
start a new thread.

If you installed Penny before 0.1.32, sign in once after upgrading:

```
codex mcp login MyPenny
```

Codex keys OAuth credentials by server URL. Version 0.1.32 moves the Penny
connection to `/mcp/codex`, so credentials stored for `/mcp` do not carry over.

## SharedSpace Scope

The per-project subconscious block does not need configuration; Codex passes the
current working directory and Penny derives `subconscious:<projectKey>` from
the repo.

Do not set local SharedSpace or workspace id environment variables in Codex.
SharedSpace routing is server-side only: Peter or Aaron enables the hidden mode
on the Convex deployment and manually marks selected plugin-token grants as
server defaults. Unselected tokens stay private. Orgs are inferred from the
selected SharedSpace row on the server.
