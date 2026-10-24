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
