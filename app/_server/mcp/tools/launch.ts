import { z } from "zod";

import { ok, type Result } from "@gt/domain/errors";
import { isFreeReceipt, spendPacketId, type SpendSubject } from "@gt/domain/mcp";
import type { Confirmed, Receipt, ReceiptMode } from "@gt/domain/produce";
import { ceilingUsdSchema, composeInputSchema, composerEstimateSchema, composerInputSchema, partPatchSchema, receiptModeSchema } from "@gt/domain/produce.schema";
import { fileSpendRequest } from "@gt/kernel/spend-requests/store";

import { address, partActSchema } from "../../../(studio)/projects/[id]/_part/schema.ts";
import { defineOp, LAUNCHES, DESTROYS, READS, WRITES, wrap, type McpToolSpec, type Obj, type ToolCtx } from "../op.ts";

// gt_launch - compose a project, change its plan, price it, launch it; the Floor's runs the same.
// The doors are the Server Actions' own (@gt/domain/produce.schema, the part editor's schema).
//
// THE LIVE RULE (composer_run, plan_launch; @gt/domain/mcp's invariant). The receipt is recomputed
// here for the mode asked - the agent need not carry a token, and one it carries that no longer
// matches is answered with the fresh receipt and nothing launches. Dry launches dry, as the agent.
// Live launches only when that recomputed receipt is free (`isFreeReceipt`: no dollar, no range
// above zero, nothing unpriced but the Claude seat). Any other live ask is filed as a spend request
// for the operator's K or X on `pkt:spend:<day>`, in one store transaction with its ledger event,
// and nothing launches. Part acts run dry for every caller (the part side arms no live act).

const id = z.string().min(1).max(200);
const rev = z.number().int().positive();
const token = z.string().min(8).max(200);
const mode = receiptModeSchema.optional();
const target = z.string().min(1).max(200).optional();

/** File the ask; the answer names the request, its day's packet and the receipt it was filed on. */
function fileAsk(ctx: ToolCtx, subject: SpendSubject, receipt: Receipt): Result<Obj> {
  const s = ctx.deps.store();
  if (!s.ok) return s;
  const filed = s.value.tx((t) => fileSpendRequest(t, { subject, receipt }, ctx.agent.actor));
  if (!filed.ok) return filed;
  const { id: requestId, day } = filed.value;
  return ok({ kind: "spend-requested", requestId, day, receipt, view: `/board/${spendPacketId(day)}` });
}

type Ask = { readonly mode: ReceiptMode; readonly token?: string };

/** The live rule over a receipt already recomputed for `ask.mode`. */
async function liveRule<T extends object>(ctx: ToolCtx, receipt: Receipt, ask: Ask, subject: SpendSubject, launch: (token: string, mode: ReceiptMode) => Result<Confirmed<T>> | Promise<Result<Confirmed<T>>>, view: (v: T) => string): Promise<Result<Obj>> {
  if (ask.token !== undefined && ask.token !== receipt.token) return ok({ kind: "stale", fresh: receipt });
  if (ask.mode === "live" && !isFreeReceipt(receipt)) return fileAsk(ctx, subject, receipt);
  const l = await launch(receipt.token, ask.mode);
  if (!l.ok) return l;
  return l.value.kind === "stale" ? ok(l.value) : ok({ ...l.value, mode: ask.mode, view: view(l.value) });
}

