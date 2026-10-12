"use client";

// THE ADS SHOTS, SHARED BY TWO STEPS. Frames makes and adopts the key images;
// Motion animates the adopted ones into clips (operator decision 2026-10-06:
// images in Frames, clips in Motion). Both read the same three things and
// write the same record, so the reading and the writing live here once:
//
//   READS: the project (template → native aspect, theme → style), the picked
//   scenario (`ADS_SCENARIOS`, Script's record, read-only).
//   WRITES: `ADS_SHOTS`, through `update` — ONE pure function applied to local
//   state and to the stored record (`patchRecord`, atomic). Frames' take
//   writes and Motion's clip writes are merges into the shot they touch, so
//   neither step can clobber the other's half.
//
// Each step adds its own verbs on top: ./useAdsFrames (takes, adopt image),
// app/_phases/motion/ads/useAdsMotion (Animate, poll, adopt clip).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PRESETS } from "@/app/library/presets";
import {
  AD_NATIVE_ASPECT,
  isAdTemplate,
  type AdScenario,
  type AdShotState,
  type AdsScenariosData,
  type AdsShotsData,
} from "@/lib/ads/types";
import { useAnnounce } from "@/lib/announcer";
import { getAsset, getUploadBlobs, readUploadPointer } from "@/lib/assets";
import type { ClipDuration } from "@/lib/imaging/video/types";
import { getProject, type Project } from "@/lib/projects";
import { projectStyle, STYLE_MISS_WORD, styleRefs, type StyleBlock } from "@/lib/themes";
import { useAuth } from "@/lib/useAuth";
import { useThemes } from "@/lib/useThemes";

import { ADS_SCENARIOS, ADS_SHOTS } from "../../_shared/records/ads";
import { useRecord } from "../../_shared/records/useRecord";
import { useLoadFor } from "../../_shared/useLoadFor";

export const EMPTY_SHOT: AdShotState = { imageTakes: [], adoptedImage: null, clips: [], adoptedClip: null };

/** The clip length to ask for: the shortest that covers the shot. Finish trims. */
export const clipDurationFor = (shotS: number): ClipDuration => (shotS <= 5 ? 5 : 10);

/** The bytes behind an upload-backed asset, or null when they are gone. */
export async function assetBlob(assetId: string): Promise<Blob | null> {
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
    const seen = asked.current;
    return () => {
      disposed.current = true;
      for (const u of mine.values()) URL.revokeObjectURL(u);
      mine.clear();
      // What was revoked must be asked for again. A remount of the same
      // instance (React's dev double-mount, a fast refresh) keeps this ref, and
      // without the clear every id read as "already asked" and its picture
      // stayed on a revoked URL.
      seen.clear();
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

export interface ShotTrouble {
  text: string;
  refused: boolean;
}

/** Per-shot busy and error flags; an error is also announced through the
 *  app's one announcer — never a local live region. */
export function useShotFlags<B extends string>() {
  const announce = useAnnounce();
  const [busy, setBusy] = useState<Record<string, B | undefined>>({});
  const [shotError, setShotError] = useState<Record<string, ShotTrouble | undefined>>({});
  const mark = useCallback((id: string, b: B | undefined) => setBusy((cur) => ({ ...cur, [id]: b })), []);
  const fail = useCallback(
    (id: string, e: ShotTrouble | undefined) => {
      setShotError((cur) => ({ ...cur, [id]: e }));
      if (e) announce({ key: `ads-shot-${id}-${Date.now()}`, text: `${e.refused ? "Refused: " : ""}${e.text}` });
    },
    [announce],
  );
  return { busy, shotError, mark, fail };
}

export function useAdsShots(projectId: string) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { themes } = useThemes(uid);

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

  /* ── the shots record ───────────────────────────────────────────────── */
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

  return {
    uid,
    loaded: projectRead && scen.hydrated && shotsRec.hydrated && (themes !== null || !uid),
    hydrated: shotsRec.hydrated,
    refused: scen.refused ?? shotsRec.refused,
    project,
    aspect,
    block,
    references,
    styleName,
    hasProjectStyle,
    scenarios,
    picked,
    shots: picked?.shots ?? [],
    shotsData,
    stale,
    update,
    updateShot,
    resetToPicked,
    writeError,
  };
}

export type AdsShotsApi = ReturnType<typeof useAdsShots>;
