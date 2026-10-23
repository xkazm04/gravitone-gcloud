import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";
import { AppError, err, errorMessage, ok, type Result } from "@gt/domain/errors";

// THE `.gravitone` ARCHIVE, READ AND WRITTEN ON THE SERVER (Phase 4 wave D, L42).
//
// v1's format (lib/studioArchive.ts) is kept to the byte, both ways, because the browser that
// still holds the v1 rows reads what this writes: NDJSON, gzip when the bytes start 1f 8b,
//   line 1   header    {kind, format, dbVersion, exportedAt, from, scope, projectIds?}
//   then     rows      {"s":"<section>","r":<the stored record>}
//   last     manifest  {kind, counts, sha256}
// and a section's digest is SHA-256 over the newline-joined SHA-256 hex of each row's exact
// line text. Every refusal v1 names (`not-an-archive`, `newer-format`, `newer-db-version`,
// `malformed`, `truncated`, `corrupt-section`) is refused here by the same name, as the
// AppError's `detail`, with v1's sentence - the page shows one vocabulary whichever side read it.
//
// WHY A SECOND READER. v1's lives in a "use client" module over IndexedDB (it reads the live
// database version from `openDb`), and the server never trusts the browser's verdict on bytes it
// is about to write from: the page verifies through v1's `inspectArchive` first (so a corrupt
// file is refused before it is uploaded), and the route verifies again here.
//
// UPGRADED (registry import-normalization/import-validation, "sizing caps that guard an
// untrusted parse"): v1 read whatever it was handed. Here the compressed body, the inflated text
// and the line count are capped before anything is parsed - a 1 MB gzip that inflates to 10 GB
// is refused as `too-large`, not discovered as an out-of-memory.

export const ARCHIVE_KIND = "gravitone-archive";
export const MANIFEST_KIND = "gravitone-archive-manifest";
export const ARCHIVE_FORMAT = 1;
/** v1's studioDb DB_VERSION (not exported there); pinned to it by tests/next-server/import-archive.test.ts,
 *  which opens the real v1 database and reads its version. */
export const V1_DB_VERSION = 5;

export const SECTIONS = ["projects", "steps", "themes", "assets", "uploads"] as const;
export type Section = (typeof SECTIONS)[number];

export type ArchiveCaps = { readonly bodyBytes: number; readonly plainBytes: number; readonly lines: number };
/** A composed cut is ~5 MB of plates (v1 studioDb); an account of a few dozen projects fits well inside. */
export const ARCHIVE_CAPS: ArchiveCaps = { bodyBytes: 128 * 2 ** 20, plainBytes: 512 * 2 ** 20, lines: 250_000 };

export type RefusalCode = "not-an-archive" | "newer-format" | "newer-db-version" | "malformed" | "truncated" | "corrupt-section" | "too-large";

export type Row = Readonly<Record<string, unknown>>;
export type Header = {
  readonly kind: typeof ARCHIVE_KIND;
  readonly format: number;
  readonly dbVersion: number;
  readonly exportedAt: number;
  readonly from: string;
  readonly scope: "account" | "project";
  readonly projectIds?: readonly string[];
};
export type Manifest = { readonly kind: typeof MANIFEST_KIND; readonly counts: Readonly<Record<Section, number>>; readonly sha256: Readonly<Record<Section, string>> };

export type Archive = {
  readonly header: Header;
  readonly manifest: Manifest;
  readonly rows: Readonly<Record<Section, readonly Row[]>>;
  /** The archive's bytes as received (compressed or not). */
  readonly bytes: number;
  /** SHA-256 of the received bytes: what an import receipt's token binds. */
  readonly digest: string;
};

const refuse = (code: RefusalCode, message: string): Result<never> => err(code === "too-large" ? "invalid" : "refused", message, { detail: code });

const hex = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");
const sectionDigest = (rowDigests: readonly string[]): string => hex(rowDigests.join("\n"));
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** `upload:<id>` (lib/assets.ts UPLOAD_SCHEME) - the one pointer the archive's closure check reads. */
export function uploadOf(src: unknown): string | null {
  return typeof src === "string" && src.startsWith("upload:") && src.length > 7 ? src.slice(7) : null;
}

const headerSchema = z.looseObject({
  kind: z.literal(ARCHIVE_KIND),
  format: z.number(),
  dbVersion: z.number(),
  exportedAt: z.number(),
  from: z.string(),
  scope: z.enum(["account", "project"]),
  projectIds: z.array(z.string()).optional(),
});
const manifestSchema = z.looseObject({
  kind: z.literal(MANIFEST_KIND),
  counts: z.record(z.string(), z.number()),
  sha256: z.record(z.string(), z.string()),
});

