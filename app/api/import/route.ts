// POST /api/import?act=preview            body: a `.gravitone` archive -> what importing it would create
// POST /api/import?act=commit&token=<t>   body: the same archive      -> per-project outcomes
// GET  /api/import?project=<id>[&project=<id>...]                     -> those projects as a `.gravitone`
//
// THE IMPORT'S ONE HTTP DOOR (Phase 4 wave D, L42). The page at /projects/import reads the
// browser's own v1 database through v1's `exportAccount` and streams the archive here; a file
// from another machine comes through the same door. Receipt-shaped (COMMON decision 3): a
// preview with a token, then a commit on that token; a stale token is a 409 carrying the fresh
// preview. ACCESS-GUARDED - an import writes no money, but it writes the operator's projects, so
// a cookie-authenticated POST must also be same-origin (app/_server/route.ts).
//
// THE BODY IS BYTES, BOUNDED. `route()` reads JSON bodies; this one reads the archive itself, to
// the cap (lib/import/archive.ts ARCHIVE_CAPS.bodyBytes), refusing a declared or streamed
// length past it before a byte is parsed.

import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";

import { ARCHIVE_CAPS } from "../../../lib/import/archive.ts";
import { confirmLive, exportLive, previewLive } from "../../../lib/import/serve.ts";
import { route } from "../../_server/route.ts";
import { queryOf } from "../../_server/http.ts";
import { actorOf } from "../../../lib/principal.ts";

export const maxDuration = 300;

const postQuery = z.discriminatedUnion("act", [z.object({ act: z.literal("preview") }).strict(), z.object({ act: z.literal("commit"), token: z.string().regex(/^[0-9a-f]{64}$/) }).strict()]);
const projectId = z.string().min(1).max(200);

async function bytesOf(req: Request, cap: number): Promise<Result<Uint8Array>> {
  const tooBig = (): Result<never> => err("invalid", `the archive exceeds ${cap} bytes`, { detail: "too-large" });
  const declared = Number(req.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > cap) return tooBig();
  if (req.body === null) return err("invalid", "an import carries the archive as its body", { detail: "not-an-archive" });
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      return tooBig();
    }
    chunks.push(value);
  }
  return ok(new Uint8Array(Buffer.concat(chunks)));
}

export const POST = route<undefined, unknown>({ guard: "access", bodyCap: ARCHIVE_CAPS.bodyBytes, maxDuration }, async ({ req, who }) => {
  const q = parseAt("POST /api/import", postQuery, queryOf(req));
  if (!q.ok) return q;
  const bytes = await bytesOf(req, ARCHIVE_CAPS.bodyBytes);
  if (!bytes.ok) return bytes;
  if (q.value.act === "preview") return previewLive(bytes.value);
  const actor = actorOf(who);
  const done = await confirmLive(bytes.value, q.value.token, actor);
  if (!done.ok) return done;
  if (done.value.kind === "stale") return Response.json({ error: "the archive or the studio changed since this preview; read the fresh one", code: "conflict", detail: "stale-preview", fresh: done.value }, { status: 409 });
  return ok(done.value);
});

export const GET = route({ guard: "access", bodyCap: 0, maxDuration }, async ({ req, who }) => {
  const ids = new URL(req.url).searchParams.getAll("project");
  const parsed = parseAt("GET /api/import", z.array(projectId).min(1).max(100), ids);
  if (!parsed.ok) return parsed;
  const uid = actorOf(who).id;
  const out = await exportLive(parsed.value, uid);
  if (!out.ok) return out;
  const name = parsed.value.length === 1 ? parsed.value[0] : `${parsed.value.length}-projects`;
  return new Response(Buffer.from(out.value), {
    headers: {
      "content-type": "application/gzip",
      "content-disposition": `attachment; filename="${String(name).replace(/[^A-Za-z0-9._-]/g, "-")}.gravitone"`,
      "cache-control": "no-store",
    },
  });
});
