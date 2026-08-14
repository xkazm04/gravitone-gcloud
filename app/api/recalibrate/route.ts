// POST /api/recalibrate — notes in, an EDIT PLAN out.
//
// The engine is a LOCAL CLAUDE CODE PROCESS, driven headlessly (`lib/claudeCli.ts`).
// It authenticates with the machine's logged-in subscription, so there is no API
// key anywhere in this app — not in the environment, not in a vault, not in a
// browser bundle. That is the whole reason for this shape.
//
// The seam is still a route handler rather than a fetch from the pad, for a
// different reason than before: a browser cannot spawn a process either.
//
// Two costs of the CLI engine over the SDK, both real, both paid deliberately:
//   1. No `output_config.format`, so the plan's shape is a REQUEST, not a
//      guarantee — `parseEditPlan` validates and rejects rather than trusting.
//   2. No cross-call prompt caching, so each run re-reads the whole notebook.
//      Runs are minutes either way; this is a cost line, not a latency one.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { CliError, runClaude } from "@/lib/claudeCli";
import { MODEL } from "@/lib/model";
import { EDIT_PLAN_SCHEMA, PlanError, parseEditPlan } from "@/app/_phases/script/editPlan";

export const runtime = "nodejs";
/** A real run is minutes. Give the handler room rather than truncating it. */
export const maxDuration = 800;

let cachedPrompt: string | null = null;
async function systemPrompt(): Promise<string> {
  // A versioned document beside the research prompt, not a string literal here —
  // it is edited far more often than this handler is.
  if (!cachedPrompt)
    cachedPrompt = await readFile(path.join(process.cwd(), "pipeline", "RECALIBRATE-PROMPT.md"), "utf8");
  return cachedPrompt;
}

export async function POST(req: Request) {
  let body: { notebook?: unknown; renders?: unknown; scope?: unknown; notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Request body was not valid JSON." }, { status: 400 });
  }
  if (!Array.isArray(body.notes) || body.notes.length === 0)
    return Response.json({ detail: "No notes were sent, so there is nothing to recalibrate." }, { status: 400 });

  // Everything goes down stdin. The notebook and three beat chains are far past
  // any platform's command-line argument limit, and on Windows that limit fails
  // as a truncated argument rather than an error — a silent corruption of the
  // one input the whole run depends on.
  const prompt = [
    await systemPrompt(),
    "",
    "---",
    "",
    "# THE RUN",
    "",
    "Return ONE JSON object and nothing else — no prose before or after, no code fence.",
    "It must satisfy this schema:",
    "",
    JSON.stringify(EDIT_PLAN_SCHEMA, null, 2),
    "",
    "## NOTEBOOK",
    JSON.stringify(body.notebook),
    "",
    "## CURRENT RENDERS",
    JSON.stringify(body.renders),
    "",
    "## SCOPE (cards the creator has taken out)",
    JSON.stringify(body.scope),
    "",
    "## NOTES",
    JSON.stringify(body.notes, null, 2),
  ].join("\n");

  try {
    const run = await runClaude(prompt);
    const plan = parseEditPlan(run.text);
    // The receipt travels with the plan. A run that took minutes and cost real
    // money and could tell the creator neither was the defect; the client keeps
    // this on the version it stages, so what a version cost survives with it.
    return Response.json({
      plan,
      engine: {
        kind: "local-claude-code",
        model: MODEL,
        sessionId: run.sessionId,
        costUsd: run.costUsd,
        durationMs: run.durationMs,
        promptChars: prompt.length,
      },
    });
  } catch (e) {
    if (e instanceof PlanError)
      // The engine ran and returned something unusable. Say which, because the
      // fix is a prompt change, not a retry.
      return Response.json(
        { detail: `The engine returned a plan this app cannot use: ${e.message} Nothing was changed.` },
        { status: 502 },
      );

    if (e instanceof CliError) {
      const status = e.kind === "not-installed" || e.kind === "not-logged-in" ? 503 : 504;
      return Response.json({ detail: `${e.message} Nothing was changed.`, code: e.kind }, { status });
    }

    console.error("[recalibrate]", e);
    return Response.json({ detail: "The recalibration failed. Nothing was changed." }, { status: 502 });
  }
}
