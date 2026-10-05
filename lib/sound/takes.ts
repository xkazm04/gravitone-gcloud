// TAKES — list, file, judge, finalize. Server-only; every write is one store
// transaction (./store.ts withStore) that also brings the ledger in line.
//
// THE RULES THE CONTRACT STATES (lib/sound/types.ts, the round-4 brief), each
// enforced here and nowhere else so the routes and the CLI cannot drift:
//
//   · a verdict change stamps `judgedAt` (and un-judging clears it);
//   · `kept` with no stage enters `pending` — Arrangement's first column;
//   · leaving `kept` clears the stage: a rejected take is not on the board;
//   · `finalized` REQUIRES a label (409 without one) and stamps `finalizedAt`,
//     because the label is what an agent selects by (`sound.mts finalized`)
//     and a finalized take nobody can select is a dead end;
//   · every judgement of a non-fixture take upserts its ledger row.

import path from "node:path";

import { syncVerdict } from "./ledger";
import { mintId, readTakes, removeFile, safeId, SoundError, withStore, writeBytesAtomic, ID_RE, type StoreTx } from "./store";
import {
  DEFECTS,
  STAGES,
  type DefectCode,
  type MeasuredSound,
  type ProviderId,
  type SoundKind,
  type SoundOp,
  type SoundTake,
  type SoundTerms,
  type Stage,
  type TakeOrigin,
  type TakePatch,
  type Verdict,
} from "./types";

export interface TakeFilter {
  kind?: SoundKind | null;
  verdict?: Verdict | null;
  stage?: Stage | null;
  provider?: ProviderId | null;
  origin?: TakeOrigin | null;
  /** Fixture rows are excluded unless asked for, or unless `origin` names them. */
  fixtures?: boolean;
  group?: string | null;
  label?: string | null;
  /** A Score cue's takes: the project and the cue (spot id) they were rendered for. */
  projectId?: string | null;
  cueId?: string | null;
}

const KINDS: readonly SoundKind[] = ["music", "sfx"];
const PROVIDERS: readonly ProviderId[] = ["elevenlabs", "suno", "local"];
const ORIGINS: readonly TakeOrigin[] = ["agent", "lab", "hunt", "import", "suno-return", "fixture", "score"];
const VERDICTS: readonly Verdict[] = ["unjudged", "kept", "rejected"];
const OPS: readonly SoundOp[] = ["compose", "plan", "section-edit", "sfx", "manual", "cue"];

const pick = <T extends string>(list: readonly T[], v: unknown): T | null => list.find((x) => x === v) ?? null;

/** Read a query string into a filter; an unknown value is a 400, not a silent
 *  "everything" — a typo'd `verdict=kpt` returning the whole shelf would read
 *  as an answer. */
export function parseTakeFilter(sp: URLSearchParams): TakeFilter {
  const one = <T extends string>(name: string, list: readonly T[]): T | null => {
    const v = sp.get(name);
    if (!v) return null;
    const hit = pick(list, v);
    if (!hit) throw new SoundError(`unknown ${name}: ${JSON.stringify(v)} (one of ${list.join(", ")})`, 400);
    return hit;
  };
  return {
    kind: one("kind", KINDS),
    verdict: one("verdict", VERDICTS),
    stage: one("stage", STAGES),
    provider: one("provider", PROVIDERS),
    origin: one("origin", ORIGINS),
    fixtures: sp.get("fixtures") === "1",
    group: sp.get("group") || null,
    label: sp.get("label") || null,
    projectId: sp.get("projectId") || null,
    cueId: sp.get("cueId") || null,
  };
}

