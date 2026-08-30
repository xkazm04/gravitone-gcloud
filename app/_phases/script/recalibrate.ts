// THE TRANSFORM, AND THE GUARDS AROUND IT.
//
// Split out of versions.ts after a UAT pass on the rebalance journey
// (uat/runs/2026-08-12-rebalance) found the transform would do four things the
// rest of the app forbids. Every guard below is one of those findings:
//
//  · A note could descope material the triage board REFUSES to descope. Step 1
//    disables the control on the steel-man and states why; a note walked around
//    it and cut the steel-man from all three renders. A rebalance that can
//    quietly do what the scope layer forbids is not a rebalance, it is a bypass.
//  · A note could give screen time to a card the creator had already taken OUT
//    of scope — two systems, opposite answers, no complaint.
//  · Two contradicting notes on one track resolved silently, and the creator was
//    never told which one lost.
//  · Cutting every fact a turn argues from left the turn in the script, at full
//    weight, with nothing behind it.
//
// The guards do not make the mocked transform smart. They make its CONTRACT
// explicit — which is the thing a real model will have to satisfy too, and the
// reason this file exists before the model does. A model that returns a plan
// violating these rules gets the same refusal, in the same ORDER: refused before
// the result is computed, never applied-and-flagged afterwards. That ordering is
// the whole difference between a guard and a complaint.

import type { Card } from "../_shared/notebook/cards";
import type { Scope } from "../research/scope";
import { stateOf } from "../research/scope";
import { ATTRIBUTION_OF as baseAttributionOf, type Usage } from "./impact";
import { applyEdits, impactFrom, type AppliedRender, type Edit, type EditPlan } from "./editPlan";
import type { Beat } from "./types";
import { RENDERS, RENDER_BY_ID } from "./renders";
import {
  budgetOf,
  type Conflict,
  type Note,
  type NoteKind,
  type Refusal,
  type Unsupported,
  type Version,
} from "./versions";

/** Notes whose intent this prototype cannot act on, so the UI can say so rather
 *  than imply the bars moved because of them. */
export function inertNotes(notes: Note[]) {
  return notes.filter((n) => n.kind === "custom" || n.kind === "move-earlier" || n.kind === "move-later");
}

const WEIGHTY: NoteKind[] = ["more-focus", "less-focus"];

/* ─────────────────────────── guards 1-3, on the notes ──────────────────────
   These read the NOTES, and both engines owe the creator the same answer about
   them: a note that cannot be honoured is refused whoever is holding the pen.
   Shared rather than re-typed, because the model path silently drifting away
   from these three rules is the exact failure this file exists to prevent. */

interface NoteGuards {
  refusals: Refusal[];
  /** cardId → the kinds that survived. The mock APPLIES these; the model path
   *  only needs to know which ones were refused. */
  keep: Map<string, NoteKind[]>;
  /** Cards carrying a descope AND a focus note — GUARD 3's subjects. WHICH
   *  instruction won is the engine's answer rather than the guard's, so the
   *  caller stamps the verdict. */
  contested: { cardId: string; kinds: NoteKind[] }[];
}

function guardNotes(notes: Note[], ctx: { cards: Card[]; scope: Scope }): NoteGuards {
  const cardById = new Map(ctx.cards.map((c) => [c.id, c]));
  const byCard = new Map<string, NoteKind[]>();
  for (const n of notes) byCard.set(n.cardId, [...(byCard.get(n.cardId) ?? []), n.kind]);

  const refusals: Refusal[] = [];
  const keep = new Map<string, NoteKind[]>();
  const contested: { cardId: string; kinds: NoteKind[] }[] = [];

  for (const [cardId, kinds] of byCard) {
    const card = cardById.get(cardId);
    const descopedInScope = stateOf(ctx.scope, cardId).descoped;
    let surviving = [...kinds];

    // GUARD 1 — a note may not descope what the scope layer refuses to descope.
    if (surviving.includes("descope") && card?.required) {
      refusals.push({
        cardId,
        kind: "descope",
        why: card.requiredWhy ?? "This material is required and cannot be removed.",
      });
      surviving = surviving.filter((k) => k !== "descope");
    }

    // GUARD 2 — a card the creator has taken out of scope may not be given
    // screen time by a note. The scope decision is the earlier and stronger one;
    // the fix is to bring it back on the triage board, not to route around it.
    if (descopedInScope && surviving.some((k) => WEIGHTY.includes(k))) {
      for (const k of surviving.filter((x) => WEIGHTY.includes(x)))
        refusals.push({
          cardId,
          kind: k,
          why: "out of scope on the triage board — bring it back into scope there first",
        });
      surviving = surviving.filter((k) => !WEIGHTY.includes(k));
    }

    // GUARD 3 — two instructions that cannot both hold. The destructive one is
    // the one the creator can SEE the result of; what they could not see was
    // that their other note had been dropped.
    if (surviving.includes("descope") && surviving.some((k) => WEIGHTY.includes(k))) {
      contested.push({ cardId, kinds: surviving.filter((k) => k === "descope" || WEIGHTY.includes(k)) });
      surviving = surviving.filter((k) => !WEIGHTY.includes(k));
    }

    keep.set(cardId, surviving);
  }

  return { refusals, keep, contested };
}

