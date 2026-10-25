// THE REPAIR TURN — a paid-for answer that failed its validator goes back to the
// model with the exact paths that refused it, instead of being thrown away.
//
// WHY THIS EXISTS. A research or recalibration answer is minutes of the dearest
// model the app calls. When it fails the validator the creator used to get a
// list of sentences and a run to start again from nothing. The validator already
// knows WHERE each rule was broken (lib/notebook/failure.ts::NotebookFinding), so
// the cheap move is to hand the model its own object back: change these paths,
// leave the rest, return the whole thing.
//
// WHAT KEEPS IT HONEST. A model asked to "fix" an object will happily fix it by
// rewriting what it was not asked to touch, or by deleting the facts that were
// failing. Two guards refuse both, in code, before the validator is even asked:
//
//   · UNCHANGED-ELSEWHERE. The repaired object is diffed against the one the
//     model was handed. Every changed leaf must sit at or under a listed path.
//   · NO-SHRINK. A repair may not return fewer `facts` than it was given. A fact
//     that fails a rule is repaired, not removed to make the rule pass.
//
// A repair that survives both still re-enters the SAME validator the original
// answer failed, so a repaired object is never trusted more than a first draft.
//
// BOUNDED, AND EXHAUSTION IS AN OUTCOME. At most MAX_REPAIR_ATTEMPTS turns. When
// they are spent the result is `{ outcome: "exhausted", findings }` — a value the
// caller renders ("the draft is still yours, these paths still fail"), not a
// generic error. A provider that FAILS (timeout, no engine) is a different thing
// and is thrown as the TextError it is: that is an outage, not a bad repair.
//
// SERVER ONLY, like the router it calls.

import { notebookFindings, type NotebookFinding } from "@/lib/notebook/validate";

import { TextError } from "./errors";
import { reason } from "./router";
import type { TextProvenance, TextRequest, TextResult } from "./types";

/** The ticket's cap. A third attempt at the same object is a prompt problem. */
export const MAX_REPAIR_ATTEMPTS = 2;

/** The slice of the router this module uses, injectable so the guards and the
 *  loop are testable without a vendor. Production always passes nothing. */
export interface RepairDeps {
  reason: (req: TextRequest) => Promise<TextResult>;
}

export interface RepairInput {
  /** The refused answer, exactly as the first turn produced it. */
  draft: unknown;
  /** Why it was refused, addressed by path. */
  findings: readonly NotebookFinding[];
  /** The JSON Schema the answer must take; handed to the engine as on any turn. */
  schema: Record<string, unknown>;
  /** The validator the repaired object re-enters. Defaults to the notebook's. */
  validate?: (candidate: unknown) => NotebookFinding[];
  signal?: AbortSignal;
}

export type RepairResult =
  | {
      outcome: "repaired";
      /** The repaired object — validated, but not yet normalised: run it through
       *  the same parse door the first answer went through. */
      value: unknown;
      attempts: number;
      /** The serving turn's receipt (turn `repair`). */
      provenance: TextProvenance;
      /** One receipt per attempt, in order. */
      turns: readonly TextProvenance[];
      /** Summed over the attempts, and only when EVERY attempt was priced: a
       *  total that skips an unpriced turn would read as the whole bill. */
      costUsd?: number;
    }
  | {
      outcome: "exhausted";
      /** What still refuses the object (guard refusals first). */
      findings: NotebookFinding[];
      /** The last object that passed the guards — the creator's draft to keep. */
      draft: unknown;
      attempts: number;
      turns: readonly TextProvenance[];
      costUsd?: number;
    };

/* ─────────────────────────────────── paths ───────────────────────────────── */

/** `facts[2].sources[0].name` → `["facts","2","sources","0","name"]`. */
export function pathTokens(path: string): string[] {
  return path
    .split(/[.[\]]+/)
    .filter((t) => t.length > 0);
}

/** Is `inner` the same address as `outer`, or somewhere beneath it? */
function covers(outer: readonly string[], inner: readonly string[]): boolean {
  return outer.length <= inner.length && outer.every((t, i) => t === inner[i]);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Every address at which `after` differs from `before`, as token paths.
 *
 * An added or removed array element or object key is reported at its own
 * address, so deleting `facts[3]` is a change AT `facts[3]` and is licensed only
 * by a listed path that is `facts[3]` or an ancestor of it.
 */
export function changedPaths(before: unknown, after: unknown, at: string[] = []): string[][] {
  if (Array.isArray(before) && Array.isArray(after)) {
    const out: string[][] = [];
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      if (i >= before.length || i >= after.length) out.push([...at, String(i)]);
      else out.push(...changedPaths(before[i], after[i], [...at, String(i)]));
    }
    return out;
  }
  if (isRecord(before) && isRecord(after)) {
    const out: string[][] = [];
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!(k in before) || !(k in after)) out.push([...at, k]);
      else out.push(...changedPaths(before[k], after[k], [...at, k]));
    }
    return out;
  }
  return Object.is(before, after) ? [] : [at];
}

const display = (tokens: readonly string[]) =>
  tokens.reduce((p, t) => (/^\d+$/.test(t) ? `${p}[${t}]` : p ? `${p}.${t}` : t), "");

/* ─────────────────────────────────── guards ──────────────────────────────── */

