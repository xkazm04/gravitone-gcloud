"use client";

// Reading an archive back: sniff the gzip magic, split lines, validate every row
// and check every section digest. Nothing here touches the database beyond
// reading its version; the format is documented in lib/studioArchive.ts.

import { readUploadPointer } from "@/lib/shelfPointers";
import { openDb } from "@/lib/studioDb";
import {
  ARCHIVE_FORMAT,
  ARCHIVE_KIND,
  ArchiveRefused,
  MANIFEST_KIND,
  SECTIONS,
  isObj,
  isStr,
  sectionDigest,
  sha256Hex,
  through,
  type ArchiveHeader,
  type ArchiveManifest,
  type ArchiveSection,
  type Row,
} from "@/lib/studioArchiveFormat";

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

export interface ParsedArchive {
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
export async function parseArchive(src: ArchiveSource, liveDbVersion: number): Promise<ParsedArchive> {
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
