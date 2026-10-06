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
//
// ── A TURN, NOT A HELD-OPEN REQUEST (AIO-A stage 3, 2026-10-06) ─────────────
//
// This was a held-open request inside useFrames: a plain fetch, never in the
// bell, lost on a reload, and its `claude` process ran on to its ceiling when
// the tab went away. It now admits the request and hands it to the turn runner
// as the `frames` kind (lib/turns/kinds/frames.ts: prepare = the refusals and
// the assembler, settle = `{ raw, manifest, engine }`). It answers 202
// `{ turnId }` as soon as the ledger has the record; the run belongs to the
// server. A second pass for the same project while one is live is a 409 naming
// it — one direction per project, across tabs and devices.
//
// `?wait=1` holds the request until the turn settles and answers the
// synchronous body this route always answered — 200 `{ raw, manifest, engine }`,
// or the same refusal statuses and sentences — for scripts and probes.

import { after } from "next/server";

import { guardRequest } from "@/lib/apiAuth";
import { TextError, statusFor } from "@/lib/text/errors";
import { slotBusy, syncBody } from "@/lib/turns/answer";
import { framesRefusal, type FramesInput } from "@/lib/turns/assemble/frames";
import { refusalResponse } from "@/lib/turns/assemble/manifest";
import { FRAMES_SPEC, FramesRefused } from "@/lib/turns/kinds/frames";
import { startTurn } from "@/lib/turns/runner";

/** The size predicate lives with the assembler (lib/turns/assemble/frames.ts,
 *  which carries the bounds and why they exist); re-exported so the probes that
 *  ask it here (frames-run-bounded) keep asking the route. */
export { tooLarge } from "@/lib/turns/assemble/frames";

export const runtime = "nodejs";
/** Sixteen art-direction decisions over a whole script is minutes, not seconds.
 *  `after()` and `?wait=1` both live as long as the route may. */
export const maxDuration = 800;

/** The same project-id rule /api/turns holds. */
const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

export async function POST(req: Request) {
  // Local-compute route (spends the machine's Claude subscription) — auth +
  // rate limit before anything is read or dispatched.
  const denied = await guardRequest(req);
  if (denied) return denied;

  // `template` and `targetS` are the project record's own two format fields;
  // lib/turns/assemble/frames.ts::FramesInput says why a run may omit them.
  let body: FramesInput & { projectId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Request body was not valid JSON." }, { status: 400 });
  }
  // No beats, no style, then COUNTS — in the order they always ran, so an
  // oversized run is refused before a megabyte of it is serialised into a
  // prompt, and the refusal can name which part was too big.
  const refused = framesRefusal(body);
  if (refused) return refusalResponse(refused);
  // The slot is per project: one live direction pass per project, decided
  // against the ledger.
  const projectId = body.projectId;
  if (typeof projectId !== "string" || !PROJECT_ID_RE.test(projectId))
    return Response.json({ detail: "`projectId` is required.", code: "bad-request" }, { status: 400 });

  let out: Awaited<ReturnType<typeof startTurn>>;
  try {
    // Assembly, then the ASSEMBLED size (the kind's prepare): that is the one
    // that is billed, and it carries the system prompt and the format brief on
    // top of what the caller sent.
    out = await startTurn(FRAMES_SPEC as Parameters<typeof startTurn>[0], projectId, body);
  } catch (e) {
    if (e instanceof FramesRefused) return refusalResponse(e.refusal);
    // One taxonomy, one status map (lib/text/errors.ts).
    if (e instanceof TextError)
      return Response.json({ detail: `${e.message} Nothing was changed.`, code: e.kind }, { status: statusFor(e.kind) });
    // A system prompt that cannot be read is a broken install, and throws as
    // the route's inline read always did.
    throw e;
  }

  if (!out.ok) return slotBusy("A scene direction pass", out.holder);

  const settled = out.done;
  try {
    after(() => settled);
  } catch {
    // No request scope (a probe or a script calling the handler directly). The
    // run is already under way as a detached promise.
  }

  // The receipt travels on the record's result (`engine`) and names the rung
  // and the transport: a creator whose prompt crossed the network to a vendor
  // is entitled to see that, and a cloud answer that rendered
  // indistinguishably from a local one is the one thing the ladder may never do.
  if (new URL(req.url).searchParams.get("wait") === "1")
    return syncBody(await settled, "The scene direction failed. Nothing was changed.");
  return Response.json({ turnId: out.turnId }, { status: 202 });
}
