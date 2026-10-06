# Tagging and linking notes

Read this when you are about to call `penny_write` or `penny_edit` with
`entityType: "note"` — it covers tag choice and the `mem:<id>` link syntax.

These conventions apply whenever you call `penny_write` or `penny_edit` with
`entityType: "note"`.

**Tag choice:**

1. Tags are reusable subject labels: topics, projects, people, or named events
   you would deliberately retrieve or browse together. Use the smallest set
   that captures what the note is substantially about, not every detail or
   incidental mention. A tag should answer "what is this about?".
2. Reuse before mint. Start with tags already present in the profile, session
   context, or relevant search results. If none fits, use `penny_read`
   (`target: "search"`) on the subject and inspect the returned tags, or
   (`target: "tags"`, `view: "related"`) around the closest known tags.
   Use (`target: "tags"`, `view: "list"`) to inspect the taxonomy when needed,
   not as a mandatory step before every write. It returns the top tags by
   count; pass `query` (a name substring) to look one up.
3. Before creating a tag, name the useful subject grouping it adds. A new tag
   must capture a meaningful subject no existing tag covers, not a narrower
   paraphrase, spelling variant, or one-off detail. A useful niche subject may
   begin with one note; low frequency alone does not make it unnecessary.
4. Do not use date tags: dates, weekdays, months, years, seasons, or relative
   times belong in date metadata and note text. Notes are already dated and
   searchable by date. A named event such as `wwdc` is a subject; its year belongs
   in the text. Keep event dates in the text even when they differ from the
   note's own date.
5. Keep PR/issue numbers, record IDs, session/run labels, provenance, and
   temporary status updates in metadata or note text, not tags. Use subject
   tags such as `kek-rotation` instead of `pr-1701` or `deploy-pending`. Do not
   add generic labels such as `fact`, `note`, `turn`, `technical`, or `code`
   merely to describe the record; add a category such as `decision` only for a
   useful deliberate grouping. Judge the label's role in the note: `notes`
   can name a product's Notes feature, rather than the kind of record being
   saved. Existing tags still need to pass the subject test before reuse.
6. Prefer the most specific established subject tag. Do not add its broader
   parent merely to repeat containment (`kek-rotation` does not also need
   `encryption` and `security`). Reuse the established name for a person or project.
7. lowercase-hyphenated (`kek-rotation`, not `KEK Rotation` or `kek_rotation`).
8. Honor this user's tag conventions if a `tag_preferences` block exists in
   their profile.

For example, a note written on October 2 about a KEK rotation fix in PR #1701
can use `kek-rotation` and the established project tag. Keep the date, PR link,
and deployment outcome in the note and its metadata; they do not need tags.

**Cleaning up existing tags:** when cleanup is authorized, read the note before
removing its last useful tag. Replace bookkeeping-only labels with established
subjects from its content, creating a subject only when none fits. Preserve
meaningful niche subjects and labels that name the actual topic; inspect usage
before merging similar names. Preserve note content and original dates, and
verify the stored tags after editing.

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
