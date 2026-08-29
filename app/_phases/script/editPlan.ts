// THE EDIT PLAN — what the model returns, and what the app does with it.
//
// The shape is deliberately "a list of edits", not "a set of scripts". A model
// that hands back whole scripts voids every review the creator already did and
// every check computed against the beats it discarded; see
// pipeline/RECALIBRATE-PROMPT.md § THE RULE.
//
// Applying a plan produces NEW BEATS, and attribution is recomputed from those
// beats. That is what closes the gap the UAT pass found: with the mock, weights
// moved while the beat chain stayed put, so the Candidates tab showed a script
// that no longer matched its own numbers.

import type { Beat, Connector, ScriptRender } from "./types";
import { RENDERS, RENDER_BY_ID } from "./renders";
import { splitAcross, type Usage } from "./impact";

export type EditOp = "retime" | "rewrite" | "cut" | "insert";

export interface Edit {
  renderId: string;
  op: EditOp;
  /** The beat being changed. On `insert`, the beat to insert AFTER. */
  beatAt?: string;
  afterBeatAt?: string;
  /** `retime` and `insert`. */
  seconds?: number;
  /** `rewrite` and `insert`. */
  text?: string;
  label?: string;
  connector?: Connector;
  /** Notebook card ids the beat rests on. Required on rewrite/insert — the
   *  matrix is recomputed from this, so a wrong list produces a lying matrix. */
  cards?: string[];
  why: string;
}

export interface EditPlan {
  edits: Edit[];
  refusals: { note: string; why: string }[];
  unchanged: string[];
  summary: string;
}

/** The shape the engine must return, stated to it as JSON Schema.
 *
 *  The local CLI has no `output_config.format`, so unlike the API path this is a
 *  REQUEST, not a guarantee — which is exactly why `parseEditPlan` below exists.
 *  Trading structured outputs for subscription auth means the validation the
 *  server used to do has to happen here instead; that cost is real and is paid
 *  in one function rather than spread through the callers. */
export const EDIT_PLAN_SCHEMA = {
  type: "object",
  properties: {
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          renderId: { type: "string", enum: RENDERS.map((r) => r.id) },
          op: { type: "string", enum: ["retime", "rewrite", "cut", "insert"] },
          beatAt: { type: "string", description: "mm:ss of the beat being changed" },
          afterBeatAt: { type: "string", description: "insert only — the beat to insert after" },
          seconds: { type: "integer", description: "retime/insert — how long the beat holds" },
          text: { type: "string", description: "rewrite/insert — the spoken line" },
          label: { type: "string", description: "insert — the beat's craft label" },
          connector: { type: "string", enum: ["BUT", "THEREFORE"], description: "insert — link to the previous beat" },
          cards: {
            type: "array",
            items: { type: "string" },
            description: "rewrite/insert — notebook card ids this beat rests on. Required.",
          },
          why: { type: "string", description: "written for the person deciding whether to accept it" },
        },
        required: ["renderId", "op", "why"],
        additionalProperties: false,
      },
    },
    refusals: {
      type: "array",
      items: {
        type: "object",
        properties: { note: { type: "string" }, why: { type: "string" } },
        required: ["note", "why"],
        additionalProperties: false,
      },
    },
    unchanged: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
  required: ["edits", "refusals", "unchanged", "summary"],
  additionalProperties: false,
} as const;

/* ------------------------------------------------------------ application */

