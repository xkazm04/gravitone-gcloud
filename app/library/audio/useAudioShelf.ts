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
//            mapped to Assets.
//   migrate  once per account, this browser's IndexedDB rows are pushed to the
//            store (./soundMigration.ts) before the first read, and the old
//            per-browser annex (reference / round / draft links) is moved onto
//            the takes it describes right after it.
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

import { applyLocally, assetFromSoundTake, playUrl, splitPatch, uploadMetaOf } from "./soundAdapter";
import { NO_ERRORS, patchKey, pickNotice, setNotice, type ShelfErrors } from "./shelfErrors";
import { migrateAnnex, migrateShelf } from "./soundMigration";

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
  const [errors, setErrors] = useState<ShelfErrors>(NO_ERRORS);
  const notice = useCallback((key: string, message: string | null) => setErrors((e) => setNotice(e, key, message)), []);
  const error = useMemo(() => pickNotice(errors), [errors]);
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
      if (!r.ok) {
        setTakes([]);
        notice("read", `The audio shelf could not be read: ${r.error}`);
        return;
      }
      const annexed = await migrateAnnex(uid, r.data.takes);
      if (cancelled) return;
      const fresh = new Map(annexed.moved.map((t) => [t.id, t] as const));
      setTakes(r.data.takes.map((t) => fresh.get(t.id) ?? t));
      notice(
        "migrate",
        moved.failed.length
          ? `${moved.failed.length} of this browser's takes did not move to the studio shelf (${moved.failed[0].error}); a reload retries.`
          : annexed.failed.length
            ? `${annexed.failed.length} reference or draft link${annexed.failed.length === 1 ? "" : "s"} did not reach the studio shelf (${annexed.failed[0].error}); a reload retries.`
            : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, notice]);

  const assets = useMemo<Asset[] | null>(
    () => (takes && uid ? takes.map((t) => assetFromSoundTake(t, uid)) : takes ? [] : null),
    [takes, uid],
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
      const { patch: tp } = splitPatch(t.kind, p);
      if (!Object.keys(tp).length) return;
      setTakes((prev) => prev && prev.map((x) => (x.id === id ? applyLocally(x, tp) : x)));
      patchTake(id, tp).then((r) => {
        if (!r.ok) {
          notice(patchKey(id), `The last judgment was not saved: ${r.error}. A reload would lose it.`);
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
        notice(patchKey(id), null);
      });
    },
    [uid, notice],
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
      const { meta: up } = uploadMetaOf({ ...m, verdict: "unjudged" } as Partial<AudioMeta> & Record<string, unknown>, {
        title: file.name.replace(/\.[^.]+$/, "") || file.name,
        fileName: file.name,
      });
      const r = await uploadTake(file, file.name, up);
      if (!r.ok) {
        notice("upload", `${file.name} was not filed: ${r.error}.`);
        return null;
      }
      const take = r.data.take;
      setTakes((prev) => [take, ...(prev ?? []).filter((x) => x.id !== take.id)]);
      notice("upload", null);
      return assetFromSoundTake(take, uid);
    },
    [uid, notice],
  );

  const fixtures = useMemo(() => (takes ?? []).filter((t) => t.origin === "fixture").length, [takes]);

  /** Delete every example take. Resolves true when the store confirmed it. */
  const clearExamples = useCallback(async (): Promise<boolean> => {
    const r = await clearFixtures();
    if (!r.ok) {
      notice("clear", `The examples were not cleared: ${r.error}.`);
      return false;
    }
    setTakes((prev) => prev && prev.filter((t) => t.origin !== "fixture"));
    notice("clear", null);
    return true;
  }, [notice]);

  return { assets, urls, error, patch, attachReturn, fixtures, clearExamples, takes };
}
