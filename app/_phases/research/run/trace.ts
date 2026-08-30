// The research run — what the local Claude Code CLI actually does to a topic.
//
// Mocked, but shaped honestly: the real run 1 was ONE session and SIX web
// searches, and the expensive part was not retrieval, it was Phase 2
// (tension-finding), which is judgement. So the trace below is mostly
// judgement steps, and the searches are named with the domains
// pipeline/RESEARCH-PROMPT.md § Phase 1 requires.

import type { RunOutcome, TracePhase, TraceStep } from "./types";

export const PHASE_LABEL: Record<TracePhase, string> = {
  spine: "1 · factual spine",
  tension: "2 · find the tension",
  mechanisms: "3 · build the mechanisms",
  turns: "4 · pre-compute the turns",
  numbers: "5 · make the numbers felt",
  steelman: "6 · find the steel-man",
  unknowns: "7 · record what you don't know",
  fit: "8 · engine fit & currency",
  gaps: "9 · declare your gaps",
};

export const TRACE: TraceStep[] = [
  { id: "t1", phase: "spine", kind: "search", label: "the number", detail: "bitcoin all-time high 2025 price history — $126,198.07 on 6 Oct 2025, $80,660 by 21 Nov", ms: 2600 },
  { id: "t2", phase: "spine", kind: "search", label: "flows & plumbing", detail: "spot ETF inflows vs price — an analyst explanation of create-and-short by authorised participants", ms: 3100 },
  { id: "t3", phase: "spine", kind: "search", label: "structural actors", detail: "Strategy mNAV below 1.0; MSTR −70%; 32 BTC sold in June 2026", ms: 2800 },
  { id: "t4", phase: "spine", kind: "search", label: "macro", detail: "10-year yield ~4.5%, 30-year at 5%, Nasdaq correlation 0.70–0.80", ms: 2400 },
  { id: "t5", phase: "spine", kind: "search", label: "politics & regulation", detail: "Strategic Bitcoin Reserve signed 2025-03-06 — and still not built 16 months later", ms: 2900 },
  { id: "t6", phase: "spine", kind: "search", label: "the counter-case", detail: "explicitly searched for the strongest 'nothing unusual is happening' argument — the row most often skipped", ms: 3300 },
  { id: "t7", phase: "tension", kind: "judgement", label: "compare belief against evidence", detail: "testing five tension shapes against the material", ms: 4200 },
  { id: "t8", phase: "tension", kind: "write", label: "shape 1 fired — the prediction that came true and didn't work", detail: "adoption → demand → price ran exactly as forecast and produced the opposite outcome", ms: 1600 },
  { id: "t9", phase: "mechanisms", kind: "write", label: "3 mechanisms as BUT/THEREFORE chains", detail: "ETF plumbing · treasury flywheel · adoption-is-correlation. Every link is BUT or THEREFORE — no AND THEN survived", ms: 3800 },
  { id: "t10", phase: "turns", kind: "write", label: "4 reversals pre-computed", detail: "each obvious_reading stated generously — a strawman here becomes a strawman on screen", ms: 3000 },
  { id: "t11", phase: "numbers", kind: "write", label: "6 scale conversions", detail: "'roughly half its high' over '$62,000'; '$2 million from a company holding billions'", ms: 2100 },
  { id: "t12", phase: "steelman", kind: "write", label: "the strongest case against the verdict", detail: "2.5 years of debt coverage in cash; 380,000 BTC accumulated after the drawdown, not before", ms: 2600 },
  { id: "t13", phase: "unknowns", kind: "write", label: "4 unknowns, each with an impact", detail: "sources quote $60k/$62k/$65k in one week → the script may never state a precise figure", ms: 2200 },
  { id: "t14", phase: "fit", kind: "judgement", label: "5 engines assessed from the material", detail: "reversal-chain excellent · adjudication good · paradox-teaser good · briefing and parallel-case poor, with reasons", ms: 2400 },
  { id: "t15", phase: "gaps", kind: "write", label: "4 gaps declared", detail: "no primary on-chain data, no price series, no bear-case-is-wrong source, miner economics unexplored", ms: 1800 },
];

/** The three ways a run can end, as a driveable prototype control. Two are not
 *  a notebook, and only one of those two is a defect.
 *
 *  This list used to be a bare untyped array literal. Its sibling `STOP_AT`
 *  in `useResearchRun.ts` is `Record<RunOutcome, number>`, so a fourth ending
 *  added to `RunOutcome` fails the build right there — but this array had
 *  nothing tying its `key`s back to the same union, so the same addition
 *  would compile here, the picker in `controls.tsx` would render the same
 *  three pills it always has, and the new ending would simply never be
 *  reachable from the UI. Held to the union the way `structure.ts` holds
 *  `ALL_RULES` to `StructureRule`: the array `satisfies` the union's shape,
 *  and `OUTCOMES_ARE_EXHAUSTIVE` fails to compile if a member goes missing. */
const OUTCOMES_LIST = [
  {
    key: "notebook",
    label: "returns a notebook",
    hint: "the run that happened — 6 searches, 19 facts, 3 renders",
  },
  {
    key: "no-tension",
    label: "finds no tension",
    hint: "a successful run with no video in it. The prompt requires it to stop and say so.",
  },
  {
    key: "process-failed",
    label: "the local process dies",
    hint: "the CLI is a process on this machine — it can exit non-zero mid-phase",
  },
] as const satisfies readonly { key: RunOutcome; label: string; hint: string }[];

export const OUTCOMES: readonly { key: RunOutcome; label: string; hint: string }[] = OUTCOMES_LIST;

type Exhaustive<Union, Listed> = [Exclude<Union, Listed>] extends [never] ? true : never;

export const OUTCOMES_ARE_EXHAUSTIVE: Exhaustive<
  RunOutcome,
  (typeof OUTCOMES_LIST)[number]["key"]
> = true;

export const NO_TENSION_REASON =
  "Six searches, no tension. What people believe about this topic and what the evidence shows are the same thing — there is no expectation to break. A topic with no tension is not a video yet, and writing one anyway produces a wiki timeline. Reporting this is the correct end of the run, not a failure of it.";

export const PROCESS_ERROR =
  "claude exited 1 during phase 3 (build the mechanisms) — the local process was killed after 41s. Six searches completed and their results are on disk; the mechanisms are not written, so there is no beat chain and no notebook. Re-running resumes from the cached spine.";
