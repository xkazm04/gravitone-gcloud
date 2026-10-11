// THE LESSON'S EVIDENCE — what the hunt measured (the winners against the heard
// losers, by axis and by technique) and the hand-written lesson filled from it.
// Separate because it answers what the hunt measured, not how the board draws it.

import type { Hunt, HuntNode, Lesson } from "@/lib/sound/types";
import { buildTree } from "./tree";

/* ── the lesson's evidence ─────────────────────────────────────────────── */

export interface HuntEvidence {
  /** Leaves that have a take to judge. */
  heard: HuntNode[];
  winners: HuntNode[];
  /** Axes the winners came from, most first. */
  axes: { axis: string; n: number }[];
  /** Techniques on winners, with how many losers carried the same one. */
  techniques: { technique: string; won: number; lost: number }[];
  takeIds: string[];
}

/** What the hunt measured, read off the nodes alone: which axis and which
 *  technique the winners share, against the leaves that were heard and lost. */
export function evidenceOf(hunt: Pick<Hunt, "nodes">): HuntEvidence {
  const leaves = buildTree(hunt.nodes).leaves;
  const heard = leaves.filter((l) => l.state === "rendered");
  const winners = heard.filter((l) => l.winner);
  const losers = heard.filter((l) => !l.winner);
  const axisN = new Map<string, number>();
  for (const w of winners) axisN.set(w.axis, (axisN.get(w.axis) ?? 0) + 1);
  const tech = new Map<string, { won: number; lost: number }>();
  for (const w of winners)
    for (const t of w.technique)
      tech.set(t, {
        won: (tech.get(t)?.won ?? 0) + 1,
        lost: tech.get(t)?.lost ?? 0,
      });
  for (const l of losers)
    for (const t of l.technique) if (tech.has(t)) tech.get(t)!.lost++;
  return {
    heard,
    winners,
    axes: [...axisN]
      .map(([axis, n]) => ({ axis, n }))
      .sort((a, b) => b.n - a.n),
    techniques: [...tech]
      .map(([technique, v]) => ({ technique, ...v }))
      .sort((a, b) => b.won - a.won || a.lost - b.lost),
    takeIds: winners.flatMap((w) => w.takeIds.slice(-1)),
  };
}

/**
 * A lesson the operator writes by hand, its evidence filled from the hunt —
 * the path when the text engine cannot draft one. The claim starts empty: a
 * lesson is a human's sentence, and an empty box is more honest than a
 * template pretending to be a finding.
 */
export function handLesson(
  hunt: Pick<Hunt, "id" | "kind" | "nodes">,
): Omit<Lesson, "id" | "confirmedAt"> {
  const e = evidenceOf(hunt);
  const providers = [...new Set(e.winners.map((w) => w.provider))];
  return {
    kind: hunt.kind,
    source: "hunt",
    provider: providers.length === 1 ? providers[0] : null,
    huntId: hunt.id,
    claim: "",
    technique: e.techniques.filter((t) => t.won > 0).map((t) => t.technique),
    evidence: {
      n: e.heard.length,
      keepRate: e.heard.length
        ? Math.round((e.winners.length / e.heard.length) * 100) / 100
        : null,
      meanScore: null,
      takeIds: e.takeIds,
    },
  };
}