export function filterTakes(takes: readonly SoundTake[], f: TakeFilter = {}): SoundTake[] {
  const out = takes.filter(
    (t) =>
      (!f.kind || t.kind === f.kind) &&
      (!f.verdict || t.verdict === f.verdict) &&
      (!f.stage || t.stage === f.stage) &&
      (!f.provider || t.provider === f.provider) &&
      (f.origin ? t.origin === f.origin : f.fixtures || t.origin !== "fixture") &&
      (!f.group || t.group === f.group) &&
      (!f.label || (t.label ?? "").toLowerCase().includes(f.label.toLowerCase())) &&
      (!f.projectId || t.projectId === f.projectId) &&
      (!f.cueId || t.cueId === f.cueId),
  );
  // Newest first; the id breaks a tie so two takes filed in one millisecond
  // keep one order across reads.
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export async function listTakes(f: TakeFilter = {}): Promise<SoundTake[]> {
  return filterTakes((await readTakes()).takes, f);
}

export async function getTake(id: string): Promise<SoundTake> {
  safeId(id);
  const t = (await readTakes()).takes.find((x) => x.id === id);
  if (!t) throw new SoundError(`no take ${id}`, 404);
  return t;
}

/* ── normalisation: a Partial<SoundTake> from the wire, held to the contract ── */

const str = (v: unknown, max = 4000): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strs = (v: unknown, cap = 40): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 120)).slice(0, cap) : [];
const iso = (v: unknown): string | null => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);

export function termsOf(v: unknown): SoundTerms {
  const t = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { genre: strs(t.genre), mood: strs(t.mood), instrument: strs(t.instrument), sfxCategory: str(t.sfxCategory, 80) };
}

function ratingsOf(v: unknown): Record<string, number | null> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number | null> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[a-z_]{1,40}$/.test(k)) continue;
    if (x === null) out[k] = null;
    else if (typeof x === "number" && Number.isFinite(x)) {
      if (x < 1 || x > 10) throw new SoundError(`rating ${k} must be 1..10 or null; got ${x}`, 400);
      out[k] = Math.round(x * 10) / 10;
    }
  }
  return out;
}

function reasonsOf(v: unknown): DefectCode[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new SoundError("reasons must be an array of defect codes", 400);
  const bad = v.filter((x) => !DEFECTS.includes(x as DefectCode));
  if (bad.length) throw new SoundError(`unknown defect code(s): ${bad.map((x) => JSON.stringify(x)).join(", ")} (known: ${DEFECTS.join(", ")})`, 400);
  return [...new Set(v as DefectCode[])];
}

function peaksOf(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  if (v.length > 4000) throw new SoundError("peaks carry at most 4000 slices", 400);
  return v.map((x) => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.min(1, Math.round(x * 1000) / 1000)) : 0));
}

function measuredOf(v: unknown): MeasuredSound | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  // Energy is an RMS, 0..1 (app/library/audio/analysis.ts); a figure outside
  // that range is a different unit somebody sent, refused rather than clamped
  // into a number that looks measured.
  const energy = num(m.energy);
  if (energy !== null && (energy < 0 || energy > 1)) throw new SoundError(`measured.energy is an RMS, 0..1; got ${energy}`, 400);
  const durationS = num(m.durationS);
  if (durationS !== null && durationS <= 0) throw new SoundError(`measured.durationS must be a positive length; got ${durationS}`, 400);
  return {
    tempoBpm: num(m.tempoBpm),
    key: str(m.key, 40),
    energy: energy === null ? null : Math.round(energy * 10000) / 10000,
    durationS: durationS === null ? null : Math.round(durationS * 100) / 100,
    lufs: num(m.lufs),
    truePeakDb: num(m.truePeakDb),
  };
}

/** A fan-out's one change: an axis and what differed. Anything else is absent. */
function variationOf(v: unknown): SoundTake["variation"] {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const axis = str(o.axis, 80);
  return axis ? { axis, diff: strs(o.diff, 20) } : null;
}

/** A section edit's modes, verbatim as the lab sent them; null when none. */
const editModesOf = (v: unknown): string[] | null => (Array.isArray(v) ? strs(v, 40) : null);

function stageOf(v: unknown): Stage | null {
  if (v === null || v === undefined) return null;
  const s = pick(STAGES, v);
  if (!s) throw new SoundError(`unknown stage ${JSON.stringify(v)} (one of ${STAGES.join(", ")})`, 400);
  return s;
}

/** Apply the contract's verdict/stage rules to a take that has just changed.
 *  `prev` is the take before the change (null on create). Mutates `t`. */
