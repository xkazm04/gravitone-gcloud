// POST /api/foundry/extract/<id>/step — ENQUEUE THE RUN'S JOB AND KICK IT.
//
//   {}                              the receipt for driving this run (dry unless `mode: "live"`)
//   { mode, token, ceilingUsd? }    confirm that receipt: the job is enqueued (once per run) and kicked
//   { retry: true, ceilingUsd? }    the operator's retry of a failed or interrupted job, then a kick
//
// v1 was the browser's PUMP: each request performed one unit under a manifest
// lease and an in-process lock, because nothing survives a response on a managed
// platform. Since Phase 4 (L29) the run is a kernel job (lib/producers/extract.ts)
// - the same job the CLI drives and the worker claims - and this route only
// enqueues it and KICKS it: a drive that admits units for one second, so at most
// one unit (a generate <= 180 s plus a recognise <= 120 s) runs inside
// `maxDuration`, then the job yields back to the queue at its next boundary. A
// dropped connection costs nothing: the job is on the store, not in this request.
// `units` is no longer read; the kick takes what one second admits.
//
// Money route: a confirmed live receipt arms the job to spend. Full guard.
// GRAVITONE_DRY_ONLY=1 refuses a live arm whatever the body says.

import { httpStatus, AppError } from "@gt/domain/errors";
import { jobIdSchema } from "@gt/domain/ids";
import { dryOnlyFrom } from "@gt/kernel/dryrun";
import { retry } from "@gt/kernel/job";

import { guardRequest } from "@/lib/apiAuth";
import { getExtractRun } from "@/lib/foundry/extract/store";
import { FoundryError } from "@/lib/foundry/store";
import { kernel, storeLocation } from "@/lib/kernelStore";
import { driveExtract, launchExtract } from "@/lib/producers/extract";

export const runtime = "nodejs";
/** One generate (≤180s) + one recognise (≤120s), with room. */
export const maxDuration = 300;

/** How long a kick admits new units: the first, and none after it. */
export const KICK_ADMIT_MS = 1000;

const OPERATOR = { kind: "operator", id: "app" } as const;

const fail = (status: number, detail: string, extra: Record<string, unknown> = {}) => Response.json({ detail, ...extra }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardRequest(req);
  if (denied) return denied;
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    const raw: unknown = await req.json();
    if (raw && typeof raw === "object") body = raw as Record<string, unknown>;
  } catch {
    /* an empty body asks for the receipt */
  }
  const mode = body.mode === "live" ? "live" : "dry";
  const token = typeof body.token === "string" ? body.token : undefined;
  const ceilingUsd = typeof body.ceilingUsd === "number" ? body.ceilingUsd : undefined;
  const dryOnly = dryOnlyFrom(process.env);

  const k = kernel();
  if (!k.ok) return fail(httpStatus(k.error.code), k.error.message);
  const store = k.value.store;
  const location = storeLocation();

  try {
    let jobId: string;
    if (body.retry === true) {
      const { run } = await getExtractRun(id);
      if (run.job === undefined) return fail(409, "This run has no job to retry; confirm its receipt first.");
      const jid = jobIdSchema.safeParse(run.job);
      if (!jid.success) return fail(500, `run ${id} names a malformed job id`);
      const r = retry(store, jid.data, OPERATOR, ceilingUsd === undefined ? {} : { ceilingUsd });
      if (!r.ok) return fail(httpStatus(r.error.code), r.error.message);
      jobId = r.value.id;
    } else {
      const launched = await launchExtract(store, { kind: "run", runId: id }, { mode, actor: OPERATOR, dryOnly, ...(token === undefined ? {} : { token }), ...(ceilingUsd === undefined ? {} : { ceilingUsd }) });
      if (!launched.ok) return fail(httpStatus(launched.error.code), launched.error.message, { code: launched.error.code });
      const l = launched.value;
      if (l.kind === "receipt") return Response.json({ receipt: l.receipt });
      if (l.kind === "stale") return fail(409, "What this launch would do changed since its receipt; read the fresh receipt.", { code: "stale-receipt", fresh: l.fresh });
      if (l.kind === "existing" && l.state !== "queued") {
        return Response.json({ runId: l.runId, jobId: l.jobId, state: l.state, kicked: false });
      }
      jobId = l.jobId;
    }
    const r = await driveExtract(store, location, jobId, { deadlineMs: Date.now() + KICK_ADMIT_MS, dryOnly });
    if (!r.ok) return fail(httpStatus(r.error.code), r.error.message, { jobId });
    const { run } = await getExtractRun(id);
    return Response.json({
      runId: id,
      jobId,
      outcome: r.value.outcome,
      state: r.value.job?.state ?? null,
      kicked: true,
      ...(r.value.reason === undefined ? {} : { reason: r.value.reason }),
      status: run.status,
      progress: run.progress,
    });
  } catch (e) {
    if (e instanceof FoundryError) return fail(e.status, e.message);
    if (e instanceof AppError) return fail(httpStatus(e.code), e.message, { code: e.code });
    throw e;
  }
}
