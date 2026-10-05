"use client";

// THE AUDIO SHELF — the module's one reader and writer of the sound store.
//
// Since round 4 (2026-10-05) the takes live on the studio server (lib/sound,
// /api/sound/*, through lib/sound/client.ts) instead of in this browser's
// IndexedDB: the Sound lab's Triage, Arrangement and Hunt, the agents' CLI
// (pipeline/sound.mts) and this Library read and write ONE shelf. What this
// hook hands its callers did not change shape — `assets` (Asset rows with an
// AudioMeta bag), `urls` (upload id -> playable URL), `patch`, `attachReturn`,
// `error` — so AudioWorkbench and everything below it read the same model they
// always did. The mapping is ./soundAdapter.ts, in one place.
//
//   read     every take, fixtures included (the Library shows them, marked),
//            mapped to Assets with this account's annex laid over.
//   migrate  once per account, this browser's IndexedDB rows are pushed to the
//            store (./soundMigration.ts) before the first read.
//   patch    a verdict, a score, a reject reason: applied to the local row
//            first so the ledger and the inspector read one post-write state,
//            then PATCHed; the server's derived fields (stage, label) are
//            taken from its answer.
//   return   a file a person brought back becomes a new unjudged take with its
//            bytes, its draft and its parent recorded.
//   clear    the examples: every fixture take, server-side, in one call.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Asset, AudioMeta } from "@/lib/assets";
import { clearFixtures, listTakes, patchTake, uploadTake } from "@/lib/sound/client";
import type { SoundTake } from "@/lib/sound/types";

import { loadAnnex, mergeAnnex } from "./soundAnnex";
import { applyLocally, assetFromSoundTake, playUrl, splitPatch, uploadMetaOf, type AnnexMap } from "./soundAdapter";
import { migrateShelf } from "./soundMigration";

/** A returned file's length, read off its metadata. Null when the browser
 *  cannot say — the take is then stored with no length rather than a fake 0. */
function probeDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const a = new Audio();
    const done = (v: number | null) => {
      a.onloadedmetadata = null;
      a.onerror = null;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 5000);
    a.preload = "metadata";
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? Math.round(a.duration * 100) / 100 : null);
    a.onerror = () => done(null);
    a.src = url;
  });
}

export function useAudioShelf(uid: string | undefined) {
  const [takes, setTakes] = useState<SoundTake[] | null>(null);
  const [annex, setAnnex] = useState<AnnexMap>({});
  const [error, setError] = useState<string | null>(null);
  /** The latest rows, for the writers below — a callback that closed over an
   *  older `takes` would map a patch onto a stale kind or a removed row. */
  const latest = useRef<SoundTake[] | null>(null);
  useEffect(() => {
    latest.current = takes;
  }, [takes]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const moved = await migrateShelf(uid);
      const r = await listTakes({ fixtures: true });
      if (cancelled) return;
      setAnnex(loadAnnex(uid));
      if (!r.ok) {
        setTakes([]);
        setError(`The audio shelf could not be read: ${r.error}`);
        return;
      }
      setTakes(r.data.takes);
      setError(
        moved.failed.length
          ? `${moved.failed.length} of this browser's takes did not move to the studio shelf (${moved.failed[0].error}); a reload retries.`
          : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const assets = useMemo<Asset[] | null>(
    () => (takes && uid ? takes.map((t) => assetFromSoundTake(t, uid, annex[t.id])) : takes ? [] : null),
    [takes, annex, uid],
  );
  /** take id -> the URL its bytes play from. Server URLs, so there is nothing
   *  to mint or revoke: the Library no longer owns object URLs for takes. */
  const urls = useMemo<ReadonlyMap<string, string>>(
    () => new Map((takes ?? []).filter((t) => t.file).map((t) => [t.id, playUrl(t.id)] as const)),
    [takes],
  );

  const patch = useCallback(
    (id: string, p: Partial<AudioMeta>) => {
      const t = latest.current?.find((x) => x.id === id);
      if (!t || !uid) return;
      const { patch: tp, annex: ax } = splitPatch(t.kind, p);
      if (Object.keys(ax).length) {
        const err = mergeAnnex(uid, { [id]: ax });
        setAnnex((m) => ({ ...m, [id]: { ...(m[id] ?? {}), ...ax } }));
        if (err) setError(err);
      }
      if (!Object.keys(tp).length) return;
      setTakes((prev) => prev && prev.map((x) => (x.id === id ? applyLocally(x, tp) : x)));
      patchTake(id, tp).then((r) => {
        if (!r.ok) {
          setError(`The last judgment was not saved: ${r.error}. A reload would lose it.`);
          return;
        }
        // Only what the server DERIVES is taken from its answer. Ratings are
        // not: a second key pressed before this answer arrived is already in
        // the local row, and the answer to the first would erase it.
        const s = r.data.take;
        setTakes((prev) =>
          prev &&
          prev.map((x) =>
            x.id === id ? { ...x, stage: s.stage, label: s.label, judgedAt: s.judgedAt, finalizedAt: s.finalizedAt } : x,
          ),
        );
        setError(null);
      });
    },
    [uid],
  );

  /** File a returned take. Resolves to the stored row, or null when the write
   *  failed (the error is then on `error`). */
  const attachReturn = useCallback(
    async (file: File, meta: Partial<AudioMeta>): Promise<Asset | null> => {
      if (!uid) return null;
      const local = URL.createObjectURL(file);
      const length = await probeDuration(local);
      URL.revokeObjectURL(local);
      const m = { ...(meta as Record<string, unknown>), ...(length != null ? { duration_s: length } : {}) };
      // A file the lab rendered keeps "lab"; anything else a person brought
      // back is a Suno return when it answers a Suno draft, else an import.
      const { meta: up, annex: ax } = uploadMetaOf({ ...m, verdict: "unjudged" } as Partial<AudioMeta> & Record<string, unknown>, {
        title: file.name.replace(/\.[^.]+$/, "") || file.name,
        fileName: file.name,
      });
      const r = await uploadTake(file, file.name, up);
      if (!r.ok) {
        setError(`${file.name} was not filed: ${r.error}.`);
        return null;
      }
      const take = r.data.take;
      const err = mergeAnnex(uid, { [take.id]: ax });
      setAnnex((a) => ({ ...a, [take.id]: { ...(a[take.id] ?? {}), ...ax } }));
      setTakes((prev) => [take, ...(prev ?? []).filter((x) => x.id !== take.id)]);
      setError(err);
      return assetFromSoundTake(take, uid, ax);
    },
    [uid],
  );

  const fixtures = useMemo(() => (takes ?? []).filter((t) => t.origin === "fixture").length, [takes]);

  /** Delete every example take. Resolves true when the store confirmed it. */
  const clearExamples = useCallback(async (): Promise<boolean> => {
    const r = await clearFixtures();
    if (!r.ok) {
      setError(`The examples were not cleared: ${r.error}.`);
      return false;
    }
    setTakes((prev) => prev && prev.filter((t) => t.origin !== "fixture"));
    setError(null);
    return true;
  }, []);

  return { assets, urls, error, patch, attachReturn, fixtures, clearExamples, takes };
}
