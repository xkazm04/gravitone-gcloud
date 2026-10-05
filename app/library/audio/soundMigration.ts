// THE ONE-TIME MOVE — this account's IndexedDB audio rows into the sound store.
//
// Until round 4 the Library's takes lived in this browser (lib/assets, kind
// "audio", bytes in the uploads store). They now live on the studio server
// (lib/sound, foundry-out/sound/) so agents can generate into Triage and pick
// from Finalized without a browser. Every row this browser holds is pushed once
// through the store's own upload (lib/sound/client.ts#uploadTake), bytes and
// all, and a per-account mark is set when every push landed.
//
// NEVER A DUPLICATE, by two locks rather than one:
//   · the mark, `gravitone.sound-migrated.v1.${uid}` — on
//     lib/identityEviction.ts#userScopedLocalKeys like every per-account mark;
//   · the id. A row keeps its own id in the store, and the store answers a
//     second push of a known id with the take it already holds (lib/sound/
//     takes.ts#createTake, "MIGRATION IS IDEMPOTENT BY ID"). So a lost mark, a
//     reload mid-move, or two accounts on one machine both carrying the 160
//     fixture ids each re-push and none of them files a second copy.
//
// A partial failure leaves the mark unset and says how many did not land; the
// next load retries only for real (the store skips the ones that did).
//
// FIXTURES. The contest rows (./audioSeed.ts, `meta.fixture`) move as origin
// "fixture" with no bytes — they never had any. An account that never seeded
// locally still gets them, straight into the store, so a fresh Library opens on
// a shelf to judge rather than an empty ledger (the seeded-once contract the
// IndexedDB seed kept). The Library shows them with a `demo` mark and a clear
// action; the ledger, the insights and the CLI's default listing never count them.
//
// The old rows are NOT deleted from IndexedDB. The move is a copy: if the
// server store is lost, the browser still holds what it held, and nothing here
// can make a second move duplicate it.

import { getUploadBlobs, listAssets, readUploadPointer, type Asset } from "@/lib/assets";
import { patchTake, uploadTake } from "@/lib/sound/client";
import type { SoundTake, TakePatch } from "@/lib/sound/types";

import { uploadMetaOf } from "./soundAdapter";

const migratedKey = (uid: string) => `gravitone.sound-migrated.v1.${uid}`;
/** The old IndexedDB seed's mark — read, never written, here: an account that
 *  carries it already has the fixture rows in IndexedDB and they move with the
 *  rest; one that does not is given them straight into the store. */
const legacySeededKey = (uid: string) => `gravitone.audio-seeded.v2.${uid}`;

export function alreadyMigrated(uid: string): boolean {
  try {
    return localStorage.getItem(migratedKey(uid)) === "1";
  } catch {
    // Unreadable storage: the store's id check still prevents a duplicate, so
    // a re-push is the safe direction to err.
    return false;
  }
}

function markMigrated(uid: string): void {
  try {
    localStorage.setItem(migratedKey(uid), "1");
  } catch {
    /* the store is idempotent by id; a lost mark costs a re-push, never a copy */
  }
}

function legacySeeded(uid: string): boolean {
  try {
    return localStorage.getItem(legacySeededKey(uid)) === "1";
  } catch {
    return true;
  }
}

export interface MigrationReport {
  skipped: boolean;
  pushed: number;
  /** Rows the store now holds, whether this push filed them or an earlier one
   *  had (the client cannot tell 201 from 200, and does not need to). */
  landed: number;
  failed: { id: string; error: string }[];
}

/** Push this account's rows. Resolves, never throws: a failure is in the report. */
export async function migrateShelf(uid: string, concurrency = 4): Promise<MigrationReport> {
  const report: MigrationReport = { skipped: false, pushed: 0, landed: 0, failed: [] };
  if (alreadyMigrated(uid)) return { ...report, skipped: true };

  let rows: Asset[];
  try {
    rows = (await listAssets(uid)).filter((a) => a.kind === "audio");
  } catch (e) {
    report.failed.push({ id: "(indexeddb)", error: e instanceof Error ? e.message : "could not read this browser's audio rows" });
    return report;
  }
  if (!legacySeeded(uid)) {
    const { seedAudioAssets } = await import("./audioSeed");
    const have = new Set(rows.map((r) => r.id));
    rows = [...rows, ...seedAudioAssets(uid).filter((r) => !have.has(r.id))];
  }
  if (!rows.length) {
    markMigrated(uid);
    return report;
  }

  const ids = rows.map((a) => readUploadPointer(a.src)).filter((x): x is string => Boolean(x));
  let blobs: Map<string, Blob>;
  try {
    blobs = await getUploadBlobs(ids);
  } catch {
    blobs = new Map();
  }

  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const a = rows[next++];
      const meta = (a.meta ?? {}) as Record<string, unknown>;
      const upload = readUploadPointer(a.src);
      const blob = upload ? blobs.get(upload) : undefined;
      if (upload && !blob && meta.fixture !== true) {
        // A returned take whose bytes this browser no longer holds. Filing it
        // without audio would be a row nobody can hear, and the store refuses
        // that for every origin but fixture — so it is reported, not faked.
        report.failed.push({ id: a.id, error: "its audio is no longer in this browser" });
        continue;
      }
      const fileName = typeof meta.fileName === "string" ? meta.fileName : `${a.id}.mp3`;
      const { meta: up } = uploadMetaOf(meta, { id: a.id, title: a.name, createdAt: a.createdAt, fileName: blob ? fileName : undefined });
      report.pushed++;
      const r = await uploadTake(blob ?? new Blob([]), fileName, up);
      if (!r.ok) report.failed.push({ id: a.id, error: r.error });
      else report.landed++;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  if (!report.failed.length) markMigrated(uid);
  return report;
}

