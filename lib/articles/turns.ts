// ONE AGENT TURN, AS A VALUE - the engine's two kinds of turn (a writer's `runAgent`, a
// reviewer's `runReviewer`) as one union, so the article job's meter
// (packages/producers/src/article/define.ts) can declare, cap, refuse and stand in for any
// turn without knowing which. Server only. Kept beside the engine because these are the
// engine's own shapes: the refusal is the one lib/articles/loop.ts `guardedDeps` returns too (a writer
// turn errors, a reviewer is unavailable), and the stand-in is lib/articles/dryAgent.ts.

import { runAgent, runReviewer, type AgentResult, type ReviewerCall, type RunAgentInput } from "@/lib/agent/cliSeam";

import { dryRunAgent, dryRunReviewer } from "./dryAgent";
import type { EngineDeps } from "./engine";

export type ArticleTurn = { readonly kind: "writer"; readonly input: RunAgentInput } | { readonly kind: "reviewer"; readonly call: ReviewerCall };

export const describeTurn = (t: ArticleTurn) =>
  t.kind === "writer"
    ? { engine: "claude", model: t.input.model, effort: t.input.effort, turn: t.input.turn, promptChars: t.input.prompt.length }
    : { engine: t.call.engine, model: t.call.model, effort: t.call.effort, turn: "article-review", promptChars: t.call.prompt.length };

/** The turn on the operator's seat. */
export const liveTurn = (t: ArticleTurn): Promise<AgentResult> => (t.kind === "writer" ? runAgent(t.input) : runReviewer(t.call));

/** The turn answered by the stub; the seat is never entered. */
export const standInTurn = (t: ArticleTurn): Promise<AgentResult> => (t.kind === "writer" ? dryRunAgent(t.input) : dryRunReviewer(t.call));

export const refusedTurn = (t: ArticleTurn, reason: string): AgentResult => ({ outcome: t.kind === "writer" ? "errored" : "unavailable", final: "", turns: 0, durationMs: 0, exitCode: null, errors: [reason] });

/** A writer turn's `--max-budget-usd` lowered to `usd`; a reviewer has no such flag. */
export const cappedTurn = (t: ArticleTurn, usd: number): ArticleTurn =>
  t.kind === "writer" ? { kind: "writer", input: { ...t.input, maxBudgetUsd: Math.min(t.input.maxBudgetUsd ?? Number.POSITIVE_INFINITY, usd) } } : t;

/** Engine deps whose every turn goes through `turn`. */
export const depsThrough = (base: EngineDeps, turn: (t: ArticleTurn) => Promise<AgentResult>): EngineDeps => ({
  ...base,
  runAgent: (input) => turn({ kind: "writer", input }),
  runReviewer: (call) => turn({ kind: "reviewer", call }),
});
