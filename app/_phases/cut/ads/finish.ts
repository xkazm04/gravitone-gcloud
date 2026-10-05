// THE ADS FINISH, AS DATA — which clip each shot uses, what the render is asked
// for, and what stands between the ad and a render, as rows.
//
// PURE, so the probe can hold it to its arithmetic; AdsFinish.tsx only draws it.
// The check vocabulary is ../finishLine.ts's: pass / fail / unmeasured, where a
// check with nothing to measure is `unmeasured`, never a pass.

import {
  AD_NATIVE_ASPECT,
  isAdTemplate,
  type AdBrief,
  type AdRenderRecord,
  type AdRenderRequest,
  type AdScenario,
  type AdShotSpec,
  type AdsFinishData,
  type AdsShotsData,
  type ClipRef,
} from "@/lib/ads/types";
import type { Aspect } from "@/lib/imaging/types";
import type { TemplateId } from "@/lib/projects";

import type { Verdict } from "../finishLine";

/** Every aspect Finish can export, native first per template. */
export const AD_ASPECTS: readonly Aspect[] = ["9:16", "1:1", "4:5", "16:9"];

/** The delivery sizes lib/adRender.ts renders at (AD_RENDER_PX there — a
 *  server-only module, so the four pairs are restated here for display). */
export const AD_ASPECT_PX: Record<Aspect, string> = {
  "9:16": "1080×1920",
  "1:1": "1080×1080",
  "4:5": "1080×1350",
  "16:9": "1920×1080",
};

/** lib/adRender.ts AD_LOUDNORM's target, and how far a measured file may sit
 *  from it — single-pass loudnorm lands within about ±0.5 LU (its own header). */
export const AD_LOUDNESS_TARGET_LUFS = -14;
export const AD_LOUDNESS_TOLERANCE_LU = 1;

/** The record as GET /api/ads/render/<id> answers it. */
export type AdRenderView = AdRenderRecord;

export interface AdShotRow {
  index: number;
  spec: AdShotSpec;
  /** The adopted clip id, or null. */
  clipId: string | null;
  clip: ClipRef | null;
  /** Seconds kept: the shot's own length, never more than the clip has. */
  trimS: number | null;
}

/** The scenario's shots against the frames record. A frames record for a
 *  different scenario adopts nothing here. */
export function shotRows(scenario: AdScenario, shots: AdsShotsData | null): AdShotRow[] {
  const current = shots && shots.scenarioId === scenario.id ? shots.shots : {};
  return scenario.shots.map((spec, index) => {
    const state = current[spec.id];
    const clipId = state?.adoptedClip ?? null;
    const clip = clipId ? (state?.clips.find((c) => c.clipId === clipId) ?? null) : null;
    const trimS = clipId ? Math.min(spec.durationS, clip?.durationS ?? spec.durationS) : null;
    return { index, spec, clipId, clip, trimS };
  });
}

/** Finish's record before anyone has edited it: the scenario's supers and
 *  end-card, the brief's CTA as a fallback, the template's native aspect. */
export function seedFinish(scenario: AdScenario, brief: AdBrief | null, template: TemplateId | null): AdsFinishData {
  return {
    supers: Object.fromEntries(scenario.shots.map((s) => [s.id, s.super])),
    endCard: {
      cta: scenario.endCard.cta || brief?.cta || "",
      line: scenario.endCard.line,
      logoAssetId: null,
      holdS: 2,
    },
    aspects: [template && isAdTemplate(template) ? AD_NATIVE_ASPECT[template] : "9:16"],
    exports: [],
  };
}

/** The super a shot carries: the creator's edit when there is one, else the
 *  scenario's. `null` is a decision (no super), kept as one. */
export function superFor(finish: AdsFinishData, spec: AdShotSpec): string | null {
  return Object.prototype.hasOwnProperty.call(finish.supers, spec.id) ? finish.supers[spec.id] : spec.super;
}

export function cutRuntimeS(rows: AdShotRow[], holdS: number): number {
  return rows.reduce((t, r) => t + (r.trimS ?? r.spec.durationS), 0) + holdS;
}

