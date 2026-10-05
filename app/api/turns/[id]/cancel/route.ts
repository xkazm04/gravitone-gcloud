// POST /api/turns/<id>/cancel — stop a running turn, and its engine with it.
//
//   200 `{ turn }`                 cancelled: the record says so, and the
//                                  engine's process tree has been told to end
//   409 `{ detail, code, turn }`   it had already settled (`code: settled`),
//                                  or another server is running it and this
//                                  one holds no handle on its engine
//                                  (`code: not-here`)
//   404 / 400                      no such turn / not a turn id
//
// Gated, not rate-counted: a cancel stops spending, and the one request that
// must never be refused for having asked too often is "stop".

import { guardAccessOnly } from "@/lib/apiAuth";
import { TURN_ID_RE } from "@/lib/turns/ledger";
import { cancelTurn } from "@/lib/turns/runner";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  if (!TURN_ID_RE.test(id)) return Response.json({ detail: "That is not a turn id.", code: "bad-request" }, { status: 400 });

  const out = await cancelTurn(id);
  if (out.ok) return Response.json({ turn: out.record });
  if (out.why === "not-found") return Response.json({ detail: `No turn ${id}.`, code: "not-found" }, { status: 404 });
  return Response.json(
    {
      detail:
        out.why === "settled"
          ? `Turn ${id} already ended as ${out.record.status}.`
          : `Turn ${id} is running on another server process, which this one cannot stop.`,
      code: out.why,
      turn: out.record,
    },
    { status: 409 },
  );
}
