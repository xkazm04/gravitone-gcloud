// POST /api/music-video/export — the Cut phase's real render. A poster, an
// mp3, a baked envelope and a resolution tier in; a muxed mp4's id out.
//
// GENEROUS maxDuration, reasoned like Leonardo's 300s comment in
// generate/route.ts: that number is "Leonardo polls for up to three minutes;
// give the handler room past that" — a real measurement turned into a ceiling
// with headroom. This route's own real measurement (see the WP5 build record)
// was ~1080p/25s-track capture+mux well under a minute on this machine's RTX
// 4090; 900 is several times that, which is the room a longer track or a
// libx264 fallback (slower than NVENC) needs without the handler timing out
// mid-mux and leaving an orphaned temp directory.
//
// Money/compute route: `guardRequest` first, exactly like every other route in
// this family. Gated a second time on `canSpawnLocalBinaries()` — ffmpeg and a
// headless Chromium are both local-binary spawns, the same posture
// `lib/imaging/providers/agy.ts` already checks before it spawns `agy`.

import { guardRequest } from "@/lib/apiAuth";
import { canSpawnLocalBinaries, describePosture, localPosture } from "@/lib/deployment";
import {
  EXPORT_RESOLUTIONS,
  ExportError,
  runExport,
  type ExportRequest,
  type ExportResolution,
} from "@/lib/musicVideoExport";
import type { AudioEnvelope } from "@/lib/audioEnvelope";
import type { EffectParams } from "@/app/_phases/frames/music-video/compositor";

export const runtime = "nodejs";
export const maxDuration = 900;

class BadRequest extends Error {}

function asResolution(v: unknown): ExportResolution {
  if (typeof v !== "string" || !(v in EXPORT_RESOLUTIONS))
    throw new BadRequest(`\`resolution\` must be one of ${Object.keys(EXPORT_RESOLUTIONS).join(", ")}.`);
  return v as ExportResolution;
}

function asBase64(v: unknown, field: string): string {
  if (typeof v !== "string" || !v.trim()) throw new BadRequest(`\`${field}\` is required.`);
  return v.replace(/^data:[^;]+;base64,/, "");
}

function asMime(v: unknown, field: string): string {
  if (typeof v !== "string" || !v.trim()) throw new BadRequest(`\`${field}\` is required.`);
  return v;
}

function asEnvelope(v: unknown): AudioEnvelope {
  if (typeof v !== "object" || v === null) throw new BadRequest("`envelope` is required.");
  const o = v as Record<string, unknown>;
  const bands = o.bands as Record<string, unknown> | undefined;
  if (
    typeof o.fps !== "number" ||
    typeof o.durationS !== "number" ||
    typeof o.frameCount !== "number" ||
    !bands ||
    !Array.isArray(bands.low) ||
    !Array.isArray(bands.mid) ||
    !Array.isArray(bands.high) ||
    !Array.isArray(o.flux)
  )
    throw new BadRequest("`envelope` is missing a required field — it must be the record `analyzeAudioEnvelope` produced.");
  if (o.frameCount <= 0) throw new BadRequest("`envelope.frameCount` must be a real track, not an empty one.");
  return o as unknown as AudioEnvelope;
}

function asEffectParams(v: unknown): EffectParams {
  if (typeof v !== "object" || v === null) throw new BadRequest("`effectParams` is required.");
  return v as EffectParams;
}

function asSeed(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new BadRequest("`seed` must be a number.");
  return v;
}

export async function POST(req: Request) {
  const denied = await guardRequest(req);
  if (denied) return denied;

  // THE SECOND GATE, BEFORE ANY BODY PARSING OR BROWSER SPAWN. A missing
  // ffmpeg/Chromium is a cheap, named refusal; discovering it after decoding
  // a multi-megabyte base64 payload would waste the one thing the brief asks
  // this failure state to be — clear and immediate, not a generic timeout.
  if (!canSpawnLocalBinaries()) {
    return Response.json(
      {
        detail: `Export spawns a headless browser and ffmpeg locally, and this environment will not allow it: ${describePosture(localPosture())}.`,
        code: "local-binaries-forbidden",
      },
      { status: 503 },
    );
  }

  try {
    const body = (await req.json().catch(() => {
      throw new BadRequest("The request body was not a JSON object.");
    })) as Record<string, unknown>;

    const exportReq: ExportRequest = {
      resolution: asResolution(body.resolution),
      posterBase64: asBase64(body.posterBase64, "posterBase64"),
      posterMime: asMime(body.posterMime, "posterMime"),
      audioBase64: asBase64(body.audioBase64, "audioBase64"),
      audioMime: asMime(body.audioMime, "audioMime"),
      envelope: asEnvelope(body.envelope),
      seed: asSeed(body.seed),
      effectParams: asEffectParams(body.effectParams),
      projectId: typeof body.projectId === "string" && body.projectId.trim() ? body.projectId : null,
    };

    const result = await runExport(exportReq);
    return Response.json({
      ...result,
      downloadUrl: `/api/music-video/export/file?id=${result.id}`,
    });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ detail: e.message, code: "bad-request" }, { status: 400 });
    if (e instanceof ExportError) {
      const status = e.code === "local-binaries-forbidden" ? 503 : e.code === "playwright-launch-failed" ? 502 : 500;
      return Response.json({ detail: e.message, code: e.code }, { status });
    }
    console.error("[music-video/export] unexpected failure", e);
    return Response.json(
      { detail: "The export failed unexpectedly. Check the server log for the real cause.", code: "failed" },
      { status: 500 },
    );
  }
}
