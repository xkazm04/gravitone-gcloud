// /articles/<runId> - v1's run page, retired in Phase 6 wave C. The skills print this address as
// the run's page, so it stays a redirect to the run's Board packet (../redirect.ts).
import { redirect } from "next/navigation";

import { articleRunTarget } from "../redirect.ts";

type Params = Promise<{ readonly runId: string }>;

export default async function V1ArticleRun({ params }: { readonly params: Params }) {
  const { runId } = await params;
  redirect(articleRunTarget(runId));
}
