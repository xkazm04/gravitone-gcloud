// THE TAKE'S READER — fills a Take from an audio Asset's untyped meta bag,
// reading every field defensively. Split out of book.ts because it is the only
// part of the take that touches the Asset shape; the Take itself is in
// ./take.ts and the readers that derive from a Take are in ./derived.ts.
// Moved verbatim.
import type { Asset, AudioMeta, LabEditMode, LabOp, MeasuredAudio } from "@/lib/assets";
import type { WirePlan } from "@/lib/music/types";
import type { Ratings, Take } from "./take";

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

const EDIT_MODES: readonly LabEditMode[] = ["keep", "low", "medium", "high", "free"];
const LAB_OPS: readonly LabOp[] = ["compose", "plan", "section-edit", "sfx"];

function planOf(v: unknown): WirePlan | null {
  if (!v || typeof v !== "object") return null;
  const chunks = (v as { chunks?: unknown }).chunks;
  return Array.isArray(chunks) ? ({ chunks } as WirePlan) : null;
}

function measuredOf(v: unknown): MeasuredAudio | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  const tempo = num(m.tempo_bpm);
  const key = str(m.key);
  if (tempo == null || !key) return null;
  const e = m.energy;
  return {
    tempo_bpm: tempo,
    key,
    energy: e === "high" || e === "medium" || e === "low" ? e : null,
    method: str(m.method) ?? "unknown",
  };
}

function variationOf(v: unknown): { axis: string; diff: string[] } | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const axis = str(r.axis);
  return axis ? { axis, diff: strs(r.diff) } : null;
}

function ratingsOf(v: unknown): Ratings | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  return {
    melody: num(r.melody),
    instrument_choice: num(r.instrument_choice),
    instrument_quality: num(r.instrument_quality),
  };
}

/** An audio Asset as the book reads it. `meta` is an untyped bag (lib/assets
 *  #AudioMeta is a cast, not a schema), so every field is read defensively and
 *  an absent one is null — never a guessed default. A stored "proven" (the
 *  previous module wrote it) reads as kept: proven is derived here. */
export function takeFromAsset(a: Asset): Take {
  const m = (a.meta ?? {}) as Record<string, unknown>;
  const v = m.verdict as AudioMeta["verdict"] | undefined;
  return {
    id: a.id,
    // `sound_kind` first: the sound store knows an effect with no category is
    // still an effect (./soundAdapter.ts); a pre-store row has only the category.
    kind: m.sound_kind === "sfx" || (m.sound_kind !== "music" && str(m.sfx_category)) ? "sfx" : "track",
    title: a.name,
    duration_s: num(m.duration_s),
    vendor: str(m.vendor),
    status: v === "kept" || v === "proven" ? "kept" : v === "rejected" ? "rejected" : "unrated",
    created_at: a.createdAt,
    ratings: ratingsOf(m.ratings),
    reject_reason: str(m.reject_reason),
    genre_tags: strs(m.genre_tags),
    mood_tags: strs(m.mood_tags),
    instrumentation: strs(m.instrumentation),
    tempo_bpm: num(m.tempo_bpm),
    key: str(m.key),
    reference_track_id: str(m.reference_track_id),
    prompt_round: str(m.prompt_round),
    sfx_category: str(m.sfx_category),
    loopable: m.loopable === true,
    parent_id: str(m.parent_id),
    draft_id: str(m.draft_id),
    prompt_text: str(m.prompt_text),
    file_name: str(m.fileName),
    upload_id: str(m.uploadId),
    lab_op: LAB_OPS.find((o) => o === m.lab_op) ?? null,
    song_id: str(m.song_id),
    plan: planOf(m.plan),
    edit_modes: Array.isArray(m.edit_modes)
      ? m.edit_modes.map((x) => EDIT_MODES.find((e) => e === x) ?? "keep")
      : null,
    peaks: Array.isArray(m.peaks) ? m.peaks.map((x) => (typeof x === "number" && Number.isFinite(x) ? x : 0)) : null,
    measured: measuredOf(m.measured),
    variation: variationOf(m.variation),
    hunt_id: str(m.hunt_id),
    fixture: m.fixture === true,
    stage: str(m.stage),
    label: str(m.label),
  };
}
