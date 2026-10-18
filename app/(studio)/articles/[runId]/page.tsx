// /articles/<runId> - v1's run page, retired in Phase 6 wave C. The skills print this address as
// the run's page, so it stays a redirect, routed by the run's state (../redirect.ts says where).
import { redirect } from "next/navigation";

import { articleRunAddress } from "../redirect.ts";

type Params = Promise<{ readonly runId: string }>;

export default async function V1ArticleRun({ params }: { readonly params: Params }) {
  const { runId } = await params;
  redirect(await articleRunAddress(runId));
}
