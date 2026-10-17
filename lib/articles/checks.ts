// THE CHECK — deterministic measurements of a drafted post. Server only.
//
// No model judges anything here: every item is a count, a regex or a computed
// style read out of a real browser, and every item says what it measured and
// the bar it was held to. The owner's seven dimensions are the frame; five of
// them can be measured in part, and `storytelling` and `depth` cannot — those
// are reported as NOT MEASURED, never as passed, because a green row nobody
// measured reads exactly like a green row somebody did.
//
// The `critique` item (dimension truth, lib/articles/critique.ts) reads the
// critique's files: at least the quorum of reviewers completed every round, and
// every blocker factual finding has a disposition with a reason.
//
// The `trial-preview` and `trial-figure` items (dimension truth,
// checksStatic.ts trialItems) are measured for a run written around a trial and
// for no other: the opening cites the trial's record [1] and states its per-arm
// n, and a figure caption cites [1].
//
// A failed item does not stop the run. The report is shown at the human gate,
// failures first, and the human decides. (The registry's own publications gate
// re-checks the mechanical rules at landing, and that one does block.)
//
// RENDERED MEASUREMENTS use the repo's Playwright (already a dependency; the
// browser lane and lib/musicVideoExport.ts use it). The page is opened from
// disk with every http(s) request aborted and counted, at 390 and 1440 px.
// When no browser can be launched, those items are `not-measured` with the
// reason — the static items still stand.

/** The bars. One table, read by the checks AND by the prompt (lib/articles/
 *  prompt.ts fills the prompt's numbers from here), so the agent is asked for
 *  exactly what it will be measured against. The source floor matches the
 *  registry publications gate (ai-registry docs/publications-lane.md). */
export const THRESHOLDS = {
  minSources: 8,
  minPrimary: 3,
  minCounter: 1,
  minFigures: 5,
  maxFigureLabelWords: 12,
  minBodyPx1440: 18,
  minBodyPx390: 17,
  minChromePx: 13,
  readMinutes: [8, 14] as [number, number],
  wordsPerMinute: 230,
  /** The hard ceiling on the post's words as `postWords` counts them (prose, table cells and
   *  captions; not code, images or Sources). The outline budgets the writer to about
   *  `readMinutes[1]` minutes; this is the line a post may not cross at all. Set 2026-10-06
   *  above the longest accepted post (6,942 on the first run) and below runaway growth: the
   *  second run drifted to 6,497 raw words after accepting 94 of 98 findings. */
  maxWords: 7000,
  /** Words before the first `## ` section of post.md, the content preview included (title,
   *  subtitle and byline excluded). The owner's skim readers read the opening and the ending.
   *  Calibrated 2026-10-07 on the eight posts of the first three days: 316 to 642 words, the
   *  five over 450 being the ones the reflections called a wall before the first section. */
  maxWordsBeforeFirstSection: 450,
  /** Words of consecutive prose between two visuals. The paragraph-count cadence rule is met by
   *  splitting a paragraph; this one is not. The same eight posts ran 190 to 364 words between
   *  visuals; 300 catches the two longest. */
  maxProseRunWords: 300,
  /** A prose paragraph of at most `maxPaddingWords` words in one sentence is a one-liner; no more
   *  than this share of the prose may be one-liners (one overnight post had 46 percent). */
  maxPaddingWords: 40,
  maxPaddingShare: 0.3,
  /** Words in one list item of the closing section. */
  maxClosingListItemWords: 50,
  /** THE SKIM SPINE. A prose paragraph over this many words carries exactly one bold span, so a
   *  reader who follows the bold type alone follows the argument. Set 2026-10-16 from the post the
   *  owner approved (2026-10-14-rate-limiting): 28 spans in its sections, 377 of 3,055 section
   *  prose words, 12.3 percent. */
  skimMinParagraphWords: 45,
  skimSpanWords: [4, 25] as [number, number],
  /** Bold past this share of the section prose words stops guiding the eye; headroom over 12.3. */
  skimMaxShare: 0.15,
} as const;

// The check is split across checks*.ts beside this file. Everything below is the
// door: the names this file exported before the split, re-exported from where
// they now live, so every importer keeps the same path and the same names.
export { citedNumbers, firstPersonHits, htmlProse, mdProse, MD_IMAGE, postWords, STATED_READ_TIME, wordCount } from "./checksText";
export { closingListItemWords, proseRuns, proseStats, skimSpine, sourceListProblems, wordsBeforeFirstSection } from "./checksProse";
export { staticItems, statesTrialN, trialItems, type StaticInput } from "./checksStatic";
export { renderedItems } from "./checksRendered";
export { runCheck, summarize } from "./checksReport";
