// POST /api/frames — a script and a notebook in, SCENE SPECS out.
//
// This is the step's centre of gravity. Everything else in Step 3 is plumbing;
// the difference between a video and a narrated slide deck is made here, by a
// model that has read the whole script and is asked to art-direct it.
//
// Why it exists at all: the first cut of this step derived each plate's subject
// from a lookup table keyed on the beat's rhetorical KIND — nine roles, nine
// canned compositions. It was fast, deterministic, and produced exactly the
// deck it deserved: every `movement` beat got the same cycle diagram whatever
// the movement was about. A template per slide type IS PowerPoint. The fix is
// not a better table.
//
// THE ENGINE IS WHICHEVER ONE THIS DEPLOYMENT HAS (`lib/text/router.ts`).
//
// It used to be the local Claude CLI, named here and imported directly. It still
// IS the local CLI on a machine that has one — that is rung 1 of the ladder and
// the app's default posture — but this handler no longer knows or cares. It
// states the TURN (`scene-direction`) and the shape it needs back, and the
// chokepoint decides which engine can serve it here: the operator's seat on a
// laptop, a metered Gemini key on Cloud Run, an honest refusal naming every
// candidate when neither is available.
//
// The reason that mattered enough to change a working route: `spawn("claude")`
// cannot happen on a managed platform, so this handler — the centre of gravity
// of Step 3 — was the single thing standing between this app and running as a
// hosted service at all.
//
// WHICH ENGINE SERVED TRAVELS WITH THE ANSWER, in `engine` below, and always
// did: this route already returned a receipt. What is new is that the receipt
// can now say something other than "local-claude-code", and it is the router
// that fills it in rather than a string literal here that could go stale.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { guardRequest } from "@/lib/apiAuth";
import { compileFormatBrief } from "@/lib/formatBrief";
import { TextError, statusFor } from "@/lib/text/errors";
import { reason } from "@/lib/text/router";

export const runtime = "nodejs";
/** Sixteen art-direction decisions over a whole script is minutes, not seconds. */
export const maxDuration = 800;

let cachedPrompt: string | null = null;
async function systemPrompt(): Promise<string> {
  if (!cachedPrompt)
    cachedPrompt = await readFile(path.join(process.cwd(), "pipeline", "FRAMES-SCENE-PROMPT.md"), "utf8");
  return cachedPrompt;
}

/**
 * WHAT THIS RUN IS ALLOWED TO COST, IN INPUT.
 *
 * Everything below `body` is caller-supplied and goes down stdin into a Claude
 * CLI run on the operator's own subscription. Until these bounds existed the
 * route checked that `beats` was a non-empty array and `style` was truthy, and
 * nothing else: a caller could send fifty megabytes of beats and buy a
 * proportionally enormous run, once per rate-limit slot.
 *
 * The sibling compute route already does this. app/api/music/generate/route.ts
 * caps every field it accepts - `asString(v, field, max)`, `asStrings(v, field,
 * cap)` - because it spends a vendor balance. This one spends a subscription,
 * which is not free either, and it had no cap at all. Same class of route, two
 * implementations, one bound.
 *
 * The ceiling that actually matters is the ASSEMBLED prompt, because that is
 * what is paid for; the per-array counts are there to fail early and to name
 * which part was oversized, which a single byte count cannot.
 */
const MAX_BEATS = 400;
const MAX_FACTS = 600;
/** Roughly a quarter of a million tokens of input - far past any real script,
 *  and far short of a bill nobody authorised. */
const MAX_PROMPT_CHARS = 1_000_000;

/** Serialised size of one caller-supplied field, or 0 when it is absent. */
function jsonSize(v: unknown): number {
  if (v === undefined || v === null) return 0;
  try {
    return JSON.stringify(v)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY; // circular or unserialisable: refuse it
  }
}

/**
 * Why this run is too large, or `null` when it is not.
 *
 * A pure predicate rather than four inline returns, because the NEGATIVE case is
 * otherwise unprobeable: asking the route "is a forty-beat script refused" means
 * getting past the bounds and dispatching a real Claude run, and a probe that
 * spends the operator's subscription to prove a limit is not a probe. The route
 * and the guard now answer the same question and the guard can be asked alone.
 */
export function tooLarge(body: {
  beats?: unknown;
  facts?: unknown;
  style?: unknown;
  schema?: unknown;
}): string | null {
  const beats = Array.isArray(body.beats) ? body.beats : [];
  if (beats.length > MAX_BEATS)
    return `${beats.length} beats were sent; this route composes at most ${MAX_BEATS}. Nothing was dispatched.`;
  if (Array.isArray(body.facts) && body.facts.length > MAX_FACTS)
    return `${body.facts.length} facts were sent; this route carries at most ${MAX_FACTS}. Nothing was dispatched.`;
  const declared = jsonSize(body.beats) + jsonSize(body.facts) + jsonSize(body.style) + jsonSize(body.schema);
  if (declared > MAX_PROMPT_CHARS)
    return `The run's material is ${Math.round(declared / 1000)}k characters; the ceiling is ${MAX_PROMPT_CHARS / 1000}k. Nothing was dispatched.`;
  return null;
}

