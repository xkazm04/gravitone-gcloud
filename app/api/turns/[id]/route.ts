// GET /api/turns/<id> — the turn's record, as the ledger holds it now.
//
// `{ turn }`: status (accepted · running · done · failed · cancelled ·
// orphaned), the receipt, and on `done` the validated result. Never the
// prompt — the record does not have it (lib/turns/ledger.ts).
//
// Gated, not rate-counted: this is what a watching tab polls, and a poll must
// not drain the bucket the money routes share (guardAccessOnly's own reason).
// The record still discloses spend and the creator's result, so it is not
// public.

import { guardAccessOnly } from "@/lib/apiAuth";
import { ensureSwept, readTurn, TURN_ID_RE } from "@/lib/turns/ledger";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  if (!TURN_ID_RE.test(id)) return Response.json({ detail: "That is not a turn id.", code: "bad-request" }, { status: 400 });

  // A boot's first read settles what the last boot left running.
  await ensureSwept();
  const turn = await readTurn(id);
  if (!turn) return Response.json({ detail: `No turn ${id}.`, code: "not-found" }, { status: 404 });
  return Response.json({ turn });
}
