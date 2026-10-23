"use client";

// THE STUDIO ARCHIVE — one file that holds an account's work, and the way back
// in.
//
// WHY THIS FILE EXISTS. IndexedDB is the only copy of everything this studio
// holds: Firebase is identity only (lib/firebase.ts), local mode syncs nothing
// (lib/localMode.ts), and `evictIdentity` (lib/identityEviction.ts) deletes every
// project, step, theme, asset and uploaded picture an account owns. Until this
// file there was no export, no import and no backup — the wipe was the end of
// the work, not a step a creator could plan around. This is the no-backend floor:
// a `.gravitone` archive a person downloads as their own act, and imports into
// any account on any machine.
//
// THE MODULES. This file is the door and the export half. The vocabulary and
// byte helpers are in studioArchiveFormat, the read-and-verify half in
// studioArchiveRead, the import half in studioArchiveImport; everything is
// re-exported from here.
//
// ── THE FORMAT ──────────────────────────────────────────────────────────────
//
// NDJSON, one JSON object per line, gzip-compressed wherever `CompressionStream`
// exists (every current browser, Node 18+). An importer sniffs the gzip magic
// bytes, so a plain archive (`gzip: false`, or a runtime without the stream)
// reads back identically.
//
//   line 1   header    {kind, format, dbVersion, exportedAt, from, scope, projectIds?}
//   then     rows      {"s":"<section>","r":<the stored record>}
//   last     manifest  {kind, counts, sha256}
//
// The manifest is a TRAILER, not a header, because the export is streamed: rows
// are read one at a time as the consumer pulls (a composed cut is ~5MB of plates
// in one step record, studioDb#getKeysByIndex), and the counts and digests are
// only known once the last row has gone. An archive with no trailer is a cut-off
// download and is refused as `truncated`.
//
// A SECTION DIGEST is SHA-256 over the newline-joined SHA-256 hex digests of its
// lines, each taken over the exact line text. A hash list rather than one hash
// over the section's bytes because WebCrypto has no incremental digest, and
// buffering the uploads section to hash it whole would defeat the streaming.
// Any changed byte in any row changes its section's digest.
//
// Upload bytes travel as base64 inside their row (`blob: {type, b64}`); every
// other row is the stored record verbatim. A record holding a value JSON cannot
// carry (a Blob outside uploads, a Map, a Date) is refused at export by name
// rather than written lossily.
//
// ── IMPORT IS ALL OR NOTHING ────────────────────────────────────────────────
//
// The whole archive is read, parsed, validated and digest-checked BEFORE the
// database is touched, and then written in ONE transaction over all five stores.
// A newer database version, a bad digest, a truncated file or a malformed row
// is an `ArchiveRefused` with a code, and nothing is written — not even the
// sections that verified. A failure inside the transaction aborts all of it.
//
// COLLISIONS, per row, on the primary key:
//
//   · no row with that id              → written as-is
//   · a row owned by THIS account      → `onCollision` decides:
//       skip       keep the resident row; the archive's is dropped (with its steps
//                  or its bytes)
//       replace    the archive's row wins; a replaced project's step set is the
//                  archive's (resident steps the archive does not have go), a
//                  replaced asset's old bytes go if it pointed elsewhere
//       duplicate  re-minted under a fresh id; a project's steps are re-keyed
//                  `${newId}:${phase}`
//   · a row owned by ANOTHER account   → ALWAYS re-minted, whatever the policy.
//       Replacing would hand that account's row to the importer; skipping would
//       silently drop the import. Neither is the importer's call to make.
//
// Every by-uid row (projects, themes, assets) is rewritten to the importing uid.
// References follow their targets: a project's `themeId`, a step's key, an
// asset's `upload:` / `proof:` pointer and the theme ids inside its meta are
// rewritten whenever the row they name was re-minted. New rows go in with `add`,
// not `put`, so an id that somehow exists after all aborts the transaction
// instead of overwriting a row nobody decided about.

