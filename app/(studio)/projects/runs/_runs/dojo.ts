"use server";

// THE START-CYCLE DOOR'S ACTIONS (L45): a Dojo cycle the skill left `planning` with a gen-spec is
// started from Runs through the cycle's own launch (lib/producers/dojo.ts `launchDojo`) - the same
// receipt, the same job id (`job:run:dojo:<cycle>`) and the same Run row the CLI makes
// (pipeline/foundry/launch.mts dojo <cycle>), so a cycle started here is the job `launch.mts`
// names as `existing`. A local cycle's job waits on gpu.local for pipeline/foundry/worker.py; a
// google cycle's for the Node worker, which carries dojo@cloud.google.
//
// Every write is `money` key use (the action wrapper); the read of a receipt is the first half of
// one, as the produce port's are (../../_port/actions.ts).

import { z } from "zod";

import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Receipt } from "@gt/domain/produce";
import { ceilingUsdSchema, receiptModeSchema } from "@gt/domain/produce.schema";
import { dryOnlyFrom } from "@gt/kernel/dryrun";

import { kernel } from "../../../../../lib/kernelStore.ts";
import type { Principal } from "../../../../../lib/principal.ts";
import { launchDojo, type DojoLaunch } from "../../../../../lib/producers/dojo.ts";
import { action } from "../../../../_server/action.ts";
import type { ActionResult } from "../../../../_server/actionCore.ts";

const cycle = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/);
const actorOf = (p: Principal): Actor => ({ kind: "operator", id: "uid" in p ? p.uid : "operator" });

export type DojoStart = { readonly kind: "launched"; readonly jobId: string; readonly note: string } | { readonly kind: "stale"; readonly fresh: Receipt };

function launched(r: Result<DojoLaunch>): Result<DojoStart> {
  if (!r.ok) return r;
  const v = r.value;
  switch (v.kind) {
    case "launched":
    case "retried":
      return ok({ kind: "launched", jobId: v.jobId, note: `dojo ${v.cycle}: job ${v.jobId} ${v.kind} on ${v.runner.lane}` });
    case "stale":
      return ok({ kind: "stale", fresh: v.fresh });
    case "existing":
      return err("conflict", `dojo ${v.cycle} is served by job ${v.jobId} (${v.state}); one job serves a cycle at a time`);
    case "receipt":
      return err("internal", "a dojo confirm answered a receipt");
  }
}

const receiptAction = action("dojo receipt", z.object({ cycle, mode: receiptModeSchema }), (i, who): Result<Receipt> => {
  const k = kernel();
  if (!k.ok) return k;
  const r = launchDojo(k.value.store, i.cycle, { mode: i.mode, actor: actorOf(who), dryOnly: dryOnlyFrom(process.env) });
  if (!r.ok) return r;
  if (r.value.kind === "receipt") return ok(r.value.receipt);
  return r.value.kind === "existing" ? err("conflict", `dojo ${i.cycle} is served by job ${r.value.jobId} (${r.value.state})`) : err("internal", `a dojo receipt read answered ${r.value.kind}`);
});

export async function dojoReceipt(input: { readonly cycle: string; readonly mode: "dry" | "live" }): Promise<ActionResult<Receipt>> {
  return receiptAction(input);
}

const startAction = action("dojo start", z.object({ cycle, mode: receiptModeSchema, token: z.string().min(8).max(200), ceilingUsd: ceilingUsdSchema.optional() }), (i, who): Result<DojoStart> => {
  const k = kernel();
  if (!k.ok) return k;
  return launched(launchDojo(k.value.store, i.cycle, { mode: i.mode, token: i.token, actor: actorOf(who), dryOnly: dryOnlyFrom(process.env), ...(i.ceilingUsd === undefined ? {} : { ceilingUsd: i.ceilingUsd }) }));
});

export async function startDojo(input: { readonly cycle: string; readonly mode: "dry" | "live"; readonly token: string; readonly ceilingUsd?: number }): Promise<ActionResult<DojoStart>> {
  return startAction(input);
}
