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

import { promotedId, proofPointer, readProofPointer, readUploadPointer, uploadPointer } from "@/lib/assets";
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

export const ARCHIVE_KIND = "gravitone-archive";
export const MANIFEST_KIND = "gravitone-archive-manifest";
/** The archive format itself — bumped only when the line grammar changes. The
 *  stored-record schema is versioned separately, by `dbVersion`. */
export const ARCHIVE_FORMAT = 1;
/** The suggested file extension. The content is NDJSON, usually gzipped. */
export const ARCHIVE_EXT = ".gravitone";

export const SECTIONS = ["projects", "steps", "themes", "assets", "uploads"] as const;
export type ArchiveSection = (typeof SECTIONS)[number];

const STORE_OF: Record<ArchiveSection, string> = {
  projects: PROJECTS_STORE,
  steps: STEPS_STORE,
  themes: THEMES_STORE,
  assets: ASSETS_STORE,
  uploads: UPLOADS_STORE,
};

export interface ArchiveHeader {
  kind: typeof ARCHIVE_KIND;
  format: number;
  /** The studio database version the rows were read from (studioDb). */
  dbVersion: number;
  exportedAt: number;
  /** The exporting account. Never written into any store on import. */
  from: string;
  scope: "account" | "project";
  projectIds?: string[];
}

export interface ArchiveManifest {
  kind: typeof MANIFEST_KIND;
  counts: Record<ArchiveSection, number>;
  sha256: Record<ArchiveSection, string>;
}

export type RefusalCode =
  | "not-an-archive"
  | "newer-format"
  | "newer-db-version"
  | "malformed"
  | "truncated"
  | "corrupt-section"
  | "gzip-unsupported";

/** An archive this code will not import, and why. Nothing was written. */
export class ArchiveRefused extends Error {
  readonly code: RefusalCode;
  constructor(code: RefusalCode, message: string) {
    super(message);
    this.name = "ArchiveRefused";
    this.code = code;
  }
}

export type CollisionPolicy = "skip" | "replace" | "duplicate";

/** What an import wrote — the counts named as `EvictionReport` names them, so
 *  a surface can put "took" and "brought back" side by side. */
export interface ImportReport {
  uid: string;
  projects: number;
  steps: number;
  themes: number;
  assets: number;
  uploads: number;
  /** Rows (projects, themes, assets) kept as resident under `skip`. */
  skipped: number;
  /** Rows overwritten under `replace`. */
  replaced: number;
  /** Rows written under a fresh id (projects, themes, assets, uploads). */
  reminted: number;
  /** Archive id → the id it was written under, for every re-minted row. */
  remap: Record<string, string>;
}

/* ── shared helpers ───────────────────────────────────────────────────────── */

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

const sectionDigest = (rowDigests: string[]) => sha256Hex(rowDigests.join("\n"));

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** A byte stream through a (de)compressor. The DOM typings declare the
 *  compressor's writable side as `BufferSource`, which a `Uint8Array` stream is
 *  but TypeScript's variance cannot see; the cast is that and nothing more. */
const through = (
  s: ReadableStream<Uint8Array>,
  t: CompressionStream | DecompressionStream,
): ReadableStream<Uint8Array> =>
  s.pipeThrough(t as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function emptyCounts(): Record<ArchiveSection, number> {
  return { projects: 0, steps: 0, themes: 0, assets: 0, uploads: 0 };
}

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

/* ── read & verify ────────────────────────────────────────────────────────── */

export type ArchiveSource = Blob | ReadableStream<Uint8Array> | Uint8Array | ArrayBuffer | string;

function toStream(src: ArchiveSource): ReadableStream<Uint8Array> {
  if (typeof src === "string") return new Blob([src]).stream();
  if (src instanceof Blob) return src.stream();
  if (src instanceof Uint8Array) return new Blob([src as Uint8Array<ArrayBuffer>]).stream();
  if (src instanceof ArrayBuffer) return new Blob([src]).stream();
  return src;
}

/** The archive's bytes, un-gzipped when they start with the gzip magic. */
async function plainStream(src: ArchiveSource): Promise<ReadableStream<Uint8Array>> {
  const reader = toStream(src).getReader();
  const first = await reader.read();
  const head = first.value ?? new Uint8Array(0);
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      if (head.length) ctrl.enqueue(head);
      if (first.done) ctrl.close();
    },
    async pull(ctrl) {
      const next = await reader.read();
      if (next.done) ctrl.close();
      else ctrl.enqueue(next.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  if (!(head[0] === 0x1f && head[1] === 0x8b)) return body;
  if (typeof DecompressionStream === "undefined") {
    throw new ArchiveRefused("gzip-unsupported", "this archive is gzip-compressed and this runtime cannot decompress it");
  }
  return through(body, new DecompressionStream("gzip"));
}

async function* readLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder("utf-8", { fatal: true });
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buf += done ? dec.decode() : dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        if (line) yield line;
      }
      if (done) break;
    }
  } catch (e) {
    if (e instanceof ArchiveRefused) throw e;
    throw new ArchiveRefused("malformed", `the archive could not be read: ${(e as Error)?.message ?? e}`);
  }
  const tail = buf.replace(/\r$/, "");
  if (tail) yield tail;
}

