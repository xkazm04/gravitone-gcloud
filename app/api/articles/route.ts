// /api/articles
//   GET   every run on disk, newest first, plus which of them a live driver holds
//   POST  create a run and start driving it to the human gate
//         { topic: { kind: "subject", bundle, subject, angle? } | { kind: "free", text, angle? },
//           model?, effort? }
//
// POST is a money route: it launches the run's kernel job, armed live by this
// confirm (lib/producers/article.ts launchArticle: a receipt, then the route's own
// confirm), so it takes the full guard (access + rate). The route ENQUEUES and
// returns: the worker (workers/runner.mts) or `pipeline/article.mts resume <id>`
// drives the same job. v1 started an un-awaited drive here. `mode: "dry"` launches
// a dry job (the stub answers every turn); `ceilingUsd` is the job's ceiling. A
// registry that cannot be reached creates a FAILED run with no job (the engine's
// rule), returned like any other: 201, status `failed`, `error` naming why.

import { guardAccessOnly, guardRequest } from "@/lib/apiAuth";
import { listArticleRuns } from "@/lib/articles/engine";
import { EFFORT_LEVELS, type ArticleStatus, type ArticleTopic, type CreateRunInput, type EffortLevel } from "@/lib/articles/types";
import { heldRuns, launchArticle } from "@/lib/producers/article";

import { failure, objectBody, refusal, ROUTE_ACTOR } from "./_lib/respond";

export const runtime = "nodejs";

/** The statuses a job works in — the only ones worth asking about a holder. */
const WORKING: ArticleStatus[] = ["queued", "researching", "drafting", "critiquing", "checking", "approved", "landing"];

export async function GET(req: Request) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  try {
    const { runs, damaged } = await listArticleRuns();
    const working = runs.filter((r) => WORKING.includes(r.status)).map((r) => r.id);
    const { held } = await heldRuns(working);
    const driving = working.filter((id) => held.has(id));
    return Response.json({ runs, damaged, driving });
  } catch (e) {
    return failure(e);
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export async function POST(req: Request) {
  const denied = await guardRequest(req);
  if (denied) return denied;
  const body = await objectBody(req);
  if (body instanceof Response) return body;

  const t = (typeof body.topic === "object" && body.topic !== null ? body.topic : {}) as Record<string, unknown>;
  if (t.kind !== "subject" && t.kind !== "free") {
    return Response.json({ error: "topic.kind must be subject or free", code: "bad-topic" }, { status: 400 });
  }
  const angle = str(t.angle)?.trim();
  const topic: ArticleTopic =
    t.kind === "subject"
      ? { kind: "subject", bundle: str(t.bundle)?.trim() ?? "", subject: str(t.subject)?.trim() ?? "", text: str(t.text)?.trim() ?? "" }
      : { kind: "free", text: str(t.text)?.trim() ?? "" };
  if (topic.kind === "subject" && (!topic.bundle || !topic.subject)) {
    return Response.json({ error: "a subject topic needs a bundle and a subject", code: "bad-topic" }, { status: 400 });
  }
  if (topic.kind === "free" && !topic.text) {
    return Response.json({ error: "a free topic needs text", code: "bad-topic" }, { status: 400 });
  }
  if (angle) topic.angle = angle;

  const effort = str(body.effort);
  if (effort !== undefined && !EFFORT_LEVELS.includes(effort as EffortLevel)) {
    return Response.json({ error: `effort must be one of ${EFFORT_LEVELS.join(", ")}`, code: "bad-effort" }, { status: 400 });
  }
  const model = str(body.model)?.trim();
  const input: CreateRunInput = { topic, ...(model ? { model } : {}), ...(effort ? { effort: effort as EffortLevel } : {}) };
  const ceilingUsd = typeof body.ceilingUsd === "number" ? body.ceilingUsd : undefined;

  try {
    const r = await launchArticle(input, { actor: ROUTE_ACTOR, mode: body.mode === "dry" ? "dry" : "live", ...(ceilingUsd === undefined ? {} : { ceilingUsd }) });
    if (!r.ok) return refusal(r.error);
    const { run, jobId, receipt } = r.value;
    return Response.json({ run, receipt, ...(jobId === undefined ? {} : { jobId }) }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
