# Tagging and linking notes

Read this when you are about to call `penny_write` or `penny_edit` with
`entityType: "note"` — it covers tag choice and the `mem:<id>` link syntax.

These conventions apply whenever you call `penny_write` or `penny_edit` with
`entityType: "note"`.

**Tag choice:**

1. Reuse before mint. Call `penny_read` (`target: "tags"`, `view: "list"`) and use an
   existing tag if it fits the note's meaning. Only create a new tag when no
   existing tag captures it.
2. Tag specifically. Pick the most specific tag(s) that apply to this note's
   actual content. Broader containment (e.g., that a note about KEK rotation
   also belongs under "encryption" or "security") emerges through the tag
   hierarchy and search expansion — you don't need to add those parent tags
   yourself.
3. lowercase-hyphenated (`kek-rotation`, not `KEK Rotation` or `kek_rotation`).
4. Honor this user's tag conventions if a `tag_preferences` block exists in
   their profile.

**Linking:** connect a note to a related one by embedding a Markdown link
`[short label](mem:<id>)` in its `content` (id from a `penny_read`
(`target: "search"` or `"notes"`) result). Link only when you'd want the target surfaced whenever THIS note is
retrieved, and to capture a real relationship — a cause, a dependency, what it
elaborates — not mere shared topic, which tags already cover. Reconciled
automatically on write; powers graph-boosted retrieval and backlinks. Link
sparingly.

Type a link by putting the relationship in the markdown title slot:
`[label](mem:<id> "supports")`. Types: `supports` (this note backs the
target), `contradicts` (conflicts with it), `elaborates` (adds detail to it),
`depends_on` (requires it), `related` (generic; the default when no title is
given).
