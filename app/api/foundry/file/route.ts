// GET /api/foundry/file?run=<id>&path=<run-relative>[&kind=extract|training|strips|scout|mesh] —
// serve one run file. `kind` names the output root: the forge's runs (default),
// the Extract module's (foundry-out/extract/), the Dojo's
// (foundry-out/training/), the code-rendered strips' (foundry-out/strips/), or
// a /scout night's (foundry-out/scout/, `run` is the night id), or a game
// asset's (foundry-out/mesh/, `run` is the asset id: its posters, renders and
// glbs - lib/foundry/mesh/store.ts SERVABLE). Same path discipline on all six.
//
// VIDEO, FOR STRIPS AND SCOUT ONLY. `kind=strips` and `kind=scout` also serve
// .mp4 and .webm, with a Range honoured as a 206 — what a <video> asks for to
// start and to seek (a night's scene clip is one). Every other kind keeps
// runStore's SERVABLE_EXTENSIONS, images and json only. A strip's strip.html is
// never served here: it is code.
//
// KEPT PAST PHASE 6: the Board's forge, extract, strips and Dojo packets draw
// their candidates from here (lib/decision/v1/types.ts foundryFileUrl). THE
// BYTES ARE serveFile()'s (app/_server/serveFile.ts, Phase 6 L67), which lists
// this route's `serveRanged` among the copies it absorbed: that copy allocated
// the whole range in memory (a `bytes=0-` on a long strip was the strip on the
// heap) and every image was read whole into a buffer; both stream now, with an
// ETag. Ranges stay video-only, as before - an <img> never seeks.
//
// foundry-out/ sits outside public/ on purpose (third-party reference frames,
// never to be published), so the page reaches images through this seam. THE
// DOOR IS route()'s `access` guard (Phase 6 L70): v1's `?k=` went with the last
// v1 page (the takes file route says why); the Board's <img> rides the session
// cookie. Access-checked but NOT rate-limited: a gallery of fifty tiles is fifty
// requests in one second, and the money-route bucket would refuse the tail.
// The refusal is route()'s envelope, which names the verdict - the reason v1's
// door stopped answering a bare "Access denied." (a server with no secret
// configured fails closed, and says so, rather than blaming the caller's key).

import path from "node:path";

import { err, type AppErrorCode } from "@gt/domain/errors";

import { FoundryError, fileStat } from "../../../../lib/foundry/store.ts";
import { extractFileStat } from "../../../../lib/foundry/extract/store.ts";
import { meshFileStat } from "../../../../lib/foundry/mesh/store.ts";
import { scoutFileStat } from "../../../../lib/foundry/scout/store.ts";
import { stripFileStat } from "../../../../lib/foundry/strips/store.ts";
import { trainingFileStat } from "../../../../lib/foundry/training/store.ts";
import { route } from "../../../_server/route.ts";
import { serveFile } from "../../../_server/serveFile.ts";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".glb": "model/gltf-binary",
};

const VIDEO = new Set([".mp4", ".webm"]);

/** A FoundryError's status as the envelope's code, so the answer keeps the store's status. */
const CODE: Readonly<Record<number, AppErrorCode>> = { 400: "invalid", 404: "not-found", 409: "conflict", 503: "unavailable" };

export const GET = route({ guard: "access", bodyCap: 0 }, async ({ req }) => {
  const url = new URL(req.url);
  const run = url.searchParams.get("run") ?? "";
  const rel = url.searchParams.get("path") ?? "";
  const kind = url.searchParams.get("kind");
  try {
    const { abs } =
      kind === "extract" ? await extractFileStat(run, rel)
      : kind === "training" ? await trainingFileStat(run, rel)
      : kind === "strips" ? await stripFileStat(run, rel)
      : kind === "scout" ? await scoutFileStat(run, rel)
      : kind === "mesh" ? await meshFileStat(run, rel)
      : await fileStat(run, rel);
    const ext = path.extname(abs).toLowerCase();
    // Candidates are immutable once written (a re-forge is a new seed or a new
    // run), so the browser may hold them for the session: serveFile's default.
    return await serveFile(req, abs, { mime: MIME[ext] ?? "application/octet-stream", ranges: (kind === "strips" || kind === "scout") && VIDEO.has(ext) });
  } catch (e) {
    if (e instanceof FoundryError) return err(CODE[e.status] ?? "internal", e.message);
    throw e;
  }
});