export interface AdFinishCheck {
  id: "clips" | "runtime" | "end-card" | "music" | "loudness";
  label: string;
  value: string;
  target: string;
  verdict: Verdict;
  /** The step that clears it. */
  owner?: "frames" | "score";
  /** True when a fail here refuses the render. */
  blocks?: boolean;
  deny?: string;
}

const s1 = (n: number) => `${Math.round(n * 10) / 10}s`;

export function adFinishChecks(args: {
  rows: AdShotRow[];
  finish: AdsFinishData;
  range: readonly [number, number] | null;
  musicTakeId: string | null;
  /** The newest finished render, any aspect. */
  rendered: AdRenderView | null;
}): AdFinishCheck[] {
  const { rows, finish, range, musicTakeId, rendered } = args;
  const out: AdFinishCheck[] = [];

  const adopted = rows.filter((r) => r.clipId).length;
  out.push({
    id: "clips",
    label: "adopted clips",
    value: `${adopted}/${rows.length}`,
    target: `${rows.length}/${rows.length}`,
    verdict: rows.length === 0 ? "unmeasured" : adopted === rows.length ? "pass" : "fail",
    owner: "frames",
    blocks: true,
    ...(adopted < rows.length
      ? { deny: `shot ${rows.filter((r) => !r.clipId).map((r) => r.index + 1).join(", ")} without a clip` }
      : {}),
  });

  const runtime = cutRuntimeS(rows, finish.endCard.holdS);
  out.push({
    id: "runtime",
    label: "runtime",
    value: s1(runtime),
    target: range ? `${range[0]}–${range[1]}s` : "—",
    verdict: !range ? "unmeasured" : runtime >= range[0] && runtime <= range[1] ? "pass" : "fail",
    ...(range && runtime < range[0] ? { deny: `${s1(range[0] - runtime)} short of the template` } : {}),
    ...(range && runtime > range[1] ? { deny: `${s1(runtime - range[1])} over the template` } : {}),
  });

  const cta = finish.endCard.cta.trim();
  out.push({
    id: "end-card",
    label: "end-card cta",
    value: cta ? "set" : "empty",
    target: "set",
    verdict: cta ? "pass" : "fail",
    blocks: true,
    ...(cta ? {} : { deny: "no call to action" }),
  });

  out.push({
    id: "music",
    label: "music bed",
    value: musicTakeId ? "adopted" : "silent",
    target: "adopted",
    verdict: musicTakeId ? "pass" : "unmeasured",
    owner: "score",
  });

  const lufs = rendered?.loudness?.integratedLufs;
  out.push({
    id: "loudness",
    label: "loudness",
    value: typeof lufs === "number" ? `${lufs.toFixed(1)} LUFS` : rendered?.hasAudio === false ? "silent" : "—",
    target: `${AD_LOUDNESS_TARGET_LUFS} LUFS`,
    verdict:
      typeof lufs !== "number"
        ? "unmeasured"
        : Math.abs(lufs - AD_LOUDNESS_TARGET_LUFS) <= AD_LOUDNESS_TOLERANCE_LU
          ? "pass"
          : "fail",
  });

  return out;
}

/** The render body for one aspect, or null while a blocking check fails. */
export function adRenderRequest(args: {
  projectId: string;
  aspect: Aspect;
  rows: AdShotRow[];
  finish: AdsFinishData;
  logo: string | null;
  musicTakeId: string | null;
}): AdRenderRequest | null {
  const { projectId, aspect, rows, finish, logo, musicTakeId } = args;
  if (!rows.length || rows.some((r) => !r.clipId || r.trimS === null) || !finish.endCard.cta.trim()) return null;
  return {
    projectId,
    aspect,
    shots: rows.map((r) => ({ clipId: r.clipId!, trimS: r.trimS!, super: superFor(finish, r.spec) })),
    endCard: { cta: finish.endCard.cta.trim(), line: finish.endCard.line, logo, holdS: finish.endCard.holdS },
    musicTakeId,
  };
}

/** The newest export per aspect. */
export function latestByAspect(exports: AdsFinishData["exports"]): Map<Aspect, AdsFinishData["exports"][number]> {
  const m = new Map<Aspect, AdsFinishData["exports"][number]>();
  for (const e of exports) {
    const prev = m.get(e.aspect);
    if (!prev || e.createdAt > prev.createdAt) m.set(e.aspect, e);
  }
  return m;
}
