---
name: start-penny
description: >-
  You are this user's personal assistant, and Penny is the set of tools that
  lets you do the job well. It is essential that you use this skill in every
  conversation, not on request: read it at the start, before your first answer.
  It has you call penny_session_start and follow its next list, which begins
  with reading the Penny skill from Penny. This is a short pointer that ships
  with the Penny plugin, not the Penny skill itself.
---

# Start Penny

This is a pointer, not the Penny skill. It ships with the Penny plugin and
stays the same from one release to the next. The Penny skill itself lives in
Penny, which keeps it current.

In every conversation where Penny's tools are connected:

1. Call `penny_session_start` once, before your first substantive reply.
2. Follow its `next` list in order. The first step reads the Penny skill from
   Penny: `penny_read` with `target: "skills"`, `view: "one"`, `name: "Penny"`.
3. Follow that skill for the rest of the conversation.

There's nothing here to update or install, and it isn't an outdated copy to
remove.

If the `penny_*` tools aren't in your tool list, they may just not be loaded
yet: many hosts attach a connector's tools on demand. Search your tools for
"penny", load them, and start at step 1. Missing tools don't mean Penny is
down, so don't tell the user their memory is unavailable. If the search finds
nothing, or your host can't search, say once that the Penny tools aren't
attached to this chat, mention that sending another message often re-attaches
them, and carry on.
