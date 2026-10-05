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
//   · THE LIBRARY'S OWN FACTS — the reference track, the prompt round, the
//     Suno draft a return answers, the lab's variation and edit modes, the
//     original file name — are SoundTake fields since the round-4 closeout
//     (referenceTrackId, promptRound, draftId, variation, editModes,
//     fileName). They used to ride in a per-browser localStorage annex
//     (soundAnnex.ts, deleted); ./soundMigration.ts#migrateAnnex moves what an
//     older browser still holds into the store, once.
//   · ENERGY is stored as the analyser's RMS (0..1) and read back as the
//     Library's band word through ./analysis.ts#energyBand — one threshold
//     pair, so the lab and the Library name the same band. A band WORD with no
//     number behind it (an old IndexedDB row) is not turned into a number.

import type { Asset, AudioMeta, LabEditMode, MeasuredAudio } from "@/lib/assets";
import { takeFileUrl } from "@/lib/sound/client";
import { DEFECTS, RUBRIC, type DefectCode, type SoundKind, type SoundTake, type TakeOrigin, type TakePatch } from "@/lib/sound/types";

import { energyBand } from "./analysis";

/** The Library's three rubric slots, in order. */
export const SLOTS = ["melody", "instrument_choice", "instrument_quality"] as const;
type Slot = (typeof SLOTS)[number];

/** The URL an <audio> element plays a take from — takeFileUrl carries the
 *  access key as `k=` itself now (lib/sound/client.ts). */
export function playUrl(id: string): string {
  return takeFileUrl(id);
}

const isDefect = (s: string): s is DefectCode => (DEFECTS as readonly string[]).includes(s);

/** The store's rubric key for a Library slot on a take of `kind`. */
export const rubricKey = (kind: SoundKind, slot: Slot) => RUBRIC[kind][SLOTS.indexOf(slot)] ?? slot;

/* ── read: SoundTake -> Asset ─────────────────────────────────────────────── */

export function assetFromSoundTake(t: SoundTake, uid: string): Asset {
  const ratings =
    Object.keys(t.ratings).length === 0
      ? undefined
      : (Object.fromEntries(SLOTS.map((s) => [s, t.ratings[rubricKey(t.kind, s)] ?? t.ratings[s] ?? null])) as NonNullable<AudioMeta["ratings"]>);
  const reason = t.verdict === "rejected" ? [...t.reasons, ...(t.note ? [t.note] : [])].join(" · ") : "";
  const measured: MeasuredAudio | undefined =
    t.measured && t.measured.tempoBpm !== null && t.measured.key
      ? {
          tempo_bpm: t.measured.tempoBpm,
          key: t.measured.key,
          energy: t.measured.energy !== null ? energyBand(t.measured.energy) : null,
          method: "measured",
        }
      : undefined;
  // How long the take IS when its bytes were measured, else what was asked
  // (app/playground/shared/format.ts#takeSeconds reads it the same way).
  const seconds = t.measured?.durationS ?? t.durationS;
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
    ...(seconds !== null ? { duration_s: seconds } : {}),
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
    ...(t.file ? { uploadId: t.id, fileName: t.fileName ?? t.file.path.split("/").pop() } : {}),
    fixture: t.origin === "fixture",
    origin: t.origin,
    ...(t.stage ? { stage: t.stage } : {}),
    ...(t.group ? { group: t.group } : {}),
    ...(t.label ? { label: t.label } : {}),
    ...(t.referenceTrackId ? { reference_track_id: t.referenceTrackId } : {}),
    ...(t.promptRound ? { prompt_round: t.promptRound } : {}),
    ...(t.draftId ? { draft_id: t.draftId } : {}),
    ...(t.variation ? { variation: t.variation } : {}),
    ...(t.editModes ? { edit_modes: t.editModes as LabEditMode[] } : {}),
  };
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

/* ── write: an AudioMeta patch -> TakePatch ───────────────────────────────── */

/** "" and null clear a link; a string sets it; undefined leaves it alone. */
const link = (v: unknown): string | null | undefined =>
  v === undefined ? undefined : typeof v === "string" && v.trim() ? v.trim() : null;

/** Map a Library patch onto the store's TakePatch. `kind` decides which rubric
 *  the slots land on. */
export function splitPatch(kind: SoundKind, p: Partial<AudioMeta>): { patch: TakePatch } {
  const patch: TakePatch = {};
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
  // The Library's measurement carries an energy WORD; the store keeps an RMS.
  // A word is not a number anybody measured, so energy stays unknown here.
  if (p.measured)
    patch.measured = { tempoBpm: p.measured.tempo_bpm, key: p.measured.key, energy: null, durationS: null, lufs: null, truePeakDb: null };
  const ref = link(p.reference_track_id);
  if (ref !== undefined) patch.referenceTrackId = ref;
  const round = link(p.prompt_round);
  if (round !== undefined) patch.promptRound = round;
  const draft = link(p.draft_id);
  if (draft !== undefined) patch.draftId = draft;
  if (p.variation !== undefined)
    patch.variation =
      p.variation && typeof p.variation.axis === "string" && p.variation.axis.trim()
        ? { axis: p.variation.axis.trim(), diff: Array.isArray(p.variation.diff) ? p.variation.diff.filter((x) => typeof x === "string") : [] }
        : null;
  if (p.edit_modes !== undefined) patch.editModes = Array.isArray(p.edit_modes) ? p.edit_modes.filter((x) => typeof x === "string") : null;
  return { patch };
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

/* ── migrate / file: an AudioMeta row -> uploadTake's meta ──────────────── */

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

/** The upload meta for one Library row (or a fresh return). `id` and
 *  `createdAt` are passed for a migrated row so the move is idempotent and
 *  "newest first" means what it meant before. */
export function uploadMetaOf(
  metaIn: Partial<AudioMeta> & Record<string, unknown>,
  opts: { id?: string; title?: string; createdAt?: number; origin?: TakeOrigin; fileName?: string },
): { meta: Partial<SoundTake> } {
  const m = metaIn as Record<string, unknown>;
  const kind: SoundKind = m.sound_kind === "sfx" || typeof m.sfx_category === "string" ? "sfx" : "music";
  const { patch } = splitPatch(kind, metaIn);
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
    referenceTrackId: patch.referenceTrackId ?? null,
    promptRound: patch.promptRound ?? null,
    draftId: patch.draftId ?? null,
    variation: patch.variation ?? null,
    editModes: patch.editModes ?? null,
    fileName: opts.fileName ?? null,
    ...(opts.createdAt ? { createdAt: new Date(opts.createdAt).toISOString() } : {}),
  };
  return { meta };
}
