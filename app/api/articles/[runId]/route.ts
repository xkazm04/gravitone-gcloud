// GET /api/articles/<runId> — everything /articles/<runId> draws, in one read.
//
// The engine's `getRunDetail` (run, sources, claims, outline, meta, check,
// patches with their diffs, post path), plus four things the gate needs that
// the detail does not carry, each read off the run directory as WP3 writes it
// and each ABSENT when the file is absent — never an empty stand-in:
//
//   driving      a live process holds the run's driver lease (store.ts). A
//                working status with no driver is a run whose drive died: the
//                page offers Resume instead of a spinner that never ends.
//   refused      patches.rejected.json — proposals the engine refused, with why
//   agent        agent/<step>.json — each turn's outcome, turns, cost, errors
//   landingLog   landing.log — the registry gates' output, tail only

import { guardAccessOnly } from "@/lib/apiAuth";
import { getRunDetail } from "@/lib/articles/engine";
import { driverAlive, inRun, readJsonFile, readTextFile } from "@/lib/articles/store";

import { failure } from "../_lib/respond";

export const runtime = "nodejs";

const STEPS = ["research", "outline", "draft"] as const;
/** The tail is what a failed gate leaves worth reading; the file can be long. */
const LOG_TAIL = 16_000;

interface AgentReceipt {
  turn: string;
  outcome: string;
  turns?: number;
  durationMs?: number;
  costUsd?: number;
  errors?: string[];
}

export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  const { runId } = await params;
  try {
    const detail = await getRunDetail(runId);
    const [driving, refused, log, ...receipts] = await Promise.all([
      driverAlive(runId),
      readJsonFile<{ entry: unknown; reason: string }[] | null>(inRun(runId, "patches.rejected.json"), null),
      readTextFile(inRun(runId, "landing.log")),
      ...STEPS.map((s) => readJsonFile<AgentReceipt | null>(inRun(runId, `agent/${s}.json`), null)),
    ]);
    const agent: Record<string, AgentReceipt> = {};
    STEPS.forEach((s, i) => {
      const r = receipts[i];
      if (r) agent[s] = { turn: r.turn, outcome: r.outcome, turns: r.turns, durationMs: r.durationMs, ...(r.costUsd !== undefined ? { costUsd: r.costUsd } : {}), errors: r.errors ?? [] };
    });
    return Response.json({
      ...detail,
      driving,
      agent,
      ...(refused ? { refused: refused.map((r) => ({ reason: r.reason, target: targetOf(r.entry), id: idOf(r.entry) })) } : {}),
      ...(log !== undefined ? { landingLog: log.length > LOG_TAIL ? log.slice(-LOG_TAIL) : log } : {}),
    });
  } catch (e) {
    return failure(e);
  }
}

const field = (entry: unknown, k: string): string | undefined => {
  const v = entry && typeof entry === "object" ? (entry as Record<string, unknown>)[k] : undefined;
  return typeof v === "string" ? v : undefined;
};
const targetOf = (entry: unknown) => field(entry, "target") ?? null;
const idOf = (entry: unknown) => field(entry, "id") ?? null;
