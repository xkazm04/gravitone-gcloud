// SEARCH: "/" opens a paper slip; types, families, templates and categories
// rank by exact, prefix, word-prefix, then substring, and a pick flies there.

import { hideBanner } from "./banner";
import { el } from "./dom";
import { navTo } from "./nav";
import { palette } from "./palette";
import type { Cx, SearchEntry } from "./state";

function buildIndex(cx: Cx): SearchEntry[] {
  const a: Omit<SearchEntry, "l">[] = [];
  cx.types.forEach((t) => a.push({ k: "type", id: t.id, label: t.label, sub: "", col: palette(t.id).k.acc }));
  cx.library.forEach((f) => a.push({ k: "fam", id: f.id, label: f.label, sub: "", col: palette(f.id).k.acc }));
  cx.templates.forEach((x) =>
    a.push({ k: "tpl", id: x.id, type: x.type, label: x.label, sub: cx.typeById.get(x.type)?.label || "", col: palette(x.type).k.acc }),
  );
  cx.library.forEach((f) =>
    f.categories.forEach((c) => a.push({ k: "cat", fam: f.id, id: c.id, label: c.label, sub: f.label, col: palette(f.id).k.acc })),
  );
  return a.map((e) => ({ ...e, l: e.label.toLowerCase() }));
}

export function runSearch(cx: Cx, q: string): SearchEntry[] {
  q = q.trim().toLowerCase();
  if (!q || !cx.SIDX) return [];
  const ord = { type: 0, fam: 1, tpl: 2, cat: 3 },
    out: [number, number, string, SearchEntry][] = [];
  cx.SIDX.forEach((e) => {
    let s = -1;
    if (e.l === q) s = 0;
    else if (e.l.startsWith(q)) s = 1;
    else if (e.l.split(/[\s\-·]+/).some((w) => w.startsWith(q))) s = 2;
    else if (e.l.includes(q)) s = 3;
    if (s >= 0) out.push([s, ord[e.k], e.l, e]);
  });
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
  return out.slice(0, 8).map((x) => x[3]);
}

/** the combobox's side of the highlight: the input names the option Enter will pick, and the
 *  options carry aria-selected, because focus never leaves the input (.sel is only the look) */
function syncActive(cx: Cx): void {
  const { q, res } = cx.els;
  const opts = [...res.querySelectorAll("button")];
  opts.forEach((o, j) => o.setAttribute("aria-selected", String(j === cx.sel)));
  q.setAttribute("aria-expanded", String(opts.length > 0));
  if (opts.length > 0 && opts[cx.sel]) q.setAttribute("aria-activedescendant", opts[cx.sel].getAttribute("id") ?? "");
  else q.removeAttribute("aria-activedescendant");
}

export function renderRes(cx: Cx): void {
  const ul = cx.els.res;
  ul.innerHTML = "";
  cx.sres.forEach((e, i) => {
    const li = el("li", "", ul),
      b = el("button", i === cx.sel ? "sel" : "", li);
    li.setAttribute("role", "presentation");
    b.setAttribute("role", "option");
    b.setAttribute("id", "res-" + i);
    b.type = "button";
    const dot = el("i", "", b);
    dot.style.background = e.col;
    el("span", "", b).textContent = e.label;
    el("small", "", b).textContent = e.sub;
    b.onclick = () => pickRes(cx, e);
    b.onpointermove = () => {
      if (cx.sel !== i) {
        cx.sel = i;
        [...ul.querySelectorAll("button")].forEach((x, j) => x.classList.toggle("sel", j === i));
        syncActive(cx);
      }
    };
  });
  syncActive(cx);
}

export function openSearch(cx: Cx): void {
  if (cx.searchOpen) return;
  if (!cx.SIDX) cx.SIDX = buildIndex(cx);
  const from = document.activeElement as HTMLElement | null;
  cx.searchFrom = from && from !== cx.els.q && cx.root.contains(from) ? from : null;
  cx.searchOpen = true;
  cx.els.search.classList.add("on");
  const q = cx.els.q;
  q.value = "";
  cx.sres = [];
  renderRes(cx);
  q.focus();
  hideBanner(cx);
}

/** closes the slip. #search is display:none then and its input takes the focus with it to <body>,
 *  so it goes back to what the slip was opened from (else the search button); a pick passes
 *  `refocus` false, because the level it flies to places the focus itself */
export function closeSearch(cx: Cx, refocus = true): void {
  if (!cx.searchOpen) return;
  cx.searchOpen = false;
  cx.els.search.classList.remove("on");
  cx.els.q.setAttribute("aria-expanded", "false");
  cx.els.q.removeAttribute("aria-activedescendant");
  const to = cx.searchFrom?.isConnected ? cx.searchFrom : cx.els.searchBtn;
  cx.searchFrom = null;
  if (refocus) to.focus({ preventScroll: true });
}

export function pickRes(cx: Cx, e: SearchEntry): void {
  closeSearch(cx, false);
  if (e.k === "type") void navTo(cx, { lv: "type", type: e.id }, { fast: true });
  else if (e.k === "tpl") void navTo(cx, { lv: "tpl", type: e.type, tpl: e.id }, { fast: true });
  else if (e.k === "fam") void navTo(cx, { lv: "fam", fam: e.id }, { fast: true });
  else void navTo(cx, { lv: "cat", fam: e.fam, cat: e.id }, { fast: true });
}

export function wireSearch(cx: Cx): void {
  const { life, els } = cx;
  life.on(els.searchBtn, "click", () => (cx.searchOpen ? closeSearch(cx) : openSearch(cx)));
  life.on(els.q, "input", () => {
    cx.sres = runSearch(cx, els.q.value);
    cx.sel = 0;
    renderRes(cx);
  });
  life.on(els.search, "pointerdown", (e) => {
    if (e.target === els.search) closeSearch(cx);
  });
}