export function recalibrate(
  base: Version,
  notes: Note[],
  id: string,
  at: number,
  ctx: { cards: Card[]; scope: Scope },
): Version {
  const { refusals, keep: applied, contested } = guardNotes(notes, ctx);

  // GUARD 3's verdict on this path: descope wins, because the mock resolves the
  // conflict itself and removing the card leaves a focus note nothing to act on.
  const conflicts: Conflict[] = contested.map((c) => ({
    cardId: c.cardId,
    kinds: c.kinds,
    applied: "descope",
    why: "descope removes the card, so a focus note on the same track cannot also apply",
  }));

  /* ------------------------------------------------------- apply what is left */
  const impact: Record<string, Record<string, Usage>> = {};
  for (const r of RENDERS) {
    const next: Record<string, Usage> = {};
    for (const [cardId, u] of Object.entries(base.impact[r.id] ?? {})) next[cardId] = { ...u };

    for (const [cardId, kinds] of applied) {
      const cur: Usage = next[cardId] ?? { kind: "unused", seconds: 0, beats: [] };

      if (kinds.includes("descope")) {
        next[cardId] = {
          kind: "cut",
          seconds: 0,
          beats: [],
          why: "descoped by your note — removed from every render in this recalibration",
        };
        continue;
      }
      if (kinds.includes("more-focus")) {
        next[cardId] =
          cur.kind === "spoken"
            ? { ...cur, seconds: Math.round(cur.seconds * 1.6) }
            : { kind: "spoken", seconds: Math.max(3, Math.round(RENDER_BY_ID[r.id].durationS * 0.06)), beats: ["new"] };
        continue;
      }
      if (kinds.includes("less-focus") && cur.kind === "spoken") {
        next[cardId] = { ...cur, seconds: Math.max(2, Math.round(cur.seconds * 0.55)) };
      }
    }
    impact[r.id] = next;
  }

  return {
    id,
    label: `Recalibration ${id.replace(/^v/, "")}`,
    basedOn: base.id,
    notes,
    createdAt: at,
    impact,
    budget: budgetOf(impact),
    refusals,
    conflicts,
    unsupported: unsupportedIn(impact, ctx),
    engine: "simulated",
  };
}

/* ────────────────────── projecting a plan before applying it ────────────────
   The trick that lets the model path run GUARD 1 in the mock's ORDER. Applying
   a plan and checking afterwards can only produce a complaint; projecting what
   it would leave behind produces a refusal, which is what the contract above
   actually promises.

   It mirrors `applyEdits` deliberately, including the part that looks like a
   bug and is not: cuts and rewrites resolve against the ORIGINAL beat marks,
   because marks are only re-laid once every edit in the plan has landed. */

/** Every card the renders would still SPEAK if `edits` were applied. */
function spokenAfter(edits: Edit[]): Set<string> {
  const out = new Set<string>();
  let inserted = 0;
  for (const r of RENDERS) {
    const base = baseAttributionOf(r.id);
    const rows = new Map<string, string[]>();
    for (const b of r.beats) rows.set(b.at, base[b.at] ?? []);

    for (const e of edits) {
      if (e.renderId !== r.id) continue;
      if (e.op === "cut") {
        if (e.beatAt) rows.delete(e.beatAt);
        continue;
      }
      if (e.op === "rewrite") {
        if (e.beatAt && e.cards && rows.has(e.beatAt)) rows.set(e.beatAt, e.cards);
        continue;
      }
      if (e.op === "insert") rows.set(`+${inserted++}`, e.cards ?? []);
      // `retime` moves seconds, never attribution.
    }

    for (const ids of rows.values()) for (const id of ids) out.add(id);
  }
  return out;
}

