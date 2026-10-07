// TYPE VIEW: a type's templates at real size, fanned as a carousel (or laid
// flat when there are one to three). The glide runs as a step on the one frame
// loop; a card's art is drawn lazily, a few per tick, as it comes near focus.

import { paperStrip, hideBanner } from "./banner";
import { drawDiorama } from "./diorama";
import { el, ICON } from "./dom";
import { carMetrics, cardPose, fmtDur } from "./layout";
import { setLv } from "./nav";
import { palette } from "./palette";
import { clamp, hash32 } from "./rng";
import { renderStage } from "./stage";
import { $, type Card, type Cx } from "./state";

function placeCards(cx: Cx): void {
  const { CAR } = cx;
  const f = Math.round(CAR.pos);
  CAR.cards.forEach((c, i) => {
    const q = cardPose(CAR, cx.g.portrait, i, CAR.pos);
    c.style.transform = `translate3d(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px,0) rotate(${q.rot.toFixed(2)}deg) scale(${q.s.toFixed(4)})`;
    c.style.opacity = q.o.toFixed(3);
    c.style.zIndex = String(q.z);
    c.style.setProperty("--dim", q.dim.toFixed(3));
    c.style.setProperty("--is", (1 / q.s).toFixed(3));
    const vis = q.o > 0.01;
    if (vis !== c._vis) {
      c._vis = vis;
      c.style.visibility = vis ? "visible" : "hidden";
      c.tabIndex = -1;
    }
    if (vis && Math.abs(i - CAR.pos) <= 4.6) ensureArt(cx, i);
    c.classList.toggle("focus", i === f);
    const dur = c.querySelector<HTMLElement>(".dur");
    if (dur) dur.style.opacity = q.s > 0.6 ? "1" : "0";
  });
  if (f !== CAR.idx) setFocusIdx(cx, f);
}

function carFrame(cx: Cx, now: number): boolean {
  const { CAR } = cx;
  const dt = clamp(now - (CAR.t || now - 16), 1, 120);
  CAR.t = now;
  const d = CAR.target - CAR.pos;
  CAR.pos += Math.abs(d) < 0.003 ? d : d * (cx.RM ? 1 : 1 - Math.pow(1 - 0.15, dt / 16.7));
  placeCards(cx);
  if (Math.abs(CAR.target - CAR.pos) > 0.0008 || CAR.drag) return true;
  CAR.t = 0;
  return false;
}
export function carReq(cx: Cx): void {
  cx.life.want("carousel", (now) => carFrame(cx, now));
}

function setFocusIdx(cx: Cx, i: number): void {
  const { CAR } = cx;
  CAR.idx = i;
  CAR.cards.forEach((c, j) => {
    c.tabIndex = j === i ? 0 : -1;
    c.setAttribute("aria-current", j === i ? "true" : "false");
  });
  updateName(cx);
  const tv = cx.els.typeView;
  const tk = $(cx, ".ticks", tv);
  if (tk) [...tk.children].forEach((b, j) => b.classList.toggle("cur", j === i));
  const pv = $<HTMLButtonElement>(cx, ".navbtn.prev", tv),
    nx = $<HTMLButtonElement>(cx, ".navbtn.next", tv);
  if (pv) pv.disabled = i <= 0;
  if (nx) nx.disabled = i >= CAR.n - 1;
}

function updateName(cx: Cx): void {
  const { CAR } = cx;
  const box = $(cx, ".tv-name", cx.els.typeView);
  if (!box) return;
  const i = CAR.hov != null ? CAR.hov : CAR.idx,
    t = CAR.list[i];
  if (!t) return;
  const b = $(cx, "b", box)!;
  if (b.textContent !== t.label) b.textContent = t.label;
  $(cx, ".nd", box)!.innerHTML = typeof t.seconds === "number" ? `<span class="chipx">${ICON.clock}${fmtDur(t.seconds)}</span>` : "";
}

function artFor(cx: Cx, c: Card, i: number): void {
  const { CAR } = cx;
  const t = CAR.list[i];
  if (c._art) return;
  c._art = true;
  if (t.art) return;
  const cv = c.querySelector<HTMLCanvasElement>(".art canvas");
  if (!cv) return;
  const w = Math.round(CAR.cw * 0.95),
    h = Math.round(CAR.ch * 0.9),
    rs = clamp(cx.g.DPR, 1, 1.5) * (CAR.cw > 600 ? 0.8 : 1);
  cv.width = Math.ceil(w * rs);
  cv.height = Math.ceil(h * rs);
  const x = cv.getContext("2d")!;
  x.scale(rs, rs);
  drawDiorama(x, w, h, t.id, t.type);
  cv.classList.add("ready");
}
function ensureArt(cx: Cx, i: number): void {
  const c = cx.CAR.cards[i];
  if (!c || c._art || c._q) return;
  c._q = true;
  cx.artQ.push(i);
  if (!cx.artRun) {
    cx.artRun = true;
    cx.life.timeout(() => artPump(cx), 0);
  }
}
function artPump(cx: Cx): void {
  const i = cx.artQ.shift();
  if (i == null) {
    cx.artRun = false;
    return;
  }
  const c = cx.CAR.cards[i];
  if (c && cx.ST.type) artFor(cx, c, i);
  cx.life.timeout(() => artPump(cx), 6);
}

