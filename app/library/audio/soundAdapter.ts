// THE ONE ADAPTER between the Library's audio model and the sound store.
//
// The Library reads takes as `Asset`s with an `AudioMeta` bag (lib/assets.ts),
// through ./book.ts#takeFromAsset, and every component in this folder is
// written against that. Since round 4 the takes live in the server's sound
// store (lib/sound, /api/sound/*) as `SoundTake`s. Rather than rewrite nine
// components against a second model, the shelf hook (./useAudioShelf.ts) maps
// at its edge — SoundTake -> Asset on read, AudioMeta patch -> TakePatch on
// write — and every mapping decision lives in this file, pure, so a probe can
// round-trip it.
//
// THE DECISIONS, each stated once:
//
//   · RATINGS are three Library slots (melody / instrument_choice /
//     instrument_quality) mapped POSITIONALLY onto the take's own rubric
//     (lib/sound/types.ts RUBRIC): for music the names coincide; for an effect
//     slot 1 is event_match, slot 2 sound_quality, slot 3 loop_seam. A score
//     given in the Library and one given in Triage are the same number in the
//     same dimension.
//   · A REJECT REASON in the Library is free text; the store's reasons are
//     defect codes. A reason that IS a code goes to `reasons`; any other text
//     goes to `note`, verbatim. Read back, the Library sees the codes and the
//     note joined — the words the person used survive the move.
//   · VENDOR: the store's provider is never null, the Library's vendor may be.
//     An unknown vendor is filed as "local" (a file from this machine) and
//     reads back as no vendor. Fixtures never reach the ledger, so this never
//     reaches a strength claim either.
//   · THE ANNEX. Seven Library facts have no field on SoundTake — the reference
//     track, the prompt round, the Suno draft a return answers, the lab's
//     variation and edit modes, the measured energy WORD and method, the
//     original file name. They are kept per account in localStorage
//     (./soundAnnex.ts) and laid back over the row here, so References, rounds
//     and the draft round trip keep working. Requested of the Director as
//     contract fields; until then they are this browser's.

import { accessHeader } from "@/lib/imagingClient";
import type { Asset, AudioMeta, LabEditMode, MeasuredAudio } from "@/lib/assets";
import { takeFileUrl } from "@/lib/sound/client";
import { DEFECTS, RUBRIC, type DefectCode, type SoundKind, type SoundTake, type TakeOrigin, type TakePatch } from "@/lib/sound/types";

/** The Library's three rubric slots, in order. */
export const SLOTS = ["melody", "instrument_choice", "instrument_quality"] as const;
type Slot = (typeof SLOTS)[number];

/** What the store has no field for, per take. Every key optional: absent means
 *  "not known", exactly as in AudioMeta. */
export interface Annex {
  reference_track_id?: string;
  prompt_round?: string;
  draft_id?: string;
  variation?: { axis: string; diff: string[] };
  edit_modes?: LabEditMode[];
  energy?: MeasuredAudio["energy"];
  method?: string;
  fileName?: string;
}
export type AnnexMap = Record<string, Annex>;

const ANNEX_KEYS = ["reference_track_id", "prompt_round", "draft_id", "variation", "edit_modes", "fileName"] as const;

/** The URL an <audio> element plays a take from. The access secret rides as
 *  `k=` because an element cannot carry a header (the file route accepts it,
 *  app/api/sound/takes/[id]/file/route.ts). Read off lib/imagingClient's
 *  header rather than the variable, so this module names no environment. */
export function playUrl(id: string): string {
  const auth = accessHeader().authorization;
  const k = auth ? auth.replace(/^Bearer\s+/i, "") : "";
  return k ? `${takeFileUrl(id)}?k=${encodeURIComponent(k)}` : takeFileUrl(id);
}

const isDefect = (s: string): s is DefectCode => (DEFECTS as readonly string[]).includes(s);

/** The store's rubric key for a Library slot on a take of `kind`. */
export const rubricKey = (kind: SoundKind, slot: Slot) => RUBRIC[kind][SLOTS.indexOf(slot)] ?? slot;

/* ── read: SoundTake -> Asset ─────────────────────────────────────────────── */

