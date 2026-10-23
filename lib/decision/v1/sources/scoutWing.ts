import "server-only";

import { err, ok, type Result } from "@gt/domain/errors";
import type { ConsequenceItem } from "@gt/domain/board";

import { CHARACTERS_HEADING, FINDINGS_HEADING, MUSE_CHARACTERS_REL, WATCH_HEADING, findingRelOf, knowledgeState, markerOf, watchlistRelOf } from "../../../foundry/scout/knowledge.ts";
import type { Candidate, IdeaCandidate, Night, NightId } from "../../../foundry/scout/types.ts";
import { parseWingRunId, wingRunId, wingWord, type ScoutWing } from "../../../foundry/scout/wing.ts";
import { activeWing, withWing } from "../../../foundry/scout/wingScope.ts";
import { v1Call, type DecisionAdapter } from "../types.ts";

// THE SCOUT PACKET'S WING (spark scout-muse) - what ./scout.ts needs to decide a night of either wing, kept
// here so the adapter does not grow past its bound.
//
// A RUN ID NAMES ITS WING: the scout wing's is the bare night (every packet minted before the wings keeps its
// id), the muse wing's `muse:<night>` - so `pkt:scout:muse:2026-10-24`. A run id naming no wing is refused
// before anything is read. Every entry of the adapter then runs inside that wing's scope (wingScope.ts), so
// every store it touches - the night, its files, the seeds, the leads, the knowledge files - is the wing's own
// root, and two Board requests for the two wings never see each other's.
//
// THE FILE ROUTE carries the run id, not the bare night: app/api/foundry/file parses it back into the wing.

export type WingRef = { readonly wing: ScoutWing; readonly night: string };

/** The wing and night a scout run id names; a wing this build does not know is not found. */
export function wingOfRun(runId: string): Result<WingRef> {
  const w = parseWingRunId(runId);
  return w === null ? err("not-found", `scout: ${runId} names no scout wing`) : ok(w);
}

/** The night of a run id the wrapper below already admitted. */
export const nightOfRun = (runId: string): NightId => parseWingRunId(runId)?.night ?? runId;

/** v1's file route for a night file of the ACTIVE wing (app/api/foundry/file `kind=scout`, lib/foundry/scout/store.ts scoutFileStat). */
export function scoutFileUrl(night: string, rel: string): string {
  return `/api/foundry/file?${new URLSearchParams({ run: wingRunId(activeWing(), night), path: rel, kind: "scout" }).toString()}`;
}

/** `scout · 9 sources`, `muse · 25 ideas`: a muse night is ideas drawn from its own briefs, not found sources. */
export function packetMeta(wing: ScoutWing, n: Night): string {
  const ideas = n.candidates.filter((c) => c.kind === "idea").length;
  return `${wingWord(wing)} · ${wing === "muse" ? `${ideas} ideas` : `${n.sources.length} sources`}${n.dry ? " · dry" : ""}`;
}

/** What a muse idea's cell meta adds: the character's name and age, and what the eye read - `read 34 · covered`. */
export function museFacts(c: Pick<IdeaCandidate, "card" | "judge">): string[] {
  const card = c.card === undefined ? [] : [`${c.card.name}, ${c.card.age}`];
  return c.judge === undefined ? card : [...card, `read ${c.judge.apparentAge ?? "unread"} · ${c.judge.clothing}`];
}

/** A character idea: kept, its card becomes a line in the muse wing's characters.md. */
export const isCharacter = (c: Candidate): c is IdeaCandidate & Required<Pick<IdeaCandidate, "card">> => c.kind === "idea" && c.target === "character" && c.card !== undefined;

/** The knowledge file a candidate's kept line lands in, for the active wing; undefined when it writes none. Throws on a bad template or step. */
function knowledgeRelOf(c: Candidate): string | undefined {
  if (c.kind === "finding") return findingRelOf(activeWing(), c.template, c.step);
  if (c.kind === "watch") return watchlistRelOf(activeWing());
  return isCharacter(c) ? MUSE_CHARACTERS_REL : undefined;
}

export type KnowledgeAt = { readonly rel: string; readonly exists: boolean; readonly holds: boolean };

/** By candidate id: each line-writing candidate's knowledge file as it stands now. A finding with nowhere to land is left out (its cell is a loss). */
export async function knowledgeOf(night: Night): Promise<Result<Record<string, KnowledgeAt>>> {
  const out: Record<string, KnowledgeAt> = {};
  for (const c of night.candidates) {
    const r = await v1Call(async () => knowledgeRelOf(c));
    if (!r.ok || r.value === undefined) continue;
    const rel = r.value;
    const s = await v1Call(() => knowledgeState(rel, markerOf(night.id, c.id)));
    if (!s.ok) return s;
    out[c.id] = { rel, ...s.value };
  }
  return ok(out);
}

/** The preview's line for a kept finding, watch line or character. */
export function knowledgeWrite(root: string, c: Candidate, k: KnowledgeAt, cell: string): ConsequenceItem & { readonly kind: "file" } {
  const heading = c.kind === "finding" ? FINDINGS_HEADING : c.kind === "watch" ? WATCH_HEADING : CHARACTERS_HEADING;
  return { kind: "file", target: `${root}/${k.rel}`, candidate: cell, detail: k.holds ? "already holds this line" : `${k.exists ? "" : "new file · "}a line under ${heading}` };
}

/** The adapter with every entry inside the wing its run id names: read and apply parse it, packet and consequence carry it on the read. */
export function inWing<V extends { readonly wing: ScoutWing }>(a: DecisionAdapter<V>): DecisionAdapter<V> {
  return {
    source: a.source,
    read: async (ref) => {
      const w = wingOfRun(ref.runId);
      return w.ok ? withWing(w.value.wing, () => a.read({ ...ref, runId: w.value.night })) : w;
    },
    packet: (v1) => withWing(v1.wing, () => a.packet(v1)),
    consequence: (v1, at) => withWing(v1.wing, () => a.consequence(v1, at)),
    apply: async (claim) => {
      const w = wingOfRun(claim.packet.runId ?? "");
      return w.ok ? withWing(w.value.wing, () => a.apply(claim)) : w;
    },
  };
}