function applyRules(t: SoundTake, prev: SoundTake | null, now: string): void {
  if (!prev || prev.verdict !== t.verdict) t.judgedAt = t.verdict === "unjudged" ? null : now;
  if (t.verdict === "kept") {
    if (t.stage === null) t.stage = "pending";
  } else if (t.stage !== null) {
    // Asking for a stage on a take that is not kept is a contradiction the
    // board cannot draw; leaving `kept` takes the card off the board.
    if (prev && prev.verdict === "kept") t.stage = null;
    else throw new SoundError(`a ${t.verdict} take has no stage; keep it first`, 409);
  }
  if (t.stage === "finalized") {
    if (!t.label || !t.label.trim())
      throw new SoundError("a finalized take needs a library label — it is what agents select it by", 409);
    if (!prev || prev.stage !== "finalized") t.finalizedAt = now;
  } else t.finalizedAt = null;
}

/* ── create ───────────────────────────────────────────────────────────────── */

const AUDIO_EXT: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
  "audio/ogg": ".ogg",
  "audio/flac": ".flac",
  "audio/x-flac": ".flac",
  "audio/aac": ".aac",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/webm": ".webm",
};
const EXT_MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".m4a": "audio/mp4",
  ".webm": "audio/webm",
};

/** 60 MB. A ten-minute WAV at CD quality is ~100 MB, but nothing this studio
 *  makes or returns is that; an upload past this is a wrong file, not a take. */
export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

/** The content type a take's bytes are served with: what the upload declared
 *  when it is audio, else read off the file name, else refused. */
export function audioMime(declared: string | null | undefined, name: string): string {
  const d = (declared ?? "").split(";")[0].trim().toLowerCase();
  if (d.startsWith("audio/")) return d === "audio/mp3" ? "audio/mpeg" : d;
  const byExt = EXT_MIME[path.extname(name).toLowerCase()];
  if (byExt) return byExt;
  throw new SoundError(`${name || "the file"} is not audio (content-type ${d || "none"})`, 415);
}

export interface IncomingFile {
  bytes: Uint8Array;
  mime: string;
  name: string;
}

/**
 * File a take. Used by the upload route (a Suno return, an import, a migrated
 * Library row) and, with `origin` already decided, by generate.ts.
 *
 * MIGRATION IS IDEMPOTENT BY ID. A Library row keeps its own id when it moves
 * here (app/library/audio/soundMigration.ts), so a second push of the same row
 * — a lost localStorage mark, two accounts on one machine carrying the same
 * 160 fixture ids — finds the take already filed and returns it unchanged
 * (`created: false`) rather than filing a duplicate. A caller-supplied id that
 * is not id-shaped is ignored and a fresh one minted.
 *
 * A take with no bytes is accepted ONLY as a fixture: the contest rows never
 * had audio (they play through the Library's WebAudio sketch), and every other
 * origin without a file would be a row nobody can listen to.
 */