/** v1's `checkRow`, sentence for sentence. */
function checkRow(s: Section, r: unknown): string | null {
  if (!isObj(r) || !isStr(r["id"])) return "a row with no id";
  const id = String(r["id"]);
  switch (s) {
    case "projects":
    case "themes":
      return typeof r["uid"] === "string" ? null : `${s} row ${id} has no uid`;
    case "steps": {
      const projectId = r["projectId"];
      const phase = r["phase"];
      if (!isStr(projectId) || !isStr(phase)) return `step ${id} has no project or phase`;
      return id === `${projectId}:${phase}` ? null : `step ${id} is not keyed ${projectId}:${phase}`;
    }
    case "assets":
      return typeof r["uid"] === "string" && typeof r["src"] === "string" ? null : `asset ${id} has no uid or src`;
    case "uploads": {
      const b = r["blob"];
      return isObj(b) && typeof b["b64"] === "string" && typeof b["type"] === "string" ? null : `upload ${id} carries no bytes`;
    }
  }
}

function plainText(bytes: Uint8Array, caps: ArchiveCaps): Result<string> {
  let plain: Uint8Array = bytes;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      plain = gunzipSync(bytes, { maxOutputLength: caps.plainBytes });
    } catch (e) {
      if (e instanceof RangeError || (e instanceof Error && "code" in e && e.code === "ERR_BUFFER_TOO_LARGE")) return refuse("too-large", `the archive inflates past ${caps.plainBytes} bytes`);
      return refuse("malformed", `the archive could not be read: ${errorMessage(e)}`);
    }
  }
  try {
    return ok(new TextDecoder("utf-8", { fatal: true }).decode(plain));
  } catch (e) {
    return refuse("malformed", `the archive could not be read: ${errorMessage(e)}`);
  }
}

/** v1's line reader: split on \n, drop a trailing \r, skip empty lines. */
function linesOf(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.length > 0);
}

/**
 * Read, validate and digest-check a whole archive (v1 `parseArchive`). Nothing is written by a
 * read; a refusal names v1's code in `detail`.
 */
