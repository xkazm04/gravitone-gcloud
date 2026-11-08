// TEXT MEASURED AS RENDERED, split out of render.mts to keep it under its line budget.
import type { Page } from "playwright";

export const SAFE_INSET = 0.06;

/** Text measured as rendered: the first line box of every visible text node,
 *  converted to an approximate font size and scaled to a 1080-wide frame. */
export async function measureText(page: Page): Promise<{ minPx: number; sample: string; outside: number; measured: number; canvases: number }> {
  return page.evaluate(
    ({ inset }) => {
      const W = innerWidth;
      const H = innerHeight;
      const scale = 1080 / W;
      let minPx = Infinity;
      let sample = "";
      let outside = 0;
      let measured = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const text = (n.textContent ?? "").trim();
        const el = n.parentElement;
        if (!el || text.length < 2) continue;
        if (el.closest("script,style,title,defs,desc,metadata")) continue;
        let op = 1;
        for (let e: Element | null = el; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.display === "none" || cs.visibility === "hidden") op = 0;
          op *= parseFloat(cs.opacity || "1");
        }
        if (op < 0.35) continue;
        let rect: DOMRect | undefined;
        if (el instanceof SVGElement) rect = el.getBoundingClientRect();
        else {
          const r = document.createRange();
          r.selectNodeContents(n);
          rect = r.getClientRects()[0];
        }
        if (!rect || rect.width < 1 || rect.height < 1) continue;
        if (rect.right < 0 || rect.bottom < 0 || rect.left > W || rect.top > H) continue;
        measured++;
        const px = (rect.height / 1.2) * scale;
        if (px < minPx) {
          minPx = px;
          sample = text.slice(0, 40);
        }
        if (rect.left < W * inset - 1 || rect.right > W * (1 - inset) + 1 || rect.top < H * inset - 1 || rect.bottom > H * (1 - inset) + 1) outside++;
      }
      return { minPx, sample, outside, measured, canvases: document.querySelectorAll("canvas").length };
    },
    { inset: SAFE_INSET },
  );
}