export function buildTypeView(cx: Cx, id: string): void {
  const { CAR, g, life } = cx;
  const { H, S, portrait } = g;
  const t = cx.typeById.get(id)!,
    list = cx.tplByType.get(id) || [],
    v = cx.els.typeView;
  v.innerHTML = "";
  v.setAttribute("aria-label", t.label);
  CAR.list = list;
  CAR.cards = [];
  CAR.hov = null;
  CAR.idx = -1;
  cx.artQ.length = 0;
  Object.assign(CAR, carMetrics(g, list.length));
  v.style.setProperty("--cw", CAR.cw + "px");
  v.style.setProperty("--ch", CAR.ch + "px");
  const head = el("div", "tv-head", v);
  paperStrip(cx, head, t.label, "tv", palette(id), hash32(id));
  const chips = el("div", "tv-chips", head);
  if (list.length) {
    chips.insertAdjacentHTML("beforeend", `<span class="chipx" aria-label="${list.length} templates">${ICON.stack}${list.length}</span>`);
    const sc = list.map((x) => x.seconds).filter((x): x is number => typeof x === "number");
    if (sc.length) {
      const a = Math.min(...sc),
        b = Math.max(...sc);
      chips.insertAdjacentHTML("beforeend", `<span class="chipx">${ICON.clock}${a === b ? fmtDur(a) : fmtDur(a) + " – " + fmtDur(b)}</span>`);
    }
  }
  if (t.art && !portrait) {
    const pr = el("div", "tv-print", head),
      im = new Image();
    im.src = t.art;
    im.alt = "Key art: " + t.label;
    pr.appendChild(im);
  }
  const wrap = el("div", "cards", v);
  const slot = el("div", "cardslot", wrap);
  wrap.style.setProperty("--cy", CAR.cy + "px");
  list.forEach((x, i) => {
    const c = el("button", "card" + (x.art ? " real" : ""), wrap) as Card;
    c.type = "button";
    c.dataset.i = String(i);
    c.style.top = CAR.cy + "px";
    c.setAttribute("aria-label", x.label + (typeof x.seconds === "number" ? ", " + fmtDur(x.seconds) : "") + (x.art ? ", key art" : ", stylised illustration"));
    const face = el("span", "face", c),
      art = el("span", "art", face);
    if (x.art) {
      const im = new Image();
      im.src = x.art;
      im.alt = "";
      im.draggable = false;
      art.appendChild(im);
    } else el("canvas", "", art);
    el("span", "dim", c);
    if (typeof x.seconds === "number") c.insertAdjacentHTML("beforeend", `<span class="dur">${ICON.clock}${fmtDur(x.seconds)}</span>`);
    CAR.cards.push(c);
  });
  const nm = el("div", "tv-name", v);
  nm.style.top = Math.round(CAR.cy + CAR.ch / 2 + (portrait ? H * 0.04 : H * 0.052)) + "px";
  el("b", "", nm);
  el("div", "nd", nm);
  if (list.length > 3) {
    const tk = el("div", "ticks", v);
    tk.style.top = Math.round(Math.min(H - (portrait ? 34 : 50), CAR.cy + CAR.ch / 2 + (portrait ? H * 0.04 : H * 0.052) + S * 0.12)) + "px";
    list.forEach((x, i) => {
      const b = el("button", "", tk);
      b.type = "button";
      b.tabIndex = -1;
      b.setAttribute("aria-label", x.label);
      b.onclick = () => {
        CAR.target = i;
        carReq(cx);
      };
    });
    const mk = (cls: "prev" | "next", ic: string, dx: number) => {
      const b = el("button", "navbtn " + cls, v);
      b.type = "button";
      b.tabIndex = -1;
      b.innerHTML = ic;
      b.setAttribute("aria-label", cls === "prev" ? "Previous" : "Next");
      b.style.top = CAR.cy - Math.max(24, S * 0.03) + "px";
      if (portrait) {
        b.style.top = parseFloat(tk.style.top) - 14 + "px";
        b.style[cls === "prev" ? "left" : "right"] = "var(--pad)";
      } else b.style[cls === "prev" ? "left" : "right"] = cls === "prev" ? "var(--pad)" : "calc(var(--pad)*2.4)";
      b.onclick = () => {
        CAR.target = clamp(Math.round(CAR.target) + dx, 0, CAR.n - 1);
        carReq(cx);
      };
    };
    mk("prev", ICON.prev, -1);
    mk("next", ICON.next, 1);
  }
  CAR.pos = CAR.target = 0;
  placeCards(cx);
  /* interactions */
  wrap.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    CAR.moved = false;
    CAR.drag = { x: e.clientX, p: CAR.target, id: e.pointerId };
    slot.classList.add("grab");
    const offs: (() => void)[] = [];
    const mv = (ev: PointerEvent) => {
      if (!CAR.drag) return;
      const dx = ev.clientX - CAR.drag.x;
      if (Math.abs(dx) > 6) CAR.moved = true;
      if (CAR.moved && !CAR.flat) {
        CAR.target = clamp(CAR.drag.p - dx / (CAR.cw * 0.42), 0, CAR.n - 1);
        CAR.pos = CAR.target;
        placeCards(cx);
      }
    };
    const up = () => {
      offs.forEach((f) => f());
      slot.classList.remove("grab");
      if (CAR.moved) {
        CAR.target = clamp(Math.round(CAR.target), 0, CAR.n - 1);
        carReq(cx);
        life.timeout(() => {
          CAR.moved = false;
        }, 0);
      }
      CAR.drag = null;
    };
    offs.push(life.on(window, "pointermove", mv), life.on(window, "pointerup", up), life.on(window, "pointercancel", up));
  });
  CAR.cards.forEach((c, i) => {
    c.onclick = (e) => {
      if (CAR.moved) {
        e.preventDefault();
        return;
      }
      if (CAR.flat || i === Math.round(CAR.target)) openTpl(cx, i);
      else {
        CAR.target = i;
        carReq(cx);
        c.focus({ preventScroll: true });
      }
    };
    c.onpointerenter = () => {
      if (CAR.drag) return;
      CAR.hov = i;
      updateName(cx);
    };
    c.onpointerleave = () => {
      CAR.hov = null;
      updateName(cx);
    };
  });
}

