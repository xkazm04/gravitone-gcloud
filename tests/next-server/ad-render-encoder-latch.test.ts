// runAdRender (L-ads): the process-wide "NVENC is unavailable" latch is set by evidence about the
// encoder, not by any ffmpeg failure. A render that fails on both encoders failed for a reason
// that is not the encoder (a corrupt shot, a full disk) and must not cost every later render the
// GPU path; a render that fails on NVENC and succeeds on libx264 is the encoder's own failure.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-ad-latch-"));
  process.env["AD_EXPORT_DIR"] = dir;
  return { dir };
});

import { rmSync, writeFileSync } from "node:fs";

import { type AdRenderDeps, type AdRenderReceipt } from "../../lib/adRender";
import type { AdRenderRequest } from "../../lib/ads/types";

afterAll(() => rmSync(state.dir, { recursive: true, force: true }));

const queued = (n: number) =>
  ({
    exportId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    projectId: "p1",
    aspect: "16:9",
    status: "queued",
    error: null,
    durationS: null,
    createdAt: 1,
    finishedAt: null,
    loudness: null,
    width: null,
    height: null,
    encoder: null,
    hasAudio: null,
  }) as AdRenderReceipt;

const req = { projectId: "p1", aspect: "16:9", shots: [], endCard: { cta: "Go", line: null, logo: null, holdS: 2 } } as unknown as AdRenderRequest;
const inputs = { shots: [{ file: "shot0.mp4", trimS: 2, super: null }], musicFile: null } as never;

/** The encoder each ffmpeg call asked for, in order; `fails` decides which calls throw. */
function harness(fails: (encoder: string) => string | null) {
  const asked: string[] = [];
  const deps: AdRenderDeps = {
    ffmpeg: async (args: string[]) => {
      const encoder = args[args.indexOf("-c:v") + 1] ?? "?";
      asked.push(encoder);
      const failure = fails(encoder);
      if (failure) throw new Error(failure);
      const out = args[args.length - 1] ?? "";
      if (out.endsWith(".partial.mp4")) writeFileSync(out, "x");
      return { stderr: "" };
    },
    probeDurationS: async () => 8,
    renderOverlays: async (specs: { out: string }[]) => {
      for (const s of specs) writeFileSync(s.out, "png");
    },
    resolveMusicFile: async () => "",
  } as unknown as AdRenderDeps;
  return { asked, deps };
}

describe("NVENC unavailable latch", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.resetModules();
  });

  it("is not set by a failure both encoders share", async () => {
    const { runAdRender: run } = await import("../../lib/adRender");
    const bad = harness(() => "Invalid data found when processing input");
    const first = await run(queued(1), req, inputs, bad.deps, () => 2);
    expect(first.status).toBe("failed");

    const good = harness(() => null);
    const second = await run(queued(2), req, inputs, good.deps, () => 3);
    expect(second.status).toBe("done");
    expect(good.asked[0]).toBe("h264_nvenc");
  });

  it("is set by an NVENC-only failure, and the render still completes", async () => {
    const { runAdRender: run } = await import("../../lib/adRender");
    const gpu = harness((e) => (e === "h264_nvenc" ? "OpenEncodeSessionEx failed: no capable devices found" : null));
    const first = await run(queued(3), req, inputs, gpu.deps, () => 2);
    expect(first.status).toBe("done");
    expect(first.encoder).toBe("libx264");
    expect(gpu.asked).toEqual(["h264_nvenc", "libx264"]);

    const next = harness(() => null);
    const second = await run(queued(4), req, inputs, next.deps, () => 3);
    expect(second.status).toBe("done");
    expect(next.asked[0]).toBe("libx264");
  });
});

