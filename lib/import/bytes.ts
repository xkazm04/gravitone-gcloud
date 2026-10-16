import { createHash } from "node:crypto";

import { blobRefSchema, mimeSchema, type BlobRef } from "@gt/domain/blob";
import { AppError } from "@gt/domain/errors";

// BYTES OUT OF THE ROWS, AND BACK IN (Phase 4 wave D, L42).
//
// v1 kept picture bytes INSIDE its records: a frames plate is a base64 `data:` URL in `src`
// (twice - units and the frames shadow, ~5 MB a cut, app/_phases/frames/useFrames.ts), an
// alternative's plate the same (~1.5 MB a scene), a theme proof a raw `base64` field beside its
// `mime` (lib/themes.ts Proof), an upload `{type, b64}` inside its archive row (lib/studioArchive.ts).
// The kernel stores bytes once, by digest (@gt/kernel/blob), and a record holds the REF
// (@gt/domain/steps frames v3: "a plate carries its bytes as a blob ref, never a data: URL").
//
// Two products come out of one walk, and both are pure - hashing is all the bytes need here; the
// committer writes them (`StagedBlob`) before its transaction:
//   · the RECORD shape: an object whose `src` is a data: URL becomes `{ blob: <ref> }` (src
//     dropped) - the plate as the kernel's door accepts it;
//   · the ORIGINAL, for the re-export: the row exactly as v1 wrote it, every byte string replaced
//     by `{ "$gtBlob": <ref>, "$prefix": "data:...;base64," }`. JSON.stringify(JSON.parse(x)) is
//     x for anything JSON.stringify wrote, so restoring the strings and stringifying again gives
//     v1's line back byte for byte (registry import-normalization/lossy-conversion-disclosure:
//     "deciding whether export can promise a round trip" - it can, for every record nobody
//     edited since; ./export.ts says what an edited one becomes).
// A base64 string that does not re-encode to itself (padding dropped, line breaks) is left inline
// in the original - exactness beats a few saved bytes - and still becomes a blob in the record.

export type StagedBlob = { readonly ref: BlobRef; readonly bytes: Uint8Array };
export type Sink = Map<string, StagedBlob>;

const MARK = "$gtBlob";
const PREFIX = "$prefix";
const DATA_URL = /^data:([^,;]*)((?:;[^,;]*)*);base64,/i;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Bytes into the sink by digest (once), as a ref. */
export function stage(sink: Sink, bytes: Uint8Array, mime: string): BlobRef {
  const ref: BlobRef = { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength, mime: mimeSchema.safeParse(mime).success ? mime : "application/octet-stream" };
  if (!sink.has(ref.sha256)) sink.set(ref.sha256, { ref, bytes });
  return ref;
}

const canonicalB64 = (b64: string, bytes: Uint8Array): boolean => Buffer.from(bytes).toString("base64") === b64;

/** A data: URL's bytes and type, or null when the string is not a base64 data: URL. */
export function dataUrl(s: string): { prefix: string; mime: string; b64: string; bytes: Uint8Array } | null {
  const m = DATA_URL.exec(s);
  if (m === null) return null;
  const prefix = m[0];
  const b64 = s.slice(prefix.length);
  return { prefix, mime: (m[1] ?? "").toLowerCase(), b64, bytes: new Uint8Array(Buffer.from(b64, "base64")) };
}

/** The original with its byte strings marked (see the header). `proofs`: also a `{base64, mime}` pair. */
export function markOriginal(value: unknown, sink: Sink): unknown {
  if (typeof value === "string") {
    const d = dataUrl(value);
    if (d === null || !canonicalB64(d.b64, d.bytes)) return value;
    return { [MARK]: stage(sink, d.bytes, d.mime), [PREFIX]: d.prefix };
  }
  if (Array.isArray(value)) return value.map((x) => markOriginal(x, sink));
  if (!isObj(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === "base64" && typeof v === "string" && typeof value["mime"] === "string") {
      const bytes = new Uint8Array(Buffer.from(v, "base64"));
      out[k] = canonicalB64(v, bytes) ? { [MARK]: stage(sink, bytes, value["mime"]), [PREFIX]: "" } : v;
    } else if (k === "b64" && typeof v === "string" && typeof value["type"] === "string") {
      const bytes = new Uint8Array(Buffer.from(v, "base64"));
      out[k] = canonicalB64(v, bytes) ? { [MARK]: stage(sink, bytes, value["type"]), [PREFIX]: "" } : v;
    } else out[k] = markOriginal(v, sink);
  }
  return out;
}

/** The record shape: every `src` data: URL becomes `blob` (the kernel's ref), everything else as it was. */
export function refsInRecord(value: unknown, sink: Sink): unknown {
  if (Array.isArray(value)) return value.map((x) => refsInRecord(x, sink));
  if (!isObj(value)) return value;
  const out: Record<string, unknown> = {};
  const src = value["src"];
  const d = typeof src === "string" ? dataUrl(src) : null;
  for (const [k, v] of Object.entries(value)) {
    if (k === "src" && d !== null) continue;
    out[k] = refsInRecord(v, sink);
  }
  if (d !== null) out["blob"] = stage(sink, d.bytes, d.mime);
  return out;
}

/** The refs a marked original or a record names. */
export function refsOf(value: unknown, out: BlobRef[] = []): BlobRef[] {
  if (Array.isArray(value)) for (const x of value) refsOf(x, out);
  else if (isObj(value)) {
    const marked = blobRefSchema.safeParse(value[MARK]);
    if (marked.success) out.push(marked.data);
    for (const [k, v] of Object.entries(value)) {
      if (k === MARK) continue;
      if (k === "blob") {
        const ref = blobRefSchema.safeParse(v);
        if (ref.success) {
          out.push(ref.data);
          continue;
        }
      }
      refsOf(v, out);
    }
  }
  return out;
}

export type ReadBytes = (ref: BlobRef) => Promise<Uint8Array | null>;

/** Put the strings back: a marked original becomes v1's row again. A missing blob throws `not-found`. */
export async function restoreOriginal(value: unknown, read: ReadBytes): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((x) => restoreOriginal(x, read)));
  if (!isObj(value)) return value;
  const marked = blobRefSchema.safeParse(value[MARK]);
  if (marked.success && typeof value[PREFIX] === "string") {
    const bytes = await read(marked.data);
    if (bytes === null) throw new AppError("not-found", `blob ${marked.data.sha256} is not in the store`);
    return `${value[PREFIX]}${Buffer.from(bytes).toString("base64")}`;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = await restoreOriginal(v, read);
  return out;
}

/** The record back in v1's shape: every `{ blob }` without a `src` gets its data: URL again. */
export async function inlineRecord(value: unknown, read: ReadBytes): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((x) => inlineRecord(x, read)));
  if (!isObj(value)) return value;
  const out: Record<string, unknown> = {};
  const ref = value["src"] === undefined ? blobRefSchema.safeParse(value["blob"]) : undefined;
  for (const [k, v] of Object.entries(value)) {
    if (k === "blob" && ref?.success === true) continue;
    out[k] = await inlineRecord(v, read);
  }
  if (ref?.success === true) {
    const bytes = await read(ref.data);
    if (bytes === null) throw new AppError("not-found", `blob ${ref.data.sha256} is not in the store`);
    out["src"] = `data:${ref.data.mime};base64,${Buffer.from(bytes).toString("base64")}`;
  }
  return out;
}