const toS = (m: string) => {
  const [a, b] = m.split(":").map(Number);
  return (a || 0) * 60 + (b || 0);
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** How long a beat holds, as a whole second.
 *
 *  The schema asks for an integer, but the local CLI has no `output_config`, so
 *  that is a request rather than a guarantee (see the note on EDIT_PLAN_SCHEMA)
 *  — and a fractional duration has nowhere to live: `mmss` would lay the next
 *  beat at "1:07.5", and the share split would have to round it anyway. Rounded
 *  once, here, where the number enters. */
const holds = (s: number) => Math.max(1, Math.round(s));

export interface AppliedRender {
  beats: Beat[];
  /** beat mark → card ids, carried by the beats themselves. */
  attribution: Record<string, string[]>;
  /** Seconds each beat holds, after the edits. */
  seconds: Record<string, number>;
}

/** Apply one render's edits, producing new beats and a fresh attribution.
 *
 *  Beat marks are RECOMPUTED from durations rather than trusted from the model:
 *  a plan that retimes beat 3 changes where beats 4..n start, and asking a model
 *  to keep a whole timeline arithmetically consistent is asking it to do the
 *  job a `reduce` does perfectly. */
export function applyEdits(
  render: ScriptRender,
  edits: Edit[],
  baseAttribution: Record<string, string[]>,
): AppliedRender {
  const mine = edits.filter((e) => e.renderId === render.id);

  // Start from the current beats, each with its duration and cards.
  type Row = { beat: Beat; seconds: number; cards: string[] };
  const rows: Row[] = render.beats.map((b, i) => {
    const next = i + 1 < render.beats.length ? toS(render.beats[i + 1].at) : render.durationS;
    return {
      beat: { ...b },
      seconds: Math.max(0, next - toS(b.at)),
      cards: baseAttribution[b.at] ?? [],
    };
  });

  const at = (mark?: string) => rows.findIndex((r) => r.beat.at === mark);

  for (const e of mine) {
    if (e.op === "cut") {
      const i = at(e.beatAt);
      if (i >= 0) rows.splice(i, 1);
      continue;
    }
    if (e.op === "retime") {
      const i = at(e.beatAt);
      if (i >= 0 && typeof e.seconds === "number") rows[i].seconds = holds(e.seconds);
      continue;
    }
    if (e.op === "rewrite") {
      const i = at(e.beatAt);
      if (i < 0) continue;
      if (e.text) rows[i].beat = { ...rows[i].beat, text: e.text };
      if (e.label) rows[i].beat = { ...rows[i].beat, label: e.label };
      if (e.cards) rows[i].cards = e.cards;
      if (typeof e.seconds === "number") rows[i].seconds = holds(e.seconds);
      continue;
    }
    if (e.op === "insert") {
      const i = at(e.afterBeatAt);
      rows.splice(i < 0 ? rows.length : i + 1, 0, {
        beat: {
          at: "pending",
          kind: "movement",
          label: e.label ?? "inserted",
          connector: (e.connector ?? "THEREFORE") as Connector,
          text: e.text ?? "",
        },
        seconds: holds(e.seconds ?? 8),
        cards: e.cards ?? [],
      });
    }
  }

  // Re-lay the timeline. Marks are derived, never asserted.
  let clock = 0;
  const beats: Beat[] = [];
  const attribution: Record<string, string[]> = {};
  const seconds: Record<string, number> = {};
  for (const r of rows) {
    const mark = mmss(clock);
    beats.push({ ...r.beat, at: mark });
    attribution[mark] = r.cards;
    seconds[mark] = r.seconds;
    clock += r.seconds;
  }
  return { beats, attribution, seconds };
}

/** Turn applied renders into the `impact` map the matrix reads.
 *
 *  `splitAcross` rather than a loop that adds the beat's whole duration once per
 *  card — the SAME function the baseline is built with (impact.ts), because a
 *  delta between two differently-computed numbers is not a delta. Crediting the
 *  full duration to every card a beat rests on is what made `budgetOf` sum to a
 *  multiple of the runtime and report a candidate as hundreds of seconds over
 *  budget while the engine's own summary said ten.
 *
 *  THE CUT RECORDS ARE SEEDED, and their absence was a real divergence between
 *  the two engines. `recalibrate()` copies `base.impact` before it applies
 *  anything, so the `kind: "cut"` rows impact.ts builds from each render's
 *  `cutFacts` survive a simulated pass. This function started from `{}` and only
 *  ever wrote `spoken`, so a MODEL pass silently turned every deliberate
 *  exclusion into `unused`. Three things went with them:
 *    · the ✕ and its `why` in the matrix — a fact the render excluded on the
 *      record became indistinguishable from one nobody had considered
 *    · MatrixFootnotes' "in no render" count, quietly inflated
 *    · GUARD 4. `unsupportedIn` builds its `gone` set partly from
 *      `RENDERS.every(… === "cut")`, and nothing was ever `cut` here — so a card
 *      every render had cut was not counted as gone, and stranded turns went
 *      unreported on precisely the path where a model had just rewritten the
 *      script. recalibrate.ts calls GUARD 4 "literally the same function on both
 *      paths"; the function was, its input was not.
 *
 *  SPOKEN WINS OVER A SEEDED CUT HERE, which is the opposite of impact.ts, and
 *  the asymmetry is the point. There, the attribution table and `cutFacts` are
 *  two hand-authored claims about the SAME script, so a clash means the table is
 *  wrong and the cut wins loudly. Here the plan is NEWER than `cutFacts`: an
 *  edit that gives a previously-cut fact a line is the model deliberately
 *  reinstating it, and letting a stale declaration erase that would discard the
 *  work and lie about the script. */
export function impactFrom(applied: Record<string, AppliedRender>): Record<string, Record<string, Usage>> {
  const out: Record<string, Record<string, Usage>> = {};
  for (const r of RENDERS) {
    const a = applied[r.id];
    const map: Record<string, Usage> = {};
    for (const c of r.cutFacts) map[c.factId] = { kind: "cut", seconds: 0, beats: [], why: c.why };
    if (a) {
      for (const [mark, cards] of Object.entries(a.attribution)) {
        const shares = splitAcross(a.seconds[mark] ?? 0, cards.length);
        cards.forEach((id, i) => {
          // Only accumulate onto a previous SPOKEN row — a seeded cut carries
          // no seconds and no beats, and adding to it would start the tally at
          // a row that means "not in this render".
          const prev = map[id];
          const spoken = prev?.kind === "spoken" ? prev : undefined;
          map[id] = {
            kind: "spoken",
            seconds: (spoken?.seconds ?? 0) + shares[i],
            beats: [...(spoken?.beats ?? []), mark],
          };
        });
      }
    }
    out[r.id] = map;
  }
  return out;
}

/* ------------------------------------------------------------- validation */

export class PlanError extends Error {}

/** Extract and validate a plan from the engine's raw text.
 *
 *  Rejects rather than repairs. A plan that is the wrong shape means the engine
 *  misunderstood the job, and quietly patching it produces edits nobody
 *  specified — the failure mode that is hardest to notice afterwards, because
 *  the result still looks like a plan. */
export function parseEditPlan(raw: string): EditPlan {
  const text = raw.trim();
  // Tolerate a ```json fence; tolerate nothing else.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();

  let j: unknown;
  try {
    j = JSON.parse(body);
  } catch {
    throw new PlanError("The engine did not return JSON.");
  }
  if (!j || typeof j !== "object") throw new PlanError("The engine returned JSON that is not an object.");

  const o = j as Record<string, unknown>;
  if (!Array.isArray(o.edits)) throw new PlanError("The plan has no `edits` array.");
  if (typeof o.summary !== "string") throw new PlanError("The plan has no `summary`.");

  const renderIds = new Set(RENDERS.map((r) => r.id));
  const ops = new Set<EditOp>(["retime", "rewrite", "cut", "insert"]);
  /** The marks an edit may name, per render. `applyEdits` resolves against the
   *  ORIGINAL beats — marks are only re-laid once every edit has landed — so
   *  the fixture's own chain is the right universe to check against. */
  const marksOf = (renderId: string) => new Set(RENDER_BY_ID[renderId].beats.map((b) => b.at));

  const edits: Edit[] = o.edits.map((raw, i) => {
    const e = raw as Record<string, unknown>;
    const where = `edits[${i}]`;
    if (typeof e.renderId !== "string" || !renderIds.has(e.renderId))
      throw new PlanError(`${where} names a render that does not exist: ${String(e.renderId)}`);
    if (typeof e.op !== "string" || !ops.has(e.op as EditOp))
      throw new PlanError(`${where} has an unknown op: ${String(e.op)}`);
    const op = e.op as EditOp;
    if (op !== "insert" && typeof e.beatAt !== "string")
      throw new PlanError(`${where} is a ${op} with no beatAt.`);
    if (op === "insert" && typeof e.afterBeatAt !== "string")
      throw new PlanError(`${where} is an insert with no afterBeatAt.`);
    // The one rule worth failing the whole plan over: a beat that speaks must
    // declare what it rests on, because every number in the matrix is derived
    // from that declaration.
    if ((op === "rewrite" || op === "insert") && !Array.isArray(e.cards))
      throw new PlanError(`${where} is a ${op} with no \`cards\` — a beat must declare the notebook ids it rests on.`);
    if (typeof e.why !== "string" || !e.why.trim())
      throw new PlanError(`${where} has no \`why\`.`);

    // A MARK THAT NAMES NO BEAT FAILS THE PLAN, because the alternative is that
    // it fails silently. `applyEdits` resolves marks with `findIndex`, and -1
    // has three meanings there and a voice for none of them: a `cut`, `rewrite`
    // or `retime` simply does not happen, and an `insert` lands at the END of
    // the render instead of where it was asked for — a beat relocated to the
    // close of the script with nothing anywhere saying so. Nothing counts them
    // either: refusals, conflicts and unsupported each have a channel on the
    // pad, and "3 of your 7 edits named beats that do not exist" has none.
    //
    // This is the rule this function already states about itself — "Rejects
    // rather than repairs … quietly patching it produces edits nobody
    // specified, the failure mode that is hardest to notice afterwards, because
    // the result still looks like a plan." It checked that a mark was a STRING
    // and never that it resolved, which is that same gap one type down.
    //
    // LAST of the per-edit checks, deliberately. A plan missing `cards` or
    // `why` AND carrying a bad mark should still be reported as the missing
    // field: those are the model misunderstanding the contract, this is it
    // misreading the script, and the first is the more useful thing to say.
    const marks = marksOf(e.renderId);
    const named = op === "insert" ? (e.afterBeatAt as string) : (e.beatAt as string);
    if (!marks.has(named))
      throw new PlanError(
        `${where} is a ${op} on ${e.renderId} at "${named}", which names no beat in that render. Its beats are ${[...marks].join(", ")}.`,
      );

    return e as unknown as Edit;
  });

  return {
    edits,
    refusals: Array.isArray(o.refusals) ? (o.refusals as EditPlan["refusals"]) : [],
    unchanged: Array.isArray(o.unchanged) ? (o.unchanged as string[]) : [],
    summary: o.summary,
  };
}
