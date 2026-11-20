// THE RETENTION SWEEP (spark reel-studio, the owner's rule of 2026-11-18). For each reel: write the recipe, ask
// lib/reel/retention.ts what is due, delete it, and record what was taken in reel.json's `film.archived`.
//
// THE ORDER IS THE GATE RECORD'S (registry review-iteration-loops/gate-record-outlives-the-media):
//   1. the keeper first - recipe.json + RECIPE.md are written before anything is deleted, so a crash after a
//      delete never leaves a film with neither its media nor its record;
//   2. only due files are touched; an undecided film keeps everything;
//   3. the destruction is RECORDED IN THE ITEM, never by removing the item: each deleted file gets an `archived`
//      row (name, bytes, sha, rule, time). A file found already gone is recorded once, marked `foundMissing`, so
//      "deleted by the sweep" and "lost" stay different states;
//   4. the recipe is written again after the deletions, so it lists them.
// Delete and record are separate writes; a crash between them is healed by step 3 on the next sweep.
//
// `dry` counts what would go and deletes nothing (the CLI's --dry, and "count before you destroy").

import { rm, stat } from "node:fs/promises";
import path from "node:path";

import type { Store } from "@gt/kernel/store";
import { publicationOfIn } from "@gt/kernel/slots/read";

import { exportsRoot } from "../publish/exports.ts";
import { kernel } from "../kernelProcess.ts";
import { reelExportId, reelSlotId } from "../producers/reelActs.ts";
import { mutateState, readState } from "../producers/reel/folder.ts";
import { filmStageOf } from "./film.ts";
import { buildRecipe, writeRecipe } from "./recipe.ts";
import { dueFiles, type DueFile, type FacePublication } from "./retention.ts";
import { listReelSlugs, readVerdicts, reelDir } from "./store.ts";
import { FILM_DIR, FILM_FACES, type ArchivedFile, type FilmFace, type ReelState } from "./types.ts";

export type SweptReel = {
  readonly slug: string;
  readonly deleted: readonly ArchivedFile[];
  /** Files due but already gone, recorded now. */
  readonly missing: readonly ArchivedFile[];
  readonly error?: string;
};

export type SweepReport = { readonly reels: number; readonly files: number; readonly bytes: number; readonly dry: boolean; readonly swept: readonly SweptReel[] };

export type SweepOptions = {
  readonly now: Date;
  readonly dry?: boolean;
  /** One reel only. */
  readonly slug?: string;
  /** A face's publication by slot id; production reads the kernel's publications table. */
  readonly publication?: (slotId: string) => FacePublication | undefined;
};

const sizeOf = (abs: string): Promise<number | undefined> => stat(abs).then((s) => (s.isFile() ? s.size : undefined), () => undefined);

/** The kernel's publication of a slot, or undefined (no store, no slot, not published). */
function kernelPublication(store: Store | undefined): (slotId: string) => FacePublication | undefined {
  return (slotId) => {
    if (store === undefined) return undefined;
    const r = store.read((x) => publicationOfIn(x, slotId));
    return r.ok && r.value !== undefined ? { at: r.value.publishedAt, dry: r.value.dry } : undefined;
  };
}

const absOf = (dir: string, file: string): string => (file.startsWith("exports:") ? path.join(exportsRoot(), file.slice("exports:".length)) : path.join(dir, FILM_DIR, file));

/** True when this exact file (name, and sha when it has one) is already in the record. */
const recorded = (state: ReelState, d: DueFile): boolean => (state.film?.archived ?? []).some((a) => a.file === d.file && (d.sha === undefined || a.sha === undefined || a.sha === d.sha));