/** Does this edit take `cardId` off the beat that was carrying it? A `cut`
 *  always does; a `rewrite` does when its new card list drops it. */
function removesCard(e: Edit, cardId: string): boolean {
  if (e.op !== "cut" && e.op !== "rewrite") return false;
  if (!e.beatAt) return false;
  if (!(baseAttributionOf(e.renderId)[e.beatAt] ?? []).includes(cardId)) return false;
  return e.op === "cut" || !(e.cards ?? []).includes(cardId);
}

/** THE MODEL PATH — an edit plan in, a Version out, through the SAME guards in
 *  the SAME order.
 *
 *  Where each one lands, stated precisely, because a comment claiming more
 *  parity than the code delivers is worse than no comment at all:
 *
 *   · GUARD 1 (required material) runs twice, and both times BEFORE anything is
 *     applied. On the notes, so a descope aimed at the steel-man is refused
 *     whichever engine holds the pen. And on the PLAN, by projecting what the
 *     edits would leave each render speaking: a `cut` or `rewrite` that would
 *     strand required material is dropped from the plan, not applied and
 *     regretted. That second half is what this function used to lack — it
 *     computed the beats and the matrix first and then appended a line to a
 *     list, so a model could ship a script with the steel-man actually gone.
 *   · GUARD 2 (scope) runs on the notes and on every edit that names cards. A
 *     `cut` and a `retime` carry no `cards` and cannot grant screen time, so
 *     they cannot violate this guard by construction — which is why the
 *     edit-level filter inspects `e.cards` only, and why that is not the hole it
 *     looks like.
 *   · GUARD 3 (conflicting notes) is DETECTED identically. Only the verdict
 *     differs, and it has to: the mock resolves the conflict itself so it knows
 *     descope won, while here the model resolved it and the winner is read back
 *     off the result rather than assumed.
 *   · GUARD 4 (stranded turns) is literally the same function on both paths.
 *
 *  The one thing this path cannot do that the mock can, stated rather than
 *  hidden: it cannot tell you a note was IGNORED. The mock applies notes itself,
 *  so silence is measurable; a model that read a note and chose not to act on it
 *  is indistinguishable from one that never saw it. `plan.refusals` is the
 *  model's own account of that, and it is shown as the model's word, never as
 *  this file's guarantee. */
