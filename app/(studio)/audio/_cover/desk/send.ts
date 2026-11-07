// A COVER'S FILES, SENT TO ITS ROUTES (spark track-mirror-studio): multipart, because a song is far past an
// action's body cap. The answer is the route's one envelope - the cover's `id`, or `{error, code}` - read through a
// narrow check and never trusted by shape; an error is shown as the route said it (../_hunt/returnClient.ts's
// posture, with its deadline: a flat floor plus the file at 128 KiB/s).
import { errorMessage } from "@gt/domain/errors";
import type { CoverRights } from "@gt/domain/cover";

import { COVER_REMIX_ROUTE, COVER_SOURCE_ROUTE } from "../contract.ts";

export type Sent = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly error: string };

export type SourceForm = { readonly file: File; readonly title: string; readonly rights: CoverRights; readonly holder: string; readonly note: string };
export type RemixForm = { readonly id: string; readonly file: File; readonly style: string };

/** What a page uses to send: the routes, or the fixture's stand-in. */
export type Sender = { readonly source: (f: SourceForm) => Promise<Sent>; readonly remix: (f: RemixForm) => Promise<Sent> };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const deadlineMs = (bytes: number): number => 30_000 + Math.ceil((bytes * 1000) / 131_072);

function idOf(body: unknown): string | undefined {
  if (!isObject(body)) return undefined;
  if (typeof body["id"] === "string") return body["id"];
  const rec = body["record"];
  return isObject(rec) && typeof rec["id"] === "string" ? rec["id"] : undefined;
}

async function post(route: string, form: FormData, bytes: number): Promise<Sent> {
  const ms = deadlineMs(bytes);
  const ctl = new AbortController();
  let late = false;
  const timer = setTimeout(() => {
    late = true;
    ctl.abort();
  }, ms);
  const lateWords = `no answer within ${Math.round(ms / 1000)} s`;
  try {
    let res: Response;
    try {
      res = await fetch(route, { method: "POST", body: form, credentials: "same-origin", signal: ctl.signal });
    } catch (e) {
      return { ok: false, error: late ? lateWords : `the upload did not arrive: ${errorMessage(e)}` };
    }
    const body: unknown = await res.json().catch((e: unknown) => ({ error: late ? lateWords : `HTTP ${res.status}, an unreadable answer: ${errorMessage(e)}` }));
    const id = idOf(body);
    if (res.ok && id !== undefined) return { ok: true, id };
    return { ok: false, error: isObject(body) && typeof body["error"] === "string" ? body["error"] : `HTTP ${res.status}` };
  } finally {
    clearTimeout(timer);
  }
}

export const routeSender: Sender = {
  source: (f) => {
    const form = new FormData();
    form.set("file", f.file, f.file.name);
    form.set("title", f.title);
    form.set("rights", f.rights);
    if (f.holder.trim() !== "") form.set("holder", f.holder.trim());
    if (f.note.trim() !== "") form.set("note", f.note.trim());
    return post(COVER_SOURCE_ROUTE, form, f.file.size);
  },
  remix: (f) => {
    const form = new FormData();
    form.set("id", f.id);
    form.set("file", f.file, f.file.name);
    form.set("style", f.style);
    return post(COVER_REMIX_ROUTE, form, f.file.size);
  },
};