type Row = Record<string, unknown>;

interface ParsedArchive {
  header: ArchiveHeader;
  manifest: ArchiveManifest;
  rows: Record<ArchiveSection, Row[]>;
}

function checkRow(s: ArchiveSection, r: unknown): string | null {
  if (!isObj(r) || !isStr(r.id)) return "a row with no id";
  switch (s) {
    case "projects":
    case "themes":
      return typeof r.uid === "string" ? null : `${s} row ${r.id} has no uid`;
    case "steps":
      if (!isStr(r.projectId) || !isStr(r.phase)) return `step ${r.id} has no project or phase`;
      return r.id === `${r.projectId}:${r.phase}` ? null : `step ${r.id} is not keyed ${r.projectId}:${r.phase}`;
    case "assets":
      return typeof r.uid === "string" && typeof r.src === "string" ? null : `asset ${r.id} has no uid or src`;
    case "uploads":
      return isObj(r.blob) && typeof r.blob.b64 === "string" && typeof r.blob.type === "string"
        ? null
        : `upload ${r.id} carries no bytes`;
  }
}

/** Read, validate and digest-check a whole archive. Throws `ArchiveRefused`. */
async function parseArchive(src: ArchiveSource, liveDbVersion: number): Promise<ParsedArchive> {
  const lines = readLines(await plainStream(src));
  const rows: Record<ArchiveSection, Row[]> = { projects: [], steps: [], themes: [], assets: [], uploads: [] };
  const digests: Record<ArchiveSection, string[]> = { projects: [], steps: [], themes: [], assets: [], uploads: [] };
  const ids: Record<ArchiveSection, Set<string>> = {
    projects: new Set(),
    steps: new Set(),
    themes: new Set(),
    assets: new Set(),
    uploads: new Set(),
  };
  let header: ArchiveHeader | null = null;
  let manifest: ArchiveManifest | null = null;
  let n = 0;

  const json = (line: string): unknown => {
    try {
      return JSON.parse(line);
    } catch {
      throw new ArchiveRefused("malformed", `line ${n} of the archive is not JSON`);
    }
  };

  for await (const line of lines) {
    n++;
    const obj = json(line);
    if (!header) {
      if (!isObj(obj) || obj.kind !== ARCHIVE_KIND) {
        throw new ArchiveRefused("not-an-archive", "this file is not a studio archive");
      }
      if (typeof obj.format !== "number" || typeof obj.dbVersion !== "number") {
        throw new ArchiveRefused("malformed", "the archive header carries no format or database version");
      }
      if (obj.format > ARCHIVE_FORMAT) {
        throw new ArchiveRefused(
          "newer-format",
          `archive format ${obj.format} is newer than this studio reads (${ARCHIVE_FORMAT}) - update the app, then import`,
        );
      }
      if (obj.dbVersion > liveDbVersion) {
        throw new ArchiveRefused(
          "newer-db-version",
          `archive from database version ${obj.dbVersion}; this studio is at version ${liveDbVersion} - update the app, then import`,
        );
      }
      header = obj as unknown as ArchiveHeader;
      continue;
    }
    if (manifest) throw new ArchiveRefused("malformed", "the archive has rows after its manifest");
    if (isObj(obj) && obj.kind === MANIFEST_KIND) {
      manifest = obj as unknown as ArchiveManifest;
      continue;
    }
    if (!isObj(obj) || !SECTIONS.includes(obj.s as ArchiveSection)) {
      throw new ArchiveRefused("malformed", `line ${n} names no archive section`);
    }
    const s = obj.s as ArchiveSection;
    const bad = checkRow(s, obj.r);
    if (bad) throw new ArchiveRefused("malformed", `${s}: ${bad}`);
    const r = obj.r as Row;
    if (ids[s].has(r.id as string)) throw new ArchiveRefused("malformed", `${s}: ${r.id} appears twice`);
    ids[s].add(r.id as string);
    rows[s].push(r);
    digests[s].push(await sha256Hex(line));
  }

  if (!header) throw new ArchiveRefused("not-an-archive", "the file is empty");
  if (!manifest) throw new ArchiveRefused("truncated", "the archive ends before its manifest - the file is incomplete");

  const corrupt: string[] = [];
  for (const s of SECTIONS) {
    const want = manifest.counts?.[s];
    const sha = manifest.sha256?.[s];
    if (want !== rows[s].length || sha !== (await sectionDigest(digests[s]))) corrupt.push(s);
  }
  if (corrupt.length) {
    throw new ArchiveRefused("corrupt-section", `section${corrupt.length > 1 ? "s" : ""} ${corrupt.join(", ")} failed verification`);
  }

  // The closure holds: every step belongs to an archived project, every upload
  // to an archived asset. Rows that reach nothing would land unreachable.
  for (const st of rows.steps) {
    if (!ids.projects.has(st.projectId as string)) {
      throw new ArchiveRefused("malformed", `step ${st.id} belongs to no project in the archive`);
    }
  }
  const pointed = new Set(
    rows.assets.map((a) => readUploadPointer(a.src as string)).filter((x): x is string => !!x),
  );
  for (const u of rows.uploads) {
    if (!pointed.has(u.id as string)) throw new ArchiveRefused("malformed", `upload ${u.id} belongs to no asset in the archive`);
  }
  return { header, manifest, rows };
}

