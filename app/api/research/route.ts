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

// ── A TURN, NOT A HELD-OPEN REQUEST (AIO-A stage 4b, 2026-10-07) ─────────────
//
// The POST used to await `retrieve()`/`reason()` in-request for minutes, and
// the notebook was written by a client closure that a reload threw away with
// the money already spent. It now admits the request and hands it to the turn
// runner as the `research` kind (lib/turns/kinds/research.ts, the ONLY
// dispatch path: prepare = the topic refusals and the prompt, dispatch = the
// retrieval rung first with today's fallback rule, settle = parseNotebook and
// the cross-check). It answers 202 `{ turnId }` as soon as the ledger has the
// record; the run belongs to the server. A second run for the same project
// while one is live is a 409 naming it.
//
// `?wait=1` holds the request until the turn settles and answers the
// synchronous body this route always answered — 200 `{ notebook, engine }`, or
// the refusal with its status, its code and every finding — for scripts and
// probes. Everything said above about the prompt, the receipt and the surface
// is now true of the kind module, which carries the same three places.

import { after } from "next/server";

import { guardRequest } from "@/lib/apiAuth";
import { TextError, statusFor, type TextErrorKind } from "@/lib/text/errors";
import { textPriceTable } from "@/lib/text/pricing";
import { engineStatus, retrievePlanFor } from "@/lib/text/router";
import { slotBusy, syncBody } from "@/lib/turns/answer";
import { MAX_TOPIC_CHARS, PromptUnavailable, topicRefusal } from "@/lib/turns/assemble/research";
import { RESEARCH_SPEC, ResearchRefused } from "@/lib/turns/kinds/research";
import type { TurnRecord } from "@/lib/turns/ledger";
import { startTurn } from "@/lib/turns/runner";

export const runtime = "nodejs";
/** A real run is minutes — nine phases and one large structured answer. Room to
 *  finish, and above the router's own 600s ceiling for a `research` turn so the
 *  engine gives up first and the creator gets a sentence. `after()` and
 *  `?wait=1` both live as long as the route may. */
export const maxDuration = 800;

/** The same project-id rule /api/turns holds. */
const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

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

  let body: { topic?: unknown; projectId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Request body was not valid JSON." }, { status: 400 });
  }

  // The topic refusals first, in the order they always ran, and before any
  // record exists. The kind's prepare asks the same function again.
  const checked = topicRefusal(body.topic);
  if (!checked.ok) return Response.json({ detail: checked.refusal.detail }, { status: checked.refusal.status });
  // The slot is per project: one live research run per project, decided
  // against the ledger.
  const projectId = body.projectId;
  if (typeof projectId !== "string" || !PROJECT_ID_RE.test(projectId))
    return Response.json({ detail: "`projectId` is required.", code: "bad-request" }, { status: 400 });

  let out: Awaited<ReturnType<typeof startTurn>>;
  try {
    out = await startTurn(RESEARCH_SPEC as Parameters<typeof startTurn>[0], projectId, { topic: checked.topic });
  } catch (e) {
    if (e instanceof ResearchRefused) return Response.json({ detail: e.message }, { status: e.status });
    // Before anything ran: a broken install, not a broken turn.
    if (e instanceof PromptUnavailable)
      return Response.json(
        { detail: `${e.message} The engine was never started, so nothing was researched.` },
        { status: 500 },
      );
    if (e instanceof TextError) return Response.json({ detail: e.message, code: e.kind }, { status: statusFor(e.kind) });
    throw e;
  }

  if (!out.ok) return slotBusy("A research run", out.holder);

  const settled = out.done;
  try {
    after(() => settled);
  } catch {
    // No request scope (a probe or a script calling the handler directly). The
    // run is already under way as a detached promise.
  }

  if (new URL(req.url).searchParams.get("wait") === "1") return researchBody(await settled);
  return Response.json({ turnId: out.turnId }, { status: 202 });
}

/** The synchronous body, as this route always answered it.
 *
 *  A FAILED turn keeps this route's own manner rather than the shared mapping's
 *  (lib/turns/answer.ts), in two places that were decided here on purpose: the
 *  `bad-response` refusal carries its `code` beside every finding, and a
 *  TextError's message STANDS ALONE, with nothing appended. The router's rung-4
 *  message already ends "Nothing was changed." for every turn class, and a
 *  second reassurance is the wrong claim on a `timeout`, where a local run may
 *  have been billed for work that was then thrown away (measured 2026-09-08:
 *  "…see .env.example. Nothing was changed. Nothing was researched."). The
 *  surface's own heading carries the fact this route can honestly promise.
 *  `done`, `cancelled` and `orphaned` answer exactly as the shared mapping does. */
function researchBody(rec: TurnRecord): Response {
  if (rec.status !== "failed") return syncBody(rec, "The research run failed. Nothing was saved.");
  const err = rec.error ?? { kind: "failed", message: "" };
  const kind = (err.kind || "failed") as TextErrorKind;
  return Response.json(
    {
      detail: err.message || "The research run failed. Nothing was saved.",
      code: kind,
      ...(err.findings?.length ? { findings: err.findings } : {}),
    },
    { status: statusFor(kind) ?? 502 },
  );
}
