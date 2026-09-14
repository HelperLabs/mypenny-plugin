# Staleness, and when the Penny tools are missing

Read this when `meta.catalogVersion` is higher than the version this skill
targets, when a call fails with `Unknown tool`, when the host's attached tool
schemas lack a documented discriminator or argument, or when the `penny_*`
tools are simply not in your available tools this turn.

## Staleness — when this skill is behind the server

This skill targets MyPenny MCP catalog 0.4.0. Two signals mean the live server
has moved ahead of it:

- **At session start**, `penny_session_start` returns the live
  `meta.catalogVersion`. If it's higher than the version this skill targets
  (named in SKILL.md), this document is out of date.
- **A tool call fails with `Unknown tool`** — the live catalog no longer has a
  name this skill used.

On either signal, trust the server's current tool list and the guidance
`penny_session_start` returns over this document, and tell the user they can
update the MyPenny plugin (or remove and re-add the MyPenny connector) to
refresh it. A plugin-update notice injected at session start says the same
about the plugin as a whole — relay it to the user.

## When the host's tool schemas are behind

The installed skill, live server, and host's attached tool definitions can
refresh separately. A matching `meta.catalogVersion` does not prove the host
has refreshed its schemas. For example, catalog 0.4.0 documents `penny_read`
(`target: "projects"`) and Project writes with `patch`, `expectedRevision`,
and `operationId`; an attached schema without those fields may be an older
snapshot even though this skill is current.

Use the host's tool-discovery or refresh capability when available, then inspect
the attached schema again. If it still lacks the needed fields, explain the
specific mismatch and ask the user to refresh the connector or start a fresh
conversation. Do not force undeclared arguments, substitute a legacy operation,
or drop scope or revision fields to make a write fit. Continue supported work
and preserve any pending update until the required capability is available.

## When the Penny tools are missing entirely — absent is not down

Sometimes `penny_session_start` and the other `penny_*` tools are simply **not
in your available tools this turn** — no call fails, they're just not there.
This is common in long or compacted sessions and after a host upgrade: some
hosts defer-loading a connector's tools and drop them from the active set until
something needs them. **It is not evidence that MyPenny failed.** The interactive
tools and the background memory injection are separate paths — the plugin's
session-start hook may already have loaded this user's profile into the
conversation even while the callable tools are detached.

So when the tools are absent:

- **Never tell the user MyPenny is unavailable, down, or that their memory was
  lost.** Absent tools ≠ failed service. Say plainly that the Penny tools aren't
  attached to this turn and that you'll reconnect them — don't degrade silently
  into "I can't access your memory."
- **Reload them yourself first.** If your host lets you search for tools on
  demand, use its available discovery mechanism to load the Penny tools
  (search for "mypenny" or "memory"); do not assume a tool named `tool_search`
  exists on every host. Call `penny_session_start` if you have not already
  oriented this conversation. If you can't search, ask the user to send one
  more message first — a new turn re-attaches a deferred connector on many
  hosts, and it costs far less than a reconnect.
- If they stay missing across several turns, have the user refresh the connector:
  update the MyPenny plugin, or remove and re-add the MyPenny connector.
- If durable content came up while the tools were gone, **put that content in
  your reply** so the user keeps it, then `penny_write` it once the tools return
  — a note is only lost if neither you nor the user is holding it.