export function assetFromSoundTake(t: SoundTake, uid: string, annex: Annex = {}): Asset {
  const ratings =
    Object.keys(t.ratings).length === 0
      ? undefined
      : (Object.fromEntries(SLOTS.map((s) => [s, t.ratings[rubricKey(t.kind, s)] ?? t.ratings[s] ?? null])) as NonNullable<AudioMeta["ratings"]>);
  const reason = t.verdict === "rejected" ? [...t.reasons, ...(t.note ? [t.note] : [])].join(" · ") : "";
  const measured: MeasuredAudio | undefined =
    t.measured && t.measured.tempoBpm !== null && t.measured.key
      ? { tempo_bpm: t.measured.tempoBpm, key: t.measured.key, energy: annex.energy ?? null, method: annex.method ?? "measured" }
      : undefined;
  const meta: Record<string, unknown> = {
    verdict: t.verdict,
    ...(ratings ? { ratings } : {}),
    ...(reason ? { reject_reason: reason } : {}),
    ...(t.provider === "suno" || t.provider === "elevenlabs" ? { vendor: t.provider } : {}),
    genre_tags: t.terms.genre,
    mood_tags: t.terms.mood,
    instrumentation: t.terms.instrument,
    ...(t.tempoBpm !== null ? { tempo_bpm: t.tempoBpm } : {}),
    ...(t.key ? { key: t.key } : {}),
    ...(t.durationS !== null ? { duration_s: t.durationS } : {}),
    // An effect with no category still reads as an effect (book.ts reads
    // `sound_kind` before it falls back to the category's presence).
    sound_kind: t.kind,
    ...(t.terms.sfxCategory ? { sfx_category: t.terms.sfxCategory } : {}),
    ...(t.loop !== null ? { loopable: t.loop } : {}),
    ...(t.parentId ? { parent_id: t.parentId } : {}),
    ...(t.prompt ? { prompt_text: t.prompt } : {}),
    ...(t.op !== "manual" ? { lab_op: t.op } : {}),
    ...(t.songId ? { song_id: t.songId } : {}),
    ...(t.plan ? { plan: t.plan } : {}),
    ...(t.peaks ? { peaks: t.peaks } : {}),
    ...(measured ? { measured } : {}),
    ...(t.huntId ? { hunt_id: t.huntId } : {}),
    // The bytes: a take with a file plays from the store; `uploadId` is the key
    // the Library's url map is read by (book.ts#takeFromAsset -> upload_id).
    ...(t.file ? { uploadId: t.id, fileName: annex.fileName ?? t.file.path.split("/").pop() } : {}),
    fixture: t.origin === "fixture",
    origin: t.origin,
    ...(t.stage ? { stage: t.stage } : {}),
    ...(t.group ? { group: t.group } : {}),
    ...(t.label ? { label: t.label } : {}),
  };
  for (const k of ANNEX_KEYS) if (k !== "fileName" && annex[k] !== undefined) meta[k] = annex[k];
  return {
    id: t.id,
    uid,
    path: ["audio"],
    name: t.title,
    src: t.file ? playUrl(t.id) : "",
    kind: "audio",
    meta,
    createdAt: Date.parse(t.createdAt) || 0,
  };
}

/* ── write: an AudioMeta patch -> TakePatch + annex ───────────────────────── */

/** Split a Library patch into what the store records and what the annex keeps.
 *  `kind` decides which rubric the slots land on. */
export function splitPatch(kind: SoundKind, p: Partial<AudioMeta>): { patch: TakePatch; annex: Annex } {
  const patch: TakePatch = {};
  const annex: Annex = {};
  if (p.verdict !== undefined) patch.verdict = p.verdict === "proven" ? "kept" : p.verdict;
  if ("reject_reason" in p) {
    const text = (p.reject_reason ?? "").trim();
    if (!text) patch.reasons = [];
    else if (isDefect(text)) {
      patch.reasons = [text];
      patch.note = null;
    } else {
      patch.reasons = [];
      patch.note = text;
    }
  }
  if (p.ratings) {
    const r: Record<string, number | null> = {};
    for (const s of SLOTS) if (s in p.ratings) r[rubricKey(kind, s)] = p.ratings[s] ?? null;
    patch.ratings = r;
  }
  if (p.peaks) patch.peaks = p.peaks;
  if (p.measured)
    patch.measured = { tempoBpm: p.measured.tempo_bpm, key: p.measured.key, energy: null, lufs: null, truePeakDb: null };
  if (p.measured) {
    annex.energy = p.measured.energy;
    annex.method = p.measured.method;
  }
  for (const k of ANNEX_KEYS) if (k !== "fileName" && (p as Record<string, unknown>)[k] !== undefined) (annex as Record<string, unknown>)[k] = (p as Record<string, unknown>)[k];
  return { patch, annex };
}

