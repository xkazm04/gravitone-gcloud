// The Suno return's upload from the board to its route (../return/route.ts): multipart, because
// the bytes are a file. The answer is the route's one envelope - `{id, version, created}` or
// `{error, code}` - read through a narrow check, never trusted by shape.
import type { Stage } from "@gt/ui/components/audio/arrange.ts";

export type ReturnAnswer = { readonly ok: true; readonly value: { readonly id: string; readonly version: number } } | { readonly ok: false; readonly error: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export async function uploadReturn(input: { readonly head: string; readonly stage: Stage; readonly file: File; readonly op: string; readonly label?: string }): Promise<ReturnAnswer> {
  const form = new FormData();
  form.set("file", input.file, input.file.name);
  form.set("head", input.head);
  form.set("stage", input.stage);
  form.set("op", input.op);
  if (input.label !== undefined) form.set("label", input.label);
  let res: Response;
  try {
    res = await fetch("/audio/return", { method: "POST", body: form, credentials: "same-origin" });
  } catch (e) {
    return { ok: false, error: `the upload did not reach the studio: ${e instanceof Error ? e.message : String(e)}` };
  }
  const body: unknown = await res.json().catch((e: unknown) => ({ error: `HTTP ${res.status}, an unreadable answer: ${e instanceof Error ? e.message : String(e)}` }));
  if (res.ok && isObject(body) && typeof body["id"] === "string" && typeof body["version"] === "number") return { ok: true, value: { id: body["id"], version: body["version"] } };
  return { ok: false, error: isObject(body) && typeof body["error"] === "string" ? body["error"] : `HTTP ${res.status}` };
}
