// THE IMPORT DOOR'S ANSWER, AS THE SCREEN READS IT. Pure of the browser's v1 database (that stays
// in ImportView.tsx with v1's exportAccount), so the Node lane can drive it with a fake fetch.
//
// `post` never rejects: a request that does not reach the route, and an answer whose body breaks
// off while it is read, are both answered in the route's own envelope (503 `unavailable`). A
// rejection here used to leave the screen in `reading` or `committing` for good - the confirm
// button stuck on "Importing…" and both doors disabled - with nothing on screen.
import { unknown } from "zod/mini";

import { parseJsonAt } from "@gt/domain/door";
import { errorMessage } from "@gt/domain/errors";

import type { ImportOutcome, ShelfOutcome } from "@/lib/import/commit";
import type { ProjectPreview } from "@/lib/import/project";
import type { Preview } from "@/lib/import/serve";
import type { ItemPreview, ThemePreview } from "@/lib/import/shelf";

export type Answer = { readonly status: number; readonly json: unknown };

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** The route's answer; a network failure, or a body that breaks off, is a 503 in the route's own envelope. */
export async function post(path: string, body: Blob, fetchImpl: Fetch = fetch): Promise<Answer> {
  let r: Response;
  try {
    r = await fetchImpl(path, { method: "POST", body, headers: { "content-type": "application/octet-stream" } });
  } catch (e) {
    return { status: 503, json: { error: `the import could not be reached: ${errorMessage(e)}`, code: "unavailable" } };
  }
  const status = r.status;
  let text: string;
  try {
    text = await r.text();
  } catch (e) {
    return { status: 503, json: { error: `the import's answer (${status}) broke off: ${errorMessage(e)}`, code: "unavailable" } };
  }
  const parsed = parseJsonAt("import answer", unknown(), text);
  return { status, json: parsed.ok ? parsed.value : { error: text.slice(0, 300) || `the import answered ${status}`, code: "internal" } };
}

/** One archive on the screen: where it came from, its bytes (sent again on the confirm), its preview. */
export type Source = { readonly name: string; readonly bytes: Blob; readonly preview: Preview };

/** What the confirms so far have landed - every source's outcomes, kept across a stale round. */
export type Landed = { readonly outcomes: readonly ImportOutcome[]; readonly styles: readonly ShelfOutcome[]; readonly items: readonly ShelfOutcome[] };
export const NOTHING_LANDED: Landed = { outcomes: [], styles: [], items: [] };
export const landedAny = (l: Landed): boolean => l.outcomes.length + l.styles.length + l.items.length > 0;

type Envelope = { readonly error?: string; readonly code?: string; readonly detail?: string };
export const envelopeOf = (x: unknown): Envelope => (typeof x === "object" && x !== null ? (x as Envelope) : {});

type Fresh = { readonly fresh: readonly ProjectPreview[]; readonly themes: readonly ThemePreview[]; readonly items: readonly ItemPreview[]; readonly token: string };

/**
 * Confirm each source on its token, in order. Each source's commit is its own on the server, so
 * what one landed has landed whatever the next one answers: a later refusal stops the loop and
 * is named BESIDE what landed (never instead of it), and a stale source comes back as its fresh
 * preview while the sources that did commit keep their outcomes. A 409 that carries no fresh
 * preview is a refusal in its own words, not a source that silently disappears.
 */
export async function commitAll(
  sources: readonly Source[],
  send: (path: string, body: Blob) => Promise<Answer> = post,
  prior: Landed = NOTHING_LANDED,
): Promise<{ readonly landed: Landed; readonly fresh: readonly Source[]; readonly failed?: { readonly name: string; readonly message: string } }> {
  let landed = prior;
  const fresh: Source[] = [];
  for (const src of sources) {
    const r = await send(`/api/import?act=commit&token=${src.preview.token}`, src.bytes);
    if (r.status === 409) {
      const f = (r.json as { fresh?: Fresh }).fresh;
      if (f !== undefined) {
        fresh.push({ ...src, preview: { ...src.preview, projects: f.fresh, themes: f.themes, items: f.items, token: f.token } });
        continue;
      }
    }
    if (r.status !== 200) return { landed, fresh, failed: { name: src.name, message: envelopeOf(r.json).error ?? `the import answered ${r.status}` } };
    const done = r.json as Landed;
    landed = { outcomes: [...landed.outcomes, ...done.outcomes], styles: [...landed.styles, ...done.styles], items: [...landed.items, ...done.items] };
  }
  return { landed, fresh };
}

/**
 * The screen's doors - this browser's read (on arrival and on its button), a picked file, a
 * confirm - each answer later, and only the NEWEST one opened may land: a slow read of this
 * browser's accounts that answers after the operator picked a file must not replace the file's
 * preview (and a confirm made on that file must not be overwritten by it). `close` (unmount)
 * drops whatever is still travelling.
 */
export function lastDoor<T>(land: (v: T) => void): { readonly open: (answer: Promise<T>) => void; readonly close: () => void } {
  let newest = 0;
  return {
    open: (answer) => {
      const mine = ++newest;
      void answer.then((v) => {
        if (newest === mine) land(v);
      });
    },
    close: () => {
      newest++;
    },
  };
}
