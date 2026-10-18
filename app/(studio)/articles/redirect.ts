// WHERE A v1 ARTICLES ADDRESS GOES NOW (Phase 6 wave C; COMMON decision 5; plan §2.1, §5.7).
//
// v1 had three pages: the run list (/articles), the topic form (/articles/new) and one run
// (/articles/<runId>). The list and the form are the Floor's article lane now - its composer
// starts a run from a registry subject, its cells show the runs in flight. That deep link MUST
// keep working: the article-run and techwriter skills print `/articles/<runId>` as the run's page.
//
// A RUN'S PAGE IS WHERE ITS STATE IS DECIDED (owner ruling 8a, L74). Wave C sent every run to its
// Board packet (`pkt:article:<runId>`), but the Board opens a packet only while the run waits at
// its gate (lib/decision/v1/sources/article.ts refuses any other status) - so a run still
// drafting, landed, failed or rejected landed on a refusal, the defect app/(studio)/_shell/
// links.ts's rule exists against. Now the run's status picks: `awaiting-approval` opens the
// packet; anything else, an unreadable run included, opens the run's history in the Ledger -
// the same target links.ts gives every act about an article run, and a page that always renders.
//
// An id that cannot be a run id (lib/articles/store.ts RUN_ID_RE - the id names the run's
// directory) names no run, so it lands on the lane, and the store is never asked about it.
// `articleRunTarget` is pure, so the table is asserted without a server; `articleRunAddress`
// is its one reader (tests/next-server/retire-redirects.test.ts drives both).

import { ArticleError, RUN_ID_RE, readRun } from "../../../lib/articles/store.ts";
import type { ArticleStatus } from "../../../lib/articles/types.ts";
import { boardFor, ledgerFor, packetIdOf } from "../_shell/links.ts";

export const ARTICLE_LANE = "/floor?lane=article";

/** The run's address for a status read from its run.json; `null` when no status could be read. */
export function articleRunTarget(runId: string, status: ArticleStatus | null): string {
  if (!RUN_ID_RE.test(runId)) return ARTICLE_LANE;
  return status === "awaiting-approval" ? boardFor(packetIdOf("article", runId)) : ledgerFor(runId);
}

/** Reads the run's status (run.json, read-only - no lock, no write) and routes by it. A run the
 *  store refuses to read - absent, or a run.json that does not parse - has no state to route by,
 *  and the Ledger is where whatever the studio does know about the id is shown. Any other
 *  failure (a disk error) is not a fact about the run and is left to throw. */
export async function articleRunAddress(runId: string): Promise<string> {
  if (!RUN_ID_RE.test(runId)) return ARTICLE_LANE;
  let status: ArticleStatus | null;
  try {
    status = (await readRun(runId)).status;
  } catch (e) {
    if (!(e instanceof ArticleError)) throw e;
    status = null;
  }
  return articleRunTarget(runId, status);
}
