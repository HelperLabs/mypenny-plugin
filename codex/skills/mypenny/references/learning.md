# Learning: helping the user keep what they learn

Read this when the user wants to learn or get better at something over time,
when search shows they've asked the same question before, or when a Brief's
Instructions begin `Learning Project.`

You can teach well inside one conversation. What you lack is everything
between conversations: the user's goal, where they are, what they got wrong
last week in another app, and what's due for review. Penny keeps that. People
learn by producing (recalling, explaining, attempting), not by reading or
being explained to. When the user is learning, get them producing.

## Recognize it, and default to answering

Most questions are just-in-time needs. Answer them; don't turn a lookup into
a lesson. Switch to learning behavior only on a real signal:

- They say they're learning, practicing, or studying something, or want to
  understand rather than just fix.
- Something is coming: an exam, certification, interview, negotiation, talk.
- They're working through a course, book, language, instrument, or
  unfamiliar codebase.
- Search shows they asked the same conceptual question before. Mention it
  once, with the date ("You asked about this on Sept 12 too. Want to make it
  stick this time?"). If they decline, drop it for this topic. A declined
  learning Project offer is recorded as a Project interaction.

Steps 2 to 4 each need their go-ahead:

1. Answer. If a note is worth saving, record what they could or couldn't do,
   not what you explained.
2. Learning in this chat: teach by production (below). Save a miss when one
   shows up.
3. Learning over weeks: propose a learning Project.
4. Wanting reviews: propose a review log. Offer a scheduled review skill only
   if they want reminders.

## Teach by production

The Project's Instructions and the user's persona override these defaults.

- Have them try first. Give the smallest hint that unblocks before any answer.
- Explain only the stuck part, at their level. Then have them redo the whole
  thing without help.
- Ask one question at a time. Raise the difficulty until they miss, then
  teach to the miss.
- Have them explain it back in their own words; name exactly what's missing.
- Check their reasoning, not only the answer. Don't rewrite their work unless
  asked.
- For performance skills, spar: play the interviewer, client, or
  counterpart. Push back, then debrief.
- Keep them in charge: invite them to set the question, challenge your
  answer, and verify it. If they're only collecting answers, say so once and
  offer the alternative.
- Don't invent sources, numbers, or certainty, and don't agree with a
  half-right answer.

## The learning Project

A topic learned over weeks is a Project. Follow `references/projects.md` for
proposing, creating only on acceptance, and upkeep. Interview before you map:
goal, current level, how they'll be tested, time available. Then fill the
Brief:

- Purpose: the real goal in their terms, why it matters, how they'll be
  tested or use it, any deadline. "Pass a live stats screen for a
  data-analyst role on Oct 24," not "learn statistics."
- Plan: the parts in learning order, what depends on what, and where people
  usually get stuck, as suggested steps. Accepting a step makes it a To-do,
  so leave map parts as suggestions unless they want them as tasks.
- Progress: their level per part, in plain words, with the date last
  checked. Update it after any session that moved their level.
- Resources: explanations, videos, and exercises that worked for them, with
  a word on why. Attach the review tracker here.
- Instructions: begin with the line `Learning Project.`, then how they want
  to be taught this topic ("make me try first; no full solutions until I've
  attempted").

## Misses

When an answer reveals a misunderstanding (not a typo or a slip), save a
note:

- Content: the concept, what they said or did in their words, the correct
  idea in one line, the date and the app you're in, and `Status: open`.
- Tags: the topic's subject tag plus `misconception`.
- When they later produce it unaided, edit the note to
  `Status: resolved (<date>)`. Never delete a miss.

## The review log

One tracker per topic: name `Review: <topic>`, kind `log`, unit `question`.
Propose it before creating it, give it a description that states the entry
format below, and attach it to the Project. Log one entry per review
question, as you go:

    { "value": 1, "concept": "<stable name>", "box": <box after this review> }

- `value`: 1 if they produced it unaided, 0 if not. Always include it; one
  entry without a numeric `value` blanks the tracker's stats.
- `concept`: read earlier entries first and reuse the exact string. Pass a
  `limit` that covers the whole log; entry reads return only the newest 100
  by default. Keep each concept small enough to ask in one question.
- `box`: Leitner boxes. Box 1 is due after 1 day, 2 after 3 days, 3 after 7,
  4 after 14, 5 after 30. A new concept's first entry is box 2 if they
  produced it, box 1 if not. After that, unaided correct moves up one box
  (max 5). A miss goes back to box 1; open or reopen its
  miss note. A concept is due once its box interval has passed, counted
  from the date of its latest entry. Count calendar days, not hours: a
  concept logged in box 3 on a Saturday evening is due the next Saturday
  morning.

## Running a review

Review when they ask ("quiz me"), when they open a conversation about the
topic and something is due, or when they run their review skill. Never start
one in the middle of other work, and don't offer one in an unrelated
conversation (the one exception is below).

1. Read the Brief and the tracker entries (with a `limit`), and work out
   what's due. Oldest due first; about ten questions unless they want more.
2. Ask one at a time. They answer before you say anything, then give the
   correct idea briefly.
3. Log each entry immediately.
4. Close with one line: how many they recalled, what fell to box 1, and
   what's due next. Update Progress if a level changed.

If they want reminders, offer one review skill for all their learning
Projects: weekly, posture `read`, delivering to a note, attached to each
learning Project as a method. When session start lists it as due, offer it
once. That offer is the one exception to never raising a review in an
unrelated conversation, because they asked for it.

## The next session

When they come back to a learning Project to keep going ("next lesson",
"where were we?", or their reminder), work in this order:

1. Review what's due first. Keep it to a few questions when a lesson
   follows, oldest due first; the rest wait for next time or a full review.
2. Take the next Plan step that Progress doesn't show as done. If Progress
   shows a step it depends on as shaky, go back to that one instead.
3. Teach it by production, at their level, and end with one question on it.
   Log that question as the new concept's first entry.
4. Update Progress: their level on that part, and the date.

If they're working through a course or book somewhere else, skip step 2 and
ask what they covered since last time.

## Diagnosis

When they ask what they keep getting wrong, or a concept is missed a second
time, read the topic's misses (`penny_read`, `target: "notes"`, tags
`[<topic>, "misconception"]`, with a `limit` above the default 50) and the
review log. Look for one underlying misunderstanding that explains several
misses. Report it as a pattern with
dated evidence ("three misses, Oct 3 in Claude and Oct 8 and 12 in ChatGPT,
treat the sample as the population"), with no judgment and no pep talk. Then
offer to teach that one root and add it to the Plan.

## Don't

- Turn every question into a lesson.
- Raise a review in an unrelated conversation (apart from a due reminder
  skill they set up), or interrupt other work for one.
- Save course content. Save what they could do, what they missed, and which
  explanation worked.
- Reuse a note's sampleQuestions as quiz questions.
- Promise reviews will happen on their own. Nothing runs unless a
  conversation picks it up.
