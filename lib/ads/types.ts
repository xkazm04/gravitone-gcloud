// THE ADS DISCIPLINE'S WIRE CONTRACT — every type that crosses a package seam.
//
// Server-safe on purpose: no "use client", no IndexedDB, no Node. The concept
// routes (app/api/ads/*), the validator (lib/ads/validate.ts), the render
// service (lib/adRender.ts) and the five step surfaces (app/_phases/*/ads/) all
// import from here, and only types and pure constants live in this file.
//
// THE ABSENT-VALUE CONVENTION, stated once: `null` means "not decided / not
// present"; a record's keys are never omitted once written, and `""` is never a
// sentinel. A brief field the creator left empty is `""` only because it is
// TEXT the creator typed nothing into — it is never read as "cleared".

import type { Aspect } from "@/lib/imaging/types";
import type { CostBasis, VideoModel } from "@/lib/imaging/video/types";

/** The templates this discipline owns (lib/projects.ts TEMPLATES, appended). */
export type AdTemplateId = "ad-social-15" | "ad-spot-30";

/** The aspect each template is composed for natively. Finish may export the
 *  others as reframes; generation always happens at this one. */
export const AD_NATIVE_ASPECT: Record<AdTemplateId, Aspect> = {
  "ad-social-15": "9:16",
  "ad-spot-30": "16:9",
};

/** Shot-count band per scenario, and the idea/scenario counts per round. */
export const AD_SHOTS = { min: 1, max: 6 } as const;
export const AD_IDEA_COUNT = 6;
export const AD_SCENARIO_COUNT = 3;
/** Key-image takes generated per shot before one is adopted. */
export const AD_IMAGE_TAKES = 3;

/* ── The brief ────────────────────────────────────────────────────────────── */

export interface AdBrief {
  /** What is being sold. */
  product: string;
  /** Who it is for. */
  audience: string;
  /** The single-minded proposition — the one thing the ad must say. */
  proposition: string;
  /** Register: playful, deadpan, premium, … (free text). */
  tone: string;
  /** Mandatories: things every idea must include (logo, claim, product shot…). */
  mustInclude: string[];
  /** The call to action the end-card carries. */
  cta: string;
  /** Where it runs (free text, e.g. "vertical feed", "pre-roll"). */
  platform: string;
}

export const EMPTY_BRIEF: AdBrief = {
  product: "",
  audience: "",
  proposition: "",
  tone: "",
  mustInclude: [],
  cta: "",
  platform: "",
};

/* ── Round 1: ideas ───────────────────────────────────────────────────────── */

export const AD_ANGLES = [
  "twist",
  "exaggeration",
  "demo",
  "emotional",
  "absurd",
  "problem-solution",
] as const;
export type AdAngle = (typeof AD_ANGLES)[number];

export interface AdIdea {
  id: string;
  angle: AdAngle;
  /** The idea in one headline, ≤ 90 characters. */
  title: string;
  /** What the first second shows. */
  hook: string;
  /** The creative leap — what makes it not the obvious ad. */
  twist: string;
  /** Why it sells THIS product to THIS audience. */
  whyItWorks: string;
  /** The honest downside. */
  risk: string;
}

/* ── Round 2: scenarios ───────────────────────────────────────────────────── */

export interface AdShotSpec {
  id: string;
  durationS: number;
  /** The key-image action block (style is restated by the caller, never here). */
  image: string;
  /** The image-to-video motion line: camera-led, one primary motion. */
  motion: string;
  /** On-screen text drawn at Finish, or null. Never lettered by a model. */
  super: string | null;
}

export interface AdEndCard {
  cta: string;
  /** An optional line above the CTA (a tagline), or null. */
  line: string | null;
}

export interface AdScenario {
  id: string;
  ideaId: string;
  title: string;
  logline: string;
  shots: AdShotSpec[];
  /** One line describing the music bed. */
  musicMood: string;
  endCard: AdEndCard;
}

/* ── The engine receipt a concept turn returns ────────────────────────────── */

export interface AdEngine {
  provider: string;
  model: string;
  costUsd: number | null;
  costBasis: CostBasis;
  durationMs: number;
}

/* ── Route bodies ─────────────────────────────────────────────────────────── */

