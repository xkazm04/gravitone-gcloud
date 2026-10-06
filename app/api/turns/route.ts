// POST /api/turns — start one AI turn on the server and answer with its id.
//
// Body: `{ kind, projectId, input }`. `kind` names a registered TurnSpec
// (lib/turns/runner.ts), which builds the prompt from `input` and validates the
// answer; this route only admits, claims and dispatches. Answers:
//
//   202 `{ turnId }`              the record is written and the turn is running
//   409 `{ detail, code, holder }` a serialised kind already has a live turn
//                                  for this project — `holder` is its id
//   400                            no kind, an unregistered kind, a bad project
//                                  id, or input the kind cannot build from;
//                                  nothing was written and nothing was sent
//
// `?wait=1` holds the request until the turn settles and answers 200 with the
// final record: the synchronous shape, kept for pipeline scripts.
//
// THE RUN IS NOT TIED TO THIS REQUEST. It is dispatched as a detached promise
// in this process and handed to `after()` so the platform keeps the instance
// alive for it (up to maxDuration). Outside a request scope — a probe calling
// the handler directly, a script — `after` is unavailable and the detached
// promise is the whole of it.
//
// Money route: the turn spends the operator's seat or a metered key. Full guard.
//
// GET /api/turns?projectId=<id>[&kind=<kind>] — that project's turns, newest
// first, at most LIST_LIMIT, WITHOUT `result` (GET /api/turns/<id> carries it).
// What a watching tab polls, so it is gated and not rate-counted, like the
// single-turn read (guardAccessOnly's own reason).

import { after } from "next/server";

import { guardAccessOnly, guardRequest } from "@/lib/apiAuth";
import { TextError, statusFor } from "@/lib/text/errors";
import { ensureSwept, listTurns } from "@/lib/turns/ledger";
import { startTurn, turnKind, turnKinds, TurnInputError } from "@/lib/turns/runner";
// The production kinds, registered on import (AIO-A stage 2). A kind is owned
// by the module that owns its prompt; this line only makes it reachable here.
import "@/lib/turns/kinds/recalibrate";

export const runtime = "nodejs";
/** The longest turn the ladder allows (the edit-plan ceiling), with room —
 *  `after()` lives as long as the route may. */
export const maxDuration = 800;

const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

const bad = (detail: string) => Response.json({ detail, code: "bad-request" }, { status: 400 });

export async function POST(req: Request) {
  const denied = await guardRequest(req);
  if (denied) return denied;

  let body: { kind?: unknown; projectId?: unknown; input?: unknown } | null;
  try {
    body = await req.json();
  } catch {
    return bad("The body must be JSON: { kind, projectId, input }.");
  }
  const kind = body?.kind;
  if (typeof kind !== "string" || !kind) return bad("`kind` is required.");
  const spec = turnKind(kind);
  if (!spec) {
    const known = turnKinds();
    return bad(`No turn kind named ${JSON.stringify(kind.slice(0, 60))} is registered (${known.length ? known.join(", ") : "none yet"}).`);
  }
  const projectId = body?.projectId;
  if (typeof projectId !== "string" || !PROJECT_ID_RE.test(projectId)) return bad("`projectId` is required.");

  let out: Awaited<ReturnType<typeof startTurn>>;
  try {
    out = await startTurn(spec, projectId, body?.input);
  } catch (e) {
    if (e instanceof TurnInputError) return bad(e.message);
    if (e instanceof TextError) return Response.json({ detail: e.message, code: e.kind }, { status: statusFor(e.kind) });
    throw e;
  }

  if (!out.ok)
    return Response.json(
      {
        detail: `A ${kind} turn is already running for this project (${out.holder.id}). Wait for it, or cancel it.`,
        code: "slot-busy",
        holder: out.holder.id,
      },
      { status: 409 },
    );

  const settled = out.done;
  try {
    after(() => settled);
  } catch {
    // No request scope (see the header). The run is already under way.
  }

  if (new URL(req.url).searchParams.get("wait") === "1") return Response.json({ turn: await settled });
  return Response.json({ turnId: out.turnId }, { status: 202 });
}

const LIST_LIMIT = 20;

export async function GET(req: Request) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  const q = new URL(req.url).searchParams;
  const projectId = q.get("projectId");
  if (!projectId || !PROJECT_ID_RE.test(projectId)) return bad("`projectId` is required.");
  const kind = q.get("kind");

  // A boot's first read settles what the last boot left running.
  await ensureSwept();
  const turns = (await listTurns())
    .filter((t) => t.projectId === projectId && (!kind || t.kind === kind))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id))
    .slice(0, LIST_LIMIT)
    .map(({ result: _result, ...rest }) => rest);
  return Response.json({ turns });
}
