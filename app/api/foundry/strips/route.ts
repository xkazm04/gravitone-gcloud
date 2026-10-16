// /api/foundry/strips
//   GET   every code-rendered strip run on disk, summarised. Access-only, never
//         rate-limited (the /foundry tab and its station poll it).
//   POST  launch a strip run as a kernel job (Phase 4, L33): no `token` answers with the
//         RECEIPT and launches nothing; the receipt's `token` sent back confirms it, and the
//         job is ENQUEUED - the worker drives it, as `pipeline/strips/run.mts --detach` leaves
//         it. A stale token is a 409 with the fresh receipt. Dry unless `mode: "live"`, and
//         GRAVITONE_DRY_ONLY=1 refuses live whatever the body says. A money route: full guard.
//
//   { run?, lane?, only?, replicas?, effortArm?, effort?, controls?, controlsOnly?,
//     rounds?, review?, leonardo?, authorTimeoutMin?, resume?, mode?, ceilingUsd?, token? }

import { z } from "zod";

import { dryOnlyFrom } from "@gt/kernel/dryrun";

import { guardAccessOnly, guardRequest } from "@/lib/apiAuth";
import { FoundryError } from "@/lib/foundry/runStore";
import { DEFAULT_OPTIONS, DEFAULT_SELECTION } from "@/lib/foundry/strips/cards";
import { listStripRuns } from "@/lib/foundry/strips/store";
import { launchStrips, type StripsTarget } from "@/lib/producers/strips";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  try {
    return Response.json({ runs: await listStripRuns() });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}

const ids = z.array(z.string().trim().min(1).max(40)).max(200);
const bodySchema = z
  .object({
    run: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/).optional(),
    lane: z.enum(["edu", "stat", "all"]).optional(),
    only: ids.optional(),
    replicas: ids.optional(),
    effortArm: ids.optional(),
    effort: z.string().trim().min(1).max(20).optional(),
    controls: z.boolean().optional(),
    controlsOnly: z.boolean().optional(),
    rounds: z.number().int().min(0).max(5).optional(),
    review: z.boolean().optional(),
    leonardo: z.boolean().optional(),
    authorTimeoutMin: z.number().int().min(5).max(240).optional(),
    resume: z.boolean().optional(),
    mode: z.enum(["dry", "live"]).optional(),
    ceilingUsd: z.number().positive().max(10_000).optional(),
    token: z.string().min(1).optional(),
  })
  .strict();

const STATUS: Record<string, number> = { invalid: 400, "not-found": 404, conflict: 409, refused: 403, budget: 402 };

export async function POST(req: Request) {
  const denied = await guardRequest(req);
  if (denied) return denied;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ detail: "The request body was not JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ detail: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") }, { status: 400 });
  const b = parsed.data;
  const selection = {
    lane: b.lane ?? DEFAULT_SELECTION.lane,
    only: b.only ?? [],
    replicas: b.replicas ?? [],
    effortArm: b.effortArm ?? [],
    effort: b.effort ?? DEFAULT_SELECTION.effort,
    controls: b.controls ?? false,
    controlsOnly: b.controlsOnly ?? false,
  };
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})$/, "$1-$2");
  let target: StripsTarget;
  if (b.resume === true) {
    if (b.run === undefined) return Response.json({ detail: "resume names the run it resumes." }, { status: 400 });
    target = { kind: "run", runId: b.run };
  } else {
    const options = {
      rounds: b.rounds ?? DEFAULT_OPTIONS.rounds,
      review: b.review ?? DEFAULT_OPTIONS.review,
      leonardo: b.leonardo ?? DEFAULT_OPTIONS.leonardo,
      authorTimeoutMin: b.authorTimeoutMin ?? DEFAULT_OPTIONS.authorTimeoutMin,
    };
    target = { kind: "new", runId: b.run ?? `strips-${stamp}`, selection, options };
  }
  try {
    const r = await launchStrips(target, {
      mode: b.mode ?? "dry",
      actor: { kind: "operator", id: "operator" },
      dryOnly: dryOnlyFrom(process.env),
      ...(b.ceilingUsd === undefined ? {} : { ceilingUsd: b.ceilingUsd }),
      ...(b.token === undefined ? {} : { token: b.token }),
    });
    if (!r.ok) return Response.json({ detail: r.error.message, code: r.error.code }, { status: STATUS[r.error.code] ?? 500 });
    const v = r.value;
    if (v.kind === "receipt") return Response.json({ receipt: v.receipt, cards: v.cards });
    if (v.kind === "stale") return Response.json({ detail: "The receipt is stale; confirm the fresh one.", fresh: v.fresh }, { status: 409 });
    if (v.kind === "existing") return Response.json({ runId: v.runId, jobId: v.jobId, state: v.state, existing: true });
    return Response.json({ runId: v.runId, jobId: v.jobId, receipt: v.receipt }, { status: 202 });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
