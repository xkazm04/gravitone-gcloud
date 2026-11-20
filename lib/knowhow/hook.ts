// EXPORT ON WRITE (spark device-metadata-sync, KS1) - the one call every writer of know-how makes after its write lands:
// lib/production's state file, the character store's create/import/save, the cast completing, a production lesson
// proposed or accepted. It exports only the touched record, and it NEVER throws into its caller: a failed export is a
// line on stderr and the write it followed stands.
//
// It stays off where a write is not this device's know-how: under a test runner (unless KNOWHOW_ROOT names a root), with
// GRAVITONE_KNOWHOW=off, outside a git checkout, and, for the kernel streams, in the fixture universe
// (NEXT_PUBLIC_GRAVITONE_DATA=fixtures), whose characters are made up.

import { existsSync } from "node:fs";
import path from "node:path";

import type { Store } from "@gt/kernel/store";

import { OUT_DIRNAME } from "../fixtures/mode.ts";
import { exportTouched, type TouchedKind } from "./export.ts";

export function knowhowEnabled(kind: TouchedKind): boolean {
  if (process.env["GRAVITONE_KNOWHOW"] === "off") return false;
  const named = (process.env["KNOWHOW_ROOT"]?.trim() ?? "") !== "";
  if (!named && (process.env["VITEST"] !== undefined || process.env["NODE_ENV"] === "test")) return false;
  if (!named && !existsSync(path.join(process.cwd(), ".git"))) return false;
  if (kind !== "production" && OUT_DIRNAME !== "foundry-out" && !named) return false;
  return true;
}

/** After a write: export what it touched. `store` is the kernel the write went through (characters, lessons). */
export function afterWrite(kind: TouchedKind, id: string, store?: Pick<Store, "read">): void {
  try {
    if (!knowhowEnabled(kind)) return;
    const s = exportTouched(kind, id, store === undefined ? {} : { store });
    for (const r of s.refused) console.warn(`knowhow: ${kind} ${r.id} not exported: ${r.reason}`);
  } catch (e) {
    console.warn(`knowhow: ${kind} ${id} not exported: ${e instanceof Error ? e.message : String(e)}`);
  }
}
