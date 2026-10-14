/* library.js — the Library route.
   Vocabulary rail (kinds · facets from the real vocabularies · state · collections · origin)
   → virtualised grid/list over up to 5,000 items → detail panel with lineage and acts.
   Hash state: #kind= &q= &f=key:value,… &sel= &view=list &d=s|l &sort=name|kind &scaled=0 &detail=0 */
(function () {
  "use strict";
  const { $, esc, I } = GT;
  const L = window.GT_LIB, M = window.GT_MODEL;
  const ALL = L.items;
  const KIND = Object.fromEntries(L.KINDS.map((k) => [k.id, k]));
  const KORDER = Object.fromEntries(L.KINDS.map((k, i) => [k.id, i]));
  const SHARED_KEYS = new Set([...L.SHARED.state, ...L.SHARED.collections, ...L.SHARED.origin, ...L.SHARED.attention]);
  const fmtN = (n) => Number(n).toLocaleString("en-US");
  const day = (it) => (it.t ? new Date(it.t).toISOString().slice(0, 10) : "—");
  const kindShort = (k) => (KIND[k] && KIND[k].short) || k;
  const icon = (k) => I[(KIND[k] || {}).icon] || I.doc;
  const narrow = () => window.innerWidth < 1360;
  const railNarrow = () => window.innerWidth < 1280;

  /* ── state ── */
  const S = { kind: "all", q: "", f: {}, scaled: true, view: "grid", dens: "m", sort: "new", sel: null, det: true, nav: false, closed: new Set(), more: new Set() };
  let list = [], posOf = new Map(), base = [], counts = {}, kcount = {};
  const pinned = new Set();

  /* ── session acts already in the ledger (pins, project uses) ── */
  GT.store.events().filter((e) => e.type === "library.pin" && e.subject).forEach((e) => {
    const it = L.byId.get(e.subject.id);
    if (!it) return;
    if (e.project) { if (!it.f.project.includes(e.project)) it.f.project = it.f.project.concat(e.project); }
    else { pinned.add(it.id); it.f.pin = ["pinned"]; }
  });

  /* ── search: free words + key:value tokens ── */
  const ALIAS = { palette: "palette_strategy", render: "render_mode", blacks: "black_handling", edges: "edge_treatment", density: "detail_density", surface: "surface_realism",
    origin: "src", collection: "project", tag: "mood", tech: "techniques", instr: "instrument" };
  const KEYS = new Set(["kind", "id", ...Object.values(L.GROUPS).flat(), ...SHARED_KEYS, ...Object.keys(ALIAS)]);
  const norm = (s) => String(s).toLowerCase().replace(/[-_]/g, " ");
  ALL.forEach((it) => {
    it.nf = {};
    Object.entries(it.f).forEach(([k, vals]) => { it.nf[k] = vals.map((v) => norm(v) + "|" + norm(L.label(k, v))).join("|"); });
    it.nf.kind = it.kind + "|" + norm(kindShort(it.kind));
    it.nf.id = it.id.toLowerCase();
    it.lt = it.title.toLowerCase();
  });
  function parseQ(q) {
    const out = { free: [], kv: [] };
    (q.toLowerCase().match(/[a-z_]+:"[^"]*"|\S+/g) || []).forEach((t) => {
      const m = /^([a-z_]+):(.+)$/.exec(t);
      if (m && KEYS.has(m[1])) out.kv.push([ALIAS[m[1]] || m[1], m[1] === "id" ? m[2].replace(/"/g, "") : norm(m[2].replace(/"/g, ""))]);
      else out.free.push(norm(t));
    });
    return out;
  }
  function matchQ(it, P) {
    for (const w of P.free) if (!it.hay.includes(w)) return false;
    for (const [k, v] of P.kv) { const s = k === "id" ? it.nf.id : k === "kind" ? it.nf.kind : it.nf[k]; if (!s || !s.includes(v)) return false; }
    return true;
  }

  /* ── ordering (cached per sort mode) ── */
  const orderCache = {};
  function ordered(mode) {
    if (orderCache[mode]) return orderCache[mode];
    const a = ALL.slice();
    const bad = (x, y) => (x.bad ? 1 : 0) - (y.bad ? 1 : 0);
    if (mode === "name") a.sort((x, y) => bad(x, y) || (x.lt < y.lt ? -1 : x.lt > y.lt ? 1 : x.n - y.n));
    else if (mode === "kind") a.sort((x, y) => bad(x, y) || KORDER[x.kind] - KORDER[y.kind] || y.t - x.t || x.n - y.n);
    else a.sort((x, y) => bad(x, y) || y.t - x.t || x.n - y.n);
    return (orderCache[mode] = a);
  }

  const groupsFor = (kind) => [...L.GROUPS[kind], ...L.SHARED.state, ...L.SHARED.collections, ...L.SHARED.origin, ...L.SHARED.attention];

  /* ── compute: results + live facet counts given the other active filters ── */
  function compute() {
    const P = parseQ(S.q);
    const active = Object.keys(S.f).filter((k) => S.f[k].size);
    const vis = groupsFor(S.kind);
    counts = {}; vis.forEach((g) => (counts[g] = new Map()));
    kcount = {}; L.KINDS.forEach((k) => (kcount[k.id] = 0));
    list = []; base = [];
    for (const it of ordered(S.sort)) {
      if (!S.scaled && it.src === "illustrative") continue;
      base.push(it);
      if (!matchQ(it, P)) continue;
      let fails = 0, failKey = null, sharedFail = 0;
      for (const k of active) {
        const set = S.f[k], vals = it.f[k];
        let ok = false;
        if (vals) for (const v of vals) if (set.has(v)) { ok = true; break; }
        if (!ok) { fails++; failKey = k; if (SHARED_KEYS.has(k)) sharedFail++; }
      }
      if (sharedFail === 0) { kcount.all++; kcount[it.kind]++; }
      if (S.kind !== "all" && it.kind !== S.kind) continue;
      if (fails === 0) list.push(it);
      if (fails <= 1) {
        for (const g of vis) {
          if (fails === 1 && failKey !== g) continue;
          const vals = it.f[g];
          if (vals) for (const v of vals) counts[g].set(v, (counts[g].get(v) || 0) + 1);
        }
      }
    }
    if (S.kind !== "all") kcount[S.kind] = list.length;
    posOf = new Map(list.map((it, i) => [it.id, i]));
  }

  /* ── hash ── */
  let writing = false;
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    S.kind = KIND[h.get("kind")] ? h.get("kind") : "all";
    S.q = h.get("q") || "";
    S.f = {};
    (h.get("f") || "").split(",").filter(Boolean).forEach((t) => { const i = t.indexOf(":"); if (i > 0) (S.f[t.slice(0, i)] = S.f[t.slice(0, i)] || new Set()).add(t.slice(i + 1)); });
    S.scaled = h.get("scaled") !== "0";
    S.view = h.get("view") === "list" ? "list" : "grid";
    S.dens = ["s", "m", "l"].includes(h.get("d")) ? h.get("d") : "m";
    S.sort = ["new", "name", "kind"].includes(h.get("sort")) ? h.get("sort") : "new";
    const sel = h.get("sel");
    S.sel = sel && L.byId.has(sel) ? sel : null;
    if (S.sel && L.byId.get(S.sel).src === "illustrative") S.scaled = true;
    S.det = h.has("detail") ? h.get("detail") !== "0" : narrow() ? !!S.sel : true;
  }
  function writeHash() {
    const p = [];
    if (S.kind !== "all") p.push("kind=" + S.kind);
    if (S.q) p.push("q=" + encodeURIComponent(S.q).replace(/%3A/gi, ":"));
    const f = Object.entries(S.f).flatMap(([k, set]) => [...set].map((v) => encodeURIComponent(k + ":" + v).replace(/%3A/gi, ":")));
    if (f.length) p.push("f=" + f.join(","));
    if (!S.scaled) p.push("scaled=0");
    if (S.view === "list") p.push("view=list");
    if (S.dens !== "m") p.push("d=" + S.dens);
    if (S.sort !== "new") p.push("sort=" + S.sort);
    if (S.sel) p.push("sel=" + encodeURIComponent(S.sel));
    if (!S.det && !narrow()) p.push("detail=0");
    const h = p.length ? "#" + p.join("&") : "";
    if (h === location.hash || (!h && !location.hash)) return;
    try { history.replaceState(null, "", h || location.pathname + location.search); }
    catch (_) { writing = true; location.hash = h; }
  }

  /* ───────────────────────── left rail ───────────────────────── */
  const STATE_ORDER = Object.fromEntries(L.STATES.map((s, i) => [s, i]));
  const SRC_ORDER = { real: 0, fixture: 1, illustrative: 2 };
  function groupHTML(g) {
    const m = counts[g];
    if (!m) return "";
    const sel = S.f[g] || new Set();
    let vals = [...m.entries()];
    sel.forEach((v) => { if (!m.has(v)) vals.push([v, 0]); });
    if (!vals.length) return "";
    if (g === "state") vals.sort((a, b) => STATE_ORDER[a[0]] - STATE_ORDER[b[0]]);
    else if (g === "src") vals.sort((a, b) => SRC_ORDER[a[0]] - SRC_ORDER[b[0]]);
    else if (g === "techniques") vals.sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));
    else vals.sort((a, b) => b[1] - a[1] || String(L.label(g, a[0])).localeCompare(L.label(g, b[0])));
    const closed = S.closed.has(g);
    const LIM = 7;
    const open = S.more.has(g) || vals.length <= LIM + 2;
    const shown = open ? vals : vals.filter((v, i) => i < LIM || sel.has(v[0]));
    const row = ([v, c]) => {
      const on = sel.has(v);
      const lead = g === "state" ? `<span class="sd ${esc(v)}" aria-hidden="true"></span>` : `<span class="ck" aria-hidden="true"></span>`;
      return `<button class="frow ${c ? "" : "zero"} ${g === "src" && v === "illustrative" ? "src-ill" : ""}" data-g="${esc(g)}" data-v="${esc(v)}" aria-pressed="${on}">${lead}<span class="fl">${esc(L.label(g, v))}</span><span class="fc">${fmtN(c)}</span></button>`;
    };
    return `<div class="fg" data-component="FacetGroup">
      <button class="fgh" data-tg="${esc(g)}" aria-expanded="${!closed}">${I.down}<span>${esc(L.groupLabel(g))}</span>${sel.size ? `<span class="on">${sel.size}</span>` : ""}<span class="nv">${vals.length}</span></button>
      ${closed ? "" : `<div class="frows">${shown.map(row).join("")}${vals.length > shown.length ? `<button class="more" data-more="${esc(g)}">+${vals.length - shown.length} more</button>` : open && vals.length > LIM + 2 ? `<button class="more" data-more="${esc(g)}">fewer</button>` : ""}</div>`}
    </div>`;
  }
  function renderNav() {
    const ae = document.activeElement;
    const keep = ae && ae.closest && ae.closest("#lnav") ? Object.assign({}, ae.dataset) : null;
    const reals = ALL.filter((i) => i.src === "real").length, fx = ALL.filter((i) => i.src === "fixture").length;
    $("#nav-total").textContent = fmtN(base.length);
    const nt = $("#nav-tog");
    if (nt) nt.innerHTML = `${I.list} vocabulary${activeTokens().length ? ` <span class="n">${activeTokens().length}</span>` : ""}`;
    $("#scale").innerHTML = `<div class="seg" role="group" aria-label="Corpus">
        <button data-scale="0" aria-pressed="${!S.scaled}"><span class="rd" aria-hidden="true"></span><span class="lb">real</span><b>${fmtN(L.REAL)}</b></button>
        <button data-scale="1" aria-pressed="${S.scaled}"><span class="rd" aria-hidden="true"></span><span class="lb">real + scaled</span><b>${fmtN(L.TOTAL)}</b></button></div>
      <div class="row"><span class="src real">${fmtN(reals)} real</span><span class="src">${fmtN(fx)} fixture</span><span class="src illustrative" style="${S.scaled ? "" : "opacity:.45"}">${fmtN(L.TOTAL - L.REAL)} illustrative</span>${GT.Hint("Each derived from one real item; never output")}</div>`;
    const kinds = L.KINDS.map((k) => `<button class="kind ${kcount[k.id] ? "" : "zero"}" data-kind="${k.id}" aria-current="${S.kind === k.id}">${I[k.icon]}<span class="lb">${esc(k.label)}</span><span class="c">${fmtN(kcount[k.id])}</span></button>`).join("");
    const kg = L.GROUPS[S.kind].map(groupHTML).join("");
    const coll = L.SHARED.collections.map(groupHTML).join("");
    $("#nav-body").innerHTML = `
      <section class="nsec" aria-label="Kind"><div class="side-h">kind</div><div class="kinds">${kinds}</div></section>
      ${kg ? `<section class="nsec" aria-label="Vocabulary"><div class="side-h">${I[KIND[S.kind].icon].replace("<svg", '<svg width="12" height="12"')} vocabulary · ${esc(kindShort(S.kind))}</div>${kg}</section>` : ""}
      ${counts.attention && counts.attention.size ? `<section class="nsec" aria-label="Attention">${groupHTML("attention")}</section>` : ""}
      <section class="nsec" aria-label="State">${groupHTML("state")}</section>
      ${coll ? `<section class="nsec" aria-label="Collections"><div class="side-h">collections</div>${coll}</section>` : ""}
      <section class="nsec" aria-label="Origin">${groupHTML("src")}</section>`;
    if (keep) {
      const sel = keep.g ? `[data-g="${CSS.escape(keep.g)}"][data-v="${CSS.escape(keep.v)}"]` : keep.kind ? `[data-kind="${keep.kind}"]` : keep.tg ? `[data-tg="${keep.tg}"]` : keep.more ? `[data-more="${keep.more}"],[data-tg="${keep.more}"]` : keep.scale ? `[data-scale="${keep.scale}"]` : null;
      const el = sel && document.querySelector("#lnav " + sel);
      if (el) el.focus({ preventScroll: true });
    }
  }

  /* ───────────────────────── center head ───────────────────────── */
  function activeTokens() { return Object.entries(S.f).flatMap(([g, set]) => [...set].map((v) => [g, v])); }
  function renderHead() {
    const toks = activeTokens();
    const k = KIND[S.kind];
    $("#crumbs").innerHTML = `<button data-crumb="root">Library</button><span class="sep">›</span>` +
      (toks.length ? `<button data-crumb="kind">${esc(k.label)}</button><span class="sep">›</span><span class="fct">${esc(L.groupLabel(toks[0][0]))}: ${esc(L.label(toks[0][0], toks[0][1]))}${toks.length > 1 ? " +" + (toks.length - 1) : ""}</span>`
        : `<span class="here">${esc(k.label)}</span>`) + (S.q ? `<span class="sep">›</span><span class="fct">“${esc(S.q)}”</span>` : "");
    $("#count").innerHTML = GT.Tally(fmtN(list.length), "items");
    const fc = $("#fchips");
    fc.classList.toggle("on", toks.length > 0);
    fc.innerHTML = toks.map(([g, v]) => `<button class="chip cyan" data-rm="${esc(g)}" data-v="${esc(v)}" aria-label="remove ${esc(L.groupLabel(g))} ${esc(L.label(g, v))}"><span class="k">${esc(L.groupLabel(g))}:</span> ${esc(L.label(g, v))}<span class="x" aria-hidden="true">×</span></button>`).join("") +
      (toks.length ? `<button class="clear" data-clear>clear all</button>` : "");
    $("#view").innerHTML = `<button data-view="grid" aria-pressed="${S.view === "grid"}" aria-label="grid view">${I.grid} grid</button><button data-view="list" aria-pressed="${S.view === "list"}" aria-label="list view">${I.list} list</button>`;
    $("#dens").innerHTML = ["s", "m", "l"].map((d) => `<button data-dens="${d}" aria-pressed="${S.dens === d}" aria-label="size ${d}">${d.toUpperCase()}</button>`).join("");
    $("#sort").value = S.sort;
    $("#det-tog").setAttribute("aria-pressed", String(!!S.det));
  }

  /* ───────────────────────── virtualised results ───────────────────────── */
  const vp = $("#vp"), layer = $("#layer"), spacer = $("#spacer");
  const live = new Map();
  const PROBLEM = { unreadable: "mp4 unreadable", missing: "media missing" };
  const badChip = (it, cls) => (it.bad ? `<span class="chip rose ${cls || ""}">${PROBLEM[it.bad]}</span>` : "");
  let badT = 0;
  function markBad(it, why) {
    if (!it || !L.flag(it, why)) return;
    Object.keys(orderCache).forEach((k) => delete orderCache[k]);
    clearTimeout(badT);
    badT = setTimeout(() => refresh({ rebuild: true, detail: true }), 120);
  }
  const mediaErr = (root) => root.addEventListener("error", (e) => {
    const v = e.target;
    if (!v || (v.tagName !== "VIDEO" && v.tagName !== "IMG")) return;
    const host = v.closest("[data-id]");
    const it = L.byId.get(host ? host.dataset.id : det.dataset.for);
    markBad(it, v.tagName === "VIDEO" ? "unreadable" : "missing");
  }, true);
  // every real file that claims to be video is opened once, so a broken one is known before the first tile is drawn
  function probe() {
    const jobs = ALL.filter((i) => i.video && i.src !== "illustrative").map((i) => new Promise((res) => {
      const v = document.createElement("video");
      v.preload = "metadata"; v.muted = true;
      v.addEventListener("loadedmetadata", res, { once: true });
      v.addEventListener("error", () => { L.flag(i, "unreadable"); res(); }, { once: true });
      v.src = i.video;
    }));
    return Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 900))]);
  }
  let geo = null;
  const PAL = { "warm-cool-split": ["#6a4220", "#1d3d63"], duotone: ["#57285f", "#164a57"], "saturated-vivid": ["#7a1f55", "#1f6476"], monochrome: ["#454a55", "#23272f"],
    "desaturated-naturalistic": ["#45493d", "#2c3540"], "complementary-split": ["#6a2d1f", "#1f5a43"] };
  const hashOf = (t) => [...String(t)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  // the item's own data drawn as a face: project title, kind, channels, captions — palette from the project's style
  function vface(it) {
    const ex = it.exp, pj = ex ? L.projById[ex.projectId] : null;
    const st = it.pstyle ? M.styleById[it.pstyle] : null;
    const pal = Object.values(PAL);
    const c = PAL[((st && st.observables) || it.obs || {}).palette_strategy] || pal[hashOf(it.id) % pal.length];
    const lead = ex ? (ex.kind === "ad" ? "ad spot" : "music video") : [kindShort(it.kind), it.sub && it.sub !== it.kind ? it.sub.replace(/^strip\./, "") : ""].filter(Boolean).join(" · ");
    const tail = ex ? [...(it.chan || []), ex.captions ? "captions " + it.f.captions[0] : null].filter(Boolean).join(" · ") : it.meta || "";
    return `<div class="vf" style="--a:${c[0]};--b:${c[1]}"><span class="vk">${esc(lead)}</span><span class="vn">${esc(pj ? pj.title : it.title)}</span><span class="vm">${esc(tail)}</span></div>`;
  }
  const waveSVG = (peaks, w, h, played) => GT.Wave(peaks, w, h, "#67e8f9", played).replace("<svg ", '<svg preserveAspectRatio="none" ');
  const isPlayingId = (id) => playing === id && !aud.paused;
  const playBtn = (it) => (it.audio ? `<button class="play ${isPlayingId(it.id) ? "on" : ""}" data-play="${esc(it.id)}" aria-label="${isPlayingId(it.id) ? "pause" : "play"} ${esc(it.title)}">${isPlayingId(it.id) ? I.pause : I.play}</button>` : "");
  function face(it, small) {
    const ill = it.src === "illustrative";
    if (it.kind === "audio") return `<div class="wv">${small ? "" : playBtn(it)}${waveSVG(it.peaks, 160, 48)}</div>`;
    if (it.kind === "doc") return `<div class="paper ${ill ? "ill" : ""}"><span class="pt">${esc(it.title)}</span><small>${esc(it.f.bundle[0])}</small></div>`;
    if (it.kind === "style" && !it.url) {
      const obs = it.obs || (it.style && it.style.observables) || {};
      const c = PAL[obs.palette_strategy] || ["#24304a", "#3a2537"];
      return `<div class="swatch" style="--a:${c[0]};--b:${c[1]}"><span class="sn">${esc(it.title)}</span><span class="so">${esc([obs.render_mode, obs.palette_strategy].filter(Boolean).join(" · "))}</span></div>`;
    }
    if (!it.url && (it.video || it.bad)) return vface(it) + (it.video && !it.bad && !ill ? `<video src="${esc(it.video)}#t=0.6" muted preload="metadata" playsinline aria-hidden="true"></video>` : "");
    if (it.url) return `<img src="${esc(it.url)}" alt="" loading="lazy" decoding="async" draggable="false">`;
    return "";
  }
  const CHIPKEYS = { image: ["scene", "set"], plate: ["family", "render_mode", "station"], style: ["family", "render_mode", "palette_strategy"], motion: ["subject", "format"],
    audio: ["genre", "mood", "type"], video: ["format", "captions"], doc: ["bundle", "techniques"] };
  function make(it) {
    const el = document.createElement("div");
    const ill = it.src === "illustrative";
    el.id = "it-" + it.n;
    el.dataset.id = it.id;
    el.setAttribute("role", "option");
    el.setAttribute("aria-selected", String(it.id === S.sel));
    el.setAttribute("aria-label", `${it.title}, ${kindShort(it.kind)}, ${it.state}${ill ? ", illustrative" : ""}${it.bad ? ", " + PROBLEM[it.bad] : ""}`);
    if (geo.mode === "grid") {
      el.className = "tile k-" + it.kind + (ill ? " ill" : "");
      el.innerHTML = `<div class="th">${face(it)}<span class="kg" aria-hidden="true">${icon(it.kind)}</span>${it.state === "reference" && it.kind === "image" ? `<span class="refmark">ref</span>` : ""}${it.kind === "style" && it.state === "ratified" ? `<span class="lk" aria-hidden="true">${I.lock}</span>` : ""}<span class="sd ${it.state}" aria-hidden="true"></span>${badChip(it, "vst")}</div>
        <div class="cap"><span class="tt ell">${esc(it.title)}</span><span class="mt ell">${esc(it.meta || "")}</span></div>`;
    } else {
      el.className = "lrow k-" + it.kind + (ill ? " ill" : "");
      const fx = (CHIPKEYS[it.kind] || []).flatMap((k) => (it.f[k] || []).slice(0, 1).map((v) => `<span class="chip lc">${esc(L.label(k, v))}</span>`)).slice(0, 3).join("");
      el.innerHTML = `<div class="lt">${face(it, true)}</div><div class="nm">${playBtn(it)}<span class="tt ell">${esc(it.title)}</span>${badChip(it, "lst")}</div>
        <div class="kd">${icon(it.kind)}<span class="ell">${esc(kindShort(it.kind))}</span></div><div class="fx">${fx}</div><div>${GT.State(it.state)}</div><span class="dt">${day(it)}</span>${GT.Src(it.src)}`;
    }
    return el;
  }
  function layout() {
    const W = vp.clientWidth, H = vp.clientHeight;
    if (S.view === "grid") {
      const pad = 14, gap = S.dens === "s" ? 8 : 12, minW = { s: 150, m: 206, l: 300 }[S.dens];
      const inner = Math.max(120, W - pad * 2);
      const cols = Math.max(1, Math.floor((inner + gap) / (minW + gap)));
      const tw = (inner - gap * (cols - 1)) / cols;
      const thH = Math.round((tw * 10) / 16), capH = S.dens === "s" ? 32 : 48;
      geo = { mode: "grid", pad, gap, cols, tw, thH, th: thH + capH, rowH: thH + capH + gap, rows: Math.ceil(list.length / cols), H };
      spacer.style.height = (list.length ? pad * 2 + geo.rows * geo.rowH - gap : 0) + "px";
      layer.style.setProperty("--thh", thH + "px");
    } else {
      const rh = { s: 34, m: 40, l: 56 }[S.dens];
      geo = { mode: "list", pad: 0, cols: 1, rowH: rh, th: rh, rows: list.length, H };
      spacer.style.height = list.length * rh + "px";
    }
    geo.key = S.view + S.dens + W + "x" + list.length;
    vp.className = "vp v-" + S.view + " dens-" + S.dens;
    det.style.top = narrow() ? vp.getBoundingClientRect().top - $("#lib").getBoundingClientRect().top + "px" : "";
    vp.style.setProperty("--lt", { s: 48, m: 56, l: 84 }[S.dens] + "px");
    $(".lcenter").style.setProperty("--lt", { s: 48, m: 56, l: 84 }[S.dens] + "px");
  }
  function place(el, i) {
    if (geo.mode === "grid") {
      const r = Math.floor(i / geo.cols), c = i % geo.cols;
      el.style.transform = `translate(${(geo.pad + c * (geo.tw + geo.gap)).toFixed(1)}px,${geo.pad + r * geo.rowH}px)`;
      el.style.width = geo.tw.toFixed(1) + "px"; el.style.height = geo.th + "px";
    } else {
      el.style.transform = `translateY(${i * geo.rowH}px)`; el.style.height = geo.rowH + "px";
    }
  }
  let lastRange = "";
  function paint(force) {
    if (!geo) return;
    const st = vp.scrollTop, over = 2;
    const r0 = Math.max(0, Math.floor((st - geo.pad) / geo.rowH) - over);
    const r1 = Math.min(geo.rows - 1, Math.floor((st + geo.H - geo.pad) / geo.rowH) + over);
    const i0 = r0 * geo.cols, i1 = Math.min(list.length - 1, (r1 + 1) * geo.cols - 1);
    const key = i0 + ":" + i1 + ":" + geo.key;
    if (!force && key === lastRange) return;
    lastRange = key;
    const keep = new Set();
    const frag = document.createDocumentFragment();
    for (let i = i0; i <= i1; i++) {
      const it = list[i];
      keep.add(it.id);
      let el = live.get(it.id);
      if (!el) { el = make(it); live.set(it.id, el); frag.appendChild(el); }
      place(el, i);
    }
    for (const [id, el] of live) if (!keep.has(id)) { el.remove(); live.delete(id); }
    layer.appendChild(frag);
    $("#rendered").textContent = `rendered ${live.size} of ${fmtN(list.length)}`;
    const empty = $("#empty-r");
    if (!list.length && !empty) {
      vp.insertAdjacentHTML("beforeend", `<div class="empty-r" id="empty-r"><span class="big">0 items</span><button class="btn sm" data-clear>${I.retry} clear filters</button></div>`);
    } else if (list.length && empty) empty.remove();
  }
  function clearLive() { live.forEach((el) => el.remove()); live.clear(); lastRange = ""; }
  let raf = 0;
  vp.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(false); }); }, { passive: true });
  new ResizeObserver(() => { const old = geo && geo.key; layout(); if (geo.key !== old) paint(true); }).observe(vp);

  function ensureVisible(id) {
    const i = posOf.get(id);
    if (i == null || !geo) return;
    const r = Math.floor(i / geo.cols), y = geo.pad + r * geo.rowH, h = geo.th;
    if (y < vp.scrollTop + 4) vp.scrollTop = Math.max(0, y - geo.pad);
    else if (y + h > vp.scrollTop + vp.clientHeight - 4) vp.scrollTop = y + h - vp.clientHeight + geo.pad;
    paint(false);
  }

  function renderListHead() {
    $("#lcols").innerHTML = S.view === "list" ? `<span></span><span>name</span><span>kind</span><span class="c-fx">facets</span><span>state</span><span>date</span><span class="c-src">src</span>` : "";
  }

  /* ── refresh pipeline ── */
  function refresh(opts) {
    opts = opts || {};
    compute();
    renderNav();
    renderHead();
    renderListHead();
    if (opts.rebuild) clearLive();
    if (opts.top) vp.scrollTop = 0;
    layout();
    paint(true);
    if (!S.sel || opts.detail) renderDetail();
    else updateDetailPos();
    writeHash();
  }

  /* ───────────────────────── selection ───────────────────────── */
  function select(id, o) {
    o = o || {};
    S.sel = id;
    live.forEach((el, k) => el.setAttribute("aria-selected", String(k === id)));
    if (id) {
      ensureVisible(id);
      const it = L.byId.get(id);
      if (it) vp.setAttribute("aria-activedescendant", "it-" + it.n);
    } else vp.removeAttribute("aria-activedescendant");
    if (o.open) setDet(true, true);
    renderDetail();
    writeHash();
  }
  function move(delta) {
    if (!list.length) return;
    const cur = S.sel != null && posOf.has(S.sel) ? posOf.get(S.sel) : -1;
    let n = cur < 0 ? 0 : cur + delta;
    n = Math.max(0, Math.min(list.length - 1, n));
    select(list[n].id);
  }
  const scrim = document.createElement("div");
  scrim.className = "dscrim"; scrim.id = "dscrim"; scrim.hidden = true;
  $("#lib").appendChild(scrim);
  const navTog = document.createElement("button");
  navTog.className = "toggle rail-tog"; navTog.id = "nav-tog"; navTog.setAttribute("aria-controls", "lnav"); navTog.setAttribute("aria-expanded", "false");
  $(".ltool").insertBefore(navTog, $(".ltool").firstChild);
  function syncDrawers() {
    $("#lib").classList.toggle("nav-on", S.nav);
    navTog.setAttribute("aria-expanded", String(S.nav));
    scrim.hidden = !((narrow() && S.det) || (railNarrow() && S.nav));
  }
  function setNav(v) { S.nav = v; syncDrawers(); }
  function setDet(v, quiet) {
    S.det = v;
    $("#lib").classList.toggle("det-off", !v);
    $("#det-tog").setAttribute("aria-pressed", String(!!v));
    syncDrawers();
    if (!quiet) writeHash();
  }
  navTog.addEventListener("click", () => setNav(!S.nav));
  scrim.addEventListener("click", () => { if (railNarrow() && S.nav) setNav(false); if (narrow() && S.det) setDet(false); vp.focus({ preventScroll: true }); });

  /* ───────────────────────── detail ───────────────────────── */
  const det = $("#det");
  const projOpts = () => M.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("");
  const lk = (id, label) => {
    const t = L.byId.get(id);
    if (!t) return `<span class="chip lc">${esc(label || id)}</span>`;
    return `<button class="lk" data-sel="${esc(id)}">${t.url ? `<img src="${esc(t.url)}" alt="" loading="lazy">` : `<span style="width:4px"></span>${icon(t.kind)}`}<span class="ell">${esc(label || t.title)}</span></button>`;
  };
  const pj = (pid) => `<button class="lk pj" data-fg="project" data-fv="${esc(pid)}">${esc(L.label("project", pid))}</button>`;
  const runB = (run) => `<button class="lk pj mono" data-fg="run" data-fv="${esc(run)}" style="font-size:13px">${esc(run)}</button>${GT.LedgerLink(run, "")}`;
  const node = (role, html, self) => `<div class="lnode ${self ? "self" : ""}"><span class="lr">${esc(role)}</span><span class="lv">${html}</span></div>`;
  const facetBtn = (k, v, kind) => `<button class="chip lc" data-fg="${esc(k)}" data-fv="${esc(v)}" data-fk="${esc(kind)}" aria-pressed="${!!(S.f[k] && S.f[k].has(v))}">${esc(L.label(k, v))}</button>`;

  function lineage(it) {
    const out = [];
    const self = node("this", `<span class="self-t ell">${esc(kindShort(it.kind))}</span>`, true);
    const users = (it.f.project || []).map(pj).join("");
    if (it.src === "illustrative") {
      out.push(node("derived", lk(it.parent)));
      out.push(self);
      if (users) out.push(node("project", users));
      return out;
    }
    const m = it.media;
    if (it.kind === "image") {
      out.push(node("run", runB(it.f.run[0])));
      out.push(self);
      if (m.kind === "forge.source") {
        const n = ALL.filter((x) => x.src === "real" && x.sub === "forge.candidate" && x.media.scene === m.scene).length;
        out.push(node("plates", `<button class="lk pj" data-goto="plate" data-fg="scene" data-fv="${esc(m.scene)}">${n} forge plates</button>`));
      }
      if (it.f.style.length) out.push(node(m.kind === "forge.source" ? "styles" : "looks", it.f.style.map((s) => (L.byId.get(s) ? lk(s) : `<span class="chip lc">${esc(L.label("style", s))}</span>`)).join("")));
    } else if (it.kind === "plate") {
      if (m.kind === "forge.candidate") out.push(node("source", lk("media/forge-" + m.scene + "-source.jpg")));
      if (/^extract\./.test(m.kind)) {
        const r = M.extractRuns[m.run];
        if (r) out.push(node("sources", r.sources.slice(0, 3).map((s) => lk(s.file, (/src-(s\d+)/.exec(s.file) || [])[1])).join("")));
      }
      out.push(node("run", runB(it.f.run[0])));
      out.push(self);
      if (m.style) out.push(node("style", L.byId.get(m.style) ? lk(m.style) : `<span class="chip lc">${esc(L.label("style", m.style))}</span><span class="chip ghost">not in catalogue</span>`));
      if (m.kind === "dojo.thumb") out.push(node("lesson", facetBtn("lesson", it.f.lesson[0], "plate")));
      if (users) out.push(node("used by", users));
    } else if (it.kind === "motion") {
      out.push(node("run", runB(it.f.run[0])));
      out.push(self);
      const sib = ALL.find((x) => x.kind === "motion" && x.src === "real" && x !== it && x.media.card === m.card);
      if (sib) out.push(node(sib.sub === "strip.video" ? "clip" : "poster", lk(sib.id)));
    } else if (it.kind === "style") {
      const o = it.style.origin || {};
      out.push(node("origin", `<span class="chip lc">${esc(o.kind || "—")}</span>${o.source ? (L.items.some((x) => (x.f.run || []).includes(o.source) && x.kind !== "style") ? runB(o.source) : `<span class="chip lc">${esc(o.source)}</span>`) : ""}`));
      out.push(self);
      const n = ALL.filter((x) => x.kind === "plate" && x.src === "real" && (x.f.style || []).includes(it.id)).length;
      if (n) out.push(node("plates", `<button class="lk pj" data-goto="plate" data-fg="style" data-fv="${esc(it.id)}">${n} plates</button>`));
      out.push(node("used by", users || `<span class="chip ghost">no project</span>`));
    } else if (it.kind === "audio") {
      if (it.huntNode) {
        const h = it.f.hunt[0];
        out.push(node("hunt", `<button class="lk pj" data-fg="hunt" data-fv="${esc(h)}">${esc(L.label("hunt", h))}</button>`));
        out.push(node("branch", `<span class="chip lc">${esc(it.huntNode.axis)}</span><span class="ell" style="font-size:13.5px">${esc(it.huntNode.label)}</span>`));
      } else out.push(node("group", facetBtn("group", it.take.group, "audio")));
      out.push(self);
      if (it.take.stage) out.push(node("stage", `<span class="chip lc">${esc(it.take.stage)}</span>`));
      if (users) out.push(node("project", users));
    } else if (it.kind === "video") {
      out.push(node("project", users));
      out.push(self);
    } else if (it.kind === "doc") {
      out.push(node("bundle", facetBtn("bundle", it.f.bundle[0], "doc")));
      out.push(self);
      if (it.articleRun) out.push(node("article", `${runB(it.articleRun.runId)}<span class="state ${it.articleRun.stage === "awaiting_gate" ? "awaiting_gate" : "running"}">${esc(it.articleRun.stage.replace("_", " "))}</span>`));
    }
    return out;
  }

  function preview(it) {
    const ill = it.src === "illustrative";
    if (it.kind === "audio") {
      const isP = isPlayingId(it.id);
      return `<div class="pv aud ${ill ? "ill" : ""}">${playBtn(it)}<div class="wvd" data-seek="${esc(it.id)}">${waveSVG(it.peaks, 300, 80, playing === it.id ? progress() : null)}</div>
        <div class="tm"><span id="tm-cur">${playing === it.id ? M.fmt.dur(aud.currentTime) : "0:00"}</span><span>${isP || (playing === it.id && aud.duration) ? M.fmt.dur(aud.duration || 0) + " file" : esc((it.meta || "").split(" · ").pop())}</span></div></div>`;
    }
    if (it.bad === "unreadable" && it.video && !ill) return `<div class="pv">${it.url ? `<img src="${esc(it.url)}" alt="${esc(it.title)}">` : vface(it)}</div><div class="err">${I.warn}<span>MEDIA_ERR_SRC_NOT_SUPPORTED · ${esc(it.video.replace(M.D, ""))}</span></div>`;
    if (it.bad === "missing") return `<div class="pv">${vface(it)}</div>`;
    if (it.kind === "video" && it.video && !ill) return `<div class="pv"><video src="${esc(it.video)}" controls preload="metadata" playsinline></video></div>`;
    if (it.kind === "motion" && it.video && !ill) return `<div class="pv"><video src="${esc(it.video)}" ${it.url ? `poster="${esc(it.url)}"` : ""} controls muted loop preload="metadata" playsinline></video></div>`;
    if (it.kind === "doc" || (it.kind === "style" && !it.url)) return `<div class="pv ${ill ? "ill" : ""}" style="background:var(--ink-2)">${face(it)}</div>`;
    if (it.url) return `<div class="pv ${ill ? "ill" : ""}"><img src="${esc(it.url)}" alt="${esc(it.title)}"></div>`;
    return "";
  }

  function body(it) {
    const ill = it.src === "illustrative";
    const k = it.kind;
    const chips = [`<span class="chip">${icon(k).replace("<svg", '<svg width="12" height="12"')} ${esc(kindShort(k))}</span>`, GT.State(it.state), GT.Src(it.src)];
    if (k === "image") chips.push(`<span class="chip ghost">private · not output</span>`);
    if (k === "style" && it.state === "ratified") chips.push(`<span class="chip emerald">${I.lock.replace("<svg", '<svg width="11" height="11"')} locked</span>`);
    if (pinned.has(it.id)) chips.push(`<span class="chip cyan">pinned</span>`);
    if (it.bad) chips.push(badChip(it));
    // facets
    const fkeys = [...L.GROUPS[k], "project", "run", "hunt"].filter((g) => (it.f[g] || []).length);
    const facets = fkeys.map((g) => `<dt>${esc(L.groupLabel(g))}</dt><dd>${it.f[g].map((v) => facetBtn(g, v, k)).join("")}</dd>`).join("");
    let extra = "";
    if (k === "style") {
      const s = it.style;
      if (s) {
        const ev = s.evidence || [];
        extra += `<h4>Evidence</h4><div class="ev">${GT.Tally(s.keep, "keep")}${GT.Tally(s.reject, "reject")}${GT.Tally(s.scenes.length, "scenes")}${GT.StackBar(s.keep, s.reject, 0, s.name)}</div>
          ${ev.length ? `<table class="evt">${ev.slice(0, 8).map((e) => `<tr><td>${esc(e.scene)}</td><td class="m">${esc(e.mechanism)}</td><td class="m">${esc(e.run.replace(/^\d{4}-\d{2}-\d{2}-/, ""))}</td><td class="${e.verdict === "keep" ? "v-keep" : "v-reject"}">${esc(e.verdict)}</td></tr>`).join("")}</table>${ev.length > 8 ? `<div class="did" style="margin-top:6px">+${ev.length - 8} rows · ${GT.LedgerLink(it.id, "ledger")}</div>` : ""}` : ""}
          <h4>Recipe</h4><p class="recipe-s">${esc(s.recipe)}</p>${s.negative ? `<p class="neg"><b>−</b> ${esc(s.negative)}</p>` : ""}`;
        if (s.plates.length) extra += `<h4>Plates ${GT.Tally(s.plates.length)}</h4><div class="plstrip">${s.plates.map((p) => `<button data-sel="${esc(p.file)}" aria-label="${esc(p.file)}"><img src="${esc(p.url)}" alt="" loading="lazy"></button>`).join("")}</div>`;
      } else if (it.recipe) extra += `<h4>Recipe · parent ${GT.Src("illustrative")}</h4><p class="recipe-s" style="opacity:.8">${esc(it.recipe)}</p>`;
    } else if (k === "audio") {
      if (it.take && !ill) {
        const t = it.take, ms = t.measured || {};
        extra += `<h4>Prompt</h4><p class="prompt-s">${esc(t.prompt)}</p>
          ${t.reasons && t.reasons.length ? `<div class="dchips">${t.reasons.map((r) => `<span class="chip rose lc">${esc(r)}</span>`).join("")}</div>` : ""}
          <h4>Measured ${GT.Src("fixture")}</h4><div class="meas">
            <div><small>bpm</small><b>${esc(ms.tempoBpm != null ? ms.tempoBpm : t.tempoBpm || "—")}</b></div><div><small>key</small><b>${esc(ms.key || t.key || "—")}</b></div><div><small>length</small><b>${M.fmt.dur(t.durationS)}</b></div>
            <div><small>lufs</small><b>${esc(ms.lufs != null ? ms.lufs : "—")}</b></div><div><small>true peak</small><b>${esc(ms.truePeakDb != null ? ms.truePeakDb + " dB" : "—")}</b></div><div><small>energy</small><b>${esc(ms.energy != null ? ms.energy.toFixed(2) : "—")}</b></div></div>`;
      } else extra += `<h4>Shape ${GT.Src("illustrative")}</h4><div class="meas"><div><small>bpm</small><b>${esc(it.bpm || "—")}</b></div><div><small>length</small><b>${M.fmt.dur(it.dur)}</b></div><div><small>wav</small><b>parent</b></div></div>`;
    } else if (k === "video" && it.exp && it.exp.captions) {
      const cues = it.exp.captions.split(/\n\s*\n/).map((b) => b.split("\n").filter((l) => l && !/-->/.test(l) && !/^\d+$/.test(l) && l !== "WEBVTT").join(" ")).filter(Boolean).slice(0, 4);
      extra += `<h4>Captions · ${esc(it.f.captions[0])}</h4><div class="prompt-s">${cues.map((c) => `<div>${esc(c)}</div>`).join("")}</div>`;
    } else if (k === "doc") {
      const t = it.topic;
      extra += `<h4>Registry subject</h4><div class="ev">${GT.Tally(t.techniques, "techniques")}<span class="chip lc">${esc(t.bundle)}</span><span class="chip lc mono">${esc(t.slug)}</span></div>`;
    } else if ((k === "image" || k === "plate") && it.w && !ill) {
      extra += `<h4>File</h4><div class="ev"><span class="chip lc">${it.w}×${it.h}</span><span class="chip lc">${esc((it.f.aspect || [])[0] || "")}</span>${it.media.mechanism ? `<span class="chip lc">${esc(it.media.mechanism)}</span>` : ""}${it.media.candidate ? `<span class="chip lc">${esc(it.media.candidate.split("--").pop())}</span>` : ""}</div>`;
    }
    const acts = ill
      ? `<div class="acts"><div class="r"><button class="btn" aria-disabled="true" disabled>Pin to collection</button><button class="btn" aria-disabled="true" disabled>Use in project</button>${GT.Hint("Illustrative items take no acts")}</div></div>`
      : `<div class="acts"><div class="r"><button class="btn ${pinned.has(it.id) ? "done" : ""}" data-pin>${pinned.has(it.id) ? "Pinned" : "Pin to collection"}</button>${GT.LedgerLink(it.id, "ledger")}</div>
         <div class="r"><select class="field" id="use-proj" aria-label="Project">${projOpts()}</select><button class="btn cyan" data-use>Use in project</button></div></div>`;
    return `${preview(it)}
      <h2 class="dtitle">${esc(it.title)}</h2>
      <div class="did">${esc(it.id)}${it.t ? " · " + day(it) : ""}</div>
      <div class="dchips">${chips.join("")}</div>
      ${facets ? `<h4>Facets</h4><dl class="fdl">${facets}</dl>` : ""}
      <h4>Lineage</h4><div class="lin">${lineage(it).join("")}</div>
      ${extra}
      <h4>Acts</h4>${acts}`;
  }

  function detHead(it) {
    const i = it ? posOf.get(it.id) : null;
    return `<div class="panel-head"><span class="kgh">${it ? icon(it.kind) + `<span>${esc(kindShort(it.kind))}</span>` : `${I.grid}<span>set</span>`}</span>
      <span class="sp"></span><span class="mono" id="det-pos" style="color:var(--faint);letter-spacing:0">${i != null ? fmtN(i + 1) + " / " + fmtN(list.length) : ""}</span>
      ${it ? `<button class="navbtn" data-step="-1" aria-label="previous item">${I.chevL}</button><button class="navbtn" data-step="1" aria-label="next item">${I.chevR}</button>` : ""}
      <button class="x" data-close aria-label="close detail"><kbd class="keycap">]</kbd></button></div>`;
  }
  function updateDetailPos() { const el = $("#det-pos"); const i = S.sel ? posOf.get(S.sel) : null; if (el) el.textContent = i != null ? fmtN(i + 1) + " / " + fmtN(list.length) : ""; }

  function summary() {
    const st = {}; L.STATES.forEach((s) => (st[s] = 0));
    const kc = {}; list.forEach((it) => { st[it.state]++; kc[it.kind] = (kc[it.kind] || 0) + 1; });
    const max = Math.max(1, ...Object.values(kc));
    const recent = list.filter((x) => x.url).slice(0, 6);
    return `<div class="sumh"><span class="big">${fmtN(list.length)}</span><span class="of">of ${fmtN(base.length)} · ${esc(KIND[S.kind].label.toLowerCase())}</span></div>
      <div class="stbar" role="img" aria-label="states">${L.STATES.map((s) => `<i class="${s}" style="flex-grow:${st[s]}"></i>`).join("")}</div>
      <div class="stl">${L.STATES.filter((s) => st[s]).map((s) => `<button data-fg="state" data-fv="${s}" data-fk="${S.kind}"><span>${GT.State(s)}</span><span class="n">${fmtN(st[s])}</span></button>`).join("")}</div>
      ${S.kind === "all" ? `<h4>Kinds</h4>${L.KINDS.slice(1).filter((k) => kc[k.id]).map((k) => `<button class="kbar" data-kind="${k.id}">${I[k.icon]}<span class="ell">${esc(k.label)}</span><span class="n">${fmtN(kc[k.id])}</span><span class="b"><i style="width:${(kc[k.id] / max) * 100}%"></i></span></button>`).join("")}` : ""}
      ${recent.length ? `<h4>${S.sort === "new" ? "Newest" : "First"}</h4><div class="recent">${recent.map((r) => `<button data-sel="${esc(r.id)}" aria-label="${esc(r.title)}"><img src="${esc(r.url)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
      <div class="keys-d"><h4>Keys</h4>${GT.Keycaps([[["/"], "search"], [["←", "→", "↑", "↓"], "move"], [["⏎"], "detail"], [["]"], "panel"], [["Esc"], "clear"]])}</div>`;
  }

  function renderDetail() {
    const it = S.sel ? L.byId.get(S.sel) : null;
    const sc = det.querySelector(".dbody");
    const keepScroll = sc && it && det.dataset.for === it.id ? sc.scrollTop : 0;
    det.innerHTML = detHead(it) + `<div class="dbody">${it ? body(it) : summary()}</div>`;
    det.dataset.for = it ? it.id : "";
    if (keepScroll) det.querySelector(".dbody").scrollTop = keepScroll;
  }

  /* ───────────────────────── audio (one element) ───────────────────────── */
  const aud = $("#aud");
  let playing = null;
  const progress = () => (aud.duration ? aud.currentTime / aud.duration : 0);
  function play(id) {
    const it = L.byId.get(id);
    if (!it || !it.audio) return;
    if (playing === id && !aud.paused) { aud.pause(); return; }
    if (playing !== id) { aud.src = it.audio; playing = id; }
    aud.play().catch(() => GT.toast("audio blocked by the browser"));
  }
  function syncPlay() {
    document.querySelectorAll("[data-play]").forEach((b) => {
      const on = isPlayingId(b.dataset.play);
      b.classList.toggle("on", on);
      b.innerHTML = on ? I.pause : I.play;
      b.setAttribute("aria-label", (on ? "pause " : "play ") + ((L.byId.get(b.dataset.play) || {}).title || ""));
    });
  }
  let lastWave = 0;
  function tick() {
    if (!playing || S.sel !== playing) return;
    const now = performance.now();
    if (now - lastWave < 120) return;
    lastWave = now;
    const it = L.byId.get(playing);
    const w = det.querySelector(".wvd"); if (w) w.innerHTML = waveSVG(it.peaks, 300, 80, progress());
    const c = $("#tm-cur"); if (c) c.textContent = M.fmt.dur(aud.currentTime);
  }
  ["play", "pause", "ended"].forEach((ev) => aud.addEventListener(ev, syncPlay));
  aud.addEventListener("timeupdate", tick);

  /* ───────────────────────── events ───────────────────────── */
  function toggleFacet(g, v, kind) {
    if (kind && !SHARED_KEYS.has(g) && S.kind !== kind && L.GROUPS[kind] && L.GROUPS[kind].includes(g)) setKind(kind, true);
    const s = S.f[g] || (S.f[g] = new Set());
    if (s.has(v)) s.delete(v); else s.add(v);
    if (!s.size) delete S.f[g];
    refresh({ top: true, detail: true });
  }
  function setKind(k, quiet) {
    S.kind = k;
    Object.keys(S.f).forEach((g) => { if (!SHARED_KEYS.has(g) && !(L.GROUPS[k] || []).includes(g)) delete S.f[g]; });
    if (!quiet) refresh({ top: true });
  }

  $("#lnav").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.kind) { setKind(b.dataset.kind); return; }
    if (b.dataset.g) { toggleFacet(b.dataset.g, b.dataset.v); return; }
    if (b.dataset.tg) { const g = b.dataset.tg; S.closed.has(g) ? S.closed.delete(g) : S.closed.add(g); renderNav(); return; }
    if (b.dataset.more) { const g = b.dataset.more; S.more.has(g) ? S.more.delete(g) : S.more.add(g); renderNav(); return; }
    if (b.dataset.scale) {
      S.scaled = b.dataset.scale === "1";
      if (!S.scaled && S.f.src) { S.f.src.delete("illustrative"); if (!S.f.src.size) delete S.f.src; }
      if (!S.scaled && S.sel && L.byId.get(S.sel).src === "illustrative") S.sel = null;
      refresh({ top: true, detail: true });
    }
  });
  document.querySelector(".lcenter").addEventListener("click", (e) => {
    const t = e.target;
    const rm = t.closest("[data-rm]");
    if (rm) { toggleFacet(rm.dataset.rm, rm.dataset.v); return; }
    if (t.closest("[data-clear]")) { S.f = {}; S.q = ""; $("#q").value = ""; refresh({ top: true, detail: true }); return; }
    const cr = t.closest("[data-crumb]");
    if (cr) { S.f = {}; if (cr.dataset.crumb === "root") { S.kind = "all"; S.q = ""; $("#q").value = ""; } refresh({ top: true, detail: true }); return; }
    const vb = t.closest("[data-view]");
    if (vb) { if (S.view !== vb.dataset.view) { S.view = vb.dataset.view; refresh({ rebuild: true }); if (S.sel) ensureVisible(S.sel); } return; }
    const db = t.closest("[data-dens]");
    if (db) { const sel = S.sel; S.dens = db.dataset.dens; refresh({ rebuild: true }); if (sel) ensureVisible(sel); return; }
    if (t.closest("#det-tog")) { setDet(!S.det); return; }
    const pb = t.closest("[data-play]");
    if (pb) { e.stopPropagation(); play(pb.dataset.play); return; }
    const el = t.closest("#layer [data-id]");
    if (el) {
      select(el.dataset.id, { open: narrow() });
      vp.focus({ preventScroll: true });
    }
  });
  vp.addEventListener("dblclick", (e) => { if (e.target.closest("[data-id]")) setDet(true); });
  $("#sort").addEventListener("change", (e) => { S.sort = e.target.value; refresh({ top: true }); });
  let qT = 0;
  $("#q").addEventListener("input", (e) => { clearTimeout(qT); qT = setTimeout(() => { S.q = e.target.value.trim(); refresh({ top: true, detail: !S.sel }); }, 110); });

  det.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-close]")) { setDet(false); vp.focus({ preventScroll: true }); return; }
    const st = t.closest("[data-step]");
    if (st) { move(+st.dataset.step); return; }
    const pb = t.closest("[data-play]");
    if (pb) { play(pb.dataset.play); return; }
    const sk = t.closest("[data-seek]");
    if (sk) {
      const id = sk.dataset.seek;
      if (playing !== id) { play(id); return; }
      const r = sk.getBoundingClientRect();
      if (aud.duration) aud.currentTime = ((e.clientX - r.left) / r.width) * aud.duration;
      return;
    }
    const sb = t.closest("[data-sel]");
    if (sb) {
      const it = L.byId.get(sb.dataset.sel);
      if (!it) return;
      if (it.src === "illustrative" && !S.scaled) S.scaled = true;
      if (!posOf.has(it.id)) { S.kind = it.kind; S.f = {}; S.q = ""; $("#q").value = ""; S.sel = it.id; refresh({ detail: true }); }
      select(it.id);
      return;
    }
    const kb = t.closest("[data-kind]");
    if (kb) { setKind(kb.dataset.kind); return; }
    const fb = t.closest("[data-fg]");
    if (fb) {
      if (fb.dataset.goto) { setKind(fb.dataset.goto, true); S.f = {}; }
      toggleFacet(fb.dataset.fg, fb.dataset.fv, fb.dataset.fk || fb.dataset.goto);
      return;
    }
    const it = S.sel && L.byId.get(S.sel);
    if (!it) return;
    if (t.closest("[data-pin]") && !pinned.has(it.id)) {
      GT.store.emit({ type: "library.pin", actor: { kind: "operator", id: "operator" }, subject: { kind: it.kind, id: it.id, label: it.title, href: "library.html#sel=" + encodeURIComponent(it.id) }, note: "pinned · collection" });
      GT.journal.add({ k: "lib.pin", id: it.id });
      pinned.add(it.id); it.f.pin = ["pinned"];
      GT.toast(`Pinned · ${it.title}`);
      refresh({ detail: true });
    } else if (t.closest("[data-use]")) {
      const pid = $("#use-proj").value, p = L.projById[pid];
      GT.store.emit({ type: "library.pin", actor: { kind: "operator", id: "operator" }, subject: { kind: it.kind, id: it.id, label: it.title, href: "library.html#sel=" + encodeURIComponent(it.id) }, note: "use in project · " + (p ? p.title : pid), project: pid });
      GT.journal.add({ k: "lib.use", id: it.id, pid });
      if (!it.f.project.includes(pid)) it.f.project = it.f.project.concat(pid);
      it.nf.project = it.f.project.map((v) => norm(v) + "|" + norm(L.label("project", v))).join("|");
      GT.toast(`${it.title} → ${p ? p.title : pid}`);
      refresh({ detail: true });
    }
  });

  document.addEventListener("keydown", (e) => {
    const t = e.target;
    const typing = t.matches && t.matches("input, select, textarea");
    if (e.key === "/" && !typing) { e.preventDefault(); $("#q").focus(); $("#q").select(); return; }
    if (typing) {
      if (t.id === "q" && e.key === "Escape") { e.preventDefault(); if (t.value) { t.value = ""; S.q = ""; refresh({ top: true, detail: !S.sel }); } vp.focus({ preventScroll: true }); }
      else if (t.id === "q" && (e.key === "ArrowDown" || e.key === "Enter")) { e.preventDefault(); clearTimeout(qT); if (S.q !== t.value.trim()) { S.q = t.value.trim(); refresh({ top: true, detail: !S.sel }); } vp.focus({ preventScroll: true }); if (!S.sel && list[0]) select(list[0].id); }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "]") { e.preventDefault(); setDet(!S.det); return; }
    const inRes = t === vp || t === document.body || vp.contains(t) || t === document.documentElement;
    if (e.key === "Escape") {
      if (railNarrow() && S.nav) { setNav(false); vp.focus({ preventScroll: true }); }
      else if (narrow() && S.det) { setDet(false); vp.focus({ preventScroll: true }); }
      else if (S.sel) select(null);
      else if (S.q) { S.q = ""; $("#q").value = ""; refresh({ top: true, detail: true }); }
      return;
    }
    if (!inRes) return;
    const cols = geo ? geo.cols : 1;
    const page = geo ? Math.max(1, Math.floor(vp.clientHeight / geo.rowH)) * cols : 10;
    const map = { ArrowRight: geo && geo.mode === "grid" ? 1 : 0, ArrowLeft: geo && geo.mode === "grid" ? -1 : 0, ArrowDown: cols, ArrowUp: -cols, PageDown: page, PageUp: -page };
    if (e.key in map) { e.preventDefault(); if (map[e.key]) move(map[e.key]); return; }
    if (e.key === "Home") { e.preventDefault(); if (list[0]) select(list[0].id); return; }
    if (e.key === "End") { e.preventDefault(); if (list.length) select(list[list.length - 1].id); return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!S.sel && list[0]) select(list[0].id, { open: true }); else setDet(!S.det); }
  });

  window.addEventListener("hashchange", () => {
    if (writing) { writing = false; return; }
    readHash();
    $("#q").value = S.q;
    setDet(S.det, true);
    refresh({ rebuild: true, detail: true });
    if (S.sel) ensureVisible(S.sel);
  });
  let wasNarrow = narrow();
  window.addEventListener("resize", () => { const n = narrow(); if (n !== wasNarrow) { wasNarrow = n; if (n && !S.sel) setDet(false, true); if (!n) setDet(true, true); } syncDrawers(); });

  /* ── boot ── */
  mediaErr(layer);
  mediaErr(det);
  $("#hdr").innerHTML = GT.header({ current: "library" });
  $("#search-ico").innerHTML = I.search;
  probe().then(() => {
    readHash();
    $("#q").value = S.q;
    setDet(S.det, true);
    refresh({ detail: true });
    if (S.sel) { ensureVisible(S.sel); const it = L.byId.get(S.sel); vp.setAttribute("aria-activedescendant", "it-" + it.n); }
    document.documentElement.dataset.libReady = "1";
  });
  window.GT_LIBRARY = { S, get list() { return list; }, get geo() { return geo; }, select, refresh };
})();
