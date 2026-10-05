// LANE — ADS FINISH RENDER (lib/adRender.ts, /api/ads/render).
//
// Four things, cheapest first:
//   · the request is refused at the field that is wrong — a clip id the store
//     did not mint, a clip that is not on disk, a trim longer than its clip, an
//     aspect with no delivery size;
//   · the filter graph is a pure function and is held to its arithmetic — each
//     super enabled over exactly its shot, the concat in shot order with the
//     end-card last, loudnorm present only when there is a music bed;
//   · the route refuses with a readable reason when the posture forbids spawning;
//   · and, when ffmpeg is on PATH, a REAL render from `testsrc` clips: pixel size
//     per aspect, duration = Σ trims + hold, an AAC stream only with music, and
//     the end-card in the last second (a frame is extracted and its brightness
//     read — the end-card is a dark plate with a white CTA pill, the test
//     pattern is not).
//
// No vendor is called anywhere: the music bed is a sine tone ffmpeg makes, handed
// in through the injected resolver.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { keepEnv } from "./_helpers";
import {
  AD_RENDER_PX,
  AdRenderError,
  REAL_AD_RENDER_DEPS,
  buildAdRenderGraph,
  parseAdRenderRequest,
  parseEbur128,
  resolveAdInputs,
  startAdRender,
  type AdRenderDeps,
} from "@/lib/adRender";
import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";
import { POST as renderPOST } from "@/app/api/ads/render/route";
import { adFinishChecks, adRenderRequest, seedFinish, shotRows } from "@/app/_phases/cut/ads/finish";
import { GET as recordGET } from "@/app/api/ads/render/[id]/route";
import type { AdRenderRequest } from "@/lib/ads/types";
import type { Aspect } from "@/lib/imaging/types";

keepEnv(["CLIP_STORE_DIR", "AD_EXPORT_DIR", "LOCAL_BINARIES", ACCESS_SECRET_VAR, "NEXT_PUBLIC_DEV_AUTH"]);

const CLIP_A = "clip-probe-aaaa01";
const CLIP_B = "clip-probe-bbbb02";

function body(over: Partial<AdRenderRequest> = {}): AdRenderRequest {
  return {
    projectId: "pj-probe",
    aspect: "9:16",
    shots: [
      { clipId: CLIP_A, trimS: 2, super: "Fresh in five" },
      { clipId: CLIP_B, trimS: 1.8, super: null },
    ],
    endCard: { cta: "Order now", line: "Bread that tastes like Sunday", logo: null, holdS: 1.5 },
    musicTakeId: null,
    ...over,
  };
}

function refusal(fn: () => unknown): AdRenderError {
  try {
    fn();
  } catch (e) {
    if (e instanceof AdRenderError) return e;
    throw e;
  }
  throw new Error("expected a refusal");
}

async function refusalAsync(p: Promise<unknown>): Promise<AdRenderError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AdRenderError) return e;
    throw e;
  }
  throw new Error("expected a refusal");
}

const tmpDirs: string[] = [];
function tmp(prefix: string): string {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}
test.afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

/* ── 1. validation ─────────────────────────────────────────────────────── */

test("request: a clip id the store did not mint is refused at the field", () => {
  const e = refusal(() => parseAdRenderRequest(body({ shots: [{ clipId: "../../etc/passwd", trimS: 2, super: null }] })));
  expect(e.code).toBe("bad-request");
  expect(e.message).toContain("shots[0].clipId");
});

test("request: aspect must be one with a delivery size; each has its platform size", () => {
  expect(refusal(() => parseAdRenderRequest({ ...body(), aspect: "3:2" })).message).toContain("aspect");
  expect(AD_RENDER_PX).toEqual({
    "9:16": { w: 1080, h: 1920 },
    "1:1": { w: 1080, h: 1080 },
    "16:9": { w: 1920, h: 1080 },
    "4:5": { w: 1080, h: 1350 },
  });
  for (const a of Object.keys(AD_RENDER_PX) as Aspect[]) expect(parseAdRenderRequest(body({ aspect: a })).aspect).toBe(a);
});

test("request: no CTA, a hold out of band, a non-image logo are each refused", () => {
  expect(refusal(() => parseAdRenderRequest(body({ endCard: { cta: "  ", line: null, logo: null, holdS: 2 } }))).message).toContain("cta");
  expect(refusal(() => parseAdRenderRequest(body({ endCard: { cta: "Go", line: null, logo: null, holdS: 30 } }))).message).toContain("holdS");
  expect(
    refusal(() => parseAdRenderRequest(body({ endCard: { cta: "Go", line: null, logo: "data:text/html;base64,PGI+", holdS: 2 } }))).message,
  ).toContain("logo");
  expect(refusal(() => parseAdRenderRequest({ ...body(), shots: [] })).message).toContain("shots");
});

