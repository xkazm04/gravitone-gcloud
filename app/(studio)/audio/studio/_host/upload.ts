// THE STUDIO'S TAKE UPLOAD, client side (spark suno-advisor): posts the mp3 the person downloaded from
// suno.com to `POST /audio/studio/take` (../take/route.ts) and answers with the new take's id and its
// measured facts, or the refusal in words. The studio never fetches from Suno: the file is the one
// the person chose to spend a download on.
//
// The answer is the route's one envelope - `{takeId, facts}` or `{error, code}` - read through a narrow
// check, never trusted by shape (../../_audio/returnClient.ts, the same reasoning). A client module:
// types only from @gt/domain, no zod.
import type { StudioTakeFacts } from "@gt/domain/audio.suno";
import { errorMessage } from "@gt/domain/errors";

export type UploadTake = { readonly file: File; readonly session: string; readonly promptId?: string; readonly clip?: "a" | "b" };

export type Uploaded = { readonly ok: true; readonly takeId: string; readonly facts: StudioTakeFacts } | { readonly ok: false; readonly error: string };

/** The route's path, one spelling for the client and the tests. */
export const TAKE_ROUTE = "/audio/studio/take";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The facts the page renders, checked for the fields it cannot draw without. */
function factsOf(v: unknown, takeId: string): StudioTakeFacts | null {
  if (!isObject(v) || v["takeId"] !== takeId || typeof v["name"] !== "string" || typeof v["href"] !== "string") return null;
  if (typeof v["durationS"] !== "number" || !Number.isFinite(v["durationS"]) || !isObject(v["measured"])) return null;
  return v as unknown as StudioTakeFacts;
}

export async function uploadTake(req: UploadTake): Promise<Uploaded> {
  const form = new FormData();
  form.set("file", req.file, req.file.name);
  form.set("session", req.session);
  if (req.promptId !== undefined) form.set("promptId", req.promptId);
  if (req.clip !== undefined) form.set("clip", req.clip);
  let res: Response;
  try {
    res = await fetch(TAKE_ROUTE, { method: "POST", body: form, credentials: "same-origin" });
  } catch (e) {
    return { ok: false, error: `the upload did not reach the studio: ${errorMessage(e)}` };
  }
  const body: unknown = await res.json().catch((e: unknown) => ({ error: `HTTP ${res.status}, an unreadable answer: ${errorMessage(e)}` }));
  if (res.ok && isObject(body) && typeof body["takeId"] === "string") {
    const facts = factsOf(body["facts"], body["takeId"]);
    if (facts !== null) return { ok: true, takeId: body["takeId"], facts };
    return { ok: false, error: `the studio filed take ${body["takeId"]} but answered facts it cannot read` };
  }
  return { ok: false, error: isObject(body) && typeof body["error"] === "string" ? body["error"] : `HTTP ${res.status}` };
}