/* ── the annex, moved once ──────────────────────────────────────────────────
 *
 * Between the store's first day and the round-4 closeout, six Library facts the
 * store had no field for — reference track, prompt round, Suno draft,
 * variation, edit modes, original file name — were kept per account in this
 * browser under `gravitone.audio-annex.${uid}`. They are SoundTake fields now,
 * so whatever a browser still holds is PATCHed onto the takes once and the key
 * is removed. Nothing writes the key any more; lib/identityEviction.ts keeps
 * evicting it for a machine that never ran this.
 *
 * THE STORE WINS. A fact is only written where the take's field is still
 * null: an annex is one browser's copy, and a value another browser (or the
 * CLI) already put on the take is newer than anything here. The annex's
 * energy WORD and method are dropped — the store keeps an RMS, and a band word
 * is not a number anybody measured.
 */

const legacyAnnexKey = (uid: string) => `gravitone.audio-annex.${uid}`;

interface LegacyAnnex {
  reference_track_id?: unknown;
  prompt_round?: unknown;
  draft_id?: unknown;
  variation?: unknown;
  edit_modes?: unknown;
  fileName?: unknown;
}

const nonEmpty = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The patch one annex entry makes on one take: only the facts the take lacks. */
export function annexPatch(t: SoundTake, a: LegacyAnnex): TakePatch {
  const p: TakePatch = {};
  const ref = nonEmpty(a.reference_track_id);
  if (ref && t.referenceTrackId === null) p.referenceTrackId = ref;
  const round = nonEmpty(a.prompt_round);
  if (round && t.promptRound === null) p.promptRound = round;
  const draft = nonEmpty(a.draft_id);
  if (draft && t.draftId === null) p.draftId = draft;
  const v = a.variation as { axis?: unknown; diff?: unknown } | null | undefined;
  if (v && nonEmpty(v.axis) && t.variation === null)
    p.variation = { axis: nonEmpty(v.axis)!, diff: Array.isArray(v.diff) ? v.diff.filter((x): x is string => typeof x === "string") : [] };
  if (Array.isArray(a.edit_modes) && a.edit_modes.length && t.editModes === null)
    p.editModes = a.edit_modes.filter((x): x is string => typeof x === "string");
  const name = nonEmpty(a.fileName);
  if (name && t.fileName === null) p.fileName = name;
  return p;
}

export interface AnnexReport {
  /** Takes the annex added a fact to, as the store answered them. */
  moved: SoundTake[];
  failed: { id: string; error: string }[];
}

/** Move this account's annex onto `takes` (the shelf as just read), then
 *  remove the key — only when every PATCH landed, so a failure retries on the
 *  next load. Resolves, never throws. */
export async function migrateAnnex(uid: string, takes: readonly SoundTake[]): Promise<AnnexReport> {
  const report: AnnexReport = { moved: [], failed: [] };
  let entries: Record<string, LegacyAnnex>;
  try {
    const raw = localStorage.getItem(legacyAnnexKey(uid));
    if (raw === null) return report;
    const v = JSON.parse(raw) as unknown;
    entries = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, LegacyAnnex>) : {};
  } catch {
    // Unreadable or unparseable: nothing can be moved from it, and keeping a
    // key nobody can read only re-fails every load.
    entries = {};
  }
  const byId = new Map(takes.map((t) => [t.id, t] as const));
  for (const [id, a] of Object.entries(entries)) {
    const t = byId.get(id);
    // A take the store no longer holds (a cleared example) has nothing to
    // carry the fact; that entry is done.
    if (!t || !a || typeof a !== "object") continue;
    const p = annexPatch(t, a);
    if (!Object.keys(p).length) continue;
    const r = await patchTake(id, p);
    if (r.ok) report.moved.push(r.data.take);
    else if (r.status !== 404) report.failed.push({ id, error: r.error });
  }
  if (!report.failed.length) {
    try {
      localStorage.removeItem(legacyAnnexKey(uid));
    } catch {
      /* a key that cannot be removed is moved again next load; the store wins, so that changes nothing */
    }
  }
  return report;
}
