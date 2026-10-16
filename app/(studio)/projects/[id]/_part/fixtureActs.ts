import "server-only";

import { ok, type Result } from "@gt/domain/errors";
import type { PartActKind, PartActResult, PartReceipt } from "@gt/domain/partView";

import { actBasis, landAct, nextJobId, type ActBasis } from "./fixture.ts";
import { digest } from "./hash.ts";
import { isLaterKind, later, targetToken } from "./kinds.ts";

// A PART ACT IS A RECEIPT, THEN A CONFIRM (COMMON decision 3), priced statically from the plan:
// the part's chosen model option (the same `ModelOption` the Plan row shows and the router
// quotes) times the act's units (one turn, or N queued follow-ups). Never by running the act.
// The token digests the part's rev, the act, the option and the units: any write to the part,
// or a re-route of its model on the Plan, makes an open receipt stale, and its confirm answers
// the fresh receipt instead of launching (the Phase 3 consequence pattern).
//
// Every fixture act is DRY: `mode: "dry"` on the receipt, and the confirm runs the act's stand-in
// and lands it as a job write. A live arm does not exist on this side (GRAVITONE_DRY_ONLY).

// The later kinds' acts label themselves (./kinds.ts `actLabel`); this table is research's and script's.
const LABELS: Readonly<Partial<Record<PartActKind, string>>> = {
  "run-research": "research turn",
  "follow-up": "follow-up turns",
  "generate-ideas": "ideas round",
  "compose-candidates": "compose turn",
  recalibrate: "edit-plan turn",
  "generate-scenarios": "scenarios round",
};

export function receiptOf(b: ActBasis, act: PartActKind): PartReceipt {
  const o = b.part.options.find((x) => x.key === b.part.chosen) ?? b.part.options[0];
  const now = b.ctx.now;
  const seconds = Math.round((o?.secondsPerUnit ?? 0) * b.units);
  const usd = o === undefined || o.usdPerUnit === null ? null : Math.round(o.usdPerUnit * b.units * 100) / 100;
  const end = new Date(now + seconds * 1000).toISOString();
  const unpricedReason = usd === null ? (o?.unpricedReason ?? "no price for this route") : undefined;
  const src = o?.src ?? "illustrative";
  return {
    token: targetToken(digest({ part: b.part.id, rev: b.rev, act, option: o?.key ?? null, units: b.units }), b.target),
    subject: { kind: "part", projectId: b.ctx.project.id, partId: b.part.id, rev: b.rev, act },
    mode: "dry",
    lines: [
      {
        key: act,
        label: (isLaterKind(b.kind) ? later(b.kind).actLabel(act) : LABELS[act]) ?? act,
        lane: o?.lane ?? "seat.text",
        provider: o?.provider ?? "—",
        model: o?.model ?? "—",
        units: b.units,
        seconds,
        usd,
        ...(unpricedReason === undefined ? {} : { unpricedReason }),
        src,
        queuePos: 1,
        start: new Date(now).toISOString(),
        end,
      },
    ],
    totals: { seconds, usd: usd ?? 0, unpriced: usd === null ? 1 : 0, src },
    queuePos: 1,
    etaAt: end,
    overCeiling: false,
    readAt: new Date(now).toISOString(),
  };
}

export function actReceipt(projectId: string, key: string, act: PartActKind, now: number, target?: string): Result<PartReceipt> {
  const b = actBasis(projectId, key, act, now, target);
  return b.ok ? ok(receiptOf(b.value, act)) : b;
}

export function confirmAct(projectId: string, key: string, act: PartActKind, token: string, now: number, target?: string): Result<PartActResult> {
  const b = actBasis(projectId, key, act, now, target);
  if (!b.ok) return b;
  const fresh = receiptOf(b.value, act);
  if (fresh.token !== token) return ok({ kind: "stale", fresh });
  const jobId = nextJobId(b.value, act);
  const view = landAct(b.value, act, jobId);
  return view.ok ? ok({ kind: "launched", jobId, view: view.value }) : view;
}
