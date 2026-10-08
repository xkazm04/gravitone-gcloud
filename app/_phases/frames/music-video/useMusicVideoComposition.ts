"use client";

// THE MUSIC-VIDEO DISCIPLINE'S FRAMES STEP — poster generation and the
// determinism inputs (seed, effectParams) the effects studio reads. Shaped
// like `research/useMusicVideoSource.ts`: hydrate once per project through
// the record def Research owns (`research/records.ts`), patch every write
// atomically (`patchRecord`), and never clobber a sibling field a different
// work package owns.
//
// THE POSTER IS A SERVER WORK KIND (lib/turns/kinds/poster.ts, operator T1:
// "keep what is paid for"). This hook only ASKS for it and shows it: the
// start goes through the turns client door, the bell tracks the turn like
// research's (`jobs.track`), and the landing — decode, upload, patch the record
// — runs in `./posterLive.ts`, a module-level watcher, so it also happens after
// the creator leaves the step and after a reload. The server builds the prompt
// and owns the rights rule (never a track filename, ID3 data or an artist), so
// the browser sends the creator's style line and nothing else about the track.
//
// SEED AND EFFECT PARAMS are set once, on a composition's first poster; that
// rule now runs inside the record's transaction at landing (posterLive.ts).

import { useCallback, useEffect, useState } from "react";

import { getAsset, getUploadBlobs, readUploadPointer, type Asset } from "@/lib/assets";
import type { useJobs } from "@/lib/jobs";

import { useRecord } from "../../_shared/records/useRecord";
import type { MusicVideoSourceStepData } from "../../_shared/stepStore";
import { MUSIC_VIDEO_SOURCE } from "../../research/records";
import type { EffectParams } from "./compositor";
import { adoptPoster, readPoster, resumePoster, startPoster, subscribePoster, type PosterStatus } from "./posterLive";

export type { PosterStatus };

const POSTER_LABEL = "Album poster";

export function useMusicVideoComposition(
  projectId: string,
  uid: string | null,
  jobs: ReturnType<typeof useJobs>,
) {
  const [style, setStyle] = useState("");
  const [posterAssetId, setPosterAssetId] = useState<string | undefined>(undefined);
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [effectParams, setEffectParams] = useState<EffectParams | undefined>(undefined);
  // The poster's status, error and provider live in the module-level store, so
  // they survive this component and are the same in a second mount.
  const [live, setLive] = useState(() => readPoster(projectId));
  useEffect(() => {
    const sync = () => setLive(readPoster(projectId));
    sync();
    return subscribePoster(projectId, sync);
  }, [projectId]);

  const { hydrated, patch } = useRecord(MUSIC_VIDEO_SOURCE, projectId, (saved) => {
    setStyle(saved?.style ?? "");
    setPosterAssetId(saved?.posterAssetId);
    setSeed(saved?.seed);
    setEffectParams((saved?.effectParams as EffectParams | undefined) ?? undefined);
    adoptPoster(projectId, saved);
  });

  /** A merge into the shared record, never a replacement: Research owns the
   *  track and its envelope, and either step may have written since this one
   *  hydrated. `patchRecord` reads and writes in one transaction — this used to
   *  be a copied `loadStep` + `saveStep`, which wrote `{ style }` alone over the
   *  envelope and the poster whenever the read failed, and dropped the first of
   *  two patches issued in one tick. */
  const write = useCallback(
    (fields: Partial<MusicVideoSourceStepData>) => patch((current) => ({ ...current, ...fields })),
    [patch],
  );

  const generatePoster = useCallback(async () => {
    if (!uid || live.status === "generating") return;
    const turnId = await startPoster(projectId, uid, style);
    if (turnId) jobs.track({ turnId, projectId, kind: "poster-generate", label: POSTER_LABEL });
  }, [uid, live.status, jobs, projectId, style]);

  // A mount asks the ledger about this project's newest poster: a live one is
  // watched and tracked, a settled one not yet taken is landed, once.
  const { track } = jobs;
  useEffect(() => {
    if (!hydrated || !uid) return;
    void resumePoster(projectId, uid)
      .then((turn) => {
        if (turn) track({ turnId: turn.id, projectId, kind: "poster-generate", label: POSTER_LABEL, record: turn });
      })
      .catch(() => undefined);
  }, [hydrated, uid, projectId, track]);

  const setStyleText = useCallback(
    (text: string) => {
      setStyle(text);
      void write({ style: text });
    },
    [write],
  );

  return {
    hydrated,
    style,
    setStyle: setStyleText,
    // A landing the store has just made is newer than what hydration read.
    posterAssetId: live.landed?.posterAssetId ?? posterAssetId,
    seed: live.landed?.seed ?? seed,
    effectParams: (live.landed?.effectParams as EffectParams | undefined) ?? effectParams,
    status: live.status,
    error: live.error,
    provider: live.provider,
    generatePoster,
  };
}

export type MusicVideoCompositionApi = ReturnType<typeof useMusicVideoComposition>;

/** Resolve a poster asset's bytes into an object URL the caller owns and must
 *  revoke — same discipline `lib/assets.ts#hydrateUploadSrcs` states for every
 *  other upload-backed asset in this app. Exported so the top-level component
 *  can keep the revoke lifecycle in its own effect rather than this hook
 *  reaching into a resource it does not own the teardown of. */
export async function loadPosterAsset(assetId: string): Promise<{ asset: Asset; url: string } | null> {
  const asset = await getAsset(assetId);
  if (!asset) return null;
  const uploadId = readUploadPointer(asset.src);
  if (!uploadId) return null;
  const blobs = await getUploadBlobs([uploadId]);
  const blob = blobs.get(uploadId);
  if (!blob) return null;
  return { asset, url: URL.createObjectURL(blob) };
}
