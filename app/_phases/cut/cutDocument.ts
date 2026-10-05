// THE CUT, COMPILED — the derived cut as a document a render can read.
//
// `deriveTimeline` gives the Cut step what it DRAWS: lanes of clips, with the
// sync bench's offsets applied at draw time (`drawnStart`, offsets.ts). This
// gives a render what it READS: one deterministic JSON edit decision list
// (card frames-score-cut-B; registry media-generation/video-assembly
// #cut-compiled-from-source). Three rules, each the reason for a shape below:
//
//   PICTURE TILES THE CLOCK. One segment per scene, in order, so the segments
//   sum to `cut.totalS` by construction — a render that concatenates them
//   cannot come out a different length from the ruler the creator cut on. A
//   segment is a STILL (the frame's layers, snapshotted: plate, then the
//   visible elements and texts FrameCanvas composites over it) or a GAP with
//   the clip's own `why`. A gap carries no picture at all, so nothing
//   downstream can mistake a refused plate for a held one
//   (#gap-and-refusal-honesty).
//
//   AUDIO NAMES ITS SOURCE BY ID. A music segment is a sound-store take id
//   (the spot's pointer, ADR 2026-08-29-score-take-persistence option D) at
//   its dialled offset, or a gap. A take that is playing from a file dropped
//   into THIS browser session is a gap here, not a take: its `blob:` URL is
//   dead to every process but the tab that minted it, and a document that
//   carried it would compile to a render that silently loses the music. Every
//   spoken line is a gap on the voice lane ("written, not recorded") for the
//   same reason the Cut draws it missing — nothing records a voice yet.
//
//   THE GATE RECORD TRAVELS WITH IT. `finish` is `finishLine(cut, offsets)` at
//   compile time, so an animatic exported with holes says which holes, after
//   the browser that knew is closed (review-iteration-loops
//   #gate-record-outlives-the-media).
//
// PURE AND DETERMINISTIC: same inputs, same bytes. `cutDocumentJson` sorts keys
// at every depth and `cutDocumentHash` is over that form, so two compiles of
// one cut are equal however their inputs' keys were ordered, and a version of
// a cut is a document you can diff.

import type { FrameElement, FrameText } from "../frames/frames";
import { takeFileUrl } from "@/lib/sound/client";

import type { CutClip, CutOrigin, DerivedCut } from "./deriveTimeline";
import { finishLine, type FinishCheck } from "./finishLine";
import { drawnStart, offsetFrom, type Offsets } from "./offsets";

export const CUT_DOCUMENT_VERSION = 1;

/** What a still composites, in FrameCanvas's order: plate, marks, words. */
export interface LayerSnapshot {
  /** The plate's `src` as the frame holds it: a data: URL or a public path. */
  plate: string;
  elements: FrameElement[];
  texts: FrameText[];
}

interface SegmentBase {
  /** The frame (picture unit) this segment stands for. */
  unitRef: string;
  label: string;
  startS: number;
  durS: number;
}

export type PictureSegment =
  | (SegmentBase & { kind: "still"; layers: LayerSnapshot })
  | (SegmentBase & { kind: "gap"; why: string });

interface AudioBase {
  lane: "music" | "voice";
  /** The clip on the Cut's ruler — the key the sync bench's offsets use. */
  clipId: string;
  /** The cue (music) or frame (voice) the clip stands for. */
  ref: string;
  label: string;
  /** Where it plays: its mark plus the dialled drift, to the millisecond. */
  startS: number;
  durS: number;
  offsetMs: number;
}

export type AudioSegment =
  | (AudioBase & { kind: "take"; takeId: string })
  | (AudioBase & { kind: "gap"; why: string });

export interface CutDocument {
  v: typeof CUT_DOCUMENT_VERSION;
  origin: CutOrigin;
  totalS: number;
  targetS: number | null;
  picture: PictureSegment[];
  audio: AudioSegment[];
  finish: FinishCheck[];
}

const ms = (s: number) => Math.round(s * 1000) / 1000;

