// POST /api/articles/<runId>/medium
//
// Makes the run's private Medium draft again (the first one is made when the run
// reaches the gate): replaces the body of the same draft when one exists. Only
// at the gate. The draft is never published and never read back.
//
// THE DOOR IS route()'s `money` guard: it drives the operator's signed-in Medium
// account, so it is held like every act that spends a seat. The engine's own
// refusals (a run that is not at the gate, a draft already in flight) keep the
// store's sentence and status.

import { err } from "@gt/domain/errors";

import { defaultDeps, ensureMediumDraft } from "../../../../../lib/articles/engine.ts";
import { ArticleError } from "../../../../../lib/articles/store.ts";
import { route } from "../../../../_server/route.ts";

export const runtime = "nodejs";

export const POST = route({ guard: "money", bodyCap: 0 }, async ({ params }) => {
  const runId = (await params)["runId"];
  if (typeof runId !== "string") return err("invalid", "a Medium draft is made at <runId>/medium");
  try {
    return Response.json({ run: await ensureMediumDraft(runId, defaultDeps()) });
  } catch (e) {
    // The store's own sentence and status (a run id that is not one is the store's 400, a missing run its 404).
    if (e instanceof ArticleError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
    throw e;
  }
});
