import "server-only";

import { ok, type Result } from "@gt/domain/errors";

import { listSeedBatches, seedOf } from "../../../foundry/scout/seedStore.ts";
import { readNight } from "../../../foundry/scout/store.ts";
import type { Night, Seed, TrackCandidate } from "../../../foundry/scout/types.ts";
import { parseTrackRef } from "../../../foundry/scout/visualizer.ts";
import { v1Call } from "../types.ts";
import type { ScoutV1 } from "./scoutPlan.ts";

// Moved out of ./scout.ts (spark scout-muse) so the adapter stays under its bound; read inside the night's wing
// like the rest of the adapter's read.

/**
 * The words a candidate's seed and a visualizer's song give its cells (spark scout-decision-graph): every seed the
 * night's candidates grow from, and each visualizer's clip - its title and its track's sentence - from the night
 * that made it. A night or a seed that cannot be read leaves its words out, never the packet. And each storyboard's
 * idea title (spark scout-storyboards), from the night that drew the idea.
 */
export async function musicOf(night: Night): Promise<Result<Pick<ScoutV1, "seeds" | "tracks" | "ideas">>> {
  const refs = new Set(night.candidates.flatMap((c) => (c.fromSeed === undefined ? [] : [c.fromSeed])));
  const seeds: Record<string, Seed> = {};
  if (refs.size > 0) {
    const batches = await v1Call(() => listSeedBatches());
    if (!batches.ok) return batches;
    for (const ref of refs) {
      const s = seedOf(batches.value, ref)?.seed;
      if (s !== undefined) seeds[ref] = s;
    }
  }
  const tracks: Record<string, { title: string; sentence: string }> = {};
  const nights = new Map<string, Night | undefined>([[night.id, night]]);
  for (const c of night.candidates) {
    if (c.kind !== "visualizer") continue;
    const p = parseTrackRef(c.track);
    if (p === null) continue;
    if (!nights.has(p.night)) nights.set(p.night, await readNight(p.night).catch(() => undefined));
    const t = nights.get(p.night)?.candidates.find((x): x is TrackCandidate => x.id === p.candidate && x.kind === "track");
    const clip = t?.clips.find((x) => x.part === p.part);
    if (t !== undefined && clip !== undefined) tracks[c.track] = { title: clip.title, sentence: t.sentence };
  }
  const ideas: Record<string, string> = {};
  for (const c of night.candidates) {
    if (c.kind !== "storyboard" || c.fromIdea === undefined) continue;
    const ref = c.fromIdea;
    const at = ref.lastIndexOf("/");
    if (at <= 0) continue;
    const from = ref.slice(0, at);
    if (!nights.has(from)) nights.set(from, await readNight(from).catch(() => undefined));
    const idea = nights.get(from)?.candidates.find((x) => x.id === ref.slice(at + 1) && x.kind === "idea");
    if (idea?.kind === "idea") ideas[ref] = idea.title;
  }
  return ok({ seeds, tracks, ideas });
}
