// /api/research — a topic in, a NOTEBOOK out. Step 1's seam to the real engine.
//
// Both halves of this seam were already built and nothing connected them:
// `pipeline/RESEARCH-PROMPT.md` is a nine-phase instruction set whose own header
// says it was "written to be fine-tuned in the terminal now and lifted into the
// app later", `pipeline/NOTEBOOK-SCHEMA.md` defines the deliverable, and
// `lib/text/router.ts` has been billing three other routes for weeks. Step 1 —
// the step named Research — could not research. This is the wire.
//
// SHAPED ON /api/recalibrate, deliberately and almost line for line: the same
// `guardRequest` first, the same prompt-from-disk with its own `PromptUnavailable`
// failure, the same `reason()` call at the chokepoint, the same three-branch
// catch ending in `statusFor(e.kind)`. Two reasoning routes that answered the
// same failure two different ways would be the exact defect lib/text/errors.ts
// was written to end.
//
// ── THE ONE THING THIS ROUTE MUST SAY OUT LOUD ──────────────────────────────
//
// RESEARCH-PROMPT.md § Phase 1 asks for "4–8 searches covering the subject's
// distinct causal domains". THIS ENGINE CANNOT SEARCH, on either rung:
//
//   · the local transport spawns with `--allowed-tools "" --max-turns 1`
//     (lib/claudeCli.ts:241 — "load-bearing: this is a pure text transform"),
//   · the cloud adapter declares no tools and enables no grounding
//     (lib/text/providers/google.ts),
//   · and `TextCapability` has one member, `reason`, with types.ts stating that
//     a workspace-touching run "would be a SEPARATE SEAM, not a flag on this
//     one".
//
// So a run through here is REASONED, NOT RETRIEVED. Every source in the answer
// is the model's own recollection of a publication, and a recollected citation
// is the single most confident-looking wrong thing a language model produces.
// That is not a reason to refuse to build the path — the notebook it produces is
// a real, structured, checkable first draft, which is more than the fixture gives
// a creator with their own idea — but it IS a reason that the word "researched"
// may not be used for it anywhere. Three places carry the fact instead:
//
//   1. THE PROMPT. § THE RUN below tells the engine it has no search, and binds
//      it to the prompt's OWN machinery for that state rather than a new rule:
//      Phase 9's `research_gaps` ("what you did not do") and the confidence
//      ladder in § facts.
//   2. THE RECEIPT. `provenance.searched: false` travels on the response.
//   3. THE SURFACE. app/_phases/research/run/provenance.ts turns it into the
//      `reasoned` origin, drawn beside the notebook exactly as `StandInNote`
//      draws `replayed` beside the fixture.
//
// If a tool-using capability is ever added, the honest upgrade is a second
// capability and a second adapter — and then this comment, the prompt block and
// the `searched` flag all change together, which is the point of there being
// three of them rather than one.
//
// ── WHAT GET DISCLOSES, AND WHY IT IS NOT app/api/imaging/pricing ───────────
//
// That route is deliberately PUBLIC and deliberately says nothing about key
// state: "the response is byte for byte identical on a box with three keys and a
// box with none." This one does the opposite — `engineStatus()` reports which
// candidates dropped out and why, which is exactly the key-and-posture state
// that route refuses to leak. That is a considered inversion, not an oversight:
//
//   · it is REQUIRED. A creator who presses a spend button that cannot work is
//     owed the reason before the click, in lib/text/errors.ts's own vocabulary
//     (`no-key`, `not-installed`, `not-logged-in`, `policy-forbidden`,
//     `managed-platform`) — five different remedies that a shared 503 cannot
//     distinguish after the fact.
//   · so it is GATED. `guardRequest` runs on GET as well as POST, which the
//     public pricing route does not do. An unauthenticated caller learns
//     nothing.
//   · and it stays NARROW. The price half is `textPriceTable()` verbatim — the
//     same committed literals, the same audit, no key, no environment.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { guardRequest } from "@/lib/apiAuth";
import { NotebookError, NOTEBOOK_SCHEMA, parseNotebook } from "@/lib/notebook/validate";
import { TextError, statusFor } from "@/lib/text/errors";
import { textPriceTable } from "@/lib/text/pricing";
import { engineStatus, reason } from "@/lib/text/router";

export const runtime = "nodejs";
/** A real run is minutes — nine phases and one large structured answer. Room to
 *  finish, and above the router's own 600s ceiling for a `research` turn so the
 *  engine gives up first and the creator gets a sentence. */
export const maxDuration = 800;

