// LANE — AD OVERLAY TEXT STAYS INSIDE THE SAFE ZONE (browser page, no server).
//
// lib/adRender.ts draws the supers and the end-card in a headless page. Its `fit`
// used to shrink text only when the LINE COUNT was over the limit, so one
// unbreakable word (a URL, a handle, a long compound) wider than the box kept the
// line count in range, never shrank, and was drawn past the safe zone and cut off
// at the frame edge. The request validator counts characters and cannot see width.
//
// This runs the real OVERLAY_PAGE_SCRIPT and reads the drawn pixels:
//   · every drawn glyph sits inside the safe box, whatever the copy;
//   · ordinary copy is not shrunk to make that true.
//
// NO VENDOR, NO SPAWN, NO SPEND: one headless Chromium page and a canvas.

import { test, expect, chromium } from "@playwright/test";

import { AD_RENDER_PX, AD_SAFE_ZONE, OVERLAY_PAGE_SCRIPT, type OverlaySpec } from "@/lib/adRender";

type Spec = Omit<Extract<OverlaySpec, { kind: "super" }>, "out"> | Omit<Extract<OverlaySpec, { kind: "end-card" }>, "out">;

const CASES: Array<{ id: string; spec: Spec; plain: boolean }> = [
  { id: "super-short", spec: { kind: "super", text: "Fresh pasta, daily" }, plain: true },
  { id: "super-url", spec: { kind: "super", text: "Order at harborviewbistro-reservations-and-catering.example.com/book-now" }, plain: false },
  { id: "cta-plain", spec: { kind: "end-card", cta: "Book your table tonight", line: "Open until midnight", logo: null }, plain: true },
  { id: "cta-url", spec: { kind: "end-card", cta: "www.harborviewbistro-reservations.example/book", line: null, logo: null }, plain: false },
  { id: "cta-handle", spec: { kind: "end-card", cta: "@harborview_bistro_and_wine_bar_downtown", line: "Follow for the daily special", logo: null }, plain: false },
];

test("drawn overlay text stays inside the safe box and plain copy keeps its size", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body style="margin:0"><canvas id="c"></canvas></body></html>');
    await page.addScriptTag({ content: OVERLAY_PAGE_SCRIPT });
    for (const aspect of ["9:16", "1:1", "16:9"] as const) {
      const size = AD_RENDER_PX[aspect];
      const safe = AD_SAFE_ZONE[aspect];
      const side = Math.max(safe.left, safe.right);
      for (const { id, spec, plain } of CASES) {
        const { x0, x1 } = await page.evaluate(
          async ({ spec, size, safe }) => {
            await (window as unknown as { __drawOverlay: (a: unknown, b: unknown, c: unknown) => Promise<string> }).__drawOverlay(spec, size, safe);
            const d = (document.getElementById("c") as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, size.w, size.h).data;
            const isSuper = (spec as { kind: string }).kind === "super";
            let lo = Infinity;
            let hi = -1;
            for (let y = 0; y < size.h; y += 2)
              for (let x = 0; x < size.w; x++) {
                const i = (y * size.w + x) * 4;
                const on = isSuper ? d[i + 3] > 8 : d[i] > 150 && d[i + 1] > 150 && d[i + 2] > 150;
                if (on) {
                  if (x < lo) lo = x;
                  if (x > hi) hi = x;
                }
              }
            return { x0: lo, x1: hi };
          },
          { spec, size, safe },
        );
        const where = `${aspect} ${id}`;
        expect(x0, `${where}: left edge`).toBeGreaterThanOrEqual(size.w * side - 1);
        expect(x1, `${where}: right edge`).toBeLessThanOrEqual(size.w * (1 - side) + 1);
        // Plain copy is not shrunk to the floor: it still spans a real share of the box.
        if (plain) expect(x1 - x0, `${where}: plain copy kept its size`).toBeGreaterThan(size.w * 0.2);
      }
    }
  } finally {
    await browser.close();
  }
});
