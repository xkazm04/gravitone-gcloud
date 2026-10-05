// GET  /api/sound/lessons?kind -> { lessons }
// POST /api/sound/lessons  Omit<Lesson, "id" | "confirmedAt"> -> 201 { lesson }
//
// A POST is a human's confirm — the only way a lesson is written (the hunt's
// lesson route only DRAFTS). A claim is required (400 without one). The lesson
// is appended to the git-tracked ledger, and `sound.mts knowledge` quotes it.

import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { appendLesson, parseLessonInput } from "@/lib/sound/ledger";
import { readLedger, SoundError, withStore } from "@/lib/sound/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await asContractDenial(guardAccessOnly(req));
  if (denied) return denied;
  try {
    const kind = new URL(req.url).searchParams.get("kind");
    if (kind && kind !== "music" && kind !== "sfx") throw new SoundError(`unknown kind ${JSON.stringify(kind)} (music or sfx)`, 400);
    const { lessons } = await readLedger();
    return Response.json({ lessons: lessons.filter((l) => !kind || l.kind === kind) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const denied = await asContractDenial(guardAccessOnly(req));
  if (denied) return denied;
  try {
    const input = parseLessonInput(await readJson(req));
    const lesson = await withStore((tx) => appendLesson(tx, input));
    return Response.json({ lesson }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