/** the wheel scrubs the carousel; bound once to the type view, which outlives rebuilds */
export function wireCarousel(cx: Cx): void {
  const { CAR } = cx;
  cx.life.on(
    cx.els.typeView,
    "wheel",
    (e) => {
      if (CAR.flat || cx.ST.lv !== "type") return;
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      CAR.target = clamp(CAR.target + d / 230, 0, CAR.n - 1);
      carReq(cx);
      cx.life.clear(CAR.snap);
      CAR.snap = cx.life.timeout(() => {
        CAR.target = Math.round(CAR.target);
        carReq(cx);
      }, 140);
    },
    { passive: false },
  );
}

/** keyboard: step the carousel to card `i` and focus it */
export function stepCarousel(cx: Cx, i: number): void {
  const { CAR } = cx;
  CAR.target = clamp(i, 0, CAR.n - 1);
  carReq(cx);
  const c = CAR.cards[CAR.target];
  if (c) {
    c.style.visibility = "visible";
    c.focus({ preventScroll: true });
  }
}

export function focusCard(cx: Cx): void {
  const c = cx.CAR.cards[cx.CAR.idx >= 0 ? cx.CAR.idx : 0];
  if (c) c.focus({ preventScroll: true });
}

/** template i, at full size (flips out of its card) */
export function openTpl(cx: Cx, i: number): void {
  const { ST, CAR } = cx;
  const list = (ST.type && cx.tplByType.get(ST.type)) || [];
  if (!list[i]) return;
  ST.tpl = list[i].id;
  cx.SV.list = list;
  const card = CAR.cards[i],
    face = card ? $(cx, ".face", card) : null,
    r = face ? face.getBoundingClientRect() : null;
  ST.opener = card || ST.opener;
  renderStage(cx, "tpl", i, r);
  setLv(cx, "tpl");
  hideBanner(cx);
}

export function closeTpl(cx: Cx): void {
  cx.root.classList.add("quick");
  cx.life.timeout(() => cx.root.classList.remove("quick"), 900);
  cx.ST.tpl = null;
  setLv(cx, "type");
  cx.life.timeout(() => focusCard(cx), 500);
}

/** the stage moved to template i: keep the carousel under it in step */
export function syncCarousel(cx: Cx, i: number): void {
  cx.CAR.target = cx.CAR.pos = i;
  placeCards(cx);
}
