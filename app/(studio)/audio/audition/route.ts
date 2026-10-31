// GET /audio/audition?id=<atlas id>&bpm=<40-220>&key=<key> - one instrument playing the composer's
// fixed four-bar phrase at the seed's tempo and key, loudness-matched (lib/audio/atlas.ts renders
// it from the machine's own sample libraries; pipeline/audio/audition.py is the renderer).
//
// A route, not a Server Action: the answer is FILE BYTES an <audio> element ranges over, the
// takes file door's shape (serveFile). Access-gated, not money: nothing here spends - the render
// is local and free, which is the point of hearing before choosing.
import { z } from "zod";

import { route } from "../../../_server/route.ts";
import { serveFile } from "../../../_server/serveFile.ts";
import { auditionFile } from "../../../../lib/audio/atlas.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

const input = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,40}$/),
  bpm: z.coerce.number().int().min(40).max(220),
  key: z.string().max(24).optional(),
});

export const GET = route({ guard: "access", bodyCap: 0, maxDuration, input }, async ({ req, input: q }) => {
  const r = await auditionFile({ id: q.id, bpm: q.bpm, key: q.key ?? null });
  if (!r.ok) return r;
  return serveFile(req, r.value, { mime: "audio/wav", cache: "private, max-age=86400" });
});
