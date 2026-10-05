"use client";

// THE ADS FRAMES STEP'S STATE — per shot: key-image takes, the adopted one,
// every clip ever asked for, the adopted clip.
//
// READS: the project (its template decides the native aspect, its theme the
// style), the picked scenario (`ADS_SCENARIOS`, Script's record).
// OWNS: `ADS_SHOTS`. Every write goes through `update`, which applies ONE pure
// function to local state and to the stored record (`patchRecord`, atomic), so
// the screen and the disk converge on the same change and a sibling write is
// never clobbered.
//
// STYLE IS RESTATED, NEVER REMEMBERED: a key image is `compilePrompt(block,
// shot.image)` — the same compiler, negative prompt and style references the
// standard Frames step sends (useFrames.ts generatePlate) — and the motion
// prompt restates the style block and the no-text clause after the shot's
// motion line (docs/video-generation-plan.md, "style is restated at every hop,
// including into motion").
//
// CLIPS ARE SERVER RECORDS. The shot holds a `ClipRef` per clip; the clip's
// status lives on the server and is polled here while any clip is in flight.
// A clip's run is a "video-clip" job, settled when its record turns terminal.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PRESETS } from "@/app/library/presets";
import {
  AD_IMAGE_TAKES,
  AD_NATIVE_ASPECT,
  isAdTemplate,
  type AdScenario,
  type AdShotSpec,
  type AdShotState,
  type AdsScenariosData,
  type AdsShotsData,
  type ClipRef,
} from "@/lib/ads/types";
import { useAnnounce } from "@/lib/announcer";
import { assetFromUpload, getAsset, getUploadBlobs, putUploads, readUploadPointer } from "@/lib/assets";
import { generateImage, ImagingRequestError } from "@/lib/imagingClient";
import { getClipRecord, getVideoCapability, isTerminalClip, startVideoClip, VideoRequestError } from "@/lib/imaging/video/client";
import type { ClipDuration, ClipRecord, VideoCapability, VideoModel } from "@/lib/imaging/video/types";
import { useJobs } from "@/lib/jobs";
import { getProject, type Project } from "@/lib/projects";
import { compilePrompt, compileStyleBlock, NEGATIVE_PROMPT, NO_TEXT_CLAUSE } from "@/lib/stylePrompt";
import { projectStyle, STYLE_MISS_WORD, styleRefs, type StyleBlock } from "@/lib/themes";
import { useAuth } from "@/lib/useAuth";
import { usePolling } from "@/lib/usePolling";
import { useThemes } from "@/lib/useThemes";

import { ADS_SCENARIOS, ADS_SHOTS } from "../../_shared/records/ads";
import { useRecord } from "../../_shared/records/useRecord";
import { useLoadFor } from "../../_shared/useLoadFor";

export const EMPTY_SHOT: AdShotState = { imageTakes: [], adoptedImage: null, clips: [], adoptedClip: null };

/** The clip length to ask for: the shortest that covers the shot. Finish trims. */
export const clipDurationFor = (shotS: number): ClipDuration => (shotS <= 5 ? 5 : 10);

/** Which job settles which clip — module-level so a remount in the same tab
 *  can still settle a job it started before it unmounted. */
const jobOfClip = new Map<string, string>();

function base64ToFile(base64: string, mime: string, name: string): File {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ""));
    r.onerror = () => reject(r.error ?? new Error("the key image could not be read"));
    r.readAsDataURL(blob);
  });
}

async function assetBlob(assetId: string): Promise<Blob | null> {
  const asset = await getAsset(assetId);
  const uploadId = asset ? readUploadPointer(asset.src) : null;
  if (!uploadId) return null;
  return (await getUploadBlobs([uploadId])).get(uploadId) ?? null;
}

/**
 * Object URLs for upload-backed assets, minted as ids appear and revoked on
 * unmount. Results that land after unmount are revoked on arrival — the URL is
 * the resource, so it is released rather than merely ignored.
 */
export function useAssetUrls(ids: readonly string[]): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());
  const owned = useRef(new Map<string, string>());
  const asked = useRef(new Set<string>());
  const disposed = useRef(false);

  useEffect(() => {
    disposed.current = false;
    const mine = owned.current;
    return () => {
      disposed.current = true;
      for (const u of mine.values()) URL.revokeObjectURL(u);
      mine.clear();
    };
  }, []);

  const key = ids.join("|");
  useEffect(() => {
    const want = key ? key.split("|").filter((id) => !asked.current.has(id)) : [];
    if (!want.length) return;
    for (const id of want) asked.current.add(id);
    void Promise.all(want.map(async (id) => [id, await assetBlob(id).catch(() => null)] as const)).then((pairs) => {
      const minted: [string, string][] = [];
      for (const [id, blob] of pairs) if (blob) minted.push([id, URL.createObjectURL(blob)]);
      if (disposed.current) {
        for (const [, u] of minted) URL.revokeObjectURL(u);
        return;
      }
      for (const [id, u] of minted) owned.current.set(id, u);
      if (minted.length) setUrls(new Map(owned.current));
    });
  }, [key]);

  return urls;
}

export type ShotBusy = "takes" | "animate";