export const LAUNCH_OPS: readonly McpToolSpec[] = [
  defineOp({
    family: "launch",
    op: "composer_receipt",
    title: "Floor run receipt",
    description: "Price a Floor run before it launches: lines (provider, model, units, seconds, usd or why unpriced), totals, queue place and ETA, read dry or live.",
    input: z.object({ input: composerEstimateSchema, mode }).strict(),
    annotations: READS,
    writes: false,
    run: async ({ input, mode: m }, { deps, agent }) => wrap(await deps.produce().composerReceipt({ input, ...(m === undefined ? {} : { mode: m }) }, agent.who), "receipt"),
  }),
  defineOp({
    family: "launch",
    op: "composer_run",
    title: "Launch a Floor run",
    description: "Launch a Floor run. Dry runs launch. A live run launches only when its recomputed receipt is free; otherwise it is filed as a spend request for the operator and nothing launches.",
    input: z.object({ input: composerInputSchema, mode, token: token.optional(), ceilingUsd: ceilingUsdSchema.optional() }).strict(),
    annotations: LAUNCHES,
    writes: true,
    run: async ({ input, mode: m = "dry", token: t, ceilingUsd }, ctx) => {
      const produce = ctx.deps.produce();
      const r = await produce.composerReceipt({ input, mode: m }, ctx.agent.who);
      if (!r.ok) return r;
      const ceiling = ceilingUsd === undefined ? {} : { ceilingUsd };
      return liveRule(ctx, r.value, { mode: m, ...(t === undefined ? {} : { token: t }) }, { kind: "run", input }, (tk, md) => produce.launchRun({ input, token: tk, mode: md, ...ceiling }, ctx.agent.who), (v) => `/projects/runs?job=${encodeURIComponent(v.jobId)}`);
    },
  }),
  defineOp({
    family: "launch",
    op: "compose",
    title: "Compose a project",
    description: "Compose a new project from a recipe, with a title, style, music take or topic and unit counts (compose_choices lists them). Answers the new project's id.",
    input: composeInputSchema,
    annotations: WRITES,
    writes: true,
    run: (i, { deps, agent }) => {
      const r = deps.produce().compose(i, agent.who);
      return r.ok ? ok({ id: r.value.id, view: `/projects/${r.value.id}` }) : r;
    },
  }),
  defineOp({
    family: "launch",
    op: "set_part",
    title: "Change a part",
    description: "Set one part's option and/or units at plan revision `rev`. A stale rev is a conflict naming the current one; answers the plan as it now reads.",
    input: z.object({ id, rev, partId: id.max(400), patch: partPatchSchema }).strict(),
    annotations: WRITES,
    writes: true,
    run: (i, { deps, agent }) => wrap(deps.produce().setPart(i, agent.who), "plan", { view: `/projects/${i.id}` }),
  }),
  defineOp({
    family: "launch",
    op: "rename",
    title: "Rename a project",
    description: "Retitle a project at plan revision `rev`; answers the plan as it now reads.",
    input: z.object({ id, rev, title: z.string().trim().min(1).max(200) }).strict(),
    annotations: { ...WRITES, idempotentHint: true },
    writes: true,
    run: (i, { deps, agent }) => wrap(deps.produce().rename(i, agent.who), "plan", { view: `/projects/${i.id}` }),
  }),
  defineOp({
    family: "launch",
    op: "plan_receipt",
    title: "Plan receipt",
    description: "Price a project's whole plan before launch: one line per part (provider, model, units, usd or why unpriced), totals, queue places and ETA, read dry or live.",
    input: z.object({ id, mode }).strict(),
    annotations: READS,
    writes: false,
    run: ({ id: pid, mode: m }, { deps, agent }) => wrap(deps.produce().planReceipt({ id: pid, ...(m === undefined ? {} : { mode: m }) }, agent.who), "receipt", { view: `/projects/${pid}` }),
  }),
  defineOp({
    family: "launch",
    op: "plan_launch",
    title: "Launch a plan",
    description: "Launch a project's plan at revision `rev`. Dry launches. Live launches only when the recomputed receipt is free; otherwise it is filed as a spend request for the operator and nothing launches.",
    input: z.object({ id, rev, mode, token: token.optional(), ceilingUsd: ceilingUsdSchema.optional() }).strict(),
    annotations: LAUNCHES,
    writes: true,
    run: async ({ id: pid, rev: at, mode: m = "dry", token: t, ceilingUsd }, ctx) => {
      const produce = ctx.deps.produce();
      const r = produce.planReceipt({ id: pid, mode: m }, ctx.agent.who);
      if (!r.ok) return r;
      // The plan moved since the agent read it: the receipt at its current revision, nothing launched.
      if (r.value.subject.kind === "project" && r.value.subject.rev !== at) return ok({ kind: "stale", fresh: r.value });
      const ceiling = ceilingUsd === undefined ? {} : { ceilingUsd };
      return liveRule(ctx, r.value, { mode: m, ...(t === undefined ? {} : { token: t }) }, { kind: "project", id: pid, rev: at }, (tk, md) => produce.launchPlan({ id: pid, rev: at, token: tk, mode: md, ...ceiling }, ctx.agent.who), () => `/projects/${pid}`);
    },
  }),
  defineOp({
    family: "launch",
    op: "discard",
    title: "Discard a project",
    description: "Discard a project at plan revision `rev`: it leaves the project list. A stale rev is a conflict.",
    input: z.object({ id, rev }).strict(),
    annotations: DESTROYS,
    writes: true,
    run: (i, { deps, agent }) => wrap(deps.produce().discard(i, agent.who), "discarded"),
  }),
  defineOp({
    family: "launch",
    op: "part_receipt",
    title: "Part act receipt",
    description: "Price one generating act on a part (research, script candidates, frames, a cue, a clip) before it runs; `target` names one unit. Part acts run dry.",
    input: z.object({ ...address, act: partActSchema, target }).strict(),
    annotations: READS,
    writes: false,
    run: async (i, { deps, agent }) => wrap(await (await deps.part()).actReceipt(i, agent.who), "receipt", { view: `/projects/${i.projectId}/${i.key}` }),
  }),
  defineOp({
    family: "launch",
    op: "part_act",
    title: "Run a part act",
    description: "Run one generating act on a part with its receipt's token. Part acts run dry for every caller; a stale token answers the fresh receipt.",
    input: z.object({ ...address, act: partActSchema, target, token }).strict(),
    annotations: LAUNCHES,
    writes: true,
    run: async (i, { deps, agent }) => {
      const r = await (await deps.part()).act(i, agent.who);
      if (!r.ok) return r;
      return r.value.kind === "stale" ? ok(r.value) : ok({ ...r.value, view: `/projects/${i.projectId}/${i.key}` });
    },
  }),
];
