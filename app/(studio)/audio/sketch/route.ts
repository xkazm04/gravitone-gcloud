// GET /audio/sketch?ids=<atlas ids, comma>&levels=<digits 0-3, one per four bars>&bpm=&key= - the
// seed's playable instruments together across the shape a person painted (lib/audio/atlas.ts;
// pipeline/audio/sketch.py renders it). Free and local: hearing the structure costs nothing,
// which is why it comes before the receipt. File bytes for an <audio> element, as the audition.
import { z } from "zod";

import { route } from "../../../_server/route.ts";
import { serveFile } from "../../../_server/serveFile.ts";
import { sketchFile } from "../../../../lib/audio/atlas.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

const input = z.object({
  ids: z.string().regex(/^[a-z0-9-]{2,40}(,[a-z0-9-]{2,40}){0,4}$/),
  levels: z.string().regex(/^[0-3]{1,32}$/),
  bpm: z.coerce.number().int().min(40).max(220),
  key: z.string().max(24).optional(),
});

export const GET = route({ guard: "access", bodyCap: 0, maxDuration, input }, async ({ req, input: q }) => {
  const r = await sketchFile({ ids: q.ids.split(","), levels: [...q.levels].map(Number), bpm: q.bpm, key: q.key ?? null });
  if (!r.ok) return r;
  return serveFile(req, r.value, { mime: "audio/wav", cache: "private, max-age=86400" });
});
