// THE AD RENDER'S DRAWN LAYER — server-only, split out of lib/adRender.ts.
//
// The supers and the end-card are drawn on a canvas in headless Chromium (why:
// lib/adRender.ts's header). This file holds that page's script, the Playwright
// driver that runs it, and the two tables the driver reads (delivery pixel size
// and safe zone per aspect). lib/adRender.ts re-exports all of it.

import { writeFile } from "node:fs/promises";

import { errorMessage } from "@gt/domain/errors";
import type { Aspect } from "./imaging/types";

/** The delivery pixel size per aspect — the platforms' own ingest sizes, not
 *  the generation grid in lib/imaging/types.ts (ASPECT_PX), which is a
 *  provider's snap and is never a delivery size. */
export const AD_RENDER_PX: Record<Aspect, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
};

/** Where text may sit, as insets from each edge (fractions of the frame).
 *  9:16 keeps clear of the feed UI — the caption block at the bottom and the
 *  action rail down the right — which is why it is the only asymmetric one.
 *  The others are classic title-safe margins. The overlay applies the wider
 *  side inset to BOTH sides, so drawn text is centred on the frame. */
export const AD_SAFE_ZONE: Record<Aspect, { top: number; bottom: number; left: number; right: number }> = {
  "9:16": { top: 0.14, bottom: 0.22, left: 0.06, right: 0.14 },
  "4:5": { top: 0.08, bottom: 0.12, left: 0.06, right: 0.06 },
  "1:1": { top: 0.08, bottom: 0.1, left: 0.08, right: 0.08 },
  "16:9": { top: 0.08, bottom: 0.1, left: 0.08, right: 0.08 },
};

export type OverlaySpec =
  | { kind: "super"; text: string; out: string }
  | { kind: "end-card"; cta: string; line: string | null; logo: string | null; out: string };

/** The overlay page: one canvas, one draw function per spec kind. Lives as a
 *  string because it runs in the browser page, not in this process. */