/** The store's own path for a take, without the `k=` query a browser adds.
 *  Derived from `takeFileUrl` rather than retyped, so the two cannot drift. */
const storePath = (takeId: string) => takeFileUrl(takeId).split("?")[0];

function picture(cut: DerivedCut): PictureSegment[] {
  const byRef = new Map(cut.clips.filter((c) => c.track === "video").map((c) => [c.ref, c]));
  return cut.scenes.map((sc) => {
    const base: SegmentBase = { unitRef: sc.id, label: sc.label, startS: sc.startS, durS: sc.durS };
    const clip = byRef.get(sc.id);
    const frame = cut.frames[sc.id];
    if (clip && clip.status !== "missing" && clip.src && frame) {
      return {
        ...base,
        kind: "still",
        layers: {
          plate: clip.src,
          elements: frame.elements.filter((e) => !e.hidden).map((e) => ({ ...e })),
          texts: frame.texts.filter((t) => !t.hidden).map((t) => ({ ...t })),
        },
      };
    }
    // The fixture's scenes have a gradient and no frame; a project's scene
    // without a held plate has the clip's reason. Either way, no picture.
    return { ...base, kind: "gap", why: clip?.why ?? (frame ? "no plate" : "no frame behind this scene") };
  });
}

function audioOf(c: CutClip, offsets: Offsets, takes: Readonly<Record<string, string>>): AudioSegment {
  const offsetMs = offsetFrom(offsets, c);
  const base: AudioBase = {
    lane: c.track === "vo" ? "voice" : "music",
    clipId: c.id,
    ref: c.ref,
    label: c.label,
    startS: ms(drawnStart(offsets, c)),
    durS: c.durS,
    offsetMs,
  };
  if (c.status === "missing" || !c.src) return { ...base, kind: "gap", why: c.why ?? "no take in hand" };
  const takeId = c.track === "music" ? takes[c.ref] : undefined;
  if (takeId && c.src.split("?")[0] === storePath(takeId)) return { ...base, kind: "take", takeId };
  return { ...base, kind: "gap", why: "session file, not in the sound store" };
}

/**
 * Compile a derived cut.
 *
 * @param offsets the sync bench's dialled drift, by clip id (the Cut's own record)
 * @param takes   cue id → the sound-store take id its spot points at
 *                (`ScoreSpot.activeTakeId`); a pointer for a cue this cut does
 *                not hold is ignored
 */
export function compileCut(cut: DerivedCut, offsets: Offsets, takes: Readonly<Record<string, string>>): CutDocument {
  const audio = cut.clips
    .filter((c) => c.track === "music" || c.track === "vo")
    .map((c) => audioOf(c, offsets, takes))
    // Lane, then time, then clip id: an order that depends on nothing but the
    // segments themselves.
    .sort((a, b) => (a.lane === b.lane ? a.startS - b.startS || (a.clipId < b.clipId ? -1 : 1) : a.lane === "music" ? -1 : 1));
  return {
    v: CUT_DOCUMENT_VERSION,
    origin: cut.origin,
    totalS: cut.totalS,
    targetS: cut.targetS,
    picture: picture(cut),
    audio,
    finish: finishLine(cut, offsets),
  };
}

/** The spots' pointers, in the shape `compileCut` takes. */
export function takePointers(spots: readonly { id: string; activeTakeId?: string }[] | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of spots ?? []) if (s.activeTakeId) out[s.id] = s.activeTakeId;
  return out;
}

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = canonical(x);
    }
    return out;
  }
  return v;
}

/** The document's one serialisation: keys sorted at every depth. */
export function cutDocumentJson(doc: CutDocument): string {
  return JSON.stringify(canonical(doc));
}

/** Two FNV-1a lanes over the canonical form, 64 bits of hex. An identity for
 *  diffing and for the sidecar, not a security boundary: it has to run in the
 *  browser and in Node, synchronously, with no dependency. */
export function cutDocumentHash(doc: CutDocument): string {
  const text = cutDocumentJson(doc);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 15);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return hex(a) + hex(b);
}
