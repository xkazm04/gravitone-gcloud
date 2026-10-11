// TABS: the ream tab stagger. layoutTabs has two callers, reams.ts (after the reams
// are built) and intro.ts (on its own, scene.ts re-exports it), so it lives in its
// own file rather than with the reams builder.

import { $, type Cx } from "./state";

/** staggers neighbouring tabs when any is wider than its ream */
export function layoutTabs(cx: Cx): void {
  if (cx.g.portrait) return;
  let over = false;
  cx.reamEls.forEach((b, i) => {
    const t = $(cx, ".tab", b);
    if (t && t.offsetWidth > cx.L.reams[i].w * 1.08) over = true;
  });
  cx.reamEls.forEach((b, i) => {
    const t = $(cx, ".tab", b),
      g = cx.L.reams[i];
    if (!t) return;
    if (t.dataset.b0 == null) t.dataset.b0 = String(parseFloat(t.style.bottom));
    t.style.bottom = parseFloat(t.dataset.b0) + (over && i % 2 ? g.th + 3 : 0) + "px";
  });
}
