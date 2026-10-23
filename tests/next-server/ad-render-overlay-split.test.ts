// THE OVERLAY PAGE SPLIT: lib/adOverlayPage.ts owns the in-page script and its Playwright driver,
// lib/adRender.ts re-exports them so importers do not change, and REAL_AD_RENDER_DEPS (which
// needs adRender's own ffmpeg runners) stays in adRender and wires the moved driver.

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("lib/adRender overlay split", () => {
  it("still exports the overlay page, its driver and the real deps", async () => {
    const render = await import("../../lib/adRender");
    const page = await import("../../lib/adOverlayPage");
    expect(typeof render.OVERLAY_PAGE_SCRIPT).toBe("string");
    expect(render.OVERLAY_PAGE_SCRIPT).toContain("window.__drawOverlay");
    expect(render.OVERLAY_PAGE_SCRIPT).toBe(page.OVERLAY_PAGE_SCRIPT);
    expect(render.realRenderOverlays).toBe(page.realRenderOverlays);
    expect(render.AD_RENDER_PX).toBe(page.AD_RENDER_PX);
    expect(render.AD_SAFE_ZONE).toBe(page.AD_SAFE_ZONE);
    expect(render.REAL_AD_RENDER_DEPS.renderOverlays).toBe(page.realRenderOverlays);
  });

  it("keeps the overlay block out of adRender.ts", () => {
    const src = readFileSync(new URL("../../lib/adRender.ts", import.meta.url), "utf8");
    expect(src).not.toContain("window.__drawOverlay");
  });
});