export function readArchive(bytes: Uint8Array, caps: ArchiveCaps = ARCHIVE_CAPS): Result<Archive> {
  if (bytes.byteLength > caps.bodyBytes) return refuse("too-large", `the archive is ${bytes.byteLength} bytes; an import takes at most ${caps.bodyBytes}`);
  if (bytes.byteLength === 0) return refuse("not-an-archive", "the file is empty");
  const text = plainText(bytes, caps);
  if (!text.ok) return text;
  const lines = linesOf(text.value);
  if (lines.length > caps.lines) return refuse("too-large", `the archive holds ${lines.length} lines; an import takes at most ${caps.lines}`);
  const rows: Record<Section, Row[]> = { projects: [], steps: [], themes: [], assets: [], uploads: [] };
  const digests: Record<Section, string[]> = { projects: [], steps: [], themes: [], assets: [], uploads: [] };
  const ids: Record<Section, Set<string>> = { projects: new Set(), steps: new Set(), themes: new Set(), assets: new Set(), uploads: new Set() };
  let header: Header | null = null;
  let manifest: Manifest | null = null;
  let n = 0;
  for (const line of lines) {
    n++;
    const parsed = parseJsonAt(`archive line ${n}`, z.unknown(), line);
    if (!parsed.ok) return refuse("malformed", `line ${n} of the archive is not JSON`);
    const obj: unknown = parsed.value;
    if (header === null) {
      if (!isObj(obj) || obj["kind"] !== ARCHIVE_KIND) return refuse("not-an-archive", "this file is not a studio archive");
      if (typeof obj["format"] !== "number" || typeof obj["dbVersion"] !== "number") return refuse("malformed", "the archive header carries no format or database version");
      if (obj["format"] > ARCHIVE_FORMAT) return refuse("newer-format", `archive format ${obj["format"]} is newer than this studio reads (${ARCHIVE_FORMAT}) - update the app, then import`);
      if (obj["dbVersion"] > V1_DB_VERSION) return refuse("newer-db-version", `archive from database version ${obj["dbVersion"]}; this studio is at version ${V1_DB_VERSION} - update the app, then import`);
      const h = headerSchema.safeParse(obj);
      if (!h.success) return refuse("malformed", "the archive header is not a studio archive header");
      header = { kind: ARCHIVE_KIND, format: h.data.format, dbVersion: h.data.dbVersion, exportedAt: h.data.exportedAt, from: h.data.from, scope: h.data.scope, ...(h.data.projectIds === undefined ? {} : { projectIds: h.data.projectIds }) };
      continue;
    }
    if (manifest !== null) return refuse("malformed", "the archive has rows after its manifest");
    if (isObj(obj) && obj["kind"] === MANIFEST_KIND) {
      const m = manifestSchema.safeParse(obj);
      if (!m.success) return refuse("corrupt-section", "the archive manifest is unreadable");
      const pick = (rec: Record<string, unknown>, s: Section) => rec[s];
      manifest = {
        kind: MANIFEST_KIND,
        counts: Object.fromEntries(SECTIONS.map((s) => [s, Number(pick(m.data.counts, s) ?? -1)])) as Record<Section, number>,
        sha256: Object.fromEntries(SECTIONS.map((s) => [s, String(pick(m.data.sha256, s) ?? "")])) as Record<Section, string>,
      };
      continue;
    }
    const s = isObj(obj) ? SECTIONS.find((x) => x === obj["s"]) : undefined;
    if (s === undefined || !isObj(obj)) return refuse("malformed", `line ${n} names no archive section`);
    const bad = checkRow(s, obj["r"]);
    if (bad !== null) return refuse("malformed", `${s}: ${bad}`);
    const r = obj["r"] as Row;
    const id = String(r["id"]);
    if (ids[s].has(id)) return refuse("malformed", `${s}: ${id} appears twice`);
    ids[s].add(id);
    rows[s].push(r);
    digests[s].push(hex(line));
  }
  if (header === null) return refuse("not-an-archive", "the file is empty");
  if (manifest === null) return refuse("truncated", "the archive ends before its manifest - the file is incomplete");
  const m = manifest;
  const corrupt = SECTIONS.filter((s) => m.counts[s] !== rows[s].length || m.sha256[s] !== sectionDigest(digests[s]));
  if (corrupt.length > 0) return refuse("corrupt-section", `section${corrupt.length > 1 ? "s" : ""} ${corrupt.join(", ")} failed verification`);
  for (const st of rows.steps) if (!ids.projects.has(String(st["projectId"]))) return refuse("malformed", `step ${String(st["id"])} belongs to no project in the archive`);
  const pointed = new Set(rows.assets.map((a) => uploadOf(a["src"])).filter((x): x is string => x !== null));
  for (const u of rows.uploads) if (!pointed.has(String(u["id"]))) return refuse("malformed", `upload ${String(u["id"])} belongs to no asset in the archive`);
  return ok({ header, manifest, rows, bytes: bytes.byteLength, digest: hex(bytes) });
}

/* ── the writer ───────────────────────────────────────────────────────────── */

/** One row's line exactly as v1's `strictJson({ s, r })` writes it. */
export const rowLine = (s: Section, r: Row): string => JSON.stringify({ s, r });

/**
 * An archive from rows already in v1's stored shapes (v1 `archiveLines`): header, rows section
 * by section, then the manifest the rows digest to. gzip, as v1 writes whenever it can.
 */
export function writeArchive(header: Omit<Header, "kind" | "format" | "dbVersion">, rows: Readonly<Record<Section, readonly Row[]>>, opts: { readonly gzip?: boolean } = {}): Uint8Array {
  const out: string[] = [JSON.stringify({ kind: ARCHIVE_KIND, format: ARCHIVE_FORMAT, dbVersion: V1_DB_VERSION, exportedAt: header.exportedAt, from: header.from, scope: header.scope, ...(header.projectIds === undefined ? {} : { projectIds: [...header.projectIds] }) })];
  const counts = {} as Record<Section, number>;
  const sha256 = {} as Record<Section, string>;
  for (const s of SECTIONS) {
    const digests: string[] = [];
    for (const r of rows[s]) {
      const line = rowLine(s, r);
      digests.push(hex(line));
      out.push(line);
    }
    counts[s] = digests.length;
    sha256[s] = sectionDigest(digests);
  }
  out.push(JSON.stringify({ kind: MANIFEST_KIND, counts, sha256 }));
  const text = new TextEncoder().encode(`${out.join("\n")}\n`);
  return opts.gzip === false ? text : new Uint8Array(gzipSync(text));
}

/** The refusal code of a failed read, when it is one of the archive's. */
export function refusalOf(e: AppError): RefusalCode | undefined {
  const d = e.detail;
  return d === "not-an-archive" || d === "newer-format" || d === "newer-db-version" || d === "malformed" || d === "truncated" || d === "corrupt-section" || d === "too-large" ? d : undefined;
}