/** The topic budget. Not a guess: the field is one line of a form and a topic is
 *  a subject, not a brief. A 4,000-character "topic" is either a paste accident
 *  or someone using the field as a prompt injection surface, and both are
 *  cheaper to refuse here than to discover at Opus prices.
 *
 *  IT IS SERVED ON THE PRE-FLIGHT rather than restated in the field. A budget
 *  declared twice is a budget that rots — the imaging price table's own argument
 *  — and the failure mode here is specific and unkind: a creator types 400
 *  characters into a field that accepts them, presses a spend button, and is
 *  told the number they were never shown. The input caps itself from this value
 *  (run/live.ts::Preflight → TopicField's `maxLength`), so the two cannot
 *  disagree. The check below stays, because a client-side cap is a courtesy and
 *  never a control. */
const MAX_TOPIC_CHARS = 300;

/** The system prompt is a file on disk, so it is a thing that can be MISSING.
 *  `pipeline/` is not part of the app's module graph; a deployment that does not
 *  carry it produces exactly this, and it is named separately because the
 *  generic answer would send the operator to check an engine that was never
 *  started. Lifted verbatim in intent from /api/recalibrate. */
class PromptUnavailable extends Error {}

let cachedPrompt: string | null = null;
async function systemPrompt(): Promise<string> {
  if (!cachedPrompt) {
    const at = path.join(process.cwd(), "pipeline", "RESEARCH-PROMPT.md");
    try {
      cachedPrompt = await readFile(at, "utf8");
    } catch {
      throw new PromptUnavailable(`The research prompt could not be read from ${at}.`);
    }
  }
  return cachedPrompt;
}

/* ─────────────────────────────── the pre-flight ──────────────────────────── */

/**
 * GET — what would happen if you pressed the button, before you press it.
 *
 * Two facts and no third: WHO would serve (and if nobody, why not, in the
 * taxonomy's own words), and WHAT this app knows about that engine's price. The
 * client turns them into one sentence beside the button — the manner
 * app/library/Playground.tsx and app/_phases/score/ScoreSpotting.tsx already
 * use for imaging and music spend.
 *
 * `engineStatus` walks the same plan `reason()` walks and asks the same two
 * gates, so this cannot report an availability the run then disagrees with. It
 * probes the local transport, which is a `claude --version`-class call and free.
 */
export async function GET(req: Request): Promise<Response> {
  const denied = guardRequest(req);
  if (denied) return denied;

  const status = await engineStatus("research");
  return Response.json({
    ...status,
    // Verbatim, exactly as /api/imaging/pricing serves its own table: every row
    // here is a literal committed to this repo, and every one of them is
    // currently UNPRICED and says why in its own words. An unpriced call is
    // unpriced, not free — lib/text/pricing.ts's first rule — and the client
    // renders that in words rather than as a numeral.
    prices: textPriceTable(),
    // A `research` turn cannot search. Sent so the surface's disclosure and the
    // route's prompt cannot drift apart: one flag, read by both.
    searched: false,
    // The field's cap, from the one place it is declared.
    maxTopicChars: MAX_TOPIC_CHARS,
  });
}

/* ────────────────────────────────── the run ──────────────────────────────── */