export function useAdsFrames(projectId: string) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { themes } = useThemes(uid);
  const jobs = useJobs();
  const announce = useAnnounce();

  /* ── the project ────────────────────────────────────────────────────── */
  const [project, setProject] = useState<Project | null>(null);
  const projectRead = useLoadFor(projectId, (id) => getProject(id), (p) => setProject(p ?? null));

  const template = project?.template;
  const aspect = template && isAdTemplate(template) ? AD_NATIVE_ASPECT[template] : "16:9";
  const chosen = projectStyle(themes ?? [], project?.themeId);
  const fallback = PRESETS[0];
  const block: StyleBlock = chosen.theme?.block ?? fallback.block;
  const styleName = chosen.theme ? chosen.theme.name : `${fallback.name} — fallback: ${STYLE_MISS_WORD[chosen.miss]}`;
  const hasProjectStyle = Boolean(chosen.theme);
  const references = useMemo(() => styleRefs(chosen.theme), [chosen.theme]);

  /* ── the picked scenario (Script's record, read-only here) ──────────── */
  const [scenarios, setScenarios] = useState<AdsScenariosData | null>(null);
  const scen = useRecord(ADS_SCENARIOS, projectId, (d) => setScenarios(d ?? null));
  const picked: AdScenario | null = useMemo(
    () => scenarios?.options.find((s) => s.id === scenarios.pickedId) ?? null,
    [scenarios],
  );

  /* ── the shots (this step's record) ─────────────────────────────────── */
  const [shotsData, setShotsData] = useState<AdsShotsData>({ scenarioId: null, shots: {} });
  const shotsRec = useRecord(ADS_SHOTS, projectId, (d) => setShotsData(d ?? { scenarioId: null, shots: {} }));
  const [writeError, setWriteError] = useState<string | null>(null);

  /** The shots belong to another scenario than the one now picked. */
  const stale = Boolean(picked && shotsData.scenarioId && shotsData.scenarioId !== picked.id);

  const update = useCallback(
    (fn: (cur: AdsShotsData) => AdsShotsData) => {
      setShotsData((cur) => fn(cur));
      void shotsRec
        .patch((cur) => fn(cur ?? { scenarioId: null, shots: {} }))
        .then((r) => {
          if (!r.ok) setWriteError("trouble" in r ? `${r.trouble.kind}: ${r.trouble.message}` : `${r.refused}: ${r.detail}`);
        });
    },
    [shotsRec],
  );

  const updateShot = useCallback(
    (shotId: string, fn: (s: AdShotState) => AdShotState) =>
      update((cur) => ({
        ...cur,
        scenarioId: cur.scenarioId ?? picked?.id ?? null,
        shots: { ...cur.shots, [shotId]: fn(cur.shots[shotId] ?? EMPTY_SHOT) },
        savedAt: Date.now(),
      })),
    [update, picked],
  );

  /** Start over on the picked scenario. Clips stay on the server; the record
   *  stops pointing at them. */
  const resetToPicked = useCallback(() => {
    if (!picked) return;
    update(() => ({ scenarioId: picked.id, shots: {}, savedAt: Date.now() }));
  }, [update, picked]);

  /* ── capability (configured? which models? at what price?) ──────────── */
  const [capability, setCapability] = useState<VideoCapability | null>(null);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  useLoadFor(
    "video-capability",
    () => getVideoCapability().then((c) => ({ c, e: null as string | null }), (e: unknown) => ({ c: null, e: e instanceof Error ? e.message : String(e) })),
    ({ c, e }) => {
      setCapability(c);
      setCapabilityError(e);
    },
  );

  /* ── per-shot busy + errors ─────────────────────────────────────────── */
  const [busy, setBusy] = useState<Record<string, ShotBusy | undefined>>({});
  const [shotError, setShotError] = useState<Record<string, { text: string; refused: boolean } | undefined>>({});
  const mark = useCallback((id: string, b: ShotBusy | undefined) => setBusy((cur) => ({ ...cur, [id]: b })), []);
  const fail = useCallback(
    (id: string, e: { text: string; refused: boolean } | undefined) => {
      setShotError((cur) => ({ ...cur, [id]: e }));
      // The non-visual channel: the app's one announcer, not a local live region.
      if (e) announce({ key: `ads-shot-${id}-${Date.now()}`, text: `${e.refused ? "Refused: " : ""}${e.text}` });
    },
    [announce],
  );

  /* ── key-image takes ────────────────────────────────────────────────── */
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

  /* ── clips ──────────────────────────────────────────────────────────── */
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
    if (!shotsRec.hydrated || !pendingKey || firstRead.current === pendingKey) return;
    firstRead.current = pendingKey;
    refresh();
  }, [shotsRec.hydrated, pendingKey, refresh]);
  usePolling(refresh, 5000, shotsRec.hydrated && pending.length > 0);

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
        const { clipId } = await startVideoClip({
          projectId,
          image: await blobToBase64(blob),
          mime,
          motion,
          durationS,
          aspect,
          model,
        });
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

  const shots = picked?.shots ?? [];
  const adoptedCount = shots.filter((s) => {
    const st = shotsData.shots[s.id];
    return Boolean(st?.adoptedClip && clipRecords[st.adoptedClip]?.status !== "failed");
  }).length;

  return {
    loaded: projectRead && scen.hydrated && shotsRec.hydrated && (themes !== null || !uid),
    refused: scen.refused ?? shotsRec.refused,
    project,
    aspect,
    styleName,
    hasProjectStyle,
    scenarios,
    picked,
    shots,
    shotsData,
    stale,
    resetToPicked,
    writeError,
    capability,
    capabilityError,
    busy,
    shotError,
    generateTakes,
    adoptImage,
    clipRecords,
    animate,
    adoptClip,
    adoptedCount,
    anyRendering: pending.length > 0,
  };
}

export type AdsFramesApi = ReturnType<typeof useAdsFrames>;
