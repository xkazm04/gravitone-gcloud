// GET /api/local-draws/file?run=<id>&path=<run-relative>
// One image or clip from GRAVITONE_LOCAL_DRAWS. The folder is the env var.
// Bytes are serveFile's. Video honours Range so a <video> can start and seek.

import { err, type AppErrorCode } from "@gt/domain/errors";

import { FoundryError } from "../../../../lib/foundry/runStore.ts";
import { drawFile } from "../../../../lib/foundry/local-draws/read.ts";
import { route } from "../../../_server/route.ts";
import { serveFile } from "../../../_server/serveFile.ts";

export const runtime = "nodejs";

const CODE: Readonly<Record<number, AppErrorCode>> = { 400: "invalid", 404: "not-found", 409: "conflict", 503: "unavailable" };

export const GET = route({ guard: "access", bodyCap: 0 }, async ({ req }) => {
  const url = new URL(req.url);
  try {
    const file = await drawFile(url.searchParams.get("run") ?? "", url.searchParams.get("path") ?? "");
    return await serveFile(req, file.abs, { mime: file.mime, ranges: file.ranges });
  } catch (e) {
    if (e instanceof FoundryError) return err(CODE[e.status] ?? "internal", e.message);
    throw e;
  }
});
