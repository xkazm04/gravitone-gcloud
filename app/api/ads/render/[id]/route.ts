// GET /api/ads/render/<id> — one ad render's record (AdRenderRecord, plus what
// the render measured: loudness, pixel size, encoder).
//
// Gated, not rate-counted: this is what the Finish step polls, and a poll must
// not drain the bucket the money routes share (guardAccessOnly's own reason).

import { guardAccessOnly } from "@/lib/apiAuth";
import { AD_EXPORT_ID_RE, readAdRenderRecord } from "@/lib/adRender";
import type { AdErrorBody } from "@/lib/ads/types";

export const runtime = "nodejs";

const fail = (status: number, error: string, message: string) =>
  Response.json({ error, message } satisfies AdErrorBody, { status });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  if (!AD_EXPORT_ID_RE.test(id)) return fail(400, "bad-request", "That is not an ad export id.");
  const rec = await readAdRenderRecord(id);
  if (!rec) return fail(404, "not-found", `No ad export ${id} on this machine.`);
  return Response.json(rec, { headers: { "cache-control": "no-store" } });
}
