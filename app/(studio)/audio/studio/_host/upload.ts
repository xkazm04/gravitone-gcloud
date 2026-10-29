// THE STUDIO'S TAKE UPLOAD, client side (spark suno-advisor): posts the mp3 the person downloaded from
// suno.com to `POST /audio/studio/take` (../take/route.ts) and answers with the new take's id and its
// measured facts, or the refusal in words. The studio never fetches from Suno: the file is the one
// the person chose to spend a download on.
// WP0 STUB: the signature is the contract; WP1 fills the body (multipart: file, session, promptId?, clip?).
import type { StudioTakeFacts } from "@gt/domain/audio.suno";

export type UploadTake = { readonly file: File; readonly session: string; readonly promptId?: string; readonly clip?: "a" | "b" };

export type Uploaded = { readonly ok: true; readonly takeId: string; readonly facts: StudioTakeFacts } | { readonly ok: false; readonly error: string };

/** The route's path, one spelling for the client and the tests. */
export const TAKE_ROUTE = "/audio/studio/take";

export async function uploadTake(_req: UploadTake): Promise<Uploaded> {
  return { ok: false, error: "upload is not built yet (spark suno-advisor WP1)" };
}
