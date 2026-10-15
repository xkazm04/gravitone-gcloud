// WHERE A v1 BOARD ADDRESS GOES NOW (Phase 3 decision 10; plan §6: "/board?src=&st=&i= ...
// become redirects"). v1's Board kept its view in the query (lib/board/url.ts): `src` one
// source, `i` the selected item as `<source>:<key>`, where a run-scoped key is
// `<run>::<item>` (lib/board/sources/cull.ts SEP). Skills, bookmarks and old ledger rows hold
// such addresses; each now opens the packet its run became (`pkt:<source>:<run>`), or, when it
// names no run, the Floor's lane where that source's piles wait. Nothing is guessed: an
// address this table does not know opens the Floor.
//
// Pure, so the table is asserted without a server (tests/next-server/board-redirect.test.ts).

import { boardFor, packetIdOf } from "../(studio)/_shell/links.ts";

/** v1's Board sources that are a decision surface now, to the packet source that decides them. */
const PACKET_OF: Readonly<Record<string, string>> = { cull: "forge", extract: "extract", dojo: "dojo", articles: "article" };

/** Where each v1 source's work waits now. `triage` was the research scope (lib/board/sources/
 *  triage.ts) - not a Weir surface (Phase 3 decision 9) - so it has no lane of its own. */
const LANE_OF: Readonly<Record<string, string>> = {
  cull: "/floor?lane=image",
  extract: "/floor?lane=image",
  dojo: "/floor?lane=image",
  proof: "/floor?lane=image",
  adoption: "/floor?lane=image",
  alternative: "/floor?lane=image",
  articles: "/floor?lane=article",
  audio: "/floor?lane=audio",
  publish: "/calendar",
};

const SEP = "::";

/** The run a v1 item key names: the part before `::`, or the key itself (an article's run id). */
function runOf(source: string, key: string): string {
  if (source === "articles") return key;
  const at = key.indexOf(SEP);
  return at < 0 ? "" : key.slice(0, at);
}

export function v1BoardTarget(params: { readonly src?: string | undefined; readonly i?: string | undefined; readonly item?: string | undefined }): string {
  const item = params.i ?? params.item;
  if (item !== undefined && item !== "") {
    const at = item.indexOf(":");
    const source = at < 0 ? (params.src ?? "") : item.slice(0, at);
    const key = at < 0 ? item : item.slice(at + 1);
    const packet = PACKET_OF[source];
    const run = runOf(source, key);
    if (packet !== undefined && run !== "") return boardFor(packetIdOf(packet, run));
  }
  return (params.src === undefined ? undefined : LANE_OF[params.src]) ?? "/floor";
}