test("resolve: a minted id with no file is unknown; a trim past the clip's length is refused", async () => {
  const clips = tmp("ad-clips-");
  process.env.CLIP_STORE_DIR = clips;
  const deps: AdRenderDeps = {
    ...REAL_AD_RENDER_DEPS,
    probeDurationS: async () => 1.9,
    resolveMusicFile: async () => {
      throw new Error("no music in this case");
    },
  };
  const missing = await refusalAsync(resolveAdInputs(parseAdRenderRequest(body()), deps));
  expect(missing.code).toBe("unknown-clip");
  expect(missing.message).toContain(CLIP_A);

  writeFileSync(path.join(clips, `${CLIP_A}.mp4`), "");
  writeFileSync(path.join(clips, `${CLIP_B}.mp4`), "");
  const long = await refusalAsync(resolveAdInputs(parseAdRenderRequest(body()), deps));
  expect(long.code).toBe("trim-too-long");
  expect(long.message).toMatch(/Shot 1: trim 2\.00s is longer than clip/);

  // Within the frame-rounding tolerance is not a refusal.
  const ok = await resolveAdInputs(parseAdRenderRequest(body({ shots: [{ clipId: CLIP_A, trimS: 1.93, super: null }] })), deps);
  expect(ok.shots[0].trimS).toBeCloseTo(1.9, 5);
});

/* ── 2. the filter graph, as a pure function ───────────────────────────── */

const graphIn = (music: string | null) => ({
  aspect: "9:16" as Aspect,
  shots: [
    { file: "a.mp4", trimS: 2, superPng: "s0.png" },
    { file: "b.mp4", trimS: 1.5, superPng: null },
    { file: "c.mp4", trimS: 3, superPng: "s2.png" },
  ],
  endCard: { png: "end.png", holdS: 2 },
  musicFile: music,
  encoder: "libx264" as const,
  outPath: "out.mp4",
});

test("graph: supers are enabled over exactly their shot's span; the concat runs in shot order, end-card last", () => {
  const g = buildAdRenderGraph(graphIn(null));
  expect(g.durationS).toBeCloseTo(8.5, 6);
  expect(g.shotStartS).toEqual([0, 2, 3.5]);
  expect(g.endCardStartS).toBeCloseTo(6.5, 6);
  expect(g.concatOrder).toEqual(["v0", "v1", "v2", "vend"]);
  expect(g.filter).toContain("[v0][v1][v2][vend]concat=n=4:v=1:a=0[base]");
  expect(g.superSpans).toEqual([{ startS: 0, endS: 2 }, null, { startS: 3.5, endS: 6.5 }]);
  expect(g.filter).toContain("enable='gte(t,0.000)*lt(t,2.000)'");
  expect(g.filter).toContain("enable='gte(t,3.500)*lt(t,6.500)'");
  // Every clip is cropped to the delivery size, never letterboxed.
  expect(g.filter.match(/scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920/g)?.length).toBe(3);
  // The inputs: three clips, then the end-card, then the two supers, in that order.
  const inputs = g.args.flatMap((a, i) => (a === "-i" ? [g.args[i + 1]] : []));
  expect(inputs).toEqual(["a.mp4", "b.mp4", "c.mp4", "end.png", "s0.png", "s2.png"]);
  expect(g.args.slice(-1)[0]).toBe("out.mp4");
});

test("graph: loudnorm and an AAC stream only with a music bed; silent otherwise", () => {
  const silent = buildAdRenderGraph(graphIn(null));
  expect(silent.hasAudio).toBe(false);
  expect(silent.filter).not.toContain("loudnorm");
  expect(silent.args).toContain("-an");
  expect(silent.args).not.toContain("aac");

  const scored = buildAdRenderGraph(graphIn("bed.mp3"));
  expect(scored.hasAudio).toBe(true);
  expect(scored.filter).toContain("loudnorm=I=-14:TP=-1:LRA=11");
  expect(scored.filter).toContain("apad=whole_dur=8.500,atrim=duration=8.500");
  expect(scored.filter).toMatch(/afade=t=out:st=7\.500:d=1\.000/);
  expect(scored.args).toContain("aac");
  expect(scored.args).not.toContain("-an");
});