export interface AdIdeasRequest {
  brief: AdBrief;
  template: AdTemplateId;
  targetS: number;
}
export interface AdIdeasResponse {
  options: AdIdea[];
  engine: AdEngine;
}

export interface AdScenariosRequest {
  brief: AdBrief;
  template: AdTemplateId;
  targetS: number;
  idea: AdIdea;
}
export interface AdScenariosResponse {
  options: AdScenario[];
  engine: AdEngine;
}

/** Every ads/video route answers a failure with this body. */
export interface AdErrorBody {
  error: string;
  message: string;
}

/* ── Records (IndexedDB, via defineRecord — app/_phases/_shared/records/ads.ts) */

export interface AdsBriefData {
  brief: AdBrief;
  savedAt?: number;
}

export interface AdsIdeasData {
  /** digestBrief(brief) at generation time — a mismatch means the ideas are stale. */
  briefDigest: string | null;
  options: AdIdea[];
  pickedId: string | null;
  engine: AdEngine | null;
  savedAt?: number;
}

export interface AdsScenariosData {
  /** The idea these scenarios execute; a different picked idea makes them stale. */
  ideaId: string | null;
  options: AdScenario[];
  pickedId: string | null;
  engine: AdEngine | null;
  savedAt?: number;
}

export interface ClipRef {
  clipId: string;
  model: VideoModel;
  durationS: number;
  costUsd: number | null;
  costBasis: CostBasis;
  createdAt: number;
  motion: string;
}

export interface AdShotState {
  /** Asset ids (lib/assets uploads) of the generated key-image takes. */
  imageTakes: string[];
  adoptedImage: string | null;
  /** Every clip ever requested for this shot, newest last. Never pruned. */
  clips: ClipRef[];
  adoptedClip: string | null;
}

export interface AdsShotsData {
  /** The scenario these shots belong to; a different picked scenario makes them stale. */
  scenarioId: string | null;
  shots: Record<string, AdShotState>;
  savedAt?: number;
}

export interface AdFinishEndCard {
  cta: string;
  line: string | null;
  logoAssetId: string | null;
  holdS: number;
}

export interface AdExportRef {
  aspect: Aspect;
  exportId: string;
  createdAt: number;
}

export interface AdsFinishData {
  supers: Record<string, string | null>;
  endCard: AdFinishEndCard;
  aspects: Aspect[];
  exports: AdExportRef[];
  savedAt?: number;
}

/* ── Render (Finish → lib/adRender.ts) ───────────────────────────────────── */

export interface AdRenderShot {
  clipId: string;
  /** Seconds kept from the clip's start. */
  trimS: number;
  super: string | null;
}

export interface AdRenderRequest {
  projectId: string;
  aspect: Aspect;
  shots: AdRenderShot[];
  endCard: {
    cta: string;
    line: string | null;
    /** PNG/JPEG data URL or null. */
    logo: string | null;
    holdS: number;
  };
  /** A sound-store take id (lib/sound) for the music bed, or null for silent. */
  musicTakeId: string | null;
}

export type AdRenderStatus = "queued" | "rendering" | "done" | "failed";

export interface AdRenderRecord {
  exportId: string;
  projectId: string;
  aspect: Aspect;
  status: AdRenderStatus;
  /** Set when status is "failed". */
  error: string | null;
  durationS: number | null;
  createdAt: number;
  finishedAt: number | null;
}

/* ── Pure helpers both sides use ──────────────────────────────────────────── */

/** A stable digest of a brief — order-insensitive for mustInclude, whitespace
 *  trimmed — so "the brief changed" is a comparison, not a guess. */
export function digestBrief(b: AdBrief): string {
  const norm = [
    b.product,
    b.audience,
    b.proposition,
    b.tone,
    [...b.mustInclude].map((s) => s.trim()).sort().join("|"),
    b.cta,
    b.platform,
  ]
    .map((s) => s.trim())
    .join("␟");
  let h = 2166136261;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** The runtime a scenario's shots add up to (end-card hold excluded). */
export function scenarioRuntimeS(s: AdScenario): number {
  return s.shots.reduce((t, shot) => t + shot.durationS, 0);
}

export function isAdTemplate(id: unknown): id is AdTemplateId {
  return id === "ad-social-15" || id === "ad-spot-30";
}