export async function POST(req: Request) {
  // Local-compute route (spends the machine's Claude subscription) — auth +
  // rate limit before anything is read or dispatched.
  const denied = guardRequest(req);
  if (denied) return denied;

  // `template` and `targetS` are the project record's own two format fields, and
  // they are `unknown` here like everything else that arrives as JSON: the seam
  // that decides whether they can be trusted is lib/formatBrief.ts, which refuses
  // to invent either. A run that omits them is not an error — it is a run whose
  // format block says it was not told, which is the honest shape for a caller
  // (the direction probe, an older client) that has no project record to read.
  let body: {
    beats?: unknown;
    facts?: unknown;
    style?: unknown;
    schema?: unknown;
    title?: unknown;
    template?: unknown;
    targetS?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Request body was not valid JSON." }, { status: 400 });
  }
  if (!Array.isArray(body.beats) || body.beats.length === 0)
    return Response.json({ detail: "No beats were sent, so there is nothing to art-direct." }, { status: 400 });
  if (!body.style)
    return Response.json({ detail: "No visual style was sent. A scene cannot be composed without one." }, { status: 400 });

  // COUNTS FIRST, so an oversized run is refused before a megabyte of it is
  // serialised into a prompt, and so the refusal can name which part was too big.
  const oversized = tooLarge(body);
  if (oversized) return Response.json({ detail: oversized, code: "too-large" }, { status: 413 });

  // Everything down stdin: the script and notebook together are far past any
  // platform's argv limit, and on Windows that limit truncates silently.
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
    JSON.stringify(body.schema ?? {}, null, 2),
    "",
    // FIRST of the run's four blocks, ahead of the script. What kind of piece
    // this is changes how every beat after it should be read, and a brief that
    // arrives after the material it governs is a brief the model has already
    // started without.
    compileFormatBrief(body.template, body.targetS),
    "",
    `## THE SCRIPT — ${String(body.title ?? "untitled")}`,
    "Beats in order. `at` is the timestamp you must echo as `beatAt`.",
    JSON.stringify(body.beats, null, 2),
    "",
    "## THE NOTEBOOK — every fact you may cite",
    "A figure on screen MUST carry one of these ids. If no row supports a number, do not show one.",
    JSON.stringify(body.facts, null, 2),
    "",
    "## THE LOCKED VISUAL STYLE — compose within it, not against it",
    JSON.stringify(body.style, null, 2),
  ].join("\n");

  // The ASSEMBLED size is the one that is billed, and it carries the system
  // prompt and the format brief on top of what the caller sent. Checked here
  // rather than only above, because the sum is what leaves the machine.
  if (prompt.length > MAX_PROMPT_CHARS)
    return Response.json(
      {
        detail: `The assembled run is ${Math.round(prompt.length / 1000)}k characters; the ceiling is ${MAX_PROMPT_CHARS / 1000}k. Nothing was dispatched.`,
        code: "too-large",
      },
      { status: 413 },
    );

  try {
    // The schema is NOT passed to the engine as `schema` here, deliberately.
    // This route's contract with its caller is `raw` — useFrames.ts owns the
    // parse, and it does more than schema-checking (it reconciles `beatAt`
    // against the script it sent). Handing the router a schema would make it
    // validate and populate `json` that nobody reads, and on the cloud rung it
    // would additionally constrain decoding to a translated subset of a schema
    // this handler received as opaque JSON from the client. The schema still
    // travels — inside the prompt, above — which is where it always did.
    const run = await reason({ prompt, turn: "scene-direction" });
    return Response.json({
      raw: run.text,
      // The receipt now names the rung and the transport. A creator whose
      // prompt crossed the network to a vendor is entitled to see that, and a
      // cloud answer that rendered indistinguishably from a local one is the
      // one thing the ladder may never do.
      engine: {
        kind: run.provenance.transport === "local-subprocess" ? "local-claude-code" : "cloud-api",
        provider: run.provenance.provider,
        model: run.provenance.model,
        rung: run.provenance.rung,
        sessionId: run.provenance.sessionId,
        costUsd: run.provenance.costUsd,
        costBasis: run.provenance.costBasis,
        durationMs: run.provenance.durationMs,
        reroutedFrom: run.provenance.reroutedFrom,
      },
    });
  } catch (e) {
    // One taxonomy, one status map (lib/text/errors.ts). This handler used to
    // carry its own copy of the status decision, as did /api/recalibrate — two
    // copies with no third place that owned them.
    if (e instanceof TextError)
      return Response.json(
        { detail: `${e.message} Nothing was changed.`, code: e.kind },
        { status: statusFor(e.kind) },
      );
    console.error("[frames]", e);
    return Response.json({ detail: "The scene direction failed. Nothing was changed." }, { status: 502 });
  }
}
