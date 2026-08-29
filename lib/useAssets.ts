"use client";

// Loading, seeding and removing the signed-in account's assets.
//
// The seed comes from the trial grid — `public/trials/index.json`, which
// pipeline/build-style-trials.mts writes. That is deliberate rather than
// convenient: those plates are the first genuinely reusable images this project
// has produced, and a shelf that starts empty teaches nothing about what a
// shelf is for.
//
// Seeded ONCE per account, marked in localStorage rather than IndexedDB —
// exactly as /projects does, and for the same reason: the mark has to survive
// the user deleting every seeded asset, or "remove" stops meaning remove and an
// emptied shelf silently refills on the next reload.

import { useCallback, useEffect, useState } from "react";

import {
  assetFromProof,
  deleteAsset as dbDelete,
  folderRenameEntries,
  getAsset,
  hydrateProofSrcs,
  listAssets,
  moveAssets,
  refileAssets,
  renameAsset,
  promotedFrom,
  putAssets,
  readProofPointer,
  type Asset,
} from "./assets";
import { listThemes, type Proof, type Theme } from "./themes";
import { presetById } from "@/app/library/presets";

const seededKey = (uid: string) => `gravitone.assets.seeded.${uid}`;

function alreadySeeded(uid: string): boolean {
  try {
    return localStorage.getItem(seededKey(uid)) === "1";
  } catch {
    return true; // storage off: better a bare shelf than one that keeps reappearing
  }
}
function markSeeded(uid: string) {
  try {
    localStorage.setItem(seededKey(uid), "1");
  } catch {
    /* see above */
  }
}

interface TrialEntry {
  styleId: string;
  styleName: string;
  trialId: string;
  trialLabel: string;
  problem: string;
  beat: string;
  file: string;
  provider?: string;
  model?: string;
  grade?: unknown;
}

/**
 * Turn the trial index into shelf entries.
 *
 * Only the `google` grid is seeded. Both were rendered, but the graded
 * comparison put Leonardo at 23% usable against Nano Banana's 87%, and a shelf
 * of reusable work should not open with three-quarters unusable plates. The
 * Leonardo grid stays on disk for comparison; it is evidence, not inventory.
 */
async function seedFromTrials(uid: string): Promise<Asset[]> {
  const res = await fetch("/trials/index.json", { cache: "no-store" });
  if (!res.ok) return [];
  const doc = (await res.json()) as { entries?: TrialEntry[] };
  const now = Date.now();

  return (doc.entries ?? [])
    .filter((e) => (e.provider ?? "leonardo") === "google")
    .map((e, i) => ({
      // CONTENT-ADDRESSED, not time-or-index-addressed. React invokes effects
      // twice in development, so two seeds can run concurrently, both find an
      // empty shelf, and both write — which with random ids produced sixty
      // assets instead of thirty (measured, drive-assets.mjs). A deterministic
      // id makes the second write an overwrite of the first, so the seed is
      // idempotent by construction rather than by locking, and re-seeding after
      // a regenerated grid updates rows instead of duplicating them.
      id: `as-${e.provider ?? "leonardo"}-${e.styleId}-${e.trialId}`,
      uid,
      // <discipline> › styles › presets › <preset>. The folder chain the shelf
      // is browsed by; the root is the preset's discipline, or "shared" when
      // the trial names a preset the catalogue no longer has. Rows seeded
      // before the root existed keep `["styles", ...]`, and the tree shows
      // both — that is what is on the shelf, not a display bug.
      path: [presetById.get(e.styleId)?.discipline ?? "shared", "styles", "presets", e.styleId],
      name: e.trialLabel || e.trialId,
      src: e.file,
      kind: "image" as const,
      meta: {
        styleName: e.styleName,
        trialId: e.trialId,
        problem: e.problem,
        beat: e.beat,
        provider: e.provider,
        model: e.model,
        grade: e.grade,
      },
      createdAt: now + i,
    }));
}

/** Read the bytes a promoted proof points at. Only pays for the theme read when
 *  something on the shelf actually needs it — a sheet is base64 in the record,
 *  so listing every theme is not free. */
async function hydrate(uid: string, rows: Asset[]): Promise<Asset[]> {
  if (!rows.some((a) => readProofPointer(a.src))) return rows;
  return hydrateProofSrcs(rows, await listThemes(uid));
}

/**
 * @param seed  Whether this mount may hand a first-time account the trial grid.
 *   The atelier passes false: it reads the shelf to know what is already on it
 *   and to promote onto it, and filling a shelf as a side effect of opening a
 *   different tab would be a surprise.
 */
