// runAdRender (L-ads): a render that fails and whose 'failed' record then cannot be written still
// resolves 'failed', and the lost write is logged rather than swallowed.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-ad-record-"));
  process.env["AD_EXPORT_DIR"] = dir;
  return { dir, writes: 0 };
});

vi.mock("node:fs/promises", async (orig) => {
  const real = await orig<typeof import("node:fs/promises")>();
  return {
    ...real,
    // The first record write ('rendering') lands; every later one is refused.
    writeFile: (async (...args: Parameters<typeof real.writeFile>) => {
      state.writes += 1;
      if (state.writes > 1) throw new Error("ENOSPC: no space left on device");
      return real.writeFile(...args);
    }) as typeof real.writeFile,
  };
});

import { rmSync } from "node:fs";

import { runAdRender, type AdRenderDeps, type AdRenderReceipt } from "../../lib/adRender";
import type { AdRenderRequest } from "../../lib/ads/types";

afterAll(() => rmSync(state.dir, { recursive: true, force: true }));

describe("runAdRender failed-record write", () => {
  it("resolves failed and warns when the failed record cannot be written", async () => {
    const id = "11111111-2222-3333-4444-555555555555";
    const queued = {
      exportId: id,
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
    } as AdRenderReceipt;
    const req = { projectId: "p1", aspect: "16:9", shots: [], endCard: { cta: "Go", line: null, logo: null, holdS: 2 } } as unknown as AdRenderRequest;
    const deps: AdRenderDeps = {
      ffmpeg: async () => ({ stderr: "" }),
      probeDurationS: async () => null,
      renderOverlays: async () => {
        throw new Error("overlay renderer exploded");
      },
      resolveMusicFile: async () => "",
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const out = await runAdRender(queued, req, { shots: [], musicFile: null }, deps, () => 2);

    expect(out.status).toBe("failed");
    expect(out.error).toContain("overlay renderer exploded");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("failed-record write failed"), expect.stringContaining("ENOSPC"));
    warn.mockRestore();
    error.mockRestore();
  });
});