export async function createTake(
  metaIn: Partial<SoundTake>,
  file: IncomingFile | null,
  now = new Date(),
): Promise<{ take: SoundTake; created: boolean }> {
  const meta = (metaIn && typeof metaIn === "object" ? metaIn : {}) as Record<string, unknown>;
  const origin = pick(ORIGINS, meta.origin) ?? "import";
  const hasBytes = !!file && file.bytes.byteLength > 0;
  if (!hasBytes && origin !== "fixture") throw new SoundError("a take needs its audio file (multipart field `file`)", 400);
  if (file && file.bytes.byteLength > MAX_UPLOAD_BYTES)
    throw new SoundError(`the file is ${Math.round(file.bytes.byteLength / 1048576)} MB; takes are capped at ${MAX_UPLOAD_BYTES / 1048576} MB`, 413);
  const mime = hasBytes ? audioMime(file!.mime, file!.name) : null;

  const wanted = typeof meta.id === "string" && ID_RE.test(meta.id) ? meta.id : null;
  const nowIso = now.toISOString();

  return withStore(async (tx) => {
    const store = await tx.get("takes");
    if (wanted) {
      const have = store.takes.find((t) => t.id === wanted);
      if (have) return { take: have, created: false };
    }
    const id = wanted ?? mintId("st");
    const terms = termsOf(meta.terms);
    const opIn = pick(OPS, meta.op);
    const kind: SoundKind = pick(KINDS, meta.kind) ?? (opIn === "sfx" || terms.sfxCategory ? "sfx" : "music");
    const verdict = pick(VERDICTS, meta.verdict) ?? "unjudged";
    const title =
      str(meta.title, 200) ?? (file?.name ? path.basename(file.name, path.extname(file.name)).slice(0, 200) : null) ?? "untitled take";
    let fileRec: SoundTake["file"] = null;
    if (hasBytes) {
      const ext = AUDIO_EXT[mime!] ?? (path.extname(file!.name).toLowerCase() || ".bin");
      const rel = await writeBytesAtomic(path.join("files", `${safeId(id)}${ext}`), file!.bytes);
      fileRec = { path: rel, mime: mime!, bytes: file!.bytes.byteLength };
    }
    const take: SoundTake = {
      id,
      kind,
      title,
      provider: pick(PROVIDERS, meta.provider) ?? (origin === "suno-return" ? "suno" : "local"),
      op: opIn ?? "manual",
      origin,
      technique: strs(meta.technique, 20),
      prompt: str(meta.prompt, 8000) ?? "",
      negative: str(meta.negative, 2000),
      terms,
      tempoBpm: num(meta.tempoBpm),
      key: str(meta.key, 40),
      durationS: num(meta.durationS),
      loop: typeof meta.loop === "boolean" ? meta.loop : null,
      file: fileRec,
      peaks: peaksOf(meta.peaks),
      measured: measuredOf(meta.measured),
      ratings: ratingsOf(meta.ratings),
      verdict,
      reasons: reasonsOf(meta.reasons),
      note: str(meta.note, 2000),
      stage: stageOf(meta.stage),
      group: str(meta.group, 80),
      label: str(meta.label, 120),
      parentId: typeof meta.parentId === "string" && ID_RE.test(meta.parentId) ? meta.parentId : null,
      huntId: str(meta.huntId, 80),
      nodeId: str(meta.nodeId, 80),
      songId: str(meta.songId, 200),
      plan: meta.plan && typeof meta.plan === "object" ? meta.plan : null,
      referenceTrackId: str(meta.referenceTrackId, 120),
      promptRound: str(meta.promptRound, 120),
      draftId: str(meta.draftId, 120),
      variation: variationOf(meta.variation),
      editModes: editModesOf(meta.editModes),
      // The name the file arrived under, unless the caller states another (a
      // migrated Library row keeps the name it was uploaded with).
      fileName: str(meta.fileName, 255) ?? (hasBytes && file!.name ? file!.name.slice(0, 255) : null),
      projectId: str(meta.projectId, 120),
      cueId: str(meta.cueId, 120),
      // A migrated row keeps the time it was made, so "newest first" means the
      // same thing in the Library after the move as before it.
      createdAt: iso(meta.createdAt) ?? nowIso,
      judgedAt: null,
      finalizedAt: null,
    };
    // A return inherits its parent's row on the board (the brief: "inherits
    // group"), unless the caller placed it explicitly.
    if (take.parentId && !take.group) take.group = store.takes.find((t) => t.id === take.parentId)?.group ?? null;
    applyRules(take, null, iso(meta.judgedAt) ?? nowIso);
    if (take.finalizedAt && iso(meta.finalizedAt)) take.finalizedAt = iso(meta.finalizedAt);
    store.takes.push(take);
    tx.touch("takes");
    await syncVerdict(tx, take);
    return { take, created: true };
  });
}

/* ── patch ───────────────────────────────────────────────────────────────── */

const PATCHABLE = new Set([
  "title",
  "ratings",
  "verdict",
  "reasons",
  "note",
  "stage",
  "group",
  "label",
  "peaks",
  "measured",
  "referenceTrackId",
  "promptRound",
  "draftId",
  "variation",
  "editModes",
  "fileName",
]);

/** Hold a PATCH body to TakePatch. Unknown keys are refused by name: a client
 *  that thinks it can set `origin` or `file` should hear that it cannot. */
