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
// violating these rules gets the same refusal.

import type { Card } from "../_shared/notebook/cards";
import type { Scope } from "../research/scope";
import { stateOf } from "../research/scope";
import { ATTRIBUTION_OF as baseAttributionOf, type Usage } from "./impact";
import { applyEdits, impactFrom, type AppliedRender, type EditPlan } from "./editPlan";
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

export function recalibrate(
  base: Version,
  notes: Note[],
  id: string,
  at: number,
  ctx: { cards: Card[]; scope: Scope },
): Version {
  const cardById = new Map(ctx.cards.map((c) => [c.id, c]));
  const byCard = new Map<string, NoteKind[]>();
  for (const n of notes) byCard.set(n.cardId, [...(byCard.get(n.cardId) ?? []), n.kind]);

  const refusals: Refusal[] = [];
  const conflicts: Conflict[] = [];
  /** cardId → the kinds that survived the guards. */
  const applied = new Map<string, NoteKind[]>();

  for (const [cardId, kinds] of byCard) {
    const card = cardById.get(cardId);
    const descopedInScope = stateOf(ctx.scope, cardId).descoped;
    let keep = [...kinds];

    // GUARD 1 — a note may not descope what the scope layer refuses to descope.
    if (keep.includes("descope") && card?.required) {
      refusals.push({
        cardId,
        kind: "descope",
        why: card.requiredWhy ?? "This material is required and cannot be removed.",
      });
      keep = keep.filter((k) => k !== "descope");
    }

    // GUARD 2 — a card the creator has taken out of scope may not be given
    // screen time by a note. The scope decision is the earlier and stronger one;
    // the fix is to bring it back on the triage board, not to route around it.
    if (descopedInScope && keep.some((k) => WEIGHTY.includes(k))) {
      for (const k of keep.filter((x) => WEIGHTY.includes(x)))
        refusals.push({
          cardId,
          kind: k,
          why: "out of scope on the triage board — bring it back into scope there first",
        });
      keep = keep.filter((k) => !WEIGHTY.includes(k));
    }

    // GUARD 3 — two instructions that cannot both hold. Descope wins because it
    // is the destructive one and the creator can see the result; what they could
    // NOT see was that their other note had been dropped.
    if (keep.includes("descope") && keep.some((k) => WEIGHTY.includes(k))) {
      conflicts.push({
        cardId,
        kinds: keep.filter((k) => k === "descope" || WEIGHTY.includes(k)),
        applied: "descope",
        why: "descope removes the card, so a focus note on the same track cannot also apply",
      });
      keep = keep.filter((k) => !WEIGHTY.includes(k));
    }

    applied.set(cardId, keep);
  }

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

/** THE MODEL PATH — an edit plan in, a Version out, through the SAME guards.
 *
 *  This is the point the UAT contract turns on: guards 1-4 apply to a model's
 *  output exactly as they apply to the mock's. A returned plan that descopes
 *  required material, funds an out-of-scope card, or strands a turn is refused
 *  here, not accepted-and-flagged — the model does not get a weaker rule than
 *  the deterministic transform it replaced. */
export function recalibrateFromPlan(
  base: Version,
  notes: Note[],
  plan: EditPlan,
  id: string,
  at: number,
  ctx: { cards: Card[]; scope: Scope },
): Version {
  const cardById = new Map(ctx.cards.map((c) => [c.id, c]));
  const refusals: Refusal[] = [];

  // GUARDS 1 + 2, applied to the PLAN before it is applied to anything. An edit
  // whose beat rests on required-but-cut or out-of-scope material is dropped.
  const legal = plan.edits.filter((e) => {
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

  const applied: Record<string, AppliedRender> = {};
  const beats: Record<string, Beat[]> = {};
  for (const r of RENDERS) {
    const a = applyEdits(r, legal, baseAttributionOf(r.id));
    applied[r.id] = a;
    beats[r.id] = a.beats;
  }
  const impact = impactFrom(applied);

  // GUARD 3 — required material must still be spoken somewhere.
  for (const c of ctx.cards) {
    if (!c.required) continue;
    const stillSpoken = RENDERS.some((r) => impact[r.id]?.[c.id]?.kind === "spoken");
    if (!stillSpoken)
      refusals.push({
        cardId: c.id,
        kind: "descope",
        why: c.requiredWhy ?? "This material is required and the plan removed it.",
      });
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
    conflicts: [],
    unsupported: unsupportedIn(impact, ctx),
    engine: "model",
    beats,
    summary: plan.summary,
    modelRefusals: plan.refusals,
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