export const OVERLAY_PAGE_SCRIPT = String.raw`
window.__drawOverlay = async function (spec, size, safe) {
  const c = document.getElementById("c");
  c.width = size.w; c.height = size.h;
  const g = c.getContext("2d");
  g.clearRect(0, 0, size.w, size.h);
  const FONT = '"Inter", "Helvetica Neue", "Segoe UI", Arial, sans-serif';
  // HORIZONTALLY SYMMETRIC: the wider of the two side insets on both sides, so
  // text is centred on the FRAME and still clear of 9:16's action rail. Using
  // each inset as-is centred text in the safe box instead — 40px left of the
  // frame's centre on 9:16, which reads as a layout error on an end-card.
  const side = Math.max(safe.left, safe.right);
  const left = size.w * side, right = size.w * (1 - side);
  const top = size.h * safe.top, bottom = size.h * (1 - safe.bottom);
  const maxW = right - left, cx = (left + right) / 2;
  const unit = Math.min(size.w, size.h);
  function wrap(text, px, weight, width, maxLines) {
    g.font = weight + " " + px + "px " + FONT;
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? cur + " " + w : w;
      if (g.measureText(next).width <= width || !cur) cur = next;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, maxLines);
  }
  // A line is also too long when one unbreakable word (a URL, a handle, a German compound)
  // is wider than the box: wrap() cannot split it, so the line COUNT stays in range and
  // only the width shows the overflow. Shrink on either.
  function widest(lines, px, weight) {
    g.font = weight + " " + px + "px " + FONT;
    return Math.max.apply(null, lines.map((l) => g.measureText(l).width));
  }
  function fit(text, px, weight, width, maxLines) {
    let size_ = px, lines = wrap(text, size_, weight, width, 99);
    while ((lines.length > maxLines || widest(lines, size_, weight) > width) && size_ > 18) { size_ = Math.round(size_ * 0.9); lines = wrap(text, size_, weight, width, 99); }
    return { px: size_, lines: lines.slice(0, maxLines) };
  }
  if (spec.kind === "super") {
    const f = fit(spec.text, Math.round(unit * 0.058), "700", maxW * 0.92, 3);
    const lh = Math.round(f.px * 1.18);
    g.font = "700 " + f.px + "px " + FONT;
    const widest = Math.max.apply(null, f.lines.map((l) => g.measureText(l).width));
    const padX = f.px * 0.55, padY = f.px * 0.4;
    const boxW = widest + padX * 2, boxH = lh * f.lines.length + padY * 2;
    const boxTop = bottom - boxH;
    g.fillStyle = "rgba(8, 9, 12, 0.62)";
    const r = f.px * 0.35, bx = cx - boxW / 2;
    g.beginPath();
    g.moveTo(bx + r, boxTop); g.lineTo(bx + boxW - r, boxTop); g.quadraticCurveTo(bx + boxW, boxTop, bx + boxW, boxTop + r);
    g.lineTo(bx + boxW, boxTop + boxH - r); g.quadraticCurveTo(bx + boxW, boxTop + boxH, bx + boxW - r, boxTop + boxH);
    g.lineTo(bx + r, boxTop + boxH); g.quadraticCurveTo(bx, boxTop + boxH, bx, boxTop + boxH - r);
    g.lineTo(bx, boxTop + r); g.quadraticCurveTo(bx, boxTop, bx + r, boxTop);
    g.fill();
    g.fillStyle = "#ffffff";
    g.textAlign = "center"; g.textBaseline = "middle";
    f.lines.forEach((l, i) => g.fillText(l, cx, boxTop + padY + lh * i + lh / 2));
  } else {
    g.fillStyle = "#0b0c10";
    g.fillRect(0, 0, size.w, size.h);
    const parts = [];
    if (spec.logo) {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("the end-card logo did not decode")); i.src = spec.logo; });
      const s = Math.min((maxW * 0.6) / img.naturalWidth, ((bottom - top) * 0.24) / img.naturalHeight);
      parts.push({ h: img.naturalHeight * s, gap: unit * 0.05, draw: (y) => g.drawImage(img, cx - (img.naturalWidth * s) / 2, y, img.naturalWidth * s, img.naturalHeight * s) });
    }
    if (spec.line) {
      const f = fit(spec.line, Math.round(unit * 0.05), "500", maxW, 3);
      const lh = Math.round(f.px * 1.25);
      parts.push({ h: lh * f.lines.length, gap: unit * 0.045, draw: (y) => {
        g.font = "500 " + f.px + "px " + FONT; g.fillStyle = "rgba(255, 255, 255, 0.86)";
        g.textAlign = "center"; g.textBaseline = "middle";
        f.lines.forEach((l, i) => g.fillText(l, cx, y + lh * i + lh / 2));
      } });
    }
    {
      const f = fit(spec.cta, Math.round(unit * 0.068), "800", maxW * 0.84, 2);
      const lh = Math.round(f.px * 1.2);
      g.font = "800 " + f.px + "px " + FONT;
      const widest = Math.max.apply(null, f.lines.map((l) => g.measureText(l).width));
      const padX = f.px * 0.9, padY = f.px * 0.5;
      const w = widest + padX * 2, h = lh * f.lines.length + padY * 2;
      parts.push({ h, gap: 0, draw: (y) => {
        const x = cx - w / 2, r = h / 2;
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
        g.lineTo(x + r, y + h); g.arc(x + r, y + r, r, Math.PI / 2, (3 * Math.PI) / 2); g.fill();
        g.font = "800 " + f.px + "px " + FONT; g.fillStyle = "#0b0c10";
        g.textAlign = "center"; g.textBaseline = "middle";
        f.lines.forEach((l, i) => g.fillText(l, cx, y + padY + lh * i + lh / 2));
      } });
    }
    const total = parts.reduce((n, p, i) => n + p.h + (i < parts.length - 1 ? p.gap : 0), 0);
    let y = top + (bottom - top - total) / 2;
    for (const p of parts) { p.draw(y); y += p.h + p.gap; }
  }
  return c.toDataURL("image/png");
};`;

export async function realRenderOverlays(specs: OverlaySpec[], aspect: Aspect): Promise<void> {
  if (!specs.length) return;
  const size = AD_RENDER_PX[aspect];
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (e) {
    throw new Error(`playwright is not installed on this machine: ${errorMessage(e)}`);
  }
  let browser: import("playwright").Browser | undefined;
  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (e) {
      throw new Error(
        `Headless Chromium failed to launch: ${errorMessage(e)}. Run "npx playwright install chromium" on this machine.`,
      );
    }
    const page = await browser.newPage({ viewport: { width: Math.min(size.w, 1920), height: Math.min(size.h, 1920) } });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><canvas id="c"></canvas></body></html>`);
    await page.addScriptTag({ content: OVERLAY_PAGE_SCRIPT });
    for (const spec of specs) {
      const dataUrl = await page.evaluate(
        async ({ spec, size, safe }) =>
          (window as unknown as { __drawOverlay: (a: unknown, b: unknown, c: unknown) => Promise<string> }).__drawOverlay(spec, size, safe),
        { spec, size, safe: AD_SAFE_ZONE[aspect] },
      );
      await writeFile(spec.out, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
    }
  } finally {
    await browser?.close().catch(() => {});
  }
}