test("ebur128 summary parses to integrated loudness and true peak", () => {
  const stderr = `[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         -14.3 LUFS\n    Threshold: -24.5 LUFS\n\n  Loudness range:\n    LRA:         0.0 LU\n\n  True peak:\n    Peak:       -1.2 dBFS\n`;
  expect(parseEbur128(stderr)).toEqual({ integratedLufs: -14.3, truePeakDb: -1.2 });
  expect(parseEbur128("nothing here")).toBeNull();
});

/* ── 3. the route's posture refusal ────────────────────────────────────── */

test("route: LOCAL_BINARIES=off is refused with a readable reason, before anything is queued", async () => {
  __resetRateLimit();
  process.env[ACCESS_SECRET_VAR] = "probe-secret";
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  process.env.LOCAL_BINARIES = "off";
  process.env.AD_EXPORT_DIR = tmp("ad-exports-");
  const res = await renderPOST(
    new Request("http://localhost/api/ads/render", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer probe-secret", "x-forwarded-for": "10.9.0.1" },
      body: JSON.stringify(body()),
    }),
  );
  expect(res.status).toBe(503);
  const b = (await res.json()) as { error: string; message: string };
  expect(b.error).toBe("local-binaries-forbidden");
  expect(b.message).toContain("LOCAL_BINARIES=off");
});

test("route: a record that does not exist is a 404, a malformed id a 400", async () => {
  process.env[ACCESS_SECRET_VAR] = "probe-secret";
  process.env.AD_EXPORT_DIR = tmp("ad-exports-");
  const get = (id: string) =>
    recordGET(new Request(`http://localhost/api/ads/render/${id}`, { headers: { authorization: "Bearer probe-secret" } }), {
      params: Promise.resolve({ id }),
    });
  expect((await get("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  expect((await get("..%2F..%2Fsecrets")).status).toBe(400);
});

/* ── 4. a real render, when ffmpeg is here ─────────────────────────────── */

function onPath(bin: string): boolean {
  try {
    execFileSync(bin, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const HAVE_FFMPEG = onPath("ffmpeg") && onPath("ffprobe");

function ffprobe(file: string): { streams: { codec_type: string; codec_name: string; width?: number; height?: number }[]; format: { duration: string } } {
  return JSON.parse(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration", "-of", "json", file], {
      encoding: "utf8",
    }),
  );
}

/** Mean luma of one frame at `atS`, 0..255, plus the frame saved beside it. */
function frameLuma(file: string, atS: number, savePng: string): number {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", atS.toFixed(3), "-i", file, "-frames:v", "1", savePng]);
  const raw = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", savePng, "-vf", "scale=64:64,format=gray", "-f", "rawvideo", "-"]);
  let sum = 0;
  for (const b of raw) sum += b;
  return sum / raw.length;
}

test("real render: 2 testsrc shots → right size per aspect, Σ trims + hold, end-card last, AAC only with music", async () => {
  test.skip(!HAVE_FFMPEG, "ffmpeg/ffprobe are not on PATH on this machine — the real render cannot run here");
  test.setTimeout(300_000);

  const clips = tmp("ad-clips-");
  const out = tmp("ad-exports-");
  const frames = process.env.AD_RENDER_PROBE_FRAMES?.trim() || tmp("ad-frames-");
  mkdirSync(frames, { recursive: true });
  process.env.CLIP_STORE_DIR = clips;
  process.env.AD_EXPORT_DIR = out;
  process.env.LOCAL_BINARIES = "on";

  // Two silent-or-not synthetic clips of different shapes — one landscape with a
  // tone on it (dropped by the render), one portrait.
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=24:duration=2.5",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2.5", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(clips, `${CLIP_A}.mp4`)]);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30:duration=2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(clips, `${CLIP_B}.mp4`)]);
  const bed = path.join(clips, "bed.wav");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=3", "-ar", "48000", bed]);

  // A logo for the 1:1 case: a small orange square, as the PNG data URL Finish sends.
  const logoPng = path.join(clips, "logo.png");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=orange:s=200x120", "-frames:v", "1", logoPng]);
  const logo = `data:image/png;base64,${readFileSync(logoPng).toString("base64")}`;

  let chromiumOk = true;
  const deps: AdRenderDeps = {
    ...REAL_AD_RENDER_DEPS,
    resolveMusicFile: async () => bed,
    renderOverlays: async (specs, aspect) => {
      try {
        await REAL_AD_RENDER_DEPS.renderOverlays(specs, aspect);
      } catch (e) {
        chromiumOk = false;
        throw e;
      }
    },
  };

  const cases: { aspect: Aspect; music: boolean }[] = [
    { aspect: "9:16", music: false },
    { aspect: "16:9", music: false },
    { aspect: "1:1", music: true },
  ];
  for (const c of cases) {
    const req = body({ aspect: c.aspect, musicTakeId: c.music ? "st-probe-bed" : null });
    if (c.music) req.endCard.logo = logo;
    const { exportId, done } = await startAdRender(req, deps);
    const rec = await done;
    test.skip(!chromiumOk, "headless Chromium did not launch — the overlays cannot be drawn here");
    expect(rec.status, rec.error ?? "").toBe("done");
    const file = path.join(out, `${exportId}.mp4`);
    expect(existsSync(file)).toBe(true);
    expect(existsSync(path.join(out, `${exportId}.partial.mp4`))).toBe(false);

    const info = ffprobe(file);
    const video = info.streams.find((s) => s.codec_type === "video")!;
    const audio = info.streams.filter((s) => s.codec_type === "audio");
    const { w, h } = AD_RENDER_PX[c.aspect];
    const dur = Number(info.format.duration);
    console.log(`[ad-render] ${c.aspect}${c.music ? " +music" : ""}: ${video.width}x${video.height} ${dur.toFixed(3)}s audio=${audio.map((a) => a.codec_name).join(",") || "none"} loudness=${JSON.stringify(rec.loudness)}`);
    expect([video.width, video.height]).toEqual([w, h]);
    expect(Math.abs(dur - (2 + 1.8 + 1.5))).toBeLessThanOrEqual(0.1);
    if (c.music) {
      expect(audio.map((a) => a.codec_name)).toEqual(["aac"]);
      expect(rec.loudness).not.toBeNull();
    } else expect(audio).toEqual([]);

    // The last second is the end-card: a dark plate with a white pill. The first
    // second is the test pattern, which is bright everywhere.
    const tag = c.aspect.replace(":", "x");
    const endLuma = frameLuma(file, dur - 0.5, path.join(frames, `end-${tag}.png`));
    const openLuma = frameLuma(file, 0.5, path.join(frames, `open-${tag}.png`));
    console.log(`[ad-render] ${c.aspect}: luma at 0.5s=${openLuma.toFixed(1)} at end-0.5s=${endLuma.toFixed(1)} (frames in ${frames})`);
    expect(endLuma).toBeLessThan(openLuma);
    expect(endLuma).toBeLessThan(80);
  }
});

