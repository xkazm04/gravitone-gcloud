"use client";

// THE ADS FRAMES STEP'S VERBS — per shot: generate key-image takes, adopt one.
// Clips are Motion's (app/_phases/motion/ads); the shared reading and the one
// record writer are ./useAdsShots.
//
// STYLE IS RESTATED, NEVER REMEMBERED: a key image is `compilePrompt(block,
// shot.image)` — the same compiler, negative prompt and style references the
// standard Frames step sends (useFrames.ts generatePlate) — at the template's
// native aspect.

import { useCallback } from "react";

import { AD_IMAGE_TAKES, type AdShotSpec } from "@/lib/ads/types";
import { assetFromUpload, putUploads } from "@/lib/assets";
import { generateImage, ImagingRequestError } from "@/lib/imagingClient";
import { compilePrompt, NEGATIVE_PROMPT } from "@/lib/stylePrompt";

import { useAdsShots, useShotFlags } from "./useAdsShots";

function base64ToFile(base64: string, mime: string, name: string): File {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

export function useAdsFrames(projectId: string) {
  const base = useAdsShots(projectId);
  const { busy, shotError, mark, fail } = useShotFlags<"takes">();
  const { uid, block, aspect, references, updateShot } = base;

  const generateTakes = useCallback(
    async (shot: AdShotSpec) => {
      if (!uid || busy[shot.id]) return;
      mark(shot.id, "takes");
      fail(shot.id, undefined);
      try {
        const res = await generateImage({
          prompt: compilePrompt(block, shot.image),
          negativePrompt: NEGATIVE_PROMPT,
          aspect,
          count: AD_IMAGE_TAKES,
          references: references.length ? references : undefined,
        });
        if (!res.images.length) throw new ImagingRequestError("The imaging call returned no image.", "refused", 200);
        const pairs = res.images.map((img, i) =>
          assetFromUpload(uid, base64ToFile(img.base64, img.mime, `${shot.id}-take-${i + 1}.png`), ["ads", projectId, "frames"], "image"),
        );
        await putUploads(pairs);
        const ids = pairs.map((p) => p.asset.id);
        updateShot(shot.id, (s) => ({ ...s, imageTakes: [...s.imageTakes, ...ids] }));
      } catch (e) {
        fail(shot.id, {
          text: e instanceof Error ? e.message : String(e),
          refused: e instanceof ImagingRequestError && e.code === "refused",
        });
      } finally {
        mark(shot.id, undefined);
      }
    },
    [uid, busy, mark, fail, block, aspect, references, projectId, updateShot],
  );

  const adoptImage = useCallback(
    (shotId: string, assetId: string) => updateShot(shotId, (s) => ({ ...s, adoptedImage: assetId })),
    [updateShot],
  );

  const adoptedCount = base.shots.filter((s) => base.shotsData.shots[s.id]?.adoptedImage).length;

  return { ...base, busy, shotError, generateTakes, adoptImage, adoptedCount };
}

export type AdsFramesApi = ReturnType<typeof useAdsFrames>;