export async function POST(req: Request): Promise<Response> {
  // MONEY/COMPUTE ROUTE — auth + rate limit before anything is read or spawned,
  // the same first line as every other spending route in this app.
  const denied = guardRequest(req);
  if (denied) return denied;

  let body: { topic?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Request body was not valid JSON." }, { status: 400 });
  }

  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  if (!topic)
    return Response.json({ detail: "No topic was sent, so there is nothing to research." }, { status: 400 });
  if (topic.length > MAX_TOPIC_CHARS)
    return Response.json(
      {
        detail: `That topic is ${topic.length} characters; this field takes ${MAX_TOPIC_CHARS}. Nothing was dispatched and nothing was billed.`,
      },
      { status: 400 },
    );

  try {
    const prompt = [
      await systemPrompt(),
      "",
      "---",
      "",
      "# THE RUN",
      "",
      `## THE TOPIC`,
      topic,
      "",
      // THE ONE DEPARTURE FROM THE DOCUMENT ABOVE, stated to the engine as a
      // constraint rather than left for it to discover mid-Phase-1. It is
      // discharged through the prompt's OWN machinery — Phase 9 and the
      // confidence ladder — because a second, route-local honesty rule is a
      // second rule that can drift from the versioned one.
      "## YOU HAVE NO SEARCH",
      "This run is a single turn with NO TOOLS: no web search, no fetch, no file access. Phase 1",
      "asks for 4–8 searches and you cannot run one. Do not pretend otherwise, and do not stop:",
      "",
      "  · Work the nine phases over what you already know. Phase 2 — finding the tension — is",
      "    judgement, not retrieval, and § Cost note names it as the bottleneck either way.",
      "  · EVERY source you cite is a RECOLLECTION. Set `confidence` accordingly: a figure you",
      "    cannot verify in this run is not `high`, whatever you remember about it. Say why in",
      "    `confidenceNote`.",
      "  · `researchGaps` MUST open with the fact that no search was run, naming the Phase 1",
      "    domains you could not cover and the load-bearing quantities that need a primary source.",
      "    That is Phase 9 working, not an apology.",
      "  · The Phase 1 counter-case row cannot be searched either, so a steel-man you write is",
      "    `provenance: \"constructed\"` — never `found`. An unmarked construction is the failure",
      "    mode Phase 6 exists to catch.",
      "  · If you do not know enough about this topic to write an honest tension, say so: return a",
      "    notebook whose `tension.strength` is `weak` and whose `researchGaps` says what is",
      "    missing. A thin honest notebook is a passing run; an invented one is not.",
      "",
      "## THE DELIVERABLE",
      "Return ONE JSON object and nothing else — no prose before or after, no code fence.",
      "It must satisfy this schema. Field names are camelCase here, not the snake_case of",
      "NOTEBOOK-SCHEMA.md; the rules of that document apply unchanged.",
      "",
      JSON.stringify(NOTEBOOK_SCHEMA, null, 2),
    ].join("\n");

    const run = await reason({ prompt, turn: "research", schema: NOTEBOOK_SCHEMA });

    // VALIDATED, NEVER TRUSTED — and validated on both rungs for the reason
    // /api/recalibrate states: a validator that only runs where the vendor
    // cannot enforce a schema is a validator nobody tests. `parseNotebook`
    // checks more than any schema can (the BUT/THEREFORE law, the claim budget,
    // the mandatory steel-man and its provenance, the graph's ids) and re-stamps
    // the topic so the notebook cannot be about something else.
    const notebook = parseNotebook(run.json ?? run.text, topic);

    return Response.json({
      notebook,
      engine: {
        // The same receipt shape /api/recalibrate returns, so a client that has
        // learned to read one reads the other. It is kept on what gets saved.
        kind: run.provenance.transport === "local-subprocess" ? "local-claude-code" : "cloud-api",
        provider: run.provenance.provider,
        model: run.provenance.model,
        rung: run.provenance.rung,
        transport: run.provenance.transport,
        schemaEnforcement: run.provenance.schemaEnforcement,
        reroutedFrom: run.provenance.reroutedFrom,
        sessionId: run.provenance.sessionId,
        costUsd: run.provenance.costUsd,
        costBasis: run.provenance.costBasis,
        durationMs: run.provenance.durationMs,
        promptChars: run.provenance.promptChars,
        // THE FIELD THE OTHER ROUTES DO NOT HAVE. It rides on the receipt and is
        // saved with the notebook, so a notebook read back in six months still
        // says that nothing in it was looked up. See the header.
        searched: false,
      },
    });
  } catch (e) {
    // Before anything ran: a broken install, not a broken turn.
    if (e instanceof PromptUnavailable)
      return Response.json(
        { detail: `${e.message} The engine was never started, so nothing was researched.` },
        { status: 500 },
      );

    // It answered, and what came back is not a notebook. `bad-response` is
    // lib/text/errors.ts's own word for exactly this, so the status and the code
    // come from there rather than from a number chosen here. Every finding
    // travels: the fix is a prompt change, and one finding per run is a prompt
    // edited five times for one run's worth of information.
    if (e instanceof NotebookError)
      return Response.json(
        {
          detail: `The engine answered, and what came back does not satisfy NOTEBOOK-SCHEMA. Nothing was saved. ${e.message}`,
          code: "bad-response",
          findings: e.findings,
        },
        { status: statusFor("bad-response") },
      );

    // One taxonomy, one status map. The message a TextError carries at the
    // bottom of the ladder names every engine that was tried and why each
    // dropped out — which is the sentence a creator with no key needs and the
    // reason this route says nothing of its own about availability.
    //
    // THE MESSAGE STANDS ALONE, with nothing appended — which is a departure
    // from /api/recalibrate next door and deliberate. That route adds "Nothing
    // was changed." to every TextError, and lib/text/router.ts's rung-4 message
    // ALREADY ENDS with that same sentence for every turn class (it is hardcoded
    // there, in one caller's vocabulary, in a shared file). Measured here on
    // 2026-09-08: "…see .env.example. Nothing was changed. Nothing was
    // researched." Appending a second reassurance is also the wrong claim on a
    // `timeout`, where a local run may have been billed for work we then threw
    // away. The surface's own heading — "the real run did not produce a
    // notebook" — carries the fact this route can honestly promise.
    if (e instanceof TextError)
      return Response.json({ detail: e.message, code: e.kind }, { status: statusFor(e.kind) });

    console.error("[research]", e);
    return Response.json({ detail: "The research run failed. Nothing was saved." }, { status: 502 });
  }
}