/** Read and verify an archive without writing anything: its header and its
 *  manifest, or the `ArchiveRefused` an import would throw. */
export async function inspectArchive(src: ArchiveSource): Promise<{ header: ArchiveHeader; manifest: ArchiveManifest }> {
  const db = await openDb();
  let live: number;
  try {
    live = db.version;
  } finally {
    db.close();
  }
  const { header, manifest } = await parseArchive(src, live);
  return { header, manifest };
}

/* ── import ───────────────────────────────────────────────────────────────── */

type Decision = "new" | "skip" | "replace" | "remint";

const PREFIX: Record<"projects" | "themes" | "assets" | "uploads", string> = {
  projects: "p",
  themes: "th",
  assets: "as",
  uploads: "up",
};

/**
 * Bring an archive's work into `uid`'s shelf. Verified in full first, then
 * written in ONE transaction — see the header for the collision rules. Rejects
 * with `ArchiveRefused` (nothing written) or with the storage error that aborted
 * the transaction (nothing written either).
 */
export async function importArchive(
  src: ArchiveSource,
  uid: string,
  opts: { onCollision: CollisionPolicy },
): Promise<ImportReport> {
  if (!uid) throw new Error("archive: no account to import into");
  const policy = opts.onCollision;
  const db = await openDb();
  try {
    const { rows } = await parseArchive(src, db.version);
    // Bytes decoded before the transaction opens: nothing awaited may sit
    // between a transaction's requests, or it commits half-way.
    const blobs = new Map<string, Row>();
    for (const u of rows.uploads) {
      const { blob, ...rest } = u as { blob: { type: string; b64: string } } & Row;
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = fromB64(blob.b64);
      } catch {
        throw new ArchiveRefused("malformed", `upload ${u.id} is not valid base64`);
      }
      blobs.set(u.id as string, { ...rest, blob: new Blob([bytes], { type: blob.type }) });
    }
    return await writeArchive(db, rows, blobs, uid, policy);
  } finally {
    db.close();
  }
}

