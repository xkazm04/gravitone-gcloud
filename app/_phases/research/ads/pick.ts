"use client";

// THE TWO PICKS — the creator's choice in each concept round, as writes.
//
// No React here on purpose: a Node probe drives these against fake-indexeddb
// (tests/golden-path/ads-concepts.probe.spec.ts), and the surfaces call them
// after updating what is on screen.
//
// PICKING AN IDEA MARKS THE PROJECT RESEARCHED. `research.researched` is the
// one field every discipline's research gate is read from (useMusicVideoSource's
// `markResearched` states why at length); an ads project has no topic and no
// notebook, so nothing else would ever write it. A merge, so a topic someone
// else wrote survives.

import type { AdsIdeasData, AdsScenariosData } from "@/lib/ads/types";

import { ADS_IDEAS, ADS_SCENARIOS } from "../../_shared/records/ads";
import { patchRecord, type RecordWriteOutcome } from "../../_shared/records/patch";
import { RESEARCH } from "../records";

/** The picked idea, merged onto disk truth — the options on disk are the ones a
 *  run wrote, which may be newer than the ones the caller was holding. */
export async function pickIdea(projectId: string, ideaId: string, at = Date.now()): Promise<RecordWriteOutcome> {
  const picked = await patchRecord(ADS_IDEAS, projectId, (cur): AdsIdeasData => ({
    briefDigest: null,
    options: [],
    engine: null,
    ...cur,
    pickedId: ideaId,
    savedAt: at,
  }));
  if (!picked.ok) return picked;
  return patchRecord(RESEARCH, projectId, (cur) => ({ ...cur, topic: cur?.topic ?? "", researched: true }));
}

export function pickScenario(projectId: string, scenarioId: string, at = Date.now()): Promise<RecordWriteOutcome> {
  return patchRecord(ADS_SCENARIOS, projectId, (cur): AdsScenariosData => ({
    ideaId: null,
    options: [],
    engine: null,
    ...cur,
    pickedId: scenarioId,
    savedAt: at,
  }));
}

/** The pick's timestamp, taken in an event handler — one clock for the screen
 *  and the disk, so `newest` (./run.ts) compares like with like. */
export const pickStamp = (): number => Date.now();

/** Round 1's options were written for a different brief. */
export const ideasStale = (d: AdsIdeasData | null, briefDigest: string): boolean =>
  !!d && d.options.length > 0 && d.briefDigest !== null && d.briefDigest !== briefDigest;

/** Round 2's options execute a different idea than the one now picked. */
export const scenariosStale = (d: AdsScenariosData | null, pickedIdeaId: string | null): boolean =>
  !!d && d.options.length > 0 && d.ideaId !== pickedIdeaId;
