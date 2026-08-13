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
  deleteAsset as dbDelete,
  listAssets,
  putAssets,
  type Asset,
} from "./assets";

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
      id: `as-${now.toString(36)}-${i.toString(36)}`,
      uid,
      // styles › presets › <preset>. The folder chain the shelf is browsed by.
      path: ["styles", "presets", e.styleId],
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

export function useAssets(uid: string | null) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      let rows = await listAssets(uid);
      if (rows.length === 0 && !alreadySeeded(uid)) {
        const seed = await seedFromTrials(uid);
        if (seed.length) {
          await putAssets(seed);
          markSeeded(uid);
          rows = await listAssets(uid);
        }
      }
      setAssets(rows);
      setError(null);
    } catch (e) {
      setAssets([]);
      setError(e instanceof Error ? e.message : "could not read your assets");
    }
  }, [uid]);

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

  return { assets, error, loading: assets === null, reload, remove };
}