export function recalibrateFromPlan(
  base: Version,
  notes: Note[],
  plan: EditPlan,
  id: string,
  at: number,
  ctx: { cards: Card[]; scope: Scope },
): Version {
  const cardById = new Map(ctx.cards.map((c) => [c.id, c]));
  const { refusals, contested } = guardNotes(notes, ctx);

  // GUARD 2, on the plan — an edit may not fund material the board took out of
  // scope, whatever reason the model gives for it.
  const inScope = plan.edits.filter((e) => {
    for (const cardId of e.cards ?? []) {
      if (stateOf(ctx.scope, cardId).descoped) {
        refusals.push({
          cardId,
          kind: "custom",
          why: `the model's ${e.op} on ${e.renderId} would speak a card that is out of scope on the triage board`,
        });
        return false;
      }
    }
    return true;
  });

  // GUARD 1, on the plan — required material may not be cut. Projected, so the
  // refusal lands before the beats and the matrix exist rather than beside them.
  const spokenBefore = spokenAfter([]);
  const wouldSpeak = spokenAfter(inScope);
  const dropped = new Set<Edit>();

  for (const c of ctx.cards) {
    if (!c.required || wouldSpeak.has(c.id)) continue;
    const why = cardById.get(c.id)?.requiredWhy ?? "This material is required and cannot be removed.";

    if (!spokenBefore.has(c.id)) {
      // Not this plan's doing — no render spoke it beforehand either. Blaming
      // the model for a gap it inherited is its own kind of dishonesty.
      refusals.push({
        cardId: c.id,
        kind: "descope",
        why: `${why} No render speaks it, and no edit in this plan removed it — the gap predates this recalibration.`,
      });
      continue;
    }

    const guilty = inScope.filter((e) => removesCard(e, c.id));
    for (const e of guilty) dropped.add(e);
    refusals.push({
      cardId: c.id,
      kind: "descope",
      why: `${why} ${guilty.length} model edit${guilty.length === 1 ? " that" : "s that"} would have removed it ${
        guilty.length === 1 ? "was" : "were"
      } refused before the plan was applied.`,
    });
  }

  // Dropping every edit that touched the beats carrying the card restores it by
  // construction, so one pass is enough — a refusal can only add material back.
  const legal = dropped.size ? inScope.filter((e) => !dropped.has(e)) : inScope;

  const applied: Record<string, AppliedRender> = {};
  const beats: Record<string, Beat[]> = {};
  for (const r of RENDERS) {
    const a = applyEdits(r, legal, baseAttributionOf(r.id));
    applied[r.id] = a;
    beats[r.id] = a.beats;
  }
  const impact = impactFrom(applied);

  // The projection follows the same rules `applyEdits` does, so this cannot
  // fire. It stays because a guarantee nobody checks is a guarantee that rots:
  // if the two ever drift apart, the creator hears it here rather than from a
  // script that quietly lost its steel-man.
  for (const c of ctx.cards) {
    if (!c.required) continue;
    if (RENDERS.some((r) => impact[r.id]?.[c.id]?.kind === "spoken")) continue;
    if (refusals.some((f) => f.cardId === c.id)) continue;
    refusals.push({
      cardId: c.id,
      kind: "descope",
      why: `${c.requiredWhy ?? "This material is required."} No render speaks it after the plan was applied and the guard that should have caught that did not — treat this version as unsafe.`,
    });
  }

  // GUARD 3's verdict on this path: read off the result, because the model —
  // not this file — decided which of the two notes it honoured.
  const conflicts: Conflict[] = contested.map((c) => {
    const kept = RENDERS.some((r) => impact[r.id]?.[c.cardId]?.kind === "spoken");
    const weighty = c.kinds.find((k) => WEIGHTY.includes(k));
    return kept && weighty
      ? {
          cardId: c.cardId,
          kinds: c.kinds,
          applied: weighty,
          why: "the plan kept this card on screen, so the descope note on the same track was not applied",
        }
      : {
          cardId: c.cardId,
          kinds: c.kinds,
          applied: "descope" as NoteKind,
          why: "the plan removed the card, so a focus note on the same track could not also apply",
        };
  });

  return {
    id,
    label: `Recalibration ${id.replace(/^v/, "")}`,
    basedOn: base.id,
    notes,
    createdAt: at,
    impact,
    budget: budgetOf(impact),
    refusals,
    conflicts,
    unsupported: unsupportedIn(impact, ctx),
    engine: "model",
    beats,
    summary: plan.summary,
    modelRefusals: plan.refusals,
    // THE SEAMS THE PLAN BROKE, carried out instead of dropped. `applyEdits`
    // has returned these all along and this function kept only `a.beats` from
    // its result, so a cut that orphaned a BUT was detected, explained, probed
    // — and then discarded one line before anything could show it. Flattened
    // across renders with the render id on each row, because a break is
    // located by render AND mark and the reviewer is looking at one render at
    // a time.
    chainBreaks: RENDERS.flatMap((r) =>
      (applied[r.id]?.chainBreaks ?? []).map((b) => ({ ...b, renderId: r.id })),
    ),
  };
}

/** GUARD 4 — a turn whose evidence this version removed is still in the script,
 *  at full weight, arguing from nothing. The scope layer already models this
 *  (`woundsOf`); the recalibration was simply not asking. */
function unsupportedIn(
  impact: Record<string, Record<string, Usage>>,
  ctx: { cards: Card[]; scope: Scope },
): Unsupported[] {
  const gone = new Set(
    ctx.cards
      .filter(
        (c) =>
          stateOf(ctx.scope, c.id).descoped ||
          RENDERS.every((r) => (impact[r.id]?.[c.id]?.kind ?? "unused") === "cut"),
      )
      .map((c) => c.id),
  );

  const out: Unsupported[] = [];
  for (const c of ctx.cards) {
    if (!c.dependsOn.length || gone.has(c.id)) continue;
    const stillSpoken = RENDERS.some((r) => impact[r.id]?.[c.id]?.kind === "spoken");
    if (!stillSpoken) continue;
    const lost = c.dependsOn.filter((d) => gone.has(d));
    if (!lost.length) continue;
    out.push({
      cardId: c.id,
      lost,
      severity: lost.length === c.dependsOn.length ? "broken" : "weakened",
    });
  }
  return out;
}
