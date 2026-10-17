// A Suno leaf's upload from the map to its route (../hunt-return/route.ts): multipart, because the
// bytes are a file. The answer is the route's one envelope - `{id, created}` or `{error, code}` -
// read through a narrow check, never trusted by shape (the Arrange return's client, ../_audio/
// returnClient.ts, for a leaf instead of a card).
export type LeafReturnAnswer = { readonly ok: true; readonly value: { readonly id: string; readonly created: boolean } } | { readonly ok: false; readonly error: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export async function uploadLeafReturn(input: { readonly hunt: string; readonly node: string; readonly file: File; readonly op: string }): Promise<LeafReturnAnswer> {
  const form = new FormData();
  form.set("file", input.file, input.file.name);
  form.set("hunt", input.hunt);
  form.set("node", input.node);
  form.set("op", input.op);
  let res: Response;
  try {
    res = await fetch("/audio/hunt-return", { method: "POST", body: form, credentials: "same-origin" });
  } catch (e) {
    return { ok: false, error: `the upload did not reach the studio: ${e instanceof Error ? e.message : String(e)}` };
  }
  const body: unknown = await res.json().catch((e: unknown) => ({ error: `HTTP ${res.status}, an unreadable answer: ${e instanceof Error ? e.message : String(e)}` }));
  if (res.ok && isObject(body) && typeof body["id"] === "string") return { ok: true, value: { id: body["id"], created: body["created"] === true } };
  return { ok: false, error: isObject(body) && typeof body["error"] === "string" ? body["error"] : `HTTP ${res.status}` };
}