/** Sweep one reel. Never throws for a reel's own trouble: it comes back as `error`. */
export async function archiveReel(slug: string, o: SweepOptions & { readonly store?: Store }): Promise<SweptReel> {
  const dir = reelDir(slug);
  try {
    const state = await readState(dir);
    const verdicts = await readVerdicts(dir);
    const stage = filmStageOf(state, verdicts);
    const round = verdicts.stops.release?.round ?? 1;
    const pubOf = o.publication ?? kernelPublication(o.store);
    const published = FILM_FACES.flatMap((face) => {
      const slotId = reelSlotId(slug, face, round);
      const p = pubOf(slotId);
      return p === undefined ? [] : [{ face, slotId, at: p.at, dry: p.dry }];
    });
    const pubByFace = (face: FilmFace): FacePublication | undefined => published.find((p) => p.face === face);

    // 1. The keeper first.
    if (o.dry !== true) await writeRecipe(dir, await buildRecipe({ dir, state, stage, verdicts, published, now: o.now }));
    const film = state.film;
    if (film === undefined) return { slug, deleted: [], missing: [] };

    const due = dueFiles({ film, stage, now: o.now, published: pubByFace, exportOf: (face) => `${reelExportId(slug, face, round)}.mp4` });
    const deleted: ArchivedFile[] = [];
    const missing: ArchivedFile[] = [];
    const at = o.now.toISOString();
    for (const d of due) {
      const abs = absOf(dir, d.file);
      const size = await sizeOf(abs);
      const row = (bytes: number, gone: boolean): ArchivedFile => ({ file: d.file, bytes, rule: d.rule, at, ...(d.sha === undefined ? {} : { sha: d.sha }), ...(gone ? { foundMissing: true } : {}) });
      if (size === undefined) {
        // Already gone: record it once (a mix that was never made is not "missing" - it has no bytes and no sha).
        if (!recorded(state, d) && d.bytes > 0) missing.push(row(d.bytes, true));
        continue;
      }
      if (o.dry !== true) await rm(abs, { force: true });
      deleted.push(row(size, false));
    }

    // 2. The proof stills go with the masters: once both masters are gone, `stills/` is a picture of a film no one keeps.
    const mastersGone = FILM_FACES.every((f) => {
      const r = film.renders[f];
      return r === undefined || recorded(state, { file: r.file, rule: "master-14d", bytes: 0, sha: r.sha }) || deleted.some((x) => x.file === r.file);
    });
    const stillsAbs = path.join(dir, FILM_DIR, "stills");
    if (mastersGone && (await stat(stillsAbs).then((s) => s.isDirectory(), () => false))) {
      if (o.dry !== true) await rm(stillsAbs, { recursive: true, force: true });
      deleted.push({ file: "stills/", bytes: 0, rule: "master-14d", at });
    }

    // 3. The record, in the item.
    const rows = [...deleted, ...missing];
    if (rows.length > 0 && o.dry !== true) {
      const next = await mutateState(dir, (s) => (s.film === undefined ? s : { ...s, film: { ...s.film, archived: [...(s.film.archived ?? []), ...rows] }, updatedAt: at }));
      // 4. The recipe again, so it lists what was just taken.
      await writeRecipe(dir, await buildRecipe({ dir, state: next, stage, verdicts, published, now: o.now }));
    }
    return { slug, deleted, missing };
  } catch (e) {
    return { slug, deleted: [], missing: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** Sweep every reel (or one). The store is the process's kernel unless a publication reader is given. */
export async function sweepReels(o: SweepOptions & { readonly store?: Store }): Promise<SweepReport> {
  let store = o.store;
  if (store === undefined && o.publication === undefined) {
    const k = kernel();
    if (k.ok) store = k.value.store;
  }
  const slugs = o.slug === undefined ? await listReelSlugs() : [o.slug];
  const swept: SweptReel[] = [];
  for (const slug of slugs) swept.push(await archiveReel(slug, { ...o, ...(store === undefined ? {} : { store }) }));
  const files = swept.flatMap((s) => s.deleted);
  return { reels: swept.length, files: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0), dry: o.dry === true, swept };
}
