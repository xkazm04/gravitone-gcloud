// GET /audio/cover/file?id=<cov-id>&f=<name> - a cover's audio, with byte ranges, so the desk's players seek
// (spark track-mirror-studio, WP2). The names are an allow-list read off the record (lib/sound/cover/href.ts
// coverFileOf): `source`, `section`, `winner`, `remix` and `take-<seed>` for a seed the record holds. Anything
// else - an unknown name, a seed not on the record, a malformed id, a path - is not-found, the same answer as a
// cover that does not exist, so the route confirms nothing about the folder's layout. The bytes are
// serveFile()'s; the path is coverFileAbs()'s, which refuses one that leaves the cover's folder.
//
// Access-guarded through route(); the session cookie rides an <audio> element's request by itself. A take and
// the section never change under their names, but the winner is re-made on a new pick and the remix replaced
// on a new upload, so nothing is held past revalidation.
import { coverIdSchema } from "@gt/domain/cover.schema";
import { err } from "@gt/domain/errors";

import { route } from "../../../../_server/route.ts";
import { serveFile } from "../../../../_server/serveFile.ts";
import { coverFileOf } from "../../../../../lib/sound/cover/href.ts";
import { coverFileAbs, readCover } from "../../../../../lib/sound/cover/store.ts";

export const runtime = "nodejs";

const gone = (id: string, f: string) => err("not-found", `cover ${id.slice(0, 40)} has no file ${JSON.stringify(f.slice(0, 40))}`);

export const GET = route({ guard: "access", bodyCap: 0 }, async ({ req }) => {
  const q = new URL(req.url).searchParams;
  const id = q.get("id") ?? "";
  const f = q.get("f") ?? "";
  if (!coverIdSchema.safeParse(id).success) return gone(id, f);
  const c = await readCover(id);
  if (c === undefined) return gone(id, f);
  const file = coverFileOf(c, f);
  if (file === undefined) return gone(id, f);
  const res = await serveFile(req, coverFileAbs(id, file.rel), { mime: file.mime, cache: "private, no-cache" });
  return res.status === 404 ? gone(id, f) : res;
});