import { readUploadPointer } from "@/lib/shelfPointers";
import {
  ASSETS_STORE,
  BY_PROJECT,
  BY_UID,
  PROJECTS_STORE,
  STEPS_STORE,
  THEMES_STORE,
  UPLOADS_STORE,
  getRecord,
  openDb,
} from "@/lib/studioDb";
import {
  ARCHIVE_FORMAT,
  ARCHIVE_KIND,
  MANIFEST_KIND,
  SECTIONS,
  emptyCounts,
  isObj,
  sectionDigest,
  sha256Hex,
  through,
  toB64,
  type ArchiveHeader,
  type ArchiveManifest,
  type ArchiveSection,
} from "@/lib/studioArchiveFormat";

export {
  ARCHIVE_EXT,
  ARCHIVE_FORMAT,
  ARCHIVE_KIND,
  ArchiveRefused,
  MANIFEST_KIND,
  SECTIONS,
} from "@/lib/studioArchiveFormat";
export type {
  ArchiveHeader,
  ArchiveManifest,
  ArchiveSection,
  CollisionPolicy,
  ImportReport,
  RefusalCode,
} from "@/lib/studioArchiveFormat";
export { inspectArchive } from "@/lib/studioArchiveRead";
export type { ArchiveSource } from "@/lib/studioArchiveRead";
export { importArchive } from "@/lib/studioArchiveImport";

const STORE_OF: Record<ArchiveSection, string> = {
  projects: PROJECTS_STORE,
  steps: STEPS_STORE,
  themes: THEMES_STORE,
  assets: ASSETS_STORE,
  uploads: UPLOADS_STORE,
};

/* ── export ───────────────────────────────────────────────────────────────── */

export interface ExportOptions {
  /** Only these projects (and their steps and the themes they name). Absent
   *  means the whole account, including the asset shelf and its uploads. */
  projectIds?: string[];
  /** Default: gzip wherever `CompressionStream` exists. */
  gzip?: boolean;
}

/** JSON.stringify that refuses what JSON would silently mangle. */
function strictJson(value: unknown): string {
  return JSON.stringify(value, function (this: unknown, key: string, v: unknown) {
    const raw = isObj(this) ? (this as Record<string, unknown>)[key] : v;
    if (
      raw instanceof Date ||
      raw instanceof Map ||
      raw instanceof Set ||
      (typeof Blob !== "undefined" && raw instanceof Blob) ||
      raw instanceof ArrayBuffer ||
      ArrayBuffer.isView(raw)
    ) {
      throw new Error(
        `studio archive: field "${key}" holds a ${Object.prototype.toString.call(raw)} that JSON cannot carry`,
      );
    }
    return v;
  });
}

interface ExportPlan {
  dbVersion: number;
  keys: Record<ArchiveSection, string[]>;
}

/** Every key the archive will hold, read in ONE readonly transaction — keys and
 *  the small rows needed to find them, never a step body or an upload's bytes. */
function planExport(db: IDBDatabase, uid: string, projectIds: string[] | undefined): Promise<ExportPlan> {
  const keys: Record<ArchiveSection, string[]> = { projects: [], steps: [], themes: [], assets: [], uploads: [] };
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PROJECTS_STORE, STEPS_STORE, THEMES_STORE, ASSETS_STORE], "readonly");
    tx.oncomplete = () => resolve({ dbVersion: db.version, keys });
    tx.onabort = () => reject(tx.error ?? new Error("archive: export read aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("archive: export read failed"));
    const projects = tx.objectStore(PROJECTS_STORE);
    const steps = tx.objectStore(STEPS_STORE);
    const themes = tx.objectStore(THEMES_STORE);

    const takeSteps = (projectId: string) => {
      const req = steps.index(BY_PROJECT).getAllKeys(projectId);
      req.onsuccess = () => keys.steps.push(...(req.result as string[]));
    };

    if (!projectIds) {
      const req = projects.index(BY_UID).getAllKeys(uid);
      req.onsuccess = () => {
        for (const id of req.result as string[]) {
          keys.projects.push(id);
          takeSteps(id);
        }
      };
      const th = themes.index(BY_UID).getAllKeys(uid);
      th.onsuccess = () => keys.themes.push(...(th.result as string[]));
      const as = tx.objectStore(ASSETS_STORE).index(BY_UID).getAll(uid);
      as.onsuccess = () => {
        const seen = new Set<string>();
        for (const row of as.result as { id: string; src?: unknown }[]) {
          keys.assets.push(row.id);
          const up = typeof row.src === "string" ? readUploadPointer(row.src) : null;
          if (up && !seen.has(up)) {
            seen.add(up);
            keys.uploads.push(up);
          }
        }
      };
      return;
    }

    // One project or a few: the closure is the project, its steps and the theme
    // it is built on, when this account owns that theme. The asset shelf is the
    // account's, not the project's, and stays out.
    const themeIds = new Set<string>();
    for (const id of projectIds) {
      const req = projects.get(id);
      req.onsuccess = () => {
        const row = req.result as { id: string; uid?: string; themeId?: string } | undefined;
        if (!row || row.uid !== uid) {
          tx.abort();
          reject(new Error(`archive: project ${id} is not one of this account's projects`));
          return;
        }
        keys.projects.push(row.id);
        takeSteps(row.id);
        if (row.themeId && !themeIds.has(row.themeId)) {
          themeIds.add(row.themeId);
          const t = themes.get(row.themeId);
          t.onsuccess = () => {
            const theme = t.result as { id: string; uid?: string } | undefined;
            if (theme && theme.uid === uid) keys.themes.push(theme.id);
          };
        }
      };
    }
  });
}