const factCount = (o: unknown) => (isRecord(o) && Array.isArray(o.facts) ? o.facts.length : 0);

/**
 * The two guards. Returns the reasons a repair is refused — none means it may
 * go on to the validator.
 */
export function guardRepair(base: unknown, repaired: unknown, findings: readonly NotebookFinding[]): NotebookFinding[] {
  const out: NotebookFinding[] = [];

  const lost = factCount(base) - factCount(repaired);
  if (lost > 0)
    out.push({
      path: "facts",
      rule: `repair removed ${lost} fact${lost === 1 ? "" : "s"}`,
      observed: `${factCount(repaired)} facts, was ${factCount(base)}`,
    });

  const allowed = findings.map((f) => pathTokens(f.path));
  for (const changed of changedPaths(base, repaired)) {
    if (allowed.some((a) => covers(a, changed))) continue;
    const where = display(changed);
    out.push({
      path: where,
      rule: `repair changed ${where}, which is not one of the listed paths`,
      observed: "edited outside the findings",
    });
  }
  return out;
}

/* ─────────────────────────────────── prompt ──────────────────────────────── */

function repairPrompt(base: unknown, findings: readonly NotebookFinding[]): string {
  const list = findings
    .map((f, i) => `${i + 1}. ${f.path || "(whole answer)"} — ${f.rule}${f.observed ? ` [found: ${f.observed}]` : ""}`)
    .join("\n");
  return [
    "Below is a JSON object you produced earlier. A validator refused it for the reasons listed.",
    "",
    "Fix ONLY the listed paths. Change nothing else: every other field, array element and key must come back exactly as it is.",
    "Do not delete any fact to make a rule pass; repair it. Return the WHOLE object as JSON and nothing besides it.",
    "",
    "REFUSED AT",
    list,
    "",
    "THE OBJECT",
    JSON.stringify(base, null, 2),
  ].join("\n");
}

/* ──────────────────────────────────── turn ───────────────────────────────── */

/**
 * Repair a refused answer, at most MAX_REPAIR_ATTEMPTS times.
 *
 * Each attempt is one `repair` turn through the router (never a provider
 * directly). An attempt that returns something the guards refuse, or that the
 * validator still refuses, becomes the next attempt's starting point only when
 * it passed the guards; a guard-refused answer is discarded so the model is
 * never asked to build on an edit it was not allowed to make.
 */
export async function repairTurn(input: RepairInput, deps: RepairDeps = { reason }): Promise<RepairResult> {
  const topic = isRecord(input.draft) && typeof input.draft.topic === "string" ? input.draft.topic : "";
  const validate = input.validate ?? ((c: unknown) => notebookFindings(c, topic));

  let base = input.draft;
  let current: NotebookFinding[] = [...input.findings];
  let guardRefusals: NotebookFinding[] = [];
  const turns: TextProvenance[] = [];
  /** What each attempt the router refused as `bad-response` cost: it ran and
   *  billed, and has no provenance. `undefined` = the error reported none. */
  const refusedCosts: (number | undefined)[] = [];

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    guardRefusals = [];
    let served: TextResult;
    try {
      served = await deps.reason({
        prompt: repairPrompt(base, current),
        turn: "repair",
        schema: input.schema,
        signal: input.signal,
      });
    } catch (e) {
      // It answered with something that is not even an object of the schema's
      // shape: a spent attempt. Anything else is an outage and propagates.
      if (e instanceof TextError && e.kind === "bad-response") {
        const d = e.detail as { costUsd?: unknown } | undefined;
        refusedCosts.push(typeof d?.costUsd === "number" && Number.isFinite(d.costUsd) ? d.costUsd : undefined);
        guardRefusals = [{ path: "", rule: `the repair answer was unusable: ${e.message}`, observed: "bad-response" }];
        continue;
      }
      throw e;
    }
    turns.push(served.provenance);

    const candidate = served.json;
    if (!isRecord(candidate)) {
      guardRefusals = [{ path: "", rule: "the repair answer was not a JSON object", observed: typeof candidate }];
      continue;
    }

    guardRefusals = guardRepair(base, candidate, current);
    if (guardRefusals.length) continue;

    const still = validate(candidate);
    if (!still.length)
      return {
        outcome: "repaired",
        value: candidate,
        attempts: attempt,
        provenance: served.provenance,
        turns,
        costUsd: totalCost(turns, refusedCosts),
      };
    base = candidate;
    current = still;
  }

  return {
    outcome: "exhausted",
    findings: [...guardRefusals, ...current],
    draft: base,
    attempts: MAX_REPAIR_ATTEMPTS,
    turns,
    costUsd: totalCost(turns, refusedCosts),
  };
}

/** The sum of every attempt's cost - served turns and refused ones - or
 *  `undefined` when any of them was unpriced (or there was no attempt): an
 *  unpriced turn is unknown, never free, and a total that skipped a refused
 *  attempt would read as the whole bill. */
function totalCost(turns: readonly TextProvenance[], refused: readonly (number | undefined)[]): number | undefined {
  const all = [...turns.map((t) => t.costUsd), ...refused];
  if (!all.length || all.some((c) => c === undefined)) return undefined;
  return all.reduce<number>((n, c) => n + (c ?? 0), 0);
}
