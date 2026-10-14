/* ledger.js — the Ledger route: one append-only log of every act, filterable, linkable,
   readable as a table by the operator and as JSON Lines by an agent.
   Reads window.GT_LEDGER (ledger-data.js), GT (shell.js), GT_STUDIO (lane labels). */
(function () {
  "use strict";
  const { $, esc, I, Tally, Src, Keycaps, Hint, store } = window.GT;
  const L = window.GT_LEDGER, S = window.GT_STUDIO, M = window.GT_MODEL;
  const NOW = L.NOW, DAY = 864e5;
  const RH = 34, JH = 22; // virtual row heights: table, json lines

  document.getElementById("hdr").innerHTML = window.GT.header({ current: "ledger" });

  /* ── state ─────────────────────────────────────────── */
  const st = { q: "", actor: "all", types: new Set(), lanes: new Set(), projects: new Set(), srcs: new Set(), from: null, to: null, ev: null, order: "desc", view: "table" };
  let ALL = L.all();
  let byId = new Map(ALL.map((e) => [e.id, e]));
  let rows = [];          // filtered + ordered
  let fresh = new Set();  // ids that just arrived live

  const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
  const fmtT = (iso) => iso.slice(5, 10) + " " + iso.slice(11, 16);
  const fmtUsd = (n) => S.fmtUsd(n);
  const narrow = () => window.matchMedia("(max-width:1360px)").matches;
  const laneLabel = (id) => (S.laneById[id] ? S.laneById[id].label : id.startsWith("channel.") ? id.slice(8) : id);
  const projTitle = (pid) => { const p = S.projectById(pid) || M.projects.find((x) => x.id === pid); return p ? p.title : pid; };
  const tone = (t) => L.typeInfo(t).tone;
  const GROUP_LABEL = { capture: "capture", run: "run", job: "job", candidate: "candidate", verdict: "verdict", commit: "commit · ratify", gate: "gate", publish: "publish", metric: "metric", session: "session" };

  /* ── hash ⇄ state ───────────────────────────────────── */
  function readHash() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    st.q = h.get("q") || "";
    st.actor = h.get("actor") || "all";
    const set = (k) => new Set((h.get(k) || "").split(",").map((x) => x.trim()).filter(Boolean));
    st.types = set("type"); st.lanes = set("lane"); st.projects = set("project"); st.srcs = set("src");
    st.from = h.get("from") || null; st.to = h.get("to") || (st.from ? st.from : null);
    st.ev = h.get("ev") || null;
    st.order = h.get("order") === "asc" ? "asc" : "desc";
    st.view = h.get("view") === "jsonl" ? "jsonl" : "table";
  }
  function hashString() {
    const p = [];
    const put = (k, v) => { if (v) p.push(k + "=" + encodeURIComponent(v).replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%2F/g, "/")); };
    put("q", st.q); if (st.actor !== "all") put("actor", st.actor);
    put("type", [...st.types].join(",")); put("lane", [...st.lanes].join(",")); put("project", [...st.projects].join(",")); put("src", [...st.srcs].join(","));
    put("from", st.from); if (st.to && st.to !== st.from) put("to", st.to); else if (st.from) put("to", st.to);
    put("ev", st.ev); if (st.order === "asc") put("order", "asc"); if (st.view === "jsonl") put("view", "jsonl");
    return p.join("&");
  }
  function writeHash() { const h = hashString(); try { history.replaceState(null, "", h ? "#" + h : location.pathname + location.search); } catch (_) { /* file:// may refuse; state stays in memory */ } }

  /* ── filtering ──────────────────────────────────────── */
  function fobj(omit) {
    return {
      q: st.q,
      actor: omit === "actor" ? null : st.actor === "all" ? null : st.actor,
      type: omit === "type" ? null : [...st.types].join(",") || null,
      lane: omit === "lane" ? null : [...st.lanes].join(",") || null,
      project: omit === "project" ? null : [...st.projects].join(",") || null,
      src: omit === "src" ? null : [...st.srcs].join(",") || null,
      from: omit === "date" ? null : st.from, to: omit === "date" ? null : st.to,
    };
  }
  const filt = (omit) => ALL.filter(L.makeFilter(fobj(omit), ALL));
  function agentCall() {
    const f = fobj(); const o = {};
    Object.keys(f).forEach((k) => { if (f[k]) o[k] = f[k]; });
    return "GT_LEDGER.query(" + JSON.stringify(o) + ")";
  }

  /* ── skeleton ───────────────────────────────────────── */
  const top = $("#lg-top"), strip = $("#lg-strip"), facets = $("#lg-facets"), center = $("#lg-center"), detail = $("#lg-detail"), root = $("#lg");
  top.innerHTML = `
    <button class="toggle lg-fac-t" id="lg-fac" type="button" aria-pressed="false" aria-expanded="false" aria-controls="lg-facets" aria-label="facets"></button>
    <label class="search" aria-label="search events">${I.search}<input class="field" id="lg-q" type="search" spellcheck="false" autocomplete="off" placeholder="id · text · actor:agent type:job.fail"><kbd class="keycap">/</kbd></label>
    <div class="seg" id="lg-seg" role="group" aria-label="actor"></div>
    <span id="lg-tally"></span>
    <span class="lg-cost" id="lg-cost"></span>
    <span id="lg-range"></span>
    <span class="sp"></span>
    <button class="toggle" id="lg-order" type="button" aria-pressed="false"></button>
    <button class="toggle" id="lg-view" type="button" aria-pressed="false" aria-label="agent view, JSON Lines">{ } jsonl</button>`;
  const qIn = $("#lg-q");

  /* ── toolbar (dynamic parts) ────────────────────────── */
  function renderTop() {
    if (document.activeElement !== qIn) qIn.value = st.q;
    const base = filt("actor");
    const c = { all: base.length, operator: 0, agent: 0, machine: 0 };
    base.forEach((e) => { c[e.actor.kind] = (c[e.actor.kind] || 0) + 1; });
    $("#lg-seg").innerHTML = ["all", "operator", "agent", "machine"].map((k) =>
      `<button type="button" data-actor="${k}" aria-pressed="${st.actor === k}">${k === "all" ? "" : `<span class="g" aria-hidden="true">${I[k]}</span>`}${k === "all" ? "All" : L.ACTORS[k].label} <b>${c[k] || 0}</b></button>`).join("");
    $("#lg-tally").innerHTML = Tally(rows.length, "events", ALL.length);
    // cost of the filtered set, split by where each figure comes from
    let sum = 0; const bySrc = {}; let priced = 0;
    rows.forEach((e) => { if (typeof e.costUsd === "number") { sum += e.costUsd; priced++; const k = e.costSrc || "real"; bySrc[k] = (bySrc[k] || 0) + e.costUsd; } });
    const marks = Object.keys(bySrc).filter((k) => k !== "real" && bySrc[k] > 0).map((k) => `<span class="src ${k === "model" ? "" : k}" aria-label="${k} ${fmtUsd(bySrc[k])}">${k} ${fmtUsd(bySrc[k])}</span>`).join("");
    $("#lg-cost").innerHTML = `<span class="chip" aria-label="cost of filtered events">cost <b>${priced ? fmtUsd(+sum.toFixed(2)) : "—"}</b></span>${marks}`;
    $("#lg-range").innerHTML = st.from ? `<button class="chip cyan lg-range" type="button" id="lg-range-x" aria-label="clear date range">${esc(st.from.slice(5))}${st.to && st.to !== st.from ? " → " + esc(st.to.slice(5)) : ""} <span class="x" aria-hidden="true">×</span></button>` : "";
    const fn = st.types.size + st.lanes.size + st.projects.size + st.srcs.size;
    const ft = $("#lg-fac"); ft.innerHTML = `${I.grid.replace("<svg", '<svg width="13" height="13" style="vertical-align:-2px;margin-right:5px"')}facets${fn ? ` <b>${fn}</b>` : ""}`; ft.setAttribute("aria-label", "facets" + (fn ? ", " + fn + " active" : ""));
    const ord = $("#lg-order");
    ord.innerHTML = (st.order === "desc" ? I.down : I.up).replace("<svg", '<svg width="12" height="12" style="vertical-align:-2px;margin-right:4px"') + (st.order === "desc" ? "newest" : "oldest");
    ord.setAttribute("aria-pressed", st.order === "asc");
    ord.setAttribute("aria-label", st.order === "desc" ? "newest first" : "oldest first");
    $("#lg-view").setAttribute("aria-pressed", st.view === "jsonl");
  }

  /* ── time strip ─────────────────────────────────────── */
  const t0 = Date.parse("2026-08-26T00:00:00Z");
  let days = [];
  function dayRange() {
    let end = Date.parse("2026-11-10T00:00:00Z");
    ALL.forEach((e) => { const t = Date.parse(e.dueAt || e.at); if (t > end) end = t; });
    const n = Math.floor((Date.parse(dayKey(end) + "T00:00:00Z") - t0) / DAY) + 1;
    days = Array.from({ length: n }, (_, i) => dayKey(t0 + i * DAY));
  }
  let hoverDay = null, drag = null;
  function renderStrip() {
    dayRange();
    const base = filt("date");
    const per = {}; days.forEach((d) => (per[d] = { operator: 0, agent: 0, machine: 0, session: 0, n: 0, due: 0 }));
    base.forEach((e) => {
      const d = per[e.at.slice(0, 10)];
      if (d) { d.n++; if (e.src === "session") d.session++; else d[e.actor.kind]++; }
      if (e.dueAt && Date.parse(e.dueAt) > NOW && per[e.dueAt.slice(0, 10)]) per[e.dueAt.slice(0, 10)].due++;
    });
    const max = Math.max(1, ...days.map((d) => per[d].n));
    const H = 56, nowKey = dayKey(NOW);
    const inSel = (d) => st.from && d >= st.from && d <= (st.to || st.from);
    const bars = days.map((d, i) => {
      const p = per[d];
      const h = p.n ? Math.max(3, Math.round(H * Math.sqrt(p.n) / Math.sqrt(max))) : 0;
      const seg = (k, cls) => (p[k] ? `<i class="${cls}" style="height:${Math.max(1, (h * p[k]) / p.n).toFixed(1)}px"></i>` : "");
      const fut = d > nowKey;
      const due = p.due ? Array.from({ length: Math.min(p.due, 5) }, (_, j) => `<span class="due" style="bottom:${3 + j * 9}px"></span>`).join("") : "";
      const cls = ["ts-day", fut ? "fut" : "", inSel(d) ? "sel" : "", st.from && !inSel(d) ? "dim" : "", p.n || fut ? "" : "zero"].filter(Boolean).join(" ");
      return `<div class="${cls}" data-day="${d}" data-i="${i}">${seg("machine", "m")}${seg("agent", "a")}${seg("operator", "o")}${seg("session", "s")}${due}</div>`;
    }).join("");
    const span = days.length;
    const nowPct = ((NOW - t0) / (span * DAY)) * 100;
    const axis = days.map((d, i) => {
      const dt = new Date(d + "T00:00:00Z");
      if (dt.getUTCDate() === 1) return `<span class="mo" style="left:${(i / span) * 100}%">${["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][dt.getUTCMonth()]}</span>`;
      if (dt.getUTCDay() === 1 && dt.getUTCDate() > 3 && dt.getUTCDate() < 29) return `<span style="left:${(i / span) * 100}%">${d.slice(8)}</span>`;
      return "";
    }).join("");
    strip.innerHTML = `
      <div class="ts-side"><span class="side-h">time · utc</span><div class="ts-read" id="ts-read" aria-live="polite"></div></div>
      <div class="ts-main">
        <div class="ts-bars" id="ts-bars" role="group" aria-label="events per day, ${esc(days[0])} to ${esc(days[days.length - 1])}">${bars}
          <div class="ts-now" style="left:${nowPct}%" aria-label="now 2026-10-14 09:12"><span>NOW</span></div>
          <div class="ts-brush" id="ts-brush" hidden></div>
        </div>
        <div class="ts-axis" aria-hidden="true">${axis}</div>
      </div>`;
    strip._per = per;
    readout();
  }
  function readout(d) {
    const el = $("#ts-read"); if (!el) return;
    const per = strip._per || {};
    const short = (k) => new Date(k + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
    if (d && per[d]) {
      const p = per[d];
      el.innerHTML = `<b>${short(d)}</b> · ${p.n} ev${p.due ? ` · <span style="color:var(--violet)">${p.due} due</span>` : ""}<br><span class="o">${p.operator} op</span> · <span class="a">${p.agent} ag</span> · <span class="m">${p.machine} mc</span>${p.session ? ` · <b>${p.session} ses</b>` : ""}`;
    } else if (st.from) {
      const n = rows.length;
      el.innerHTML = `<b>${short(st.from)}${st.to && st.to !== st.from ? " → " + short(st.to) : ""}</b><br>${n} events`;
    } else {
      el.innerHTML = `<b>${short(days[0])} → ${short(days[days.length - 1])}</b><br>${days.length} days`;
    }
  }
  function dayAtX(x) {
    const bars = $("#ts-bars"); const r = bars.getBoundingClientRect();
    const i = Math.max(0, Math.min(days.length - 1, Math.floor(((x - r.left) / r.width) * days.length)));
    return i;
  }
  function showBrush(a, b) {
    const br = $("#ts-brush"); if (!br) return;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    br.hidden = false; br.style.left = (lo / days.length) * 100 + "%"; br.style.width = ((hi - lo + 1) / days.length) * 100 + "%";
  }
  strip.addEventListener("pointerdown", (ev) => {
    if (!ev.target.closest("#ts-bars")) return;
    const i = dayAtX(ev.clientX); drag = { a: i, b: i, id: ev.pointerId };
    $("#ts-bars").setPointerCapture(ev.pointerId); showBrush(i, i); ev.preventDefault();
  });
  strip.addEventListener("pointermove", (ev) => {
    if (!ev.target.closest || !$("#ts-bars")) return;
    const inBars = ev.target.closest("#ts-bars");
    if (drag) { drag.b = dayAtX(ev.clientX); showBrush(drag.a, drag.b); readout(days[drag.b]); return; }
    if (inBars) { const d = days[dayAtX(ev.clientX)]; if (d !== hoverDay) { hoverDay = d; readout(d); } }
  });
  strip.addEventListener("pointerleave", () => { if (!drag) { hoverDay = null; readout(); } });
  strip.addEventListener("pointerup", () => {
    if (!drag) return;
    const lo = days[Math.min(drag.a, drag.b)], hi = days[Math.max(drag.a, drag.b)];
    drag = null;
    if (lo === hi && st.from === lo && (st.to || lo) === lo) { st.from = st.to = null; } else { st.from = lo; st.to = hi; }
    apply();
  });

  /* ── facets ─────────────────────────────────────────── */
  function countBy(list, key) { const c = new Map(); list.forEach((e) => { const k = key(e); if (k != null && k !== "") c.set(k, (c.get(k) || 0) + 1); }); return c; }
  function fr(attrs, label, n, max, pressed, extra) {
    return `<button type="button" class="fr ${extra || ""} ${n ? "" : "zero"}" ${attrs} aria-pressed="${pressed}">${label}<span class="c">${n}</span>${max ? `<span class="bar" aria-hidden="true"><i style="width:${Math.round((n / max) * 100)}%"></i></span>` : ""}</button>`;
  }
  function renderFacets() {
    const tBase = filt("type"), lBase = filt("lane"), pBase = filt("project"), sBase = filt("src");
    const tc = countBy(tBase, (e) => e.type), gc = countBy(tBase, (e) => L.typeInfo(e.type).group);
    const typesAll = [...new Set(ALL.map((e) => e.type))];
    const gmax = Math.max(1, ...gc.values());
    const typeRows = L.GROUPS.filter((g) => typesAll.some((t) => L.typeInfo(t).group === g) || g === "session").map((g) => {
      const subs = typesAll.filter((t) => L.typeInfo(t).group === g).sort();
      const gl = `<span class="l">${esc(GROUP_LABEL[g] || g)}</span>`;
      return fr(`data-f="type" data-v="${g}"`, gl, gc.get(g) || 0, gmax, st.types.has(g)) +
        (subs.length > 1 ? subs.filter((t) => tc.get(t) || st.types.has(t)).map((t) => fr(`data-f="type" data-v="${esc(t)}"`, `<span class="tone ${tone(t)}" aria-hidden="true"></span><span class="l">${esc(t)}</span>`, tc.get(t) || 0, 0, st.types.has(t), "sub")).join("") : "");
    }).join("");
    const lc = countBy(lBase, (e) => e.lane);
    const lanes = [...new Set(ALL.map((e) => e.lane).filter(Boolean))].sort((a, b) => (lc.get(b) || 0) - (lc.get(a) || 0) || a.localeCompare(b));
    const lmax = Math.max(1, ...lc.values());
    const pc = countBy(pBase, (e) => e.projectId);
    const projs = [...new Set(ALL.map((e) => e.projectId).filter(Boolean))].sort((a, b) => (pc.get(b) || 0) - (pc.get(a) || 0) || a.localeCompare(b));
    const pmax = Math.max(1, ...pc.values());
    const sc = countBy(sBase, (e) => e.src);
    const srcs = ["real", "fixture", "illustrative", "session"];
    const smax = Math.max(1, ...sc.values());
    const sesN = ALL.filter((e) => e.src === "session").length;
    const any = st.types.size || st.lanes.size || st.projects.size || st.srcs.size;
    const sec = (title, f, body) => `<div class="fc-sec"><div class="side-h"><span>${title}</span>${f ? `<button type="button" data-clear="${f}">clear</button>` : ""}</div>${body}</div>`;
    facets.innerHTML = `<div class="panel-head">${I.ledger.replace("<svg", '<svg width="13" height="13"')} facets<span class="sp" style="flex:1"></span>${any ? `<button type="button" class="chip" data-clear="all" aria-label="clear facets">clear</button>` : ""}</div>
      <div class="panel-body">
        ${sec("type", st.types.size ? "type" : "", typeRows)}
        ${sec("lane · resource", st.lanes.size ? "lane" : "", lanes.map((l) => fr(`data-f="lane" data-v="${esc(l)}"`, `<span class="l">${esc(laneLabel(l))} <span class="mono" style="color:var(--faint);font-size:12px">${esc(l)}</span></span>`, lc.get(l) || 0, lmax, st.lanes.has(l))).join(""))}
        ${sec("project", st.projects.size ? "project" : "", projs.map((p) => fr(`data-f="project" data-v="${esc(p)}"`, `<span class="l">${esc(projTitle(p))}</span>`, pc.get(p) || 0, pmax, st.projects.has(p))).join(""))}
        ${sec("src", st.srcs.size ? "src" : "", srcs.map((s) => fr(`data-f="src" data-v="${s}"`, `<span class="l">${Src(s)}</span>`, sc.get(s) || 0, smax, st.srcs.has(s))).join("") +
          (sesN ? `<div class="fc-ses"><button class="btn sm rose" type="button" id="lg-ses-clear">clear session ${Tally(sesN)}</button></div>` : ""))}
        <div class="fc-keys">${Keycaps([[["/"], "search"], [["↑", "↓"], "move"], [["⏎"], "open"], [["V"], "jsonl"], [["Esc"], "clear"]])}</div>
      </div>`;
  }
  facets.addEventListener("click", (ev) => {
    if (ev.target.closest("#lg-ses-clear")) { const n = ALL.filter((e) => e.src === "session").length; store.clear(); st.srcs.delete("session"); reload(); window.GT.toast(n + " session events cleared"); const h = document.getElementById("hdr-ses"); if (h) h.querySelector("b").textContent = "0"; return; }
    const c = ev.target.closest("[data-clear]");
    if (c) { const k = c.dataset.clear; if (k === "all") { st.types.clear(); st.lanes.clear(); st.projects.clear(); st.srcs.clear(); } else ({ type: st.types, lane: st.lanes, project: st.projects, src: st.srcs })[k].clear(); apply(); return; }
    const b = ev.target.closest(".fr"); if (!b) return;
    const set = { type: st.types, lane: st.lanes, project: st.projects, src: st.srcs }[b.dataset.f];
    const v = b.dataset.v;
    if (set.has(v)) set.delete(v); else set.add(v);
    apply();
  });

  /* ── center: table / jsonl (virtualised) ────────────── */
  center.innerHTML = `<div id="lg-head"></div><div class="lg-scroll" id="lg-scroll" tabindex="0" role="grid" aria-label="events" aria-rowcount="0"><div class="lg-spacer" id="lg-spacer"></div><div id="lg-rows" style="position:absolute;left:0;right:0;top:0"></div></div>`;
  const scroller = $("#lg-scroll"), spacer = $("#lg-spacer"), rowsHost = $("#lg-rows");
  function renderHead() {
    const h = $("#lg-head");
    if (st.view === "jsonl") {
      const hs = hashString();
      h.innerHTML = `<div class="av-head">
        <div class="av-q"><code><i>ledger.html#</i>${esc(hs || "")}</code><code>${esc(agentCall())}</code></div>
        ${Tally(rows.length, "lines")}
        <button class="btn sm violet" type="button" id="av-copy">${I.doc.replace("<svg", '<svg width="14" height="14"')} Copy JSONL</button>
      </div>`;
    } else {
      h.innerHTML = `<div class="lg-cols" role="row"><button type="button" data-sort aria-label="order ${st.order === "desc" ? "newest first" : "oldest first"}">#${st.order === "desc" ? I.down : I.up}</button><span>time</span><span>actor</span><span>type</span><span>subject</span><span class="r">cost</span><span>src</span></div>`;
    }
  }
  function costCell(e) {
    if (typeof e.costUsd !== "number") return `<span class="c none" aria-label="no cost">—</span>`;
    const mark = e.costSrc && e.costSrc !== "real" ? `<sup aria-label="${esc(e.costSrc)}">${e.costSrc === "model" ? "est" : e.costSrc.slice(0, 3)}</sup>` : "";
    return `<span class="c ${e.costUsd === 0 ? "z" : ""}">${fmtUsd(e.costUsd)}${mark}</span>`;
  }
  function rowHtml(e, i) {
    const sel = e.id === st.ev;
    const tail = e.error ? `<span class="nt er">${esc(e.error)}</span>` : e.reason ? `<span class="nt">${esc(e.reason)}</span>` : e.note ? `<span class="nt">${esc(e.note)}</span>` : "";
    return `<div class="ev ${e.actor.kind} ${fresh.has(e.id) ? "fresh" : ""}" role="row" aria-rowindex="${i + 1}" aria-selected="${sel}" data-id="${e.id}" style="top:${i * RH}px">
      <span class="n">#${e.n}</span>
      <span class="t">${e.atSrc === "derived" ? '<span class="apx" aria-label="derived time">≈</span>' : '<span class="apx"></span>'}${fmtT(e.at)}</span>
      <span class="a">${I[e.actor.kind] || ""}<span>${esc(e.actor.id)}</span></span>
      <span><span class="ty ${tone(e.type)}">${esc(e.type)}</span></span>
      <span class="s"><span class="k">${esc(e.subject.kind)}</span><a href="${esc(e.subject.href)}" tabindex="-1">${esc(e.subject.label)}</a>${tail}</span>
      ${costCell(e)}
      <span class="sr">${Src(e.src)}</span>
    </div>`;
  }
  function jsonHi(s) {
    return s.replace(/("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([^"\d\-tfn]+|[\s\S])/g, (m, str, colon, num, lit, other) => {
      if (str) return colon ? `<span class="k">${esc(str)}</span>${esc(colon)}` : `<span class="sv">${esc(str)}</span>`;
      if (num) return `<span class="nv">${num}</span>`;
      if (lit) return `<span class="bv">${lit}</span>`;
      return esc(other);
    });
  }
  function lineHtml(e, i) {
    return `<div class="jl" role="row" aria-selected="${e.id === st.ev}" data-id="${e.id}" style="top:${i * JH}px"><span class="ln">${e.n}</span>${jsonHi(JSON.stringify(e))}</div>`;
  }
  let raf = 0;
  function paintRows() {
    raf = 0;
    const h = st.view === "jsonl" ? JH : RH;
    spacer.style.height = rows.length * h + "px";
    scroller.setAttribute("aria-rowcount", rows.length);
    const t = scroller.scrollTop, vh = scroller.clientHeight || 600;
    const i0 = Math.max(0, Math.floor(t / h) - 10), i1 = Math.min(rows.length, Math.ceil((t + vh) / h) + 10);
    let html = "";
    for (let i = i0; i < i1; i++) html += st.view === "jsonl" ? lineHtml(rows[i], i) : rowHtml(rows[i], i);
    if (!rows.length) html = `<div class="lg-empty"><span>0 events</span><button class="btn sm" type="button" data-reset>clear filters</button></div>`;
    rowsHost.innerHTML = html;
    rowsHost.style.width = st.view === "jsonl" ? "max-content" : "";
    rowsHost.style.minWidth = "100%";
  }
  const schedulePaint = () => { if (!raf) raf = requestAnimationFrame(paintRows); };
  scroller.addEventListener("scroll", schedulePaint, { passive: true });
  window.addEventListener("resize", () => { schedulePaint(); });
  rowsHost.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-reset]")) { resetAll(); return; }
    const r = ev.target.closest("[data-id]"); if (!r) return;
    if (ev.target.closest("a")) return; // the subject link navigates
    select(r.dataset.id, { open: true });
  });
  rowsHost.addEventListener("dblclick", (ev) => { const r = ev.target.closest("[data-id]"); if (r) openSubject(byId.get(r.dataset.id)); });
  center.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-sort]")) { st.order = st.order === "desc" ? "asc" : "desc"; apply({ keepScroll: false }); }
    if (ev.target.closest("#av-copy")) copyText(rows.map((e) => JSON.stringify(e)).join("\n"), rows.length + " lines copied");
  });

  /* ── detail ─────────────────────────────────────────── */
  function rel(iso) {
    const d = Date.parse(iso) - NOW, a = Math.abs(d);
    const m = Math.round(a / 6e4), h = Math.floor(m / 60), dd = Math.floor(h / 24);
    const s = dd >= 2 ? dd + "d " + (h % 24) + "h" : h >= 1 ? h + "h " + (m % 60) + "m" : m + "m";
    return d <= 0 ? s + " before NOW" : s + " after NOW";
  }
  function related(e) {
    const sid = e.subject.id, rid = e.runId;
    return ALL.filter((x) => x.id !== e.id && (x.subject.id === sid || (rid && x.runId === rid)));
  }
  function renderDetail() {
    const e = st.ev ? byId.get(st.ev) : null;
    const head = `<div class="panel-head">event${e ? ` <span class="mono" style="color:var(--ink-bright);letter-spacing:0">#${e.n}</span>` : ""}<span class="sp"></span>${e ? window.GT.LedgerLink(e.subject.id, "subject") : ""}<button class="x" type="button" id="dt-x" aria-label="close detail">×</button></div>`;
    if (!e) { detail.innerHTML = head + `<div class="dt-empty"><span>0 selected</span></div>`; return; }
    const r = related(e);
    const relShow = r.slice(0, 14);
    const link = (h, t) => `<a href="${esc(h)}">${esc(t)}</a>`;
    const kv = [];
    kv.push(["id", `<span class="mono">${esc(e.id)}</span>${e.sesId ? ` <span class="mono" style="color:var(--faint)">${esc(e.sesId)}</span>` : ""}`]);
    if (typeof e.costUsd === "number") kv.push(["cost", `<span class="mono">${fmtUsd(e.costUsd)}</span>${e.costRange ? ` <span class="mono" style="color:var(--muted)">${fmtUsd(e.costRange[0])}–${fmtUsd(e.costRange[1])}</span>` : ""} ${Src(e.costSrc || "real")}`]);
    if (e.lane) kv.push(["lane", `${esc(laneLabel(e.lane))} <span class="mono" style="color:var(--faint)">${esc(e.lane)}</span>`]);
    if (e.runId) kv.push(["run", link("ledger.html#q=" + encodeURIComponent(e.runId), e.runId)]);
    if (e.projectId) kv.push(["project", link("projects.html#runs/" + encodeURIComponent(e.projectId), projTitle(e.projectId))]);
    if (e.packetId) kv.push(["packet", link("index.html#open=" + encodeURIComponent(e.packetId), e.packetId)]);
    if (e.styleId) kv.push(["style", link("library.html#kind=style&sel=" + encodeURIComponent(e.styleId), e.styleId)]);
    if (e.verdict) kv.push(["verdict", `<span class="${e.verdict === "keep" ? "v-keep" : "v-reject"}">${esc(e.verdict)}</span>`]);
    if (e.reason) kv.push(["reason", esc(e.reason)]);
    if (e.dueAt) kv.push(["due", `<span class="mono">${esc(e.dueAt)}</span>`]);
    kv.push(["src", Src(e.src)]);
    detail.innerHTML = head + `<div class="panel-body"><div class="dt">
      <div>
        <div class="dt-type ${tone(e.type)}">${esc(e.type)}</div>
        <div class="dt-actor ${e.actor.kind}">${I[e.actor.kind] || ""}<span class="kd">${esc(e.actor.kind)}</span><span>${esc(e.actor.id)}</span></div>
      </div>
      <div class="dt-time"><span>${esc(e.at)}</span><div class="row"><span class="rel">${rel(e.at)}</span><span class="src ${e.atSrc === "real" ? "real" : ""}" aria-label="time source">time ${esc(e.atSrc || "real")}</span></div></div>
      <div class="dt-subj">
        <span class="chip lc" style="justify-self:start">${esc(e.subject.kind)}</span>
        <div class="lbl">${esc(e.subject.label)}</div>
        <div class="id">${esc(e.subject.id)}</div>
        <div class="acts"><a class="btn sm cyan" href="${esc(e.subject.href)}">Open record ${I.chevR.replace("<svg", '<svg width="12" height="12"')}</a><button class="btn sm" type="button" data-q="${esc(e.subject.id)}">history ${Tally(r.filter((x) => x.subject.id === e.subject.id).length + 1)}</button></div>
      </div>
      ${e.error ? `<div><div class="h4">error · verbatim</div><div class="dt-err" role="alert">${I.warn}<span>${esc(e.error)}</span></div></div>` : ""}
      ${e.note ? `<div class="dt-note">${esc(e.note)}</div>` : ""}
      <dl>${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      ${r.length ? `<div><div class="h4">related ${Tally(r.length)}</div><div class="rel-list">${relShow.map((x) => `<button type="button" data-sel="${x.id}"><span class="n">#${x.n}</span><span class="t">${fmtT(x.at)}</span><span class="ty ${tone(x.type)}">${esc(x.type)}</span></button>`).join("")}</div>${r.length > relShow.length ? `<button class="rel-more" type="button" data-q="${esc(e.runId && r.some((x) => x.runId === e.runId) ? e.runId : e.subject.id)}">+${r.length - relShow.length} more</button>` : ""}</div>` : ""}
      <div><div class="dt-jsonh"><span class="h4">raw · json</span><button class="btn sm" type="button" id="dt-copy">${I.doc.replace("<svg", '<svg width="13" height="13"')} copy</button></div><pre class="json" id="dt-json">${jsonHi(JSON.stringify(e, null, 2))}</pre></div>
    </div></div>`;
  }
  detail.addEventListener("click", (ev) => {
    const s = ev.target.closest("[data-sel]"); if (s) { select(s.dataset.sel, { open: true, scroll: true }); return; }
    const q = ev.target.closest("[data-q]"); if (q) { st.q = q.dataset.q; apply(); return; }
    if (ev.target.closest("#dt-x")) { root.classList.remove("det-open"); return; }
    if (ev.target.closest("#dt-copy")) { const e = byId.get(st.ev); if (e) copyText(JSON.stringify(e, null, 2), "event " + e.id + " copied"); }
  });

  /* ── selection ──────────────────────────────────────── */
  function closeFac() { root.classList.remove("fac-open"); const t = $("#lg-fac"); if (t) { t.setAttribute("aria-pressed", "false"); t.setAttribute("aria-expanded", "false"); } }
  center.addEventListener("click", () => { if (root.classList.contains("fac-open")) closeFac(); });
  function select(id, o) {
    o = o || {};
    if (!byId.has(id)) return;
    st.ev = id;
    if (o.open && narrow()) { root.classList.add("det-open"); closeFac(); }
    rowsHost.querySelectorAll("[data-id]").forEach((r) => r.setAttribute("aria-selected", r.dataset.id === id));
    if (o.scroll) scrollToSel();
    renderDetail(); writeHash();
  }
  function scrollToSel() {
    const i = rows.findIndex((e) => e.id === st.ev); if (i < 0) return;
    const h = st.view === "jsonl" ? JH : RH;
    const y = i * h, vh = scroller.clientHeight;
    if (y < scroller.scrollTop) scroller.scrollTop = y;
    else if (y + h > scroller.scrollTop + vh) scroller.scrollTop = y + h - vh;
    paintRows();
  }
  function move(d) {
    if (!rows.length) return;
    let i = rows.findIndex((e) => e.id === st.ev);
    i = i < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, i + d));
    select(rows[i].id, { scroll: true });
  }
  function openSubject(e) { if (e && e.subject && e.subject.href) location.href = e.subject.href; }

  /* ── apply ──────────────────────────────────────────── */
  function apply(o) {
    o = o || {};
    rows = filt();
    rows.sort((a, b) => (st.order === "desc" ? b.n - a.n : a.n - b.n));
    // the selection follows the filter: a selected event outside the result set yields to the first row
    if (rows.length && (!st.ev || !byId.has(st.ev) || !rows.some((e) => e.id === st.ev))) st.ev = rows[0].id;
    root.classList.toggle("jsonl", st.view === "jsonl");
    renderTop(); renderStrip(); renderFacets(); renderHead();
    if (o.keepScroll === false) scroller.scrollTop = 0;
    paintRows(); renderDetail(); writeHash();
  }
  function resetAll() { st.q = ""; st.actor = "all"; st.types.clear(); st.lanes.clear(); st.projects.clear(); st.srcs.clear(); st.from = st.to = null; apply({ keepScroll: false }); }

  /* ── toolbar events ─────────────────────────────────── */
  let qT = 0;
  qIn.addEventListener("input", () => { clearTimeout(qT); qT = setTimeout(() => { st.q = qIn.value.trim(); scroller.scrollTop = 0; apply({ reselect: true }); }, 110); });
  qIn.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { if (qIn.value) { qIn.value = ""; st.q = ""; apply({ reselect: true }); } else qIn.blur(); ev.stopPropagation(); }
    if (ev.key === "Enter" || ev.key === "ArrowDown") { ev.preventDefault(); scroller.focus(); if (!st.ev && rows[0]) select(rows[0].id); }
  });
  top.addEventListener("click", (ev) => {
    const a = ev.target.closest("[data-actor]"); if (a) { st.actor = a.dataset.actor; apply({ keepScroll: false, reselect: true }); return; }
    if (ev.target.closest("#lg-range-x")) { st.from = st.to = null; apply(); return; }
    if (ev.target.closest("#lg-fac")) { const o = root.classList.toggle("fac-open"); $("#lg-fac").setAttribute("aria-pressed", o); $("#lg-fac").setAttribute("aria-expanded", o); if (o) root.classList.remove("det-open"); return; }
    if (ev.target.closest("#lg-order")) { st.order = st.order === "desc" ? "asc" : "desc"; apply({ keepScroll: false }); return; }
    if (ev.target.closest("#lg-view")) { st.view = st.view === "jsonl" ? "table" : "jsonl"; apply(); scrollToSel(); return; }
  });

  /* ── keys ───────────────────────────────────────────── */
  document.addEventListener("keydown", (ev) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === "/" && !typing) { ev.preventDefault(); qIn.focus(); qIn.select(); return; }
    if (typing) return;
    if (ev.key === "ArrowDown" || ev.key === "j") { ev.preventDefault(); move(1); return; }
    if (ev.key === "ArrowUp" || ev.key === "k") { ev.preventDefault(); move(-1); return; }
    if (ev.key === "PageDown") { ev.preventDefault(); move(Math.max(1, Math.floor(scroller.clientHeight / RH) - 1)); return; }
    if (ev.key === "PageUp") { ev.preventDefault(); move(-Math.max(1, Math.floor(scroller.clientHeight / RH) - 1)); return; }
    if (ev.key === "Home" && document.activeElement === scroller) { ev.preventDefault(); if (rows[0]) select(rows[0].id, { scroll: true }); return; }
    if (ev.key === "End" && document.activeElement === scroller) { ev.preventDefault(); if (rows.length) select(rows[rows.length - 1].id, { scroll: true }); return; }
    if (ev.key === "Enter") { const t = document.activeElement; if (t && (t.tagName === "A" || t.tagName === "BUTTON")) return; ev.preventDefault(); openSubject(byId.get(st.ev)); return; }
    if (ev.key === "v" || ev.key === "V") { st.view = st.view === "jsonl" ? "table" : "jsonl"; apply(); scrollToSel(); return; }
    if (ev.key === "Escape") {
      if (root.classList.contains("fac-open")) { closeFac(); return; }
      if (root.classList.contains("det-open")) { root.classList.remove("det-open"); return; }
      if (st.from) { st.from = st.to = null; apply(); return; }
      if (st.q || st.types.size || st.lanes.size || st.projects.size || st.srcs.size || st.actor !== "all") { resetAll(); }
    }
  });

  /* ── clipboard ──────────────────────────────────────── */
  function copyText(text, msg) {
    const done = () => window.GT.toast(msg);
    const fallback = () => {
      const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (_) { window.GT.toast("copy blocked · select the text"); }
      ta.remove();
    };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback(); } catch (_) { fallback(); }
  }

  /* ── live: session acts from any route / tab ────────── */
  function reload(newOnes) {
    ALL = L.all(); byId = new Map(ALL.map((e) => [e.id, e]));
    fresh = new Set(newOnes || []);
    apply();
    if (fresh.size) setTimeout(() => { fresh.clear(); }, 1300);
  }
  document.addEventListener("gt:ledger", () => { const before = ALL.length; ALL = L.all(); reload(ALL.slice(before).map((e) => e.id)); });
  window.addEventListener("storage", (ev) => { if (!ev.key || ev.key.indexOf("gravitone.next.session") === 0) { const before = ALL.length; ALL = L.all(); reload(ALL.length > before ? ALL.slice(before).map((e) => e.id) : []); } });
  window.addEventListener("hashchange", () => { readHash(); apply({ keepScroll: false }); scrollToSel(); });

  /* ── boot ───────────────────────────────────────────── */
  readHash();
  apply();
  scrollToSel();
})();
