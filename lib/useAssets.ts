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
  hydrateProofSrcs,
  listAssets,
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
        const asset = assetFromProof(uid, theme, proof);
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

  return { assets, error, loading: assets === null, reload, remove, promote, removeFromTheme };
}
