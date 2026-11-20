// MEDIA, BY REFERENCE (spark device-metadata-sync, KS1) - a know-how record names a picture or a clip by the sha256 of its
// bytes and a LOGICAL location (`<root>/<relative>`), never by its bytes or a machine path. A file outside every known
// root is refused with the reason, so a stray absolute path can never reach the public projection. `localFileOf` is the
// way back: the file on THIS machine, only when it is there and its bytes still hash to the reference.
//
// Roots, most specific first: `production-fixture` (productionFixtureRoot(), PRODUCTION_FIXTURE_DIR in tests), `blobs`
// (the content-addressed store beside the kernel's file), then any first folder of `foundry-out/`.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import type { MediaRef } from "@gt/domain/knowhow";

import { productionFixtureRoot } from "../foundry/production/files.ts";
import { storeLocation } from "../kernelProcess.ts";

type Root = { readonly name: string; readonly dir: string };

const FOUNDRY_OUT = "foundry-out";
const SEGMENT_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** The blob store's folder: beside the kernel's file (GRAVITONE_STORE_PATH moves both). The store is never opened. */
export const blobsDir = (): string => path.join(path.dirname(storeLocation()), "blobs");

function roots(): readonly Root[] {
  return [
    { name: "production-fixture", dir: productionFixtureRoot() },
    { name: "blobs", dir: blobsDir() },
  ];
}

const inside = (dir: string, abs: string): string | null => {
  const rel = path.relative(path.resolve(dir), path.resolve(abs));
  return rel === "" || rel.startsWith("..") || path.isAbsolute(rel) ? null : rel.split(path.sep).join("/");
};

/** The logical location of a file, or the reason it has none. */
export function logicalPath(abs: string): Result<string> {
  for (const r of roots()) {
    const rel = inside(r.dir, abs);
    if (rel !== null) return ok(`${r.name}/${rel}`);
  }
  const rel = inside(path.join(process.cwd(), FOUNDRY_OUT), abs);
  if (rel !== null && rel.includes("/") && SEGMENT_RE.test(rel.split("/")[0] ?? "")) return ok(rel);
  return err("refused", `${path.basename(abs)} is outside every known media root`);
}

const hashes = new Map<string, { readonly size: number; readonly mtimeMs: number; readonly hash: string }>();

/** sha256 of a file's bytes, hex; remembered by size and mtime so an export on every write stays cheap. */
export function fileHash(abs: string): string {
  const s = statSync(abs);
  const held = hashes.get(abs);
  if (held !== undefined && held.size === s.size && held.mtimeMs === s.mtimeMs) return held.hash;
  const hash = createHash("sha256").update(readFileSync(abs)).digest("hex");
  hashes.set(abs, { size: s.size, mtimeMs: s.mtimeMs, hash });
  return hash;
}

/** A file as a reference, or the reason it cannot be one (outside the roots, or not there). */
export function explainMediaRef(abs: string, kind: MediaRef["kind"]): Result<MediaRef> {
  const at = logicalPath(abs);
  if (!at.ok) return at;
  if (!existsSync(abs)) return err("not-found", `${at.value} is not on this device`);
  try {
    return ok({ kind, hash: fileHash(abs), at: at.value });
  } catch (e) {
    return err("unavailable", `${at.value} did not read: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function mediaRef(abs: string, kind: MediaRef["kind"]): MediaRef | null {
  const r = explainMediaRef(abs, kind);
  return r.ok ? r.value : null;
}

/** A blob already named by its digest: no bytes are read. */
export const blobMediaRef = (sha256: string, kind: MediaRef["kind"]): MediaRef => ({ kind, hash: sha256, at: `blobs/${sha256.slice(0, 2)}/${sha256.slice(2)}` });

/** The file a reference names on THIS device: there, and its bytes still the referenced ones; else null. */
export function localFileOf(ref: Pick<MediaRef, "hash" | "at">): string | null {
  const parts = ref.at.split("/");
  const [head, ...rest] = parts;
  if (head === undefined || rest.length === 0 || parts.some((p) => p === "" || p === "." || p === "..")) return null;
  const root = roots().find((r) => r.name === head);
  const base = root?.dir ?? (SEGMENT_RE.test(head) ? path.join(process.cwd(), FOUNDRY_OUT, head) : null);
  if (base === null) return null;
  const abs = path.join(base, ...rest);
  if (inside(base, abs) === null || !existsSync(abs)) return null;
  try {
    return fileHash(abs) === ref.hash ? abs : null;
  } catch {
    return null;
  }
}
