"use client";

// THE MUSIC-VIDEO DISCIPLINE'S FRAMES STEP — poster generation and the
// determinism inputs (seed, effectParams) the effects studio reads. Shaped
// like `research/useMusicVideoSource.ts`: hydrate once per project through
// the record def Research owns (`research/records.ts`), patch every write
// atomically (`patchRecord`), and never clobber a sibling field a different
// work package owns.
//
// POSTER GENERATION IS AN ASYNC JOB (WP1's "poster-generate" kind), not a
// synchronous request — `lib/jobs.tsx`'s own header measures the real call at
// ~57s through `agy`, and the pattern this hook follows is
// `research/guided/useEducationalResearch.ts`'s `startResearch`: claim a job
// slot, do the work, settle it when the work resolves, regardless of whether
// the component that started it is still mounted.
//
// THE ROUTER, NOT THE PROVIDER. `lib/imaging/router.ts` is explicitly
// SERVER-ONLY (its own header: "Nothing here may be imported from a
// component") — a client component cannot import it at all, let alone the
// `agy` adapter underneath it, so this hook calls `generateImage` from
// `lib/imagingClient.ts`, the browser-side wrapper that posts to
// `POST /api/imaging/generate`, which is where `generate()` actually runs,
// server-side, through the router's agy-then-cloud-fallback chain. This is
// the same seam every other imaging surface in this app already uses
// (`lib/imagingClient.ts`'s own header) — not a deviation invented for this
// package.

import { useCallback, useState } from "react";

import { assetFromUpload, getAsset, getUploadBlobs, putUploads, readUploadPointer, type Asset } from "@/lib/assets";
import { generateImage } from "@/lib/imagingClient";
import type { useJobs } from "@/lib/jobs";

import { useRecord } from "../../_shared/records/useRecord";
import type { MusicVideoSourceStepData } from "../../_shared/stepStore";
import { MUSIC_VIDEO_SOURCE } from "../../research/records";
import { DEFAULT_EFFECT_PARAMS, type EffectParams } from "./compositor";

export type PosterStatus = "idle" | "generating" | "error";

/** A 32-bit seed. `crypto.getRandomValues` where it exists (every real
 *  browser); `Math.random()` as the one honest fallback for an environment
 *  that somehow lacks it. Either way this is called exactly ONCE per
 *  composition, the first time a poster exists, and the result is persisted —
 *  nothing downstream ever re-seeds. */
function makeSeed(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 0xffffffff);
}

function base64ToFile(base64: string, mime: string, name: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

/** The prompt sent to the imaging router. NEVER the track's filename, ID3
 *  metadata or artist/song information — the idea note's rights-and-
 *  provenance findings are about exactly this: an album poster generated FROM
 *  a prompt that leaked the real track's title would entangle a generic
 *  "image boosting" render with a specific commercial work's identity. The
 *  only track-derived input here is the creator's own freely-typed style
 *  line, which they wrote for this purpose. */
function buildPrompt(style: string): string {
  const base =
    "A single cinematic album-poster-style still image for a music video. " +
    "Dramatic lighting, rich detail, no text, no lyrics, no logos, no watermarks.";
  const trimmed = style.trim();
  return trimmed ? `${base} Visual direction: ${trimmed}.` : base;
}

export function useMusicVideoComposition(
  projectId: string,
  uid: string | null,
  jobs: ReturnType<typeof useJobs>,
) {
  const [style, setStyle] = useState("");
  const [posterAssetId, setPosterAssetId] = useState<string | undefined>(undefined);
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [effectParams, setEffectParams] = useState<EffectParams | undefined>(undefined);
  const [status, setStatus] = useState<PosterStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  const { hydrated, patch } = useRecord(MUSIC_VIDEO_SOURCE, projectId, (saved) => {
    setStyle(saved?.style ?? "");
    setPosterAssetId(saved?.posterAssetId);
    setSeed(saved?.seed);
    setEffectParams((saved?.effectParams as EffectParams | undefined) ?? undefined);
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
    if (!uid || status === "generating") return;

    const job = jobs.start("poster-generate", projectId, "Album poster", { driven: true });
    if (!job) return; // another run is already in flight for this project

    setStatus("generating");
    setError(null);

    try {
      const result = await generateImage({ prompt: buildPrompt(style), aspect: "16:9", count: 1 });
      const image = result.images[0];
      if (!image) throw new Error("The imaging router returned no image.");

      const file = base64ToFile(image.base64, image.mime, "poster.png");
      const pair = assetFromUpload(uid, file, ["music-video", "poster"], "image");
      await putUploads([pair]);

      // THE SEED AND THE EFFECT PARAMS ARE SET ONCE, on the FIRST poster this
      // composition ever gets, and never again. A re-generated poster (a
      // creator who does not like the first result) keeps the existing seed —
      // re-rolling the seed on every generation would be indistinguishable
      // from the determinism bug the acceptance test exists to catch: two
      // renders of "the same" composition producing different pixels because
      // one of its inputs quietly moved.
      const nextSeed = seed ?? makeSeed();
      const nextParams: EffectParams = effectParams ?? { ...DEFAULT_EFFECT_PARAMS };

      setPosterAssetId(pair.asset.id);
      setSeed(nextSeed);
      setEffectParams(nextParams);
      setProvider(result.provenance.provider);
      setStatus("idle");

      // `MusicVideoSourceStepData.effectParams` is `Record<string, unknown>` —
      // deliberately untyped at the store boundary (stepStore.ts's own
      // comment: WP3's to shape). `EffectParams` is this package's own typed
      // view of that bag; the cast is the one seam between them.
      await write({
        posterAssetId: pair.asset.id,
        seed: nextSeed,
        effectParams: nextParams as unknown as Record<string, unknown>,
      });
      jobs.settle(job.id, "done", `A poster generated via ${result.provenance.provider}.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setStatus("error");
      setError(message);
      jobs.settle(job.id, "failed", message);
    }
  }, [uid, status, jobs, projectId, style, seed, effectParams, write]);

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
    posterAssetId,
    seed,
    effectParams,
    status,
    error,
    provider,
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
