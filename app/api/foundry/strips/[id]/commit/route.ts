// GET  /api/foundry/strips/<id>/commit — the plan: exact counts, the motion
//      style ids the kept become, the media the rejected lose, and a token.
// POST /api/foundry/strips/<id>/commit {token} — do it, under the catalogue
//      lock, refusing with 409 when the token no longer matches.
//
// Destructive and one-way for the rejected: the tab confirms with the plan's
// counts before it calls this. Undecided cards are untouched.

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError } from "@/lib/foundry/runStore";
import { commitStripRun, previewStripCommit } from "@/lib/foundry/strips/store";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    return Response.json(await previewStripCommit(id));
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  let body: { token?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* an empty body is allowed */
  }
  const token = typeof body?.token === "string" ? body.token : undefined;
  try {
    return Response.json(await commitStripRun(id, token));
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
