"use client";

// The studio archive's vocabulary: the format constants, the header, manifest and
// report shapes, and the byte/hash helpers the export, read and import halves
// share. The format and its rules are documented in lib/studioArchive.ts.

export const ARCHIVE_KIND = "gravitone-archive";
export const MANIFEST_KIND = "gravitone-archive-manifest";
/** The archive format itself — bumped only when the line grammar changes. The
 *  stored-record schema is versioned separately, by `dbVersion`. */
export const ARCHIVE_FORMAT = 1;
/** The suggested file extension. The content is NDJSON, usually gzipped. */
export const ARCHIVE_EXT = ".gravitone";

export const SECTIONS = ["projects", "steps", "themes", "assets", "uploads"] as const;
export type ArchiveSection = (typeof SECTIONS)[number];

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

export type Row = Record<string, unknown>;

/* ── shared helpers ───────────────────────────────────────────────────────── */

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export const sectionDigest = (rowDigests: string[]) => sha256Hex(rowDigests.join("\n"));

export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** A byte stream through a (de)compressor. The DOM typings declare the
 *  compressor's writable side as `BufferSource`, which a `Uint8Array` stream is
 *  but TypeScript's variance cannot see; the cast is that and nothing more. */
export const through = (
  s: ReadableStream<Uint8Array>,
  t: CompressionStream | DecompressionStream,
): ReadableStream<Uint8Array> =>
  s.pipeThrough(t as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
export const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function emptyCounts(): Record<ArchiveSection, number> {
  return { projects: 0, steps: 0, themes: 0, assets: 0, uploads: 0 };
}