/** Apply a TakePatch to a take the way the server will, for the optimistic
 *  local row: ratings merge, keeping drops reasons, a keep enters pending. The
 *  server's answer then overwrites the derived fields (stage, stamps). */
export function applyLocally(t: SoundTake, p: TakePatch): SoundTake {
  const next: SoundTake = { ...t, ...p, ratings: p.ratings ? { ...t.ratings, ...p.ratings } : t.ratings };
  if (p.verdict === "kept" && !("reasons" in p)) next.reasons = [];
  if (next.verdict === "kept" && next.stage === null) next.stage = "pending";
  if (next.verdict !== "kept") next.stage = null;
  return next;
}

/* ── migrate / file: an AudioMeta row -> uploadTake's meta + annex ─────────── */

/** Which origin a Library row migrates as. A fixture is a fixture; a lab render
 *  (it carries `lab_op`) is "lab"; a file returned against a Suno draft is a
 *  "suno-return"; anything else came in by hand — "import". */
export function originOf(meta: Record<string, unknown>): TakeOrigin {
  if (meta.fixture === true) return "fixture";
  if (typeof meta.lab_op === "string") return "lab";
  if (meta.vendor === "suno" && typeof meta.draft_id === "string") return "suno-return";
  return "import";
}

const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const numOr = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The upload meta for one Library row (or a fresh return), plus its annex.
 *  `id` and `createdAt` are passed for a migrated row so the move is
 *  idempotent and "newest first" means what it meant before. */
export function uploadMetaOf(
  metaIn: Partial<AudioMeta> & Record<string, unknown>,
  opts: { id?: string; title?: string; createdAt?: number; origin?: TakeOrigin; fileName?: string },
): { meta: Partial<SoundTake>; annex: Annex } {
  const m = metaIn as Record<string, unknown>;
  const kind: SoundKind = m.sound_kind === "sfx" || typeof m.sfx_category === "string" ? "sfx" : "music";
  const { patch, annex } = splitPatch(kind, metaIn);
  const verdict = patch.verdict ?? "unjudged";
  const opMap: Record<string, SoundTake["op"]> = { compose: "compose", plan: "plan", "section-edit": "section-edit", sfx: "sfx" };
  const meta: Partial<SoundTake> = {
    ...(opts.id ? { id: opts.id } : {}),
    ...(opts.title ? { title: opts.title } : {}),
    kind,
    provider: m.vendor === "suno" || m.vendor === "elevenlabs" ? m.vendor : "local",
    op: typeof m.lab_op === "string" ? (opMap[m.lab_op] ?? "manual") : "manual",
    origin: opts.origin ?? originOf(m),
    // A Library row has no technique list; a row anchored on a reference track
    // was briefed with exactly that technique, so it says so.
    technique: typeof m.reference_track_id === "string" ? ["reference-track-anchoring"] : [],
    prompt: typeof m.prompt_text === "string" ? m.prompt_text : "",
    negative: null,
    terms: {
      genre: strs(m.genre_tags),
      mood: strs(m.mood_tags),
      instrument: strs(m.instrumentation),
      sfxCategory: typeof m.sfx_category === "string" ? m.sfx_category : null,
    },
    tempoBpm: numOr(m.tempo_bpm),
    key: typeof m.key === "string" ? m.key : null,
    durationS: numOr(m.duration_s),
    loop: typeof m.loopable === "boolean" ? m.loopable : null,
    peaks: patch.peaks ?? null,
    measured: patch.measured ?? null,
    ratings: patch.ratings ?? {},
    verdict,
    reasons: verdict === "rejected" ? (patch.reasons ?? []) : [],
    note: verdict === "rejected" ? (patch.note ?? null) : null,
    parentId: typeof m.parent_id === "string" ? m.parent_id : null,
    huntId: typeof m.hunt_id === "string" ? m.hunt_id : null,
    songId: typeof m.song_id === "string" ? m.song_id : null,
    plan: m.plan && typeof m.plan === "object" ? m.plan : null,
    ...(opts.createdAt ? { createdAt: new Date(opts.createdAt).toISOString() } : {}),
  };
  if (opts.fileName) annex.fileName = opts.fileName;
  return { meta, annex };
}