function writeArchive(
  db: IDBDatabase,
  rows: Record<ArchiveSection, Row[]>,
  blobs: Map<string, Row>,
  uid: string,
  policy: CollisionPolicy,
): Promise<ImportReport> {
  const report: ImportReport = {
    uid,
    projects: 0,
    steps: 0,
    themes: 0,
    assets: 0,
    uploads: 0,
    skipped: 0,
    replaced: 0,
    reminted: 0,
    remap: {},
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([PROJECTS_STORE, STEPS_STORE, THEMES_STORE, ASSETS_STORE, UPLOADS_STORE], "readwrite");
    // The request's own error, caught before the transaction loses it — the
    // same capture studioDb#runTx does, for the same measured reason.
    let cause: unknown = null;
    tx.addEventListener(
      "error",
      (e) => {
        const target = e.target as IDBRequest | null;
        if (!cause && target && "error" in target) cause = target.error;
      },
      true,
    );
    tx.oncomplete = () => resolve(report);
    tx.onerror = () => reject(cause ?? tx.error ?? new Error("archive: import failed"));
    tx.onabort = () => reject(cause ?? tx.error ?? new Error("archive: import aborted"));

    const store = {
      projects: tx.objectStore(PROJECTS_STORE),
      steps: tx.objectStore(STEPS_STORE),
      themes: tx.objectStore(THEMES_STORE),
      assets: tx.objectStore(ASSETS_STORE),
      uploads: tx.objectStore(UPLOADS_STORE),
    };

    // ── 1 · read what is resident under every archive id, inside this tx ──
    const owner = { projects: new Map<string, unknown>(), themes: new Map<string, unknown>() };
    const residentAssets = new Map<string, Row>();
    const residentUploads = new Set<string>();
    const residentSteps = new Map<string, IDBValidKey[]>();
    let pending = 0;
    const settle = () => {
      if (--pending > 0) return;
      try {
        write();
      } catch (e) {
        cause = cause ?? e;
        try {
          tx.abort();
        } catch {
          /* already finishing */
        }
        reject(e);
      }
    };
    const read = <T>(req: IDBRequest<T>, take: (v: T) => void) => {
      pending++;
      req.onsuccess = () => {
        take(req.result);
        settle();
      };
    };
    for (const p of rows.projects) {
      const id = p.id as string;
      read(store.projects.get(id), (r) => r && owner.projects.set(id, (r as Row).uid));
      read(store.steps.index(BY_PROJECT).getAllKeys(id), (k) => residentSteps.set(id, k ?? []));
    }
    for (const t of rows.themes) {
      const id = t.id as string;
      read(store.themes.get(id), (r) => r && owner.themes.set(id, (r as Row).uid));
    }
    for (const a of rows.assets) {
      const id = a.id as string;
      read(store.assets.get(id), (r) => r && residentAssets.set(id, r as Row));
    }
    for (const u of rows.uploads) {
      const id = u.id as string;
      read(store.uploads.count(id), (c) => c > 0 && residentUploads.add(id));
    }
    if (pending === 0) {
      pending = 1;
      settle();
    }

    // ── 2 · decide and write, synchronously, in the same transaction ──
    function write() {
      const minted = new Set<string>();
      const mint = (kind: keyof typeof PREFIX) => {
        let id: string;
        do {
          id = `${PREFIX[kind]}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        } while (minted.has(id));
        minted.add(id);
        return id;
      };
      const decide = (resident: boolean, residentUid: unknown): Decision => {
        if (!resident) return "new";
        if (residentUid !== uid) return "remint";
        return policy === "skip" ? "skip" : policy === "replace" ? "replace" : "remint";
      };
      const count = (d: Decision) => {
        if (d === "skip") report.skipped++;
        else if (d === "replace") report.replaced++;
        else if (d === "remint") report.reminted++;
      };

      // Themes first: projects and assets point at them.
      const themeId = new Map<string, string>();
      for (const t of rows.themes) {
        const id = t.id as string;
        const d = decide(owner.themes.has(id), owner.themes.get(id));
        count(d);
        if (d === "skip") continue;
        const to = d === "remint" ? mint("themes") : id;
        if (to !== id) {
          themeId.set(id, to);
          report.remap[id] = to;
        }
        const row = { ...t, id: to, uid };
        if (d === "replace") store.themes.put(row);
        else store.themes.add(row);
        report.themes++;
      }

      const stepsOf = new Map<string, Row[]>();
      for (const st of rows.steps) {
        const list = stepsOf.get(st.projectId as string) ?? [];
        list.push(st);
        stepsOf.set(st.projectId as string, list);
      }
      for (const p of rows.projects) {
        const id = p.id as string;
        const d = decide(owner.projects.has(id), owner.projects.get(id));
        count(d);
        if (d === "skip") continue;
        const to = d === "remint" ? mint("projects") : id;
        if (to !== id) report.remap[id] = to;
        const row: Row = { ...p, id: to, uid };
        if (typeof p.themeId === "string" && themeId.has(p.themeId)) row.themeId = themeId.get(p.themeId);
        if (d === "replace") store.projects.put(row);
        else store.projects.add(row);
        report.projects++;
        // The step set is the archive's. Under replace that drops resident
        // steps the archive does not hold; under "new" the only resident steps
        // are orphans of a project that no longer exists, and they go too.
        if (d !== "remint") for (const k of residentSteps.get(id) ?? []) store.steps.delete(k);
        for (const st of stepsOf.get(id) ?? []) {
          store.steps.put({ ...st, id: `${to}:${st.phase as string}`, projectId: to });
          report.steps++;
        }
      }

      // Assets, and the bytes behind them.
      const uploadTo = new Map<string, string>();
      for (const a of rows.assets) {
        const id = a.id as string;
        const resident = residentAssets.get(id);
        const d = decide(!!resident, resident?.uid);
        count(d);
        if (d === "skip") continue;
        const row: Row = { ...a, uid };
        const meta: Row | undefined = isObj(a.meta) ? { ...a.meta } : undefined;
        if (meta) row.meta = meta;
        let to = d === "remint" ? mint("assets") : id;

        const proof = readProofPointer(a.src as string);
        if (proof && themeId.has(proof.themeId)) {
          const th = themeId.get(proof.themeId)!;
          row.src = proofPointer(th, proof.proofId);
          // A promoted proof's id is content-addressed (assets#promotedId), so
          // it follows its theme rather than taking a random one.
          if (id === promotedId(proof.themeId, proof.proofId)) to = promotedId(th, proof.proofId);
        }
        if (meta && typeof meta.themeId === "string" && themeId.has(meta.themeId)) {
          meta.themeId = themeId.get(meta.themeId);
        }
        if (meta && isObj(meta.provenance) && Array.isArray(meta.provenance.parentIds)) {
          meta.provenance = {
            ...meta.provenance,
            parentIds: meta.provenance.parentIds.map((x: unknown) =>
              typeof x === "string" && themeId.has(x) ? themeId.get(x) : x,
            ),
          };
        }

        const up = readUploadPointer(a.src as string);
        if (up && blobs.has(up)) {
          let target = uploadTo.get(up);
          if (!target) {
            const residentUp = resident ? readUploadPointer(String(resident.src)) : null;
            const overwrite = d === "replace" && residentUp === up;
            target = residentUploads.has(up) && !overwrite ? mint("uploads") : up;
            uploadTo.set(up, target);
            const bytes = { ...blobs.get(up)!, id: target };
            if (overwrite) store.uploads.put(bytes);
            else store.uploads.add(bytes);
            report.uploads++;
            if (target !== up) {
              report.reminted++;
              report.remap[up] = target;
            }
          }
          row.src = uploadPointer(target);
          if (meta && meta.uploadId === up) meta.uploadId = target;
        }
        // A replaced row that pointed at OTHER bytes leaves them unreachable;
        // they go with it, as lib/assets#deleteAsset would take them.
        if (d === "replace" && resident) {
          const old = readUploadPointer(String(resident.src));
          if (old && old !== readUploadPointer(String(row.src))) store.uploads.delete(old);
        }

        if (to !== id) report.remap[id] = to;
        row.id = to;
        if (d === "replace") store.assets.put(row);
        else store.assets.add(row);
        report.assets++;
      }
    }
  });
}
