// GET /api/sound/insights?kind -> { cells: InsightCell[], lessons, judged }
//
// Triage's strengths map, counted from the git-tracked ledger
// (pipeline/sound/ledger.json) — the same rows `sound.mts knowledge` renders
// into knowledge/audio/, through the same function (lib/sound/insights.ts), so
// the heat table and the knowledge doc cannot count one verdict two ways.
// Non-fixture judged takes only: a fixture never reaches the ledger.

import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, toErrorResponse } from "@/lib/sound/http";
import { computeInsights } from "@/lib/sound/insights";
import { readLedger, SoundError } from "@/lib/sound/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await asContractDenial(await guardAccessOnly(req));
  if (denied) return denied;
  try {
    const raw = new URL(req.url).searchParams.get("kind");
    if (raw && raw !== "music" && raw !== "sfx") throw new SoundError(`unknown kind ${JSON.stringify(raw)} (music or sfx)`, 400);
    const kind = raw === "music" || raw === "sfx" ? raw : undefined;
    const ledger = await readLedger();
    const { cells, judged } = computeInsights(ledger.verdicts, kind);
    return Response.json({ cells, lessons: ledger.lessons.filter((l) => !kind || l.kind === kind), judged });
  } catch (e) {
    return toErrorResponse(e);
  }
}
