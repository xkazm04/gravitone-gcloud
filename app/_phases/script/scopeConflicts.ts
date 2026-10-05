// SCOPE CONFLICTS — detection, resolution planning, and before/after deltas.
//
// A scope conflict occurs when material the creator descoped on the triage board
// is still spoken in one or more candidate script renders.
// This module provides deterministic detection, a resolution plan that stages
// descope notes without conflicting or violating schema guards, and delta accounting.

import type { Card } from "../_shared/notebook/cards";
import { stateOf, type Scope } from "../research/scope";
import { RENDERS } from "./renders";
import { usageIn, type Note, type Version } from "./versions";

export interface ResolutionPlanStageItem {
  cardId: string;
  kind: "descope";
}

export interface ResolutionPlanSkippedItem {
  cardId: string;
  why: string;
}

export interface ResolutionPlanContestedItem {
  cardId: string;
  why: string;
}

export interface ResolutionPlan {
  stage: ResolutionPlanStageItem[];
  skipped: ResolutionPlanSkippedItem[];
  contested: ResolutionPlanContestedItem[];
}

export interface ConflictDelta {
  before: number;
  after: number;
  resolved: string[];
  remaining: string[];
}

/** "not taken" is a DEFAULT, "descoped" is a DECISION. */
export function outWord(card: Card, scope: Scope): "in" | "not-taken" | "descoped" {
  const s = stateOf(scope, card.id);
  if (!s.descoped) return "in";
  return card.optIn ? "not-taken" : "descoped";
}

/** Returns the renders that still speak the card, with seconds, or an empty list. */
export function stillSpoken(
  version: Version,
  card: Card,
  scope: Scope,
): { renderId: string; label: string; seconds: number }[] {
  if (outWord(card, scope) === "in") return [];
  return RENDERS.flatMap((r) => {
    const u = usageIn(version, r.id, card.id);
    return u.kind === "spoken" ? [{ renderId: r.id, label: r.engineLabel, seconds: u.seconds }] : [];
  });
}

/** Returns list of card IDs that are descoped in `scope` but `stillSpoken(version, card, scope).length > 0`. */
export function conflictsIn(version: Version, cards: Card[], scope: Scope): string[] {
  return cards
    .filter((card) => stillSpoken(version, card, scope).length > 0)
    .map((card) => card.id);
}

/**
 * Plans resolution of scope conflicts by staging descope notes:
 * - If card.required: put in skipped with why = card.requiredWhy
 * - If existingNotes already has a descope note on card.id: ignore (already staged)
 * - If existingNotes has a non-descope note on card.id: put in contested with why = "A note already exists for this card"
 * - Else: put in stage [{ cardId: card.id, kind: 'descope' }]
 */
export function resolutionPlan(
  version: Version,
  cards: Card[],
  scope: Scope,
  existingNotes: Array<Pick<Note, "cardId" | "kind"> & Partial<Note>>,
): ResolutionPlan {
  const conflictIds = new Set(conflictsIn(version, cards, scope));

  const stage: ResolutionPlanStageItem[] = [];
  const skipped: ResolutionPlanSkippedItem[] = [];
  const contested: ResolutionPlanContestedItem[] = [];

  for (const card of cards) {
    if (!conflictIds.has(card.id)) continue;

    if (card.required) {
      skipped.push({
        cardId: card.id,
        why: card.requiredWhy ?? "This material is required and cannot be removed.",
      });
      continue;
    }

    const hasDescope = existingNotes.some((n) => n.cardId === card.id && n.kind === "descope");
    if (hasDescope) {
      // already staged
      continue;
    }

    const hasOtherNote = existingNotes.some((n) => n.cardId === card.id && n.kind !== "descope");
    if (hasOtherNote) {
      contested.push({
        cardId: card.id,
        why: "A note already exists for this card",
      });
      continue;
    }

    stage.push({
      cardId: card.id,
      kind: "descope",
    });
  }

  return { stage, skipped, contested };
}

/** Computes { before, after, resolved, remaining } card conflicts between two versions. */
export function conflictDelta(
  before: Version,
  after: Version,
  cards: Card[],
  scope: Scope,
): ConflictDelta {
  const beforeList = conflictsIn(before, cards, scope);
  const afterList = conflictsIn(after, cards, scope);
  const afterSet = new Set(afterList);
  const resolved = beforeList.filter((id) => !afterSet.has(id));

  return {
    before: beforeList.length,
    after: afterList.length,
    resolved,
    remaining: afterList,
  };
}
