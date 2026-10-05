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
import { uploadTake } from "@/lib/sound/client";

import { mergeAnnex } from "./soundAnnex";
import { uploadMetaOf, type Annex } from "./soundAdapter";

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

  const annex: Record<string, Annex> = {};
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
      const { meta: up, annex: ax } = uploadMetaOf(meta, { id: a.id, title: a.name, createdAt: a.createdAt, fileName: blob ? fileName : undefined });
      annex[a.id] = ax;
      report.pushed++;
      const r = await uploadTake(blob ?? new Blob([]), fileName, up);
      if (!r.ok) report.failed.push({ id: a.id, error: r.error });
      else report.landed++;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  mergeAnnex(uid, annex);
  if (!report.failed.length) markMigrated(uid);
  return report;
}