export function useAssets(uid: string | null, { seed = true }: { seed?: boolean } = {}) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      let rows = await listAssets(uid);
      // Gated on the MARK alone, not on an empty shelf. A promoted proof is a
      // row, and an account that promoted one before ever opening Assets would
      // otherwise never be given the trial grid at all.
      if (seed && !alreadySeeded(uid)) {
        const seeded = await seedFromTrials(uid);
        if (seeded.length) {
          await putAssets(seeded);
          markSeeded(uid);
          rows = await listAssets(uid);
        }
      }
      setAssets(await hydrate(uid, rows));
      setError(null);
    } catch (e) {
      setAssets([]);
      setError(e instanceof Error ? e.message : "could not read your assets");
    }
  }, [uid, seed]);

  useEffect(() => {
    if (!uid) {
      setAssets(null);
      return;
    }
    void reload();
  }, [uid, reload]);

  const remove = useCallback(async (id: string) => {
    try {
      await dbDelete(id);
      setAssets((as) => (as ?? []).filter((a) => a.id !== id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not remove the asset");
    }
  }, []);

  /**
   * Put an approved proof on the shelf.
   *
   * Idempotent by construction, not by checking: the id is content-addressed
   * (assets.ts#promotedId), so a second promotion overwrites the same row. The
   * local list is updated the same way — replace by id, never append — because
   * React 19 can run the caller twice.
   */
  const promote = useCallback(
    async (theme: Theme, proof: Proof): Promise<Asset | null> => {
      if (!uid) return null;
      try {
        const fresh = assetFromProof(uid, theme, proof);
        // A plate the user has since REFILED keeps where they put it. The id is
        // content-addressed, so a second promotion is an overwrite of the same
        // row (assets.ts#promotedId) — and `assetFromProof` recomputes the path
        // from the theme, so without this every reopened proof sheet would drag
        // the plate back out of the folder the user moved it to, silently and
        // on an action that reads as a no-op.
        const prior = await getAsset(fresh.id);
        // The NAME is preserved for the same reason as the path: both are the
        // user's edits to a shelf entry, and `assetFromProof` recomputes both
        // from the theme. A plate they renamed reverting to the proof's own
        // label the next time the sheet is opened is the same silent undo.
        const asset = prior ? { ...fresh, path: prior.path, name: prior.name } : fresh;
        await putAssets([asset]);
        // The stored row holds the pointer; the list holds what a gallery can
        // draw. Same record, dereferenced — see assets.ts.
        const [shown] = hydrateProofSrcs([asset], [theme]);
        setAssets((as) =>
          [...(as ?? []).filter((a) => a.id !== asset.id), shown].sort((a, b) =>
            a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
          ),
        );
        setError(null);
        return asset;
      } catch (e) {
        setError(e instanceof Error ? e.message : "could not put it on the shelf");
        return null;
      }
    },
    [uid],
  );

  /**
   * Refile rows under a new folder chain.
   *
   * Returns how many rows the store accepted, so a caller can say "moved 3
   * plates to presets" rather than announcing a number it assumed. Local state
   * is patched rather than reloaded: a reload would re-hydrate every promoted
   * proof on the shelf — re-reading the themes and rebuilding megabytes of
   * base64 — to reflect a change to one array of strings.
   */
  const move = useCallback(async (ids: string[], path: string[]): Promise<number> => {
    if (!ids.length) return 0;
    try {
      await moveAssets(ids, path);
      const moving = new Set(ids);
      setAssets((as) => (as ?? []).map((a) => (moving.has(a.id) ? { ...a, path } : a)));
      setError(null);
      return ids.length;
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not refile it");
      return 0;
    }
  }, []);

  /**
   * Rename one plate. An empty name is refused rather than stored: the shelf
   * reads `name` for the tile caption, the drawer heading and the removal
   * announcement, and a blank one would make a plate that cannot be referred
   * to by any of the three.
   */
  const rename = useCallback(async (id: string, raw: string): Promise<boolean> => {
    const name = raw.trim();
    if (!name) return false;
    try {
      await renameAsset(id, name);
      setAssets((as) => (as ?? []).map((a) => (a.id === id ? { ...a, name } : a)));
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not rename it");
      return false;
    }
  }, []);

  /**
   * Rename a folder — which, for a tree derived from paths, is a refile of
   * everything at or below it.
   *
   * Returns how many plates moved so the caller can say so. The entries are
   * computed from LOCAL state because that is what the user is looking at and
   * what the count they are about to be told refers to; the writes themselves
   * still go row by row through the store.
   */
  const renameFolder = useCallback(
    async (path: string[], raw: string): Promise<number> => {
      const name = raw.trim();
      if (!name || !path.length || name === path[path.length - 1]) return 0;
      const entries = folderRenameEntries(assets ?? [], path, name);
      if (!entries.length) return 0;
      try {
        await refileAssets(entries);
        const byId = new Map(entries.map((e) => [e.id, e.path]));
        setAssets((as) => (as ?? []).map((a) => (byId.has(a.id) ? { ...a, path: byId.get(a.id)! } : a)));
        setError(null);
        return entries.length;
      } catch (e) {
        setError(e instanceof Error ? e.message : "could not rename the folder");
        return 0;
      }
    },
    [assets],
  );

  /** Drop every shelf entry promoted out of one theme — what deleting that
   *  theme has to do, since a promoted asset POINTS at bytes inside it and
   *  would otherwise be left pointing at nothing. */
  const removeFromTheme = useCallback(
    async (themeId: string) => {
      if (!uid) return;
      try {
        // From the STORE, not from local state: this runs beside a theme
        // deletion, and the shelf may never have been opened in this session.
        const doomed = promotedFrom(await listAssets(uid), themeId);
        for (const a of doomed) await dbDelete(a.id);
        const ids = new Set(doomed.map((a) => a.id));
        setAssets((as) => (as ?? []).filter((a) => !ids.has(a.id)));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "could not clear the promoted plates");
      }
    },
    [uid],
  );

  return {
    assets,
    error,
    loading: assets === null,
    reload,
    remove,
    move,
    rename,
    renameFolder,
    promote,
    removeFromTheme,
  };
}