/* ── 5. Finish's checks (app/_phases/cut/ads/finish.ts), pure ──────────── */

test("finish: a shot with no adopted clip blocks the render; runtime is held to the template band", () => {
  const scenario = {
    id: "sc", ideaId: "i", title: "t", logline: "l", musicMood: "m",
    endCard: { cta: "Buy", line: null },
    shots: [
      { id: "a", durationS: 4, image: "", motion: "", super: "One" },
      { id: "b", durationS: 6, image: "", motion: "", super: null },
    ],
  };
  const clip = (clipId: string, durationS: number) => ({ clipId, model: "m" as never, durationS, costUsd: null, costBasis: "free" as never, createdAt: 0, motion: "" });
  const finish = seedFinish(scenario, null, "ad-social-15");
  expect(finish.aspects).toEqual(["9:16"]);

  const half = shotRows(scenario, { scenarioId: "sc", shots: { a: { imageTakes: [], adoptedImage: null, clips: [clip(CLIP_A, 5)], adoptedClip: CLIP_A } } });
  const blocked = adFinishChecks({ rows: half, finish, range: [6, 20], musicTakeId: null, rendered: null });
  expect(blocked.find((c) => c.id === "clips")).toMatchObject({ verdict: "fail", blocks: true, value: "1/2" });
  expect(blocked.find((c) => c.id === "loudness")?.verdict).toBe("unmeasured");
  expect(adRenderRequest({ projectId: "p", aspect: "9:16", rows: half, finish, logo: null, musicTakeId: null })).toBeNull();

  const full = shotRows(scenario, {
    scenarioId: "sc",
    shots: {
      a: { imageTakes: [], adoptedImage: null, clips: [clip(CLIP_A, 5)], adoptedClip: CLIP_A },
      b: { imageTakes: [], adoptedImage: null, clips: [clip(CLIP_B, 5)], adoptedClip: CLIP_B },
    },
  });
  // Shot b asks for 6s; its clip has 5 — the trim is the clip's length.
  expect(full.map((r) => r.trimS)).toEqual([4, 5]);
  const checks = adFinishChecks({ rows: full, finish, range: [6, 20], musicTakeId: null, rendered: null });
  expect(checks.find((c) => c.id === "runtime")).toMatchObject({ value: "11s", verdict: "pass" });
  const req = adRenderRequest({ projectId: "p", aspect: "1:1", rows: full, finish, logo: null, musicTakeId: "st-x" });
  expect(req?.shots).toEqual([{ clipId: CLIP_A, trimS: 4, super: "One" }, { clipId: CLIP_B, trimS: 5, super: null }]);
  expect(parseAdRenderRequest(req)).toEqual(req);

  // Out of the template band, both ways: a fail with the gap named, and not a
  // blocking one — a long or short ad still renders.
  const long = adFinishChecks({ rows: full, finish: { ...finish, endCard: { ...finish.endCard, holdS: 10 } }, range: [6, 20], musicTakeId: null, rendered: null });
  expect(long.find((c) => c.id === "runtime")).toMatchObject({ value: "19s", verdict: "pass" });
  const over = adFinishChecks({ rows: full, finish, range: [6, 10], musicTakeId: null, rendered: null });
  expect(over.find((c) => c.id === "runtime")).toMatchObject({ value: "11s", target: "6–10s", verdict: "fail", deny: "1s over the template" });
  expect(over.find((c) => c.id === "runtime")?.blocks).toBeUndefined();
  const under = adFinishChecks({ rows: full, finish, range: [20, 45], musicTakeId: null, rendered: null });
  expect(under.find((c) => c.id === "runtime")).toMatchObject({ verdict: "fail", deny: "9s short of the template" });
  expect(adRenderRequest({ projectId: "p", aspect: "1:1", rows: full, finish, logo: null, musicTakeId: null })).not.toBeNull();

  // A frames record for another scenario adopts nothing here.
  expect(shotRows(scenario, { scenarioId: "other", shots: {} }).every((r) => r.clipId === null)).toBe(true);
});

