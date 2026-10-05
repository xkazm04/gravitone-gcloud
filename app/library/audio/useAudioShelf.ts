"use client";

// THE AUDIO SHELF — the module's one reader and writer of lib/assets.
//
//   read     every `kind: "audio"` row for the account, plus the bytes behind
//            any returned take (studioDb's uploads store), as object URLs this
//            hook mints and releases.
//   seed     once per account, the contest fixture (./audioSeed.ts).
//   patch    a verdict, a score, a reject reason: lib/assets#updateAssetMeta,
//            applied to the local list first so the ledger and the inspector
//            read one post-write state without a refetch.
//   return   a file a person downloaded from Suno or ElevenLabs becomes a new
//            unjudged take with its bytes, its draft and its parent recorded —
//            lib/assets#putUploads, one transaction over row and bytes. The
//            contest held these as session-only blob URLs; here they survive a
//            reload.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  assetFromUpload,
  getUploadBlobs,
  listAssets,
  putAssets,
  putUploads,
  readUploadPointer,
  updateAssetMeta,
  type Asset,
  type AudioMeta,
} from "@/lib/assets";

/** The seeded-once mark — same contract as lib/useProjects.ts's `seededKey`:
 *  outside IndexedDB so it survives a user deleting every seeded row, and the
 *  rows go in with `put`, so two tabs racing one fresh account upsert the same
 *  ids rather than one of them needing to lose.
 *
 *  `.v2`: the first audio seed (eight hand-written rows, 2026-10-04) set an
 *  unversioned mark, and an account carrying it would otherwise never be
 *  offered the contest fixture. The fixture's ids cover all eight of the old
 *  ones, so the reseed REPLACES that seed rather than sitting beside it.
 *  lib/identityEviction.ts evicts both marks. */
const seededKey = (uid: string) => `gravitone.audio-seeded.v2.${uid}`;

function alreadySeeded(uid: string): boolean {
  try {
    return localStorage.getItem(seededKey(uid)) === "1";
  } catch {
    return true;
  }
}

function markSeeded(uid: string): void {
  try {
    localStorage.setItem(seededKey(uid), "1");
  } catch {
    /* the seed is idempotent by id; a lost mark costs a re-put, not a duplicate */
  }
}

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

const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function useAudioShelf(uid: string | undefined) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  /** upload id -> object URL, for the returned takes whose bytes are present. */
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [error, setError] = useState<string | null>(null);
  /** Every URL this hook minted, released on unmount. A ref, not state: it is
   *  read only by the cleanup, never by a render. */
  const owned = useRef(new Set<string>());

  useEffect(() => {
    const held = owned.current;
    return () => {
      held.forEach((u) => URL.revokeObjectURL(u));
      held.clear();
    };
  }, []);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const minted: string[] = [];
    const held = owned.current;
    (async () => {
      try {
        let rows = await listAssets(uid);
        if (!alreadySeeded(uid)) {
          const { seedAudioAssets } = await import("./audioSeed");
          await putAssets(seedAudioAssets(uid));
          markSeeded(uid);
          rows = await listAssets(uid);
        }
        const audio = rows.filter((a) => a.kind === "audio");
        const ids = audio.map((a) => readUploadPointer(a.src)).filter((id): id is string => Boolean(id));
        const blobs = await getUploadBlobs(ids);
        if (cancelled) return;
        const next = new Map<string, string>();
        for (const [id, blob] of blobs) {
          const u = URL.createObjectURL(blob);
          minted.push(u);
          held.add(u);
          next.set(id, u);
        }
        setUrls(next);
        setAssets(audio);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setAssets([]);
        setError(message(e, "could not read the audio shelf"));
      }
    })();
    return () => {
      cancelled = true;
      for (const u of minted) {
        URL.revokeObjectURL(u);
        held.delete(u);
      }
    };
  }, [uid]);

  const patch = useCallback((id: string, p: Partial<AudioMeta>) => {
    setAssets((prev) => prev && prev.map((a) => (a.id === id ? { ...a, meta: { ...(a.meta ?? {}), ...p } } : a)));
    updateAssetMeta(id, p as Record<string, unknown>).then(
      () => setError(null),
      (e) =>
        setError(
          `The last judgment was not saved: ${message(e, "the browser refused the write")}. A reload would lose it.`,
        ),
    );
  }, []);

  /** File a returned take. Resolves to the stored row, or null when the write
   *  failed (the error is then on `error`). */
  const attachReturn = useCallback(
    async (file: File, meta: Partial<AudioMeta>): Promise<Asset | null> => {
      if (!uid) return null;
      const pair = assetFromUpload(uid, file, ["audio"], "audio");
      const url = URL.createObjectURL(file);
      owned.current.add(url);
      const length = await probeDuration(url);
      const audioMeta: Partial<AudioMeta> = {
        ...meta,
        verdict: "unjudged",
        ...(length != null ? { duration_s: length } : {}),
      };
      pair.asset.meta = { ...(pair.asset.meta ?? {}), ...audioMeta };
      try {
        await putUploads([pair]);
      } catch (e) {
        URL.revokeObjectURL(url);
        owned.current.delete(url);
        setError(`${file.name} was not filed: ${message(e, "the browser refused the write")}.`);
        return null;
      }
      setUrls((m) => new Map(m).set(pair.upload.id, url));
      setAssets((prev) => [...(prev ?? []), pair.asset]);
      setError(null);
      return pair.asset;
    },
    [uid],
  );

  return { assets, urls, error, patch, attachReturn };
}
