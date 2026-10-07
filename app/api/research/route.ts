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
// ── AND NOW THERE IS ONE, BEHIND A FLAG (research-run-engine-B) ─────────────
//
// `retrieve` (lib/text/types.ts) and its adapter (providers/claudeCliRetrieve.ts)
// may search and fetch — WebSearch and WebFetch, nothing that touches this
// machine. With TEXT_RETRIEVE OFF, which is the default, nothing below the
// header changes: the pre-flight names the retrieval candidate as
// `policy-forbidden`, and the POST builds the same prompt, calls the same
// `reason()`, and answers the same receipt, byte for byte. With it ON, the three
// places above change together, as promised:
//
//   1. THE PROMPT swaps § YOU HAVE NO SEARCH for § YOU HAVE SEARCH, AND NOTHING
//      ELSE, and asks for the schema that carries a `url` per source;
//   2. THE RECEIPT carries `sources` — one SourceReceipt per page fetched — and
//      `searched` is DERIVED from them (`sources.length > 0`), never set;
//   3. the notebook is cross-checked against the receipts before it is
//      returned: a `high` fact citing a page nobody fetched comes back `medium`,
//      with the finding in `engine.crossCheck` (lib/notebook/validate.ts).
//
// If no retrieval engine can serve (none planned here, binary missing), the run
// falls back to `reason()` — today's run — and the retrieval candidates that
// dropped out lead its `reroutedFrom`, so nothing about the descent is silent.
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

import { guardRequest } from "@/lib/apiAuth";
import {
  crossCheckRetrieval,
  NotebookError,
  NOTEBOOK_SCHEMA,
  parseNotebook,
  RETRIEVE_NOTEBOOK_SCHEMA,
} from "@/lib/notebook/validate";
import { retrievalEnabled } from "@/lib/text/env";
import { TextError, statusFor } from "@/lib/text/errors";
import { textPriceTable } from "@/lib/text/pricing";
import { engineStatus, reason, retrieve, retrievePlanFor } from "@/lib/text/router";
import type { RerouteStep, TextResult } from "@/lib/text/types";
import { MAX_TOPIC_CHARS, PromptUnavailable, reasonPrompt, retrievePrompt, topicRefusal } from "@/lib/turns/assemble/research";

export const runtime = "nodejs";
/** A real run is minutes — nine phases and one large structured answer. Room to
 *  finish, and above the router's own 600s ceiling for a `research` turn so the
 *  engine gives up first and the creator gets a sentence. */
export const maxDuration = 800;

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
  const denied = await guardRequest(req);
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
    // A `research` turn cannot search — unless the engine that would serve it
    // is a retrieval rung, which only TEXT_RETRIEVE can make true. Sent so the
    // surface's disclosure and the route's prompt cannot drift apart: one flag,
    // read by both. With the flag off this is `false`, as it always was.
    searched: status.serving !== null && retrievePlanFor("research").includes(status.serving),
    // The field's cap, from the one place it is declared.
    maxTopicChars: MAX_TOPIC_CHARS,
  });
}

/* ────────────────────────────────── the run ──────────────────────────────── */

export async function POST(req: Request): Promise<Response> {
  // MONEY/COMPUTE ROUTE — auth + rate limit before anything is read or spawned,
  // the same first line as every other spending route in this app.
  const denied = await guardRequest(req);
  if (denied) return denied;

  let body: { topic?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Request body was not valid JSON." }, { status: 400 });
  }

  const checked = topicRefusal(body.topic);
  if (!checked.ok) return Response.json({ detail: checked.refusal.detail }, { status: checked.refusal.status });
  const topic = checked.topic;

  try {
    // THE RETRIEVAL RUNG FIRST, and only when the operator opened it. Off, this
    // block is skipped entirely and what follows is today's run, unchanged.
    let retrieveTrail: readonly RerouteStep[] = [];
    if (retrievalEnabled()) {
      let served: TextResult | null = null;
      try {
        served = await retrieve({
          prompt: await retrievePrompt(topic),
          turn: "research",
          schema: RETRIEVE_NOTEBOOK_SCHEMA,
        });
      } catch (e) {
        // Fall back to reasoning ONLY when no retrieval engine was available —
        // the availability kinds, or none planned here. A retrieval run that
        // ran and failed (a fence breach, a timeout, a bad answer) is not
        // quietly re-billed as a reasoning run; it answers as itself.
        if (!(e instanceof TextError) || !(e.reroutable || e.kind === "unsupported")) throw e;
        retrieveTrail = trailOf(e);
      }
      if (served) return retrievedAnswer(served, topic);
    }

    const prompt = await reasonPrompt(topic);

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
        // The retrieval candidates that dropped out lead the descent, when the
        // flag sent this run to one first. Off, the trail is empty and this is
        // the reasoning router's own record, as it always was.
        reroutedFrom: retrieveTrail.length
          ? [...retrieveTrail, ...(run.provenance.reroutedFrom ?? [])]
          : run.provenance.reroutedFrom,
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

/* ──────────────────────────── the retrieval run ──────────────────────────── */

/** The retrieval trail a refused `retrieve()` carried (router.ts puts it on
 *  `detail.trail`), or nothing. */
function trailOf(e: TextError): readonly RerouteStep[] {
  const d = e.detail as { trail?: unknown } | undefined;
  return Array.isArray(d?.trail) ? (d.trail as RerouteStep[]) : [];
}

/** A retrieval run's answer: validated exactly as a reasoned one, then
 *  cross-checked against its receipts, with `searched` derived from them. */
function retrievedAnswer(run: TextResult, topic: string): Response {
  const receipts = run.receipts ?? [];
  // NotebookError from either step goes to the POST's catch: the same
  // `bad-response` answer, with every finding.
  const checked = crossCheckRetrieval(parseNotebook(run.json ?? run.text, topic), receipts);
  return Response.json({
    notebook: checked.notebook,
    engine: {
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
      // DERIVED, never set: a run is `searched` because it fetched something,
      // and the receipts are the proof. Zero receipts is `false` on the
      // retrieval rung exactly as on the reasoning one.
      searched: receipts.length > 0,
      sources: receipts,
      // What the cross-check changed and why — one line per downgraded fact.
      crossCheck: checked.findings,
    },
  });
}
