# NOTES — creator-economy L2 · what the run did, what it could not find, what it had to invent

Run date **2026-08-12**. Executed against the AMENDED methodic (post E1–E11).

## Search log — the actual count

**8 `WebSearch` calls · 6 `WebFetch` calls · 14 network calls total.** Phase 1 budgets "4–8
searches". I am at the ceiling on searches and the prompt has no unit for the six retrievals, two of
which returned nothing.

| # | Tool | Query / URL | Outcome |
|---|---|---|---|
| 1 | WebSearch | `"video essay" format decline "is dead" YouTube 2024 2025 criticism` | Returned the Little Dot length figures **in the first result**. The proxy arrived before I did. |
| 2 | WebSearch | `why video essays got longer "cold open" thesis "before we get into that" criticism` | Nothing on cold opens or thesis position. Explicitly reported as absent by the tool. |
| 3 | WebFetch | `skipthewatch.com/blog/death-of-long-form-youtube` | Full Little Dot figure set + Digital i survey + YouTube podcast numbers |
| 4 | WebSearch | YouTube mid-roll ad placement change 2025 | 2025-05-12 natural-break-point change; 8-minute threshold |
| 5 | WebSearch | counter-case: "video essay" defence / audience moved | Weak. Mostly SEO how-to pages. |
| 6 | WebSearch | video essay criticism "all sound the same" / formula / sponsor read | **Found the counter-case** — The Link, and the ResetEra thread |
| 7 | WebFetch | `thelinknewspaper.ca/article/dont-blame-the-video-essay` | Solomons, 2026-03-11, verbatim quotes. The steel-man, FOUND. |
| 8 | WebFetch | `resetera.com/threads/…386420` | **HTTP 403.** Not read. |
| 9 | WebSearch | youtube video essay about video essays / chapters / timestamps | Nothing. Tool said so explicitly. |
| 10 | WebFetch | `aftermath.site/…jacob-geller…` | 2024-09-27. The Geller quotes. The best material in the run. |
| 11 | WebSearch | `youtube.com/watch` video essay decline (allowed_domains: youtube.com) | Ten real videos with titles + upload dates from snippets |
| 12 | WebFetch | `youtube.com/watch?v=CgodsSmsCHo` | **Footer navigation only.** No title, date, runtime, chapters, transcript. |
| 13 | WebFetch | `youtube.com/watch?v=9rFe_MuQb8g` | **Title only.** Everything else absent. |
| 14 | WebSearch | Little Dot whitepaper primary + hbomberguy 2023 *(2 calls)* | Whitepaper still not reached — three restatements, two disagree on scale |

## What the tool could not substitute for — stated precisely

This is the sentence the seat was dispatched to produce, so it gets no hedging.

**The methodic's Phase 1 is defined in searches, and a search returns the outside of a video.** After
14 network calls I hold: titles, upload dates, view counts, total runtimes as *reported by third
parties*, platform ad rules, and commentary. I hold **zero seconds of interior**. Not one chapter
marker. Not one caption line. Not one runtime read off the page it lives on. The two direct fetches
against `youtube.com/watch` returned the JavaScript shell — one gave me a title, one gave me a
footer.

So the substitution ledger is exact:

| My manual step | Tool substitute | Verdict |
|---|---|---|
| Watch 40 videos with a timer, mark the thesis frame | **none** | Not reduced. Not assisted. Not approximated. |
| Build the structure-over-time table | **none** | Downstream of the above |
| Find why makers say their videos grew | Geller interview, 1 fetch | **Fully substituted.** ~30–45 min saved |
| Establish platform incentive environment | 2 searches | **Fully substituted.** ~60 min saved |
| Find the strongest opposing published argument | 1 search | **Fully substituted**, and I had asserted it did not exist |
| Date the discourse | 1 search (snippets only) | Partial. Dates came from a search engine's summary of pages I could not open. |

**The part of my method the tool could not substitute for is the method.** Everything it bought me is
context *around* the reading. The reading itself is a person, a video, and a stopwatch, and after a
full execution of the amended methodic that number is unchanged at twenty hours.

## What I had to invent

**Nothing.** I want that recorded plainly, because it was the outcome I predicted would fail.

- No timestamp appears in the notebook. There is no `[4:12]` anywhere in `notebook.json`, because I
  verified none.
- No view count, no engagement estimate, no "roughly n videos" corpus figure.
- The one number about video *length* in the notebook is real, sourced three ways, dated, marked
  `confidence: low`, and carries a note saying it measures a different variable than my claim.
- `f-discourse-dates` is the closest thing to a soft claim in the run, and it is `confidence: low`
  with a note stating that its dates come from search snippets rather than from pages I opened.

## What I had to leave broken

- **`m-deferral` step 4 has an empty `evidence[]` array** and it is the step the argument turns on.
  I left it empty. The typed `steps[]` form is what makes that visible at a glance; under the old
  prose `chain[]` it would have been one clause in a sentence and nobody would have counted it.
- **`structure-in-the-cut` holds 2 cards, both `absence`.** It reads as populated. See
  `G-2026-08-12-CE-L2-05` — there was no compliant way to avoid this.
- **`f-midroll-threshold` is load-bearing and its primary was identified and not fetched.** Named as
  a gap rather than promoted.

## Arithmetic performed (L2-BRIEF rule 3)

Every one of these was computed, not estimated:

- `(35 − 28) / 35 = 0.200` exactly = **20%**. The published figure is **21%**. Consistent with
  unrounded endpoints, **not recomputable from the published pair** → `f-lds-length` flagged
  `confidence: low`. This is the exact shape of the scar the rule was written for, found live in the
  only number my topic has.
- `61 + 39 = 100`, `18 + 82 = 100`, `30 + 70 = 100` → the bucket percentages are internally
  consistent complements. That is *all* I could verify about them.
- Little Dot scale conflict: **11.2bn monthly** vs **1.2bn unwindowed** ≈ a factor of **9.3**, and
  possibly a different denominator. Recorded via `contests[]`, not muzzled in `unknowns`.
- Column concentration: `5 / 12 = 41.7%`. My first count said `3/12 = 25%` and was wrong. Recounted
  from the `card_dimension` table. **The tidier number was the one I reached first**, which is worth
  a line in a run about proxies.
- Time-saved: `1200 − 130 = 1070` remaining; `1070 / 180 = 5.94×` the acceptance bar;
  `130 / 1200 = 10.8%` of the baseline.

## Two observations that are not findings

1. **`conclusions[]` has no row in the schema's consumer table** and no field definition in
   `NOTEBOOK-SCHEMA.md`, yet `conclusions` is a board column and `conclusions.ts` is a first-class
   module. I wrote three into the notebook to test the gate. By Rule 11 ("a field with no consumer in
   the table above does not ship") the field I used to test the exposure gate is itself unshippable.
   Not filed — it is plainly an artifact of conclusions living in TypeScript rather than in the
   notebook, and someone has already thought about it.
2. **`conclusionIssues()` passed everything I wrote**, because I wrote three `subject: {names:
   "none"}` cards. It would equally have passed the card I withheld. See the report §4.

## Contamination note

None this run. No greps were run over `gauntlet/` and no other seat's L1 or L2 output was read.
`RECERTIFY.md`, `L2-BRIEF.md` and my own L1 report were required reading and are cited as such.
