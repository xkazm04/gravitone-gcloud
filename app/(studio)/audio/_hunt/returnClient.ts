// A Suno leaf's upload from the map to its route (../hunt-return/route.ts): multipart, because the
// bytes are a file. The answer is the route's one envelope - `{id, created}` or `{error, code}` -
// read through a narrow check, never trusted by shape (the Arrange return's client, ../_audio/
// returnClient.ts, for a leaf instead of a card).
import { errorMessage } from "@gt/domain/errors";

export type LeafReturnAnswer = { readonly ok: true; readonly value: { readonly id: string; readonly created: boolean } } | { readonly ok: false; readonly error: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

// A DEADLINE FOR AN UPLOAD THE STUDIO NEVER ANSWERS. The route's maxDuration bounds the server, not
// a connection that never reaches it: without a signal a stalled fetch neither resolves nor
// rejects, and the leaf's drop stays `returning` until a reload. The allowance is a flat floor plus
// the file at a minimum rate (128 KiB/s, about 1 Mbit/s), so the largest take the cap admits still
// has minutes, and a slower link than that is refused with the deadline named rather than hung.
const FLOOR_MS = 30_000;
const MIN_BYTES_PER_S = 131_072;

export const returnDeadlineMs = (bytes: number): number => FLOOR_MS + Math.ceil((bytes * 1000) / MIN_BYTES_PER_S);

export async function uploadLeafReturn(input: { readonly hunt: string; readonly node: string; readonly file: File; readonly op: string }): Promise<LeafReturnAnswer> {
  const form = new FormData();
  form.set("file", input.file, input.file.name);
  form.set("hunt", input.hunt);
  form.set("node", input.node);
  form.set("op", input.op);
  const ms = returnDeadlineMs(input.file.size);
  const ctl = new AbortController();
  let late = false;
  const timer = setTimeout(() => {
    late = true;
    ctl.abort();
  }, ms);
  const lateWords = `the studio did not answer within ${Math.round(ms / 1000)} s`;
  try {
    let res: Response;
    try {
      res = await fetch("/audio/hunt-return", { method: "POST", body: form, credentials: "same-origin", signal: ctl.signal });
    } catch (e) {
      return { ok: false, error: late ? lateWords : `the upload did not reach the studio: ${errorMessage(e)}` };
    }
    const body: unknown = await res.json().catch((e: unknown) => ({ error: late ? lateWords : `HTTP ${res.status}, an unreadable answer: ${errorMessage(e)}` }));
    return read(res, body);
  } finally {
    clearTimeout(timer);
  }
}

function read(res: Response, body: unknown): LeafReturnAnswer {
  if (res.ok && isObject(body) && typeof body["id"] === "string") return { ok: true, value: { id: body["id"], created: body["created"] === true } };
  return { ok: false, error: isObject(body) && typeof body["error"] === "string" ? body["error"] : `HTTP ${res.status}` };
}