async function* archiveLines(uid: string, opts: ExportOptions): AsyncGenerator<string> {
  if (!uid) throw new Error("archive: no account to export");
  const db = await openDb();
  try {
    const plan = await planExport(db, uid, opts.projectIds);
    const header: ArchiveHeader = {
      kind: ARCHIVE_KIND,
      format: ARCHIVE_FORMAT,
      dbVersion: plan.dbVersion,
      exportedAt: Date.now(),
      from: uid,
      scope: opts.projectIds ? "project" : "account",
      ...(opts.projectIds ? { projectIds: [...opts.projectIds] } : {}),
    };
    yield JSON.stringify(header);

    const counts = emptyCounts();
    const sha256 = {} as Record<ArchiveSection, string>;
    for (const s of SECTIONS) {
      const digests: string[] = [];
      for (const key of plan.keys[s]) {
        // One read per row, as the consumer pulls. A row deleted since the plan
        // is simply absent; the trailer counts what was actually written.
        const rec = await getRecord<Record<string, unknown>>(db, STORE_OF[s], key);
        if (!rec) continue;
        let row: Record<string, unknown> = rec;
        if (s === "uploads") {
          const { blob, ...rest } = rec;
          if (!(blob instanceof Blob)) throw new Error(`archive: upload ${key} holds no bytes`);
          row = { ...rest, blob: { type: blob.type, b64: toB64(new Uint8Array(await blob.arrayBuffer())) } };
        }
        const line = strictJson({ s, r: row });
        digests.push(await sha256Hex(line));
        counts[s]++;
        yield line;
      }
      sha256[s] = await sectionDigest(digests);
    }
    const manifest: ArchiveManifest = { kind: MANIFEST_KIND, counts, sha256 };
    yield JSON.stringify(manifest);
  } finally {
    db.close();
  }
}

/**
 * The whole account as a `.gravitone` archive stream: every project and step,
 * every theme, the asset shelf and the bytes of every uploaded reference.
 *
 * Lazy and pulled: nothing is read until the consumer reads, and only one row is
 * in memory at a time. `new Response(stream).blob()` makes a downloadable file.
 */
export function exportAccount(uid: string, opts: ExportOptions = {}): ReadableStream<Uint8Array> {
  const lines = archiveLines(uid, opts);
  const enc = new TextEncoder();
  const raw = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        const next = await lines.next();
        if (next.done) ctrl.close();
        else ctrl.enqueue(enc.encode(next.value + "\n"));
      } catch (e) {
        ctrl.error(e);
      }
    },
    async cancel() {
      await lines.return(undefined);
    },
  });
  if (opts.gzip === false || typeof CompressionStream === "undefined") return raw;
  return through(raw, new CompressionStream("gzip"));
}

/** One project as an archive — the project, its steps and its theme. Importing
 *  it into another account (or this one, under `duplicate`) is how a project is
 *  handed on. */
export function exportProject(
  uid: string,
  projectId: string,
  opts: Omit<ExportOptions, "projectIds"> = {},
): ReadableStream<Uint8Array> {
  return exportAccount(uid, { ...opts, projectIds: [projectId] });
}
