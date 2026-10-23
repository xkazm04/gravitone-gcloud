import "server-only";

import { errorMessage } from "@gt/domain/errors";
import type { LibraryOrigin } from "@gt/domain/library";

import { listNights, readNight, resolveInNight } from "../../foundry/scout/store.ts";
import { cellId, type Night, type SceneCandidate } from "../../foundry/scout/types.ts";
import { withWing } from "../../foundry/scout/wingScope.ts";
import { isoOf, mimeOf, type Feed, type FeedCtx, type FeedItem, type FeedRead } from "./types.ts";

// THE SCOUT'S KEPT SCENES, AS LIBRARY ITEMS - foundry-out/scout/<night>/night.json
// (lib/foundry/scout/store.ts), read through the night store's own readers.
//
// Only what the Board admitted: a scene from a COMMITTED night that was not
// dry, with at least one of its cells kept (night.committed.kept). One item per
// scene, a `motion` item: the clip when the operator kept the clip, else the
// first kept replica as a poster. Its subject is the recipe's composition -
// the scene's craft in words, never a source's subject - and it is
// `reference-only` whatever was kept: a replica is OUR picture of THEIR shot,
// and the clip animates that replica, so neither is cleared to publish.
//
// Kept STYLES are not here: a style candidate's commit writes the catalogue,
// and stylesFeed (./foundry.ts) already projects every catalogue style.
// Findings and watch lines are knowledge files, not media. A game asset (`asset3d`) is
// shelved by the mesh feed (./mesh.ts) from its own manifest, where the night's apply wrote each
// variant's verdict - shelving it here too would put one model in the Library twice.
//
// THE SCOUT WING ONLY (spark scout-muse), pinned by name rather than left to whatever scope a caller
// runs in: the muse wing's stills are a study of how characters are drawn, judged and triaged on the
// Board, and the brief keeps them off the Library's shelves in v1. A kept muse look still reaches the
// catalogue through the extract path, and stylesFeed shelves it from there.

const ORIGIN: LibraryOrigin = "scout";

const NIGHT_CAP = 120;

/** The scene's Library item and the cell that decides its format: the kept clip, else the first kept replica. */
export function sceneShelf(night: Pick<Night, "id">, c: SceneCandidate, kept: ReadonlySet<string>): { readonly id: string; readonly cell: string; readonly format: "clip" | "poster"; readonly file: string } | null {
  const id = `motion:scout:${night.id}:${c.id}`;
  const clipCell = cellId(c.id, "clip");
  if (c.clip !== undefined && kept.has(clipCell)) return { id, cell: clipCell, format: "clip", file: c.clip.path };
  const i = c.replicas.findIndex((_, n) => kept.has(cellId(c.id, `replica-${n + 1}`)));
  const file = c.replicas[i];
  return file === undefined ? null : { id, cell: cellId(c.id, `replica-${i + 1}`), format: "poster", file };
}

/** Pure: a night's kept scenes as feed items, and the scenes it could not shelve, said. */
export function shelveNight(night: Night, universe: "real" | "fixture"): FeedRead {
  const done = night.committed;
  if (night.dry || done === undefined || done.dry) return { items: [], skipped: [] };
  const kept = new Set(done.kept);
  const items: FeedItem[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const at = isoOf(done.at) ?? isoOf(night.startedAt);
  for (const c of night.candidates) {
    if (c.kind !== "scene") continue;
    const shelf = sceneShelf(night, c, kept);
    if (shelf === null) continue;
    const r = c.recipe;
    if (r === undefined) {
      skipped.push({ id: `${night.id}/${c.id}`, reason: "kept, but the scene has no recipe to name it by" });
      continue;
    }
    let abs: string;
    try {
      abs = resolveInNight(night.id, shelf.file);
    } catch (e) {
      skipped.push({ id: `${night.id}/${c.id}`, reason: `${shelf.file}: ${errorMessage(e)}` });
      continue;
    }
    const mime = mimeOf(abs);
    items.push({
      item: {
        kind: "motion",
        id: shelf.id,
        title: `${r.shot} · ${r.composition}`,
        state: "ratified",
        collections: [{ kind: "run", id: night.id }],
        origin: ORIGIN,
        rights: { use: "reference-only" },
        source: universe,
        lineage: [{ kind: "run", id: night.id }, ...(c.jobId === undefined ? [] : [{ kind: "job" as const, id: c.jobId }])],
        vocabulary: { subject: r.composition, format: shelf.format },
        ...(at === undefined ? {} : { at }),
      },
      meta: `${shelf.format} · scout ${night.id}`,
      extras: { prompt: r.prompt, run: { id: night.id, stage: night.state } },
      ...(mime === undefined ? {} : { file: { abs, mime } }),
    });
  }
  return { items, skipped };
}

async function readScoutWing(ctx: FeedCtx): Promise<FeedRead> {
  const items: FeedItem[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const summary of (await listNights()).slice(0, NIGHT_CAP)) {
    if (summary.state !== "committed" || summary.dry) continue;
    let night: Night;
    try {
      night = await readNight(summary.id);
    } catch (e) {
      skipped.push({ id: summary.id, reason: errorMessage(e) });
      continue;
    }
    const r = shelveNight(night, ctx.universe);
    items.push(...r.items);
    skipped.push(...r.skipped);
  }
  return { items, skipped };
}

export const scoutFeed: Feed = {
  id: "scout",
  read: (ctx) => withWing("scout", () => readScoutWing(ctx)),
};