/* ── 6. drawn overlays are centred on the frame ────────────────────────── */

/** Horizontal extent of the "ink" in a PNG: alpha > 0 for a transparent super,
 *  luma > 60 against the end-card's dark plate. */
function inkSpanX(png: string, mode: "alpha" | "luma"): { minX: number; maxX: number; w: number } {
  const info = ffprobe(png).streams[0];
  const w = info.width!, h = info.height!;
  const raw = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", png, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 26 });
  let minX = w, maxX = -1;
  for (let y = 0; y < h; y += 2)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const ink = mode === "alpha" ? raw[i + 3] > 0 : 0.299 * raw[i] + 0.587 * raw[i + 1] + 0.114 * raw[i + 2] > 60;
      if (ink) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  return { minX, maxX, w };
}

test("overlays: every super and end-card is centred on the frame, every aspect", async () => {
  test.skip(!HAVE_FFMPEG, "ffmpeg/ffprobe are not on PATH on this machine — the overlay PNGs cannot be decoded here");
  test.setTimeout(120_000);
  const dir = tmp("ad-overlays-");
  for (const aspect of Object.keys(AD_RENDER_PX) as Aspect[]) {
    const tag = aspect.replace(":", "x");
    const specs = [
      { kind: "super" as const, text: "Baked at 5am", out: path.join(dir, `super-${tag}.png`) },
      { kind: "end-card" as const, cta: "Order for tomorrow", line: "Sunday Loaf — Main St.", logo: null, out: path.join(dir, `end-${tag}.png`) },
    ];
    try {
      await REAL_AD_RENDER_DEPS.renderOverlays(specs, aspect);
    } catch (e) {
      test.skip(true, `headless Chromium did not draw the overlays here: ${e instanceof Error ? e.message : String(e)}`);
    }
    for (const [spec, mode] of [[specs[0], "alpha"], [specs[1], "luma"]] as const) {
      const { minX, maxX, w } = inkSpanX(spec.out, mode);
      const centre = (minX + maxX) / 2;
      console.log(`[ad-render] ${aspect} ${spec.kind}: ink x ${minX}..${maxX}, centre ${centre.toFixed(1)} of ${w / 2}`);
      expect(maxX, `${aspect} ${spec.kind} drew nothing`).toBeGreaterThan(minX);
      expect(Math.abs(centre - w / 2), `${aspect} ${spec.kind} is off-centre`).toBeLessThanOrEqual(3);
    }
  }
});
