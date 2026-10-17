// WHERE A v1 ARTICLES ADDRESS GOES NOW (Phase 6 wave C; COMMON decision 5; plan §2.1, §5.7).
//
// v1 had three pages: the run list (/articles), the topic form (/articles/new) and one run
// (/articles/<runId>). The list and the form are the Floor's article lane now - its composer
// starts a run from a registry subject, its cells show the runs in flight. A run's page is its
// Board packet (`pkt:article:<runId>`), where the human gate is decided (lib/decision/v1/sources/
// article.ts approves and reworks in-process). That deep link MUST keep working: the article-run
// and techwriter skills print `/articles/<runId>` as the run's page.
//
// An id that cannot be a run id (lib/articles/store.ts RUN_ID_RE - the id names the run's
// directory) names no run, so it lands on the lane rather than on a Board that would refuse it.
// Pure, so the table is asserted without a server (tests/next-server/retire-redirects.test.ts).

import { RUN_ID_RE } from "../../../lib/articles/store.ts";
import { boardFor, packetIdOf } from "../_shell/links.ts";

export const ARTICLE_LANE = "/floor?lane=article";

export function articleRunTarget(runId: string): string {
  return RUN_ID_RE.test(runId) ? boardFor(packetIdOf("article", runId)) : ARTICLE_LANE;
}
