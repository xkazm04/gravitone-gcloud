"use client";

// THE ADS MOTION STEP'S VERBS — per shot: animate the adopted key image into a
// hosted clip, poll it, adopt one. Re-animating appends; no clip is pruned.
// The shared reading and the one record writer are
// app/_phases/frames/ads/useAdsShots (Frames owns the images, Motion the clips).
//
// The motion prompt is the shot's motion line, then the style block and the
// no-text clause restated (docs/video-generation-plan.md: "style is restated
// at every hop, including into motion").
//
// CLIPS ARE SERVER RECORDS. The shot holds a `ClipRef` per clip; the clip's
// status lives on the server and is polled while any clip is in flight. Each
// run is a "video-clip" job, settled when its record turns terminal.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AdShotSpec, ClipRef } from "@/lib/ads/types";
import { getClipRecord, getVideoCapability, isTerminalClip, startVideoClip, VideoRequestError } from "@/lib/imaging/video/client";
import type { ClipDuration, ClipRecord, VideoCapability, VideoModel } from "@/lib/imaging/video/types";
import { useJobs } from "@/lib/jobs";
import { compileStyleBlock, NO_TEXT_CLAUSE } from "@/lib/stylePrompt";
import { usePolling } from "@/lib/usePolling";

import { useLoadFor } from "../../_shared/useLoadFor";
import { assetBlob, clipDurationFor, useAdsShots, useShotFlags } from "../../frames/ads/useAdsShots";

/** Which job settles which clip — module-level so a remount in the same tab
 *  can still settle a job it started before it unmounted. */
const jobOfClip = new Map<string, string>();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ""));
    r.onerror = () => reject(r.error ?? new Error("the key image could not be read"));
    r.readAsDataURL(blob);
  });
}

