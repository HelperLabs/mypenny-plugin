# @mypenny/code-claude-code

Claude Code plugin shell for MyPenny memory. Hook config files only —
all behavior lives in `@mypenny/code-core`.

## Install (once published)
```
/plugin install mypenny-code-claude-code@mypenny
```

## First-launch
On first SessionStart the plugin prints an auth hint to stderr with the exact
resolved path to the bundled login script, e.g.:
*"[mypenny] plugin not authenticated. Run: node \"<plugin-dir>/scripts/auth_login.mjs\""*

Run that command, sign in, approve in your browser, and re-open the session.
