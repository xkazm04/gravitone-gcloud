// THE RESUMABLE-UPLOAD SESSIONS - one file per slot, `<publish root>/sessions/<slotId>.json`
// `{ sessionUri, sha256 }`, exactly where and as v1 wrote them (lib/publish/publisher.ts), so a
// session a v1 upload left half-done is still found by the slot it belongs to (the importer kept
// every v1 slot id: lib/publish/import.ts). Server-only.
//
// WHY A FILE AND NOT THE STORE: the session must be on disk BEFORE the first byte moves, from
// inside the adapter's upload (YouTubeClient `onSession`), which runs between two store
// transactions by design (a claim's transaction never spans a network call). It is the
// channel's resume state, not calendar data; the slot row stays the truth about the slot.
//
// THE SESSION URI IS A DESTINATION SOMEONE ELSE SUPPLIED (outbound-notifications:
// destination-guard-integrity). It came from a Location header, and it sits in a file any process
// on this box can edit; the uploader PUTs the video, with a bearer token, to whatever it says. So
// it is held to the one shape the platform issues - https on a googleapis.com host - when it is
// read back - ./youtube.ts sessionUriAllowed, the rule the client applies to the header itself. A session
// that fails the rule is not resumed; the upload starts a fresh one.

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";

import { outPath } from "../fixtures/roots";

import { sessionUriAllowed } from "./youtube";

/** v1 lib/publish/store.ts storeRoot, read per call so a test or the CLI can point it elsewhere. */
export function publishRoot(): string {
  const env = process.env.PUBLISH_STORE_DIR?.trim();
  return env ? path.resolve(env) : outPath("publish");
}

const SLOT_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function sessionPath(slotId: string): Result<string> {
  if (!SLOT_ID.test(slotId)) return err("invalid", `not a valid slot id: ${JSON.stringify(slotId.slice(0, 80))}`);
  return ok(path.join(publishRoot(), "sessions", `${slotId}.json`));
}

const sessionSchema = z.object({ sessionUri: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/) });

/** The session to resume for these exact bytes; undefined for none, other bytes, or a URI the guard refuses. */
export async function readSession(slotId: string, sha256: string): Promise<Result<string | undefined>> {
  const file = sessionPath(slotId);
  if (!file.ok) return file;
  let text: string;
  try {
    text = await readFile(file.value, "utf8");
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") return ok(undefined);
    return err("unavailable", `${file.value}: ${errorMessage(e)}`, { cause: e });
  }
  const s = parseJsonAt(file.value, sessionSchema, text);
  // A damaged or foreign file is not resumed; a fresh session is the safe answer, and it is said by
  // returning nothing rather than failing a publish over a file whose only job was an optimisation.
  if (!s.ok || s.value.sha256 !== sha256 || !sessionUriAllowed(s.value.sessionUri)) return ok(undefined);
  return ok(s.value.sessionUri);
}

let n = 0;

/** Persisted before the first byte (tmp + rename: a reader sees the old file or the new one). */
export async function writeSession(slotId: string, sessionUri: string, sha256: string): Promise<void> {
  const file = sessionPath(slotId);
  if (!file.ok) throw file.error;
  await mkdir(path.dirname(file.value), { recursive: true });
  const tmp = `${file.value}.${process.pid}.${++n}.tmp`;
  await writeFile(tmp, `${JSON.stringify({ sessionUri, sha256 }, null, 2)}\n`, "utf8");
  await rename(tmp, file.value);
}

/** Dropped once the publication is recorded - never before, so a lost record can still resume. */
export async function removeSession(slotId: string): Promise<Result<void>> {
  const file = sessionPath(slotId);
  if (!file.ok) return file;
  try {
    await rm(file.value, { force: true });
    return ok(undefined);
  } catch (e) {
    return err("unavailable", `${file.value} was not removed: ${errorMessage(e)}`, { cause: e });
  }
}