export function useAdsMotion(projectId: string) {
  const base = useAdsShots(projectId);
  const { busy, shotError, mark, fail } = useShotFlags<"animate">();
  const jobs = useJobs();
  const { shotsData, updateShot, block, aspect } = base;

  /* ── capability (configured? which models? at what price?) ──────────── */
  const [capability, setCapability] = useState<VideoCapability | null>(null);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  useLoadFor(
    "video-capability",
    () =>
      getVideoCapability().then(
        (c) => ({ c, e: null as string | null }),
        (e: unknown) => ({ c: null, e: e instanceof Error ? e.message : String(e) }),
      ),
    ({ c, e }) => {
      setCapability(c);
      setCapabilityError(e);
    },
  );

  /* ── clip records ───────────────────────────────────────────────────── */
  const [clipRecords, setClipRecords] = useState<Record<string, ClipRecord>>({});

  const allRefs = useMemo(
    () => Object.entries(shotsData.shots).flatMap(([shotId, s]) => s.clips.map((c) => ({ shotId, ref: c }))),
    [shotsData],
  );
  const pending = allRefs.filter(({ ref }) => {
    const r = clipRecords[ref.clipId];
    return !r || !isTerminalClip(r.status);
  });

  const absorb = useCallback(
    (shotId: string, rec: ClipRecord) => {
      setClipRecords((cur) => ({ ...cur, [rec.clipId]: rec }));
      if (!isTerminalClip(rec.status)) return;
      const jobId = jobOfClip.get(rec.clipId);
      if (jobId) {
        jobOfClip.delete(rec.clipId);
        jobs.settle(jobId, rec.status === "done" ? "done" : "failed", rec.status === "done" ? `${rec.model} · ${rec.durationS}s` : (rec.error ?? rec.status));
      }
      // Carry the vendor's figure onto the ref, and adopt the first clip that
      // lands for a shot that has none.
      updateShot(shotId, (s) => ({
        ...s,
        clips: s.clips.map((c) =>
          c.clipId === rec.clipId && (c.costUsd !== rec.costUsd || c.costBasis !== rec.costBasis)
            ? { ...c, costUsd: rec.costUsd, costBasis: rec.costBasis }
            : c,
        ),
        adoptedClip: s.adoptedClip ?? (rec.status === "done" ? rec.clipId : null),
      }));
    },
    [jobs, updateShot],
  );

  const refresh = useCallback(() => {
    for (const { shotId, ref } of pending)
      void getClipRecord(ref.clipId).then(
        (rec) => absorb(shotId, rec),
        (e: unknown) => {
          // A clip this server has never heard of (another machine's store, a
          // wiped foundry-out/) is closed as failed with the server's words.
          if (e instanceof VideoRequestError && e.status === 404)
            absorb(shotId, {
              clipId: ref.clipId, projectId, status: "failed", model: ref.model, durationS: clipDurationFor(ref.durationS),
              aspect, motion: ref.motion, vendorJobId: null, costUsd: ref.costUsd, costBasis: ref.costBasis,
              error: e.message, createdAt: ref.createdAt, finishedAt: null,
            });
        },
      );
  }, [pending, absorb, projectId, aspect]);

  // Read every clip's state once on hydration, then poll while any is in flight.
  const pendingKey = pending.map((p) => p.ref.clipId).join("|");
  const firstRead = useRef<string | null>(null);
  useEffect(() => {
    if (!base.hydrated || !pendingKey || firstRead.current === pendingKey) return;
    firstRead.current = pendingKey;
    refresh();
  }, [base.hydrated, pendingKey, refresh]);
  usePolling(refresh, 5000, base.hydrated && pending.length > 0);

  /* ── animate ────────────────────────────────────────────────────────── */
  const animate = useCallback(
    async (shot: AdShotSpec, model: VideoModel, durationS: ClipDuration) => {
      const state = shotsData.shots[shot.id];
      if (!state?.adoptedImage || busy[shot.id]) return;
      mark(shot.id, "animate");
      fail(shot.id, undefined);
      const job = jobs.start("video-clip", projectId, `Clip · shot ${shot.id}`, { driven: true });
      try {
        const blob = await assetBlob(state.adoptedImage);
        if (!blob) throw new Error("The adopted key image is no longer on this browser.");
        const mime = (["image/png", "image/jpeg", "image/webp"] as const).find((m) => m === blob.type) ?? "image/png";
        const motion = [shot.motion.trim(), compileStyleBlock(block), NO_TEXT_CLAUSE].join("\n\n");
        const { clipId } = await startVideoClip({ projectId, image: await blobToBase64(blob), mime, motion, durationS, aspect, model });
        if (job) jobOfClip.set(clipId, job.id);
        const price = capability?.priceUsd[model]?.[durationS] ?? null;
        const ref: ClipRef = {
          clipId,
          model,
          durationS,
          costUsd: price,
          costBasis: price === null ? "unpriced" : "estimated",
          createdAt: Date.now(),
          motion: shot.motion,
        };
        updateShot(shot.id, (s) => ({ ...s, clips: [...s.clips, ref] }));
      } catch (e) {
        const text = e instanceof Error ? e.message : String(e);
        fail(shot.id, { text, refused: false });
        if (job) jobs.settle(job.id, "failed", text);
      } finally {
        mark(shot.id, undefined);
      }
    },
    [shotsData, busy, mark, fail, jobs, projectId, block, aspect, capability, updateShot],
  );

  const adoptClip = useCallback(
    (shotId: string, clipId: string) => updateShot(shotId, (s) => ({ ...s, adoptedClip: clipId })),
    [updateShot],
  );

  /** Shots whose adopted clip is a finished one. */
  const adoptedCount = base.shots.filter((s) => {
    const id = shotsData.shots[s.id]?.adoptedClip;
    return Boolean(id && clipRecords[id]?.status === "done");
  }).length;

  return {
    ...base,
    busy,
    shotError,
    capability,
    capabilityError,
    clipRecords,
    animate,
    adoptClip,
    adoptedCount,
    anyClip: allRefs.length > 0,
  };
}

export type AdsMotionApi = ReturnType<typeof useAdsMotion>;