export function parseTakePatch(body: unknown): TakePatch {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SoundError("a patch must be a JSON object", 400);
  const b = body as Record<string, unknown>;
  const extra = Object.keys(b).filter((k) => !PATCHABLE.has(k));
  if (extra.length) throw new SoundError(`not patchable: ${extra.join(", ")}`, 400);
  const p: TakePatch = {};
  if ("title" in b) {
    const t = str(b.title, 200);
    if (!t) throw new SoundError("a title cannot be empty", 400);
    p.title = t;
  }
  if ("ratings" in b) p.ratings = ratingsOf(b.ratings);
  if ("verdict" in b) {
    const v = pick(VERDICTS, b.verdict);
    if (!v) throw new SoundError(`unknown verdict ${JSON.stringify(b.verdict)} (one of ${VERDICTS.join(", ")})`, 400);
    p.verdict = v;
  }
  if ("reasons" in b) p.reasons = reasonsOf(b.reasons);
  if ("note" in b) p.note = b.note === null ? null : str(b.note, 2000);
  if ("stage" in b) p.stage = stageOf(b.stage);
  if ("group" in b) p.group = b.group === null ? null : str(b.group, 80);
  if ("label" in b) p.label = b.label === null ? null : str(b.label, 120);
  if ("peaks" in b) p.peaks = b.peaks === null ? null : peaksOf(b.peaks);
  if ("measured" in b) p.measured = b.measured === null ? null : measuredOf(b.measured);
  // The Library's facts: a string set, null clears. An empty string is a clear
  // too — the Library's own forms send "" for "no reference".
  if ("referenceTrackId" in b) p.referenceTrackId = str(b.referenceTrackId, 120);
  if ("promptRound" in b) p.promptRound = str(b.promptRound, 120);
  if ("draftId" in b) p.draftId = str(b.draftId, 120);
  if ("variation" in b) p.variation = variationOf(b.variation);
  if ("editModes" in b) p.editModes = editModesOf(b.editModes);
  if ("fileName" in b) p.fileName = str(b.fileName, 255);
  return p;
}

/** Apply a patch inside a transaction (the hunt route's winner marking reuses
 *  this so a winner is judged by the same rules as a keep in Triage). */
export async function patchTakeTx(tx: StoreTx, id: string, patch: TakePatch, now = new Date()): Promise<SoundTake> {
  safeId(id);
  const store = await tx.get("takes");
  const i = store.takes.findIndex((t) => t.id === id);
  if (i === -1) throw new SoundError(`no take ${id}`, 404);
  const prev = store.takes[i];
  const next: SoundTake = {
    ...prev,
    ...patch,
    // Ratings MERGE: the rubric is scored one dimension per keypress, and a
    // replace would let two fast keys race each other out of the bag (the
    // Library measured exactly that, 344cdbc — app/library/audio/
    // AudioWorkbench.tsx `lastRatings`; Triage chains its writes per take for
    // the same reason, app/playground/triage/useTriage.ts). A null clears one
    // dimension.
    ratings: patch.ratings ? { ...prev.ratings, ...patch.ratings } : prev.ratings,
  };
  // Rejection reasons belong to a rejection; keeping a take drops them.
  if (patch.verdict === "kept" && !("reasons" in patch)) next.reasons = [];
  applyRules(next, prev, now.toISOString());
  store.takes[i] = next;
  tx.touch("takes");
  await syncVerdict(tx, next);
  return next;
}

export function patchTake(id: string, patch: TakePatch, now = new Date()): Promise<SoundTake> {
  return withStore((tx) => patchTakeTx(tx, id, patch, now));
}

/* ── clear the examples ──────────────────────────────────────────────────── */

/** Remove every fixture take (and any bytes one carries). Fixtures only: the
 *  Library's "clear the examples" is the one bulk delete there is, and a route
 *  that could bulk-delete judged work would be one typo from erasing a shelf. */
export async function removeFixtures(): Promise<number> {
  return withStore(async (tx) => {
    const store = await tx.get("takes");
    const gone = store.takes.filter((t) => t.origin === "fixture");
    if (!gone.length) return 0;
    store.takes = store.takes.filter((t) => t.origin !== "fixture");
    tx.touch("takes");
    for (const t of gone) if (t.file) await removeFile(t.file.path);
    return gone.length;
  });
}
