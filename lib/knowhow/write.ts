// THE PROJECTION'S WRITER (spark device-metadata-sync, KS1) - every know-how file goes out through here: keys sorted at
// every depth, one-space indent, a trailing newline, written through a temp file and a rename, and NOT written when the
// bytes on disk are already these, so an export that changes nothing leaves the tree clean. The repo is public, so the
// last gate before a byte lands is `leak`: an absolute machine path or this machine's user name refuses the record.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { KNOWHOW_DIR } from "@gt/domain/knowhow";

/** The `knowhow/` folder: KNOWHOW_ROOT (tests), else `<cwd>/knowhow`. Read per call. */
export function knowhowRoot(): string {
  const o = process.env["KNOWHOW_ROOT"]?.trim();
  return o ? path.resolve(o) : path.join(process.cwd(), KNOWHOW_DIR);
}

/** A contract path (`knowhow/characters/x.json`) as a file under the root. */
export function fileOf(contractPath: string): string {
  const rel = contractPath.startsWith(`${KNOWHOW_DIR}/`) ? contractPath.slice(KNOWHOW_DIR.length + 1) : contractPath;
  return path.join(knowhowRoot(), ...rel.split("/"));
}

const sorted = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(sorted);
  if (typeof v !== "object" || v === null) return v;
  const o = v as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => [k, sorted(o[k])]),
  );
};

/** The bytes a record is written as. */
export const serialize = (v: unknown): string => `${JSON.stringify(sorted(v), null, 1)}\n`;

const DRIVE_RE = /(?<![A-Za-z])[A-Za-z]:(?:\\\\|\/(?!\/))/;
const HOME_RE = /\/(?:Users|home)\/[^/\s"]+/;

/** Why these bytes may not be published, or null: a drive path, a home folder, or this machine's user name. */
export function leak(text: string): string | null {
  if (DRIVE_RE.test(text)) return "carries an absolute drive path";
  if (HOME_RE.test(text)) return "carries a home folder path";
  let user = "";
  try {
    user = os.userInfo().username.toLowerCase();
  } catch {
    /* no user: nothing to look for */
  }
  if (user.length >= 3 && text.toLowerCase().includes(user)) return "carries this machine's user name";
  return null;
}

export type Written = "written" | "unchanged";

/** Write a record's bytes unless they are already there. Throws only on a filesystem failure. */
export function writeRecord(file: string, bytes: string): Written {
  if (existsSync(file) && readFileSync(file, "utf8") === bytes) return "unchanged";
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    writeFileSync(tmp, bytes);
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
  return "written";
}

/** A record already in the projection, or undefined. */
export function readRecord(file: string): Record<string, unknown> | undefined {
  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** What an export did: the contract paths written (or, dry, that would be), how many were already so, what was refused. */
export type ExportSummary = { readonly written: string[]; unchanged: number; readonly refused: { readonly id: string; readonly reason: string }[] };

export const emptySummary = (): ExportSummary => ({ written: [], unchanged: 0, refused: [] });

export function mergeSummary(into: ExportSummary, from: ExportSummary): ExportSummary {
  into.written.push(...from.written);
  into.unchanged += from.unchanged;
  into.refused.push(...from.refused);
  return into;
}

/**
 * One record into the projection: refused when its bytes would leak a machine fact; `appendOnly` never touches a file that
 * is already there (a lane record); `dry` only counts. Never throws: a filesystem failure is a refusal with its sentence.
 */
export function put(s: ExportSummary, id: string, contractPath: string, record: unknown, o: { readonly dry?: boolean; readonly appendOnly?: boolean } = {}): void {
  const bytes = serialize(record);
  const why = leak(bytes);
  if (why !== null) {
    s.refused.push({ id, reason: why });
    return;
  }
  const file = fileOf(contractPath);
  if (o.appendOnly === true && existsSync(file)) {
    s.unchanged++;
    return;
  }
  if (o.dry === true) {
    if (existsSync(file) && readFileSync(file, "utf8") === bytes) s.unchanged++;
    else s.written.push(contractPath);
    return;
  }
  try {
    if (writeRecord(file, bytes) === "written") s.written.push(contractPath);
    else s.unchanged++;
  } catch (e) {
    s.refused.push({ id, reason: `could not write ${contractPath}: ${e instanceof Error ? e.message : String(e)}` });
  }
}
