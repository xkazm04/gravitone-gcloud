/* projects.js — Projects route: a project is a composition on top of the pipeline.
   Plan  = the breakdown per resource (which model on which lane, units, time, cost, deps).
   Runs  = the same jobs on a day-line, one row per resource, NOW line, the project's thread lit;
           reorder, retry, re-route, pause — every act previews its Δ first and lands in the ledger. */
(function () {
  "use strict";
  const { $, $$, esc, I, Tally, PipRow, Keycaps, Src, State, LedgerLink } = GT;
  const M = window.GT_MODEL, ST = window.GT_STUDIO;
  const { fmtDur, fmtUsd } = ST;
  const NOW = ST.NOW, H = ST.H, MIN = ST.MIN;
  const OPERATOR = { kind: "operator", id: "operator" };

  const S = { open: {}, pid: null, view: "plan", job: null, zoom: 1, hoverPid: null, composing: false, first: true };
  const RECIPE_ICON = { film: "video", album: "audio", explainer: "article" };
  const STATUS_TO_STATE = { done: "ratified", running: "running", queued: "queued", planned: "draft", gate: "awaiting_gate", failed: "failed", paused: "paused", blocked: "blocked" };
  const partTitle = (j) => (j.pid ? (j.part === "gate" ? "gate · " + j.of : ST.PART_LABEL[j.part] || j.part) : j.title);
  const jobTitle = (j) => (j.pid ? partTitle(j) + (j.units > 1 ? " ×" + j.units : "") : j.title);
  const proj = (id) => ST.projectById(id);
  const job = (id) => ST.jobs.find((j) => j.id === id);
  const lane = (id) => ST.laneById[id] || (id === "gate" ? { id: "gate", label: "Weir · operator", engines: "the verdict is yours" } : { id: "calendar", label: "Calendar", engines: "slots · publish" });
  const dt = (t) => new Date(t);
  const hm = (t) => dt(t).toISOString().slice(11, 16);
  const day = (t) => M.fmt.day(dt(t));
  const when = (t) => { if (t == null) return "—"; const d = dt(t); const sameDay = d.toISOString().slice(0, 10) === M.NOW.toISOString().slice(0, 10); return (sameDay ? "" : day(t) + " ") + hm(t); };
  const rel = (ms) => { const m = Math.round(ms / MIN); if (Math.abs(m) < 1) return "±0"; return (m > 0 ? "+" : "−") + fmtDur(Math.abs(m)); };
  const money = (j) => (j.usdRange ? `$${j.usdRange[0]}–${j.usdRange[1]}` : fmtUsd(j.usd));
  const srcOf = (j) => (j.src === "model" ? "model" : j.src || "illustrative");
  function emit(type, j, note, extra) {
    GT.store.emit(Object.assign({ type, actor: OPERATOR, subject: { kind: j.pid ? "job" : "run", id: j.id, label: (j.pid ? proj(j.pid).title + " · " : "") + jobTitle(j), href: "projects.html#runs/" + (j.pid || "all") + "/" + j.id }, lane: j.lane, projectId: j.pid || null, note, costUsd: j.usd, costSrc: srcOf(j) }, extra || {}));
  }

  /* ───────────── list ───────────── */
  function groupOf(p) {
    if (p.launched === false) return "plan";
    const t = ST.projectTotals(p.id);
    return t.state === "awaiting_gate" ? "weir" : t.state === "blocked" ? "blocked" : t.state === "running" ? "running" : t.state === "ratified" ? "shipped" : "running";
  }
  const GROUPS = [["weir", "At the weir", "amber"], ["blocked", "Blocked", "rose"], ["running", "Running · queued", "cyan"], ["plan", "Plans", "faint"], ["shipped", "Shipped", "emerald"]];
  function stepPips(p) {
    return ST.jobsOf(p.id).filter((j) => j.part !== "gate" && j.part !== "slot").map((j) => STATUS_TO_STATE[j.status] === "queued" ? "draft" : STATUS_TO_STATE[j.status] === "failed" ? "blocked" : STATUS_TO_STATE[j.status] === "paused" ? "draft" : STATUS_TO_STATE[j.status]);
  }
  function ListRow(p) {
    const t = ST.projectTotals(p.id);
    const r = ST.RECIPES[p.recipe];
    const lit = S.pid === p.id;
    return `<a class="prow ${lit ? "on" : ""} ${p.fresh ? "fresh" : ""}" href="#${S.view}/${esc(p.id)}" data-pid="${esc(p.id)}" aria-current="${lit ? "page" : "false"}">
      <span class="pic">${I[RECIPE_ICON[p.recipe]]}</span>
      <span class="pt"><span class="ell ttl">${esc(p.title)}</span>
        <span class="meta">${PipRow(stepPips(p), "steps")}<span class="mono">${t.eta ? (p.launched === false ? "~" + fmtDur(t.min) : "eta " + when(t.eta)) : ""}</span></span></span>
      <span class="pr">${t.failed ? `<span class="chip rose" style="height:20px">${t.failed}</span>` : t.gates ? `<span class="chip amber" style="height:20px">${t.gates}</span>` : ""}<span class="mono usd">${t.hi !== t.lo ? `$${Math.round(t.lo)}–${Math.round(t.hi)}` : fmtUsd(t.usd)}</span></span>
    </a>`;
  }
  function renderList() {
    const by = {}; ST.projects.forEach((p) => (by[groupOf(p)] = by[groupOf(p)] || []).push(p));
    const fj = ST.foundryJobs.filter((j) => j.status !== "done").length;
    $("#plist").innerHTML = `<div class="panel-head">Compositions ${Tally(ST.projects.length)}<button class="btn sm cyan" data-act="compose" style="margin-left:auto" aria-haspopup="dialog">+ Compose <kbd class="keycap">N</kbd></button></div>
      <div class="panel-body">
        <a class="prow all ${S.pid === null ? "on" : ""}" href="#runs" data-pid="" aria-current="${S.pid === null ? "page" : "false"}"><span class="pic">${I.grid}</span><span class="pt"><span class="ttl">All lanes</span><span class="meta"><span class="mono">${ST.LANES.length} resources · ${fj} floor runs</span></span></span></a>
        ${GROUPS.filter(([g]) => by[g]).map(([g, label, col]) => `<div class="pgroup" style="color:var(--${col === "faint" ? "faint" : col})">${label} ${Tally(by[g].length)}</div>${by[g].map(ListRow).join("")}`).join("")}
      </div>`;
  }

  /* ───────────── top: title · ribbon · tabs ───────────── */
  function Ribbon(p) {
    const js = ST.jobsOf(p.id);
    const t = ST.projectTotals(p.id);
    const nodes = js.filter((j) => j.part !== "slot").map((j) => {
      const st = STATUS_TO_STATE[j.status];
      const g = j.part === "gate";
      return `<button class="rnode ${g ? "gate" : ""} ${st} ${S.job === j.id ? "sel" : ""}" data-job="${esc(j.id)}" aria-label="${esc(partTitle(j))}, ${j.status}"><i></i><span>${esc(g ? "◆ " + j.of : partTitle(j))}</span></button>`;
    }).join('<span class="rlink" aria-hidden="true"></span>');
    const slotJob = js.find((j) => j.part === "slot");
    const slot = slotJob && slotJob.slot ? M.slots.find((s) => s.id === slotJob.slot) : null;
    const tail = slot ? `<a class="rnode slot ${slot.status === "published" ? "ratified" : slot.status === "failed" ? "blocked" : "awaiting_gate"}" href="index.html#slot=${esc(slot.id)}"><i></i><span><span class="chan ${slot.channelId}">${{ youtube: "YT", tiktok: "TT", instagram: "IG", blog: "PR" }[slot.channelId]}</span> ${esc(day(slot.at.getTime()))} ${hm(slot.at.getTime())}</span></a>`
      : `<span class="rnode slot draft"><i></i><span>slot ${t.slotAt ? "~" + day(t.slotAt) : "—"}</span></span>`;
    return `<div class="ribbon" data-component="IdeaSlotRibbon" role="list" aria-label="idea to slot"><span class="rnode idea ratified"><i></i><span>idea</span></span><span class="rlink" aria-hidden="true"></span>${nodes}<span class="rlink" aria-hidden="true"></span>${tail}</div>`;
  }
  function renderTop() {
    const p = S.pid ? proj(S.pid) : null;
    const t = p ? ST.projectTotals(p.id) : null;
    const r = p ? ST.RECIPES[p.recipe] : null;
    const crumbs = `<nav data-component="Crumbs" aria-label="breadcrumb"><a href="projects.html#${S.view}">Projects</a><span class="sep">›</span>${p ? `<span class="chip lc">${esc(r.label)}</span><span class="here" aria-current="page">${esc(p.title)}</span>` : `<span class="here" aria-current="page">All lanes</span>`}</nav>`;
    const tabs = `<div class="tabrail" role="tablist" aria-label="view">${[["plan", "Plan", "P"], ["runs", "Runs", "R"]].map(([v, l, k]) => `<a role="tab" href="#${v}${S.pid ? "/" + S.pid : ""}" aria-selected="${S.view === v}" class="${!p && v === "plan" ? "dim" : ""}">${l}<kbd class="keycap">${k}</kbd></a>`).join("")}</div>`;
    const totals = p ? `<div class="totals">
        <span class="chip">${State(t.state === "draft" && p.launched === false ? "draft" : t.state, p.launched === false ? "plan" : t.state === "awaiting_gate" ? "at the weir" : t.state === "ratified" ? "shipped" : t.state)}</span>
        <span class="chip">${fmtDur(t.min)} <b>work</b></span>
        <span class="chip">${t.hi !== t.lo ? `<b>$${t.lo.toFixed(0)}–${t.hi.toFixed(0)}</b>` : `<b>${fmtUsd(t.usd)}</b>`} est</span>
        <span class="chip ${t.eta && t.eta > NOW ? "cyan" : ""}">eta <b>${t.eta ? when(t.eta) : "—"}</b></span>
        ${LedgerLink(p.id, "ledger")}
      </div>` : `<div class="totals"><span class="chip cyan">${ST.jobs.filter((j) => j.status === "running").length} <b>running</b></span><span class="chip">${ST.jobs.filter((j) => j.status === "queued").length} <b>queued</b></span><span class="chip amber">${ST.jobs.filter((j) => j.status === "gate").length} <b>at the weir</b></span><span class="chip rose">${ST.jobs.filter((j) => j.status === "failed").length} <b>failed</b></span></div>`;
    return `<div class="ptop"><div class="ptop-row">${crumbs}${tabs}</div>
      <div class="ptop-row">${p ? `<h1 class="ptitle">${p.launched === false && p.draft ? `<input class="title-in" id="title-in" value="${esc(p.title)}" aria-label="title">` : esc(p.title)}</h1><span class="mono sub">${esc(p.template || "")}${p.length ? " · " + esc(p.length) : ""}${p.style ? " · " + esc((M.styleById[p.style] || { name: p.style }).name) : ""}</span>` : `<h1 class="ptitle">Runs · every resource</h1>`}${totals}</div>
      ${p ? Ribbon(p) : ""}</div>`;
  }

  /* ───────────── plan: breakdown per resource ───────────── */
  const EDITABLE = { frames: 1, motion: 1, score: 1, voice: 1, still: 1, strips: 1 };
  function optLabel(j, i) {
    const o = ST.CATALOG[j.part].opts[i];
    const n = Math.max(1, j.units);
    const usd = o.usdRange ? `$${o.usdRange[0]}–${o.usdRange[1]}` : fmtUsd(+(o.usd * n).toFixed(2));
    return `${o.model} · ${lane(o.lane).label} — ${fmtDur(Math.max(2, o.min * n))} · ${usd}`;
  }
  function PlanRow(j) {
    const cat = ST.CATALOG[j.part];
    const g = j.part === "gate", sl = j.part === "slot";
    const st = STATUS_TO_STATE[j.status];
    const locked = j.status === "done" || j.status === "running";
    const deps = ST.deps(j);
    const model = g ? `<span class="mono" style="color:var(--amber)">operator · your verdict</span>` : sl ? `<span class="mono" style="color:var(--violet)">publish</span>`
      : cat.opts.length > 1 && !locked ? `<select class="field model-sel" data-job="${esc(j.id)}" aria-label="model for ${esc(partTitle(j))}">${cat.opts.map((o, i) => `<option value="${i}" ${i === j.opt ? "selected" : ""}>${esc(optLabel(j, i))}</option>`).join("")}</select>`
      : `<span class="mono model-fixed">${esc(j.model)}</span>`;
    const units = EDITABLE[j.part] && !locked ? `<input class="field units-in" type="number" min="1" max="200" value="${j.units}" data-job="${esc(j.id)}" aria-label="${esc(cat.unit)}s"> <span class="u">${esc(cat.unit)}s</span>` : g || sl ? "" : `<span class="mono">${j.units}</span> <span class="u">${esc(cat.unit)}${j.units > 1 ? "s" : ""}</span>`;
    return `<tr class="prow-t ${g ? "gate" : ""} ${sl ? "slot" : ""} ${S.job === j.id ? "sel" : ""}" data-job="${esc(j.id)}">
      <td class="c-part"><span class="pdot ${st}"></span>${esc(g ? "◆ verdict · " + j.of : partTitle(j))}</td>
      <td><span class="lane-chip l-${esc(j.lane.replace(".", "-"))}">${esc(lane(j.lane).label)}</span></td>
      <td class="c-model">${model}</td>
      <td class="c-units">${units}</td>
      <td class="num">${g || sl ? "—" : fmtDur(j.dur)}</td>
      <td class="num">${g || sl ? "—" : money(j)} ${!g && !sl ? Src(srcOf(j)) : ""}</td>
      <td class="mono c-start">${j.s ? when(j.s) : "—"}</td>
      <td class="c-deps">${deps.map((d) => `<span class="dep ${STATUS_TO_STATE[d.status]}">${esc(d.part === "gate" ? "◆" + d.of : d.part)}</span>`).join("")}</td>
      <td>${State(st, j.status === "gate" ? "at weir" : j.status)}${j.blockedBy ? `<span class="chip rose lc" style="height:20px;margin-left:4px">↳ ${esc(j.blockedBy.part)}</span>` : ""}</td>
    </tr>`;
  }
  function ResourceSummary(p) {
    const t = ST.projectTotals(p.id);
    const lanes = Object.entries(t.byLane).sort((a, b) => b[1].min - a[1].min);
    const maxMin = Math.max(1, ...lanes.map(([, b]) => b.min));
    const pre = p.launched === false ? ST.previewLaunch(p) : null;
    const qpos = (lid) => { if (!pre) return null; const q = ST.jobsOf(p.id).filter((j) => j.lane === lid).map((j) => pre.pos[j.id] && pre.pos[j.id].q).filter(Boolean); return q.length ? Math.min(...q) : null; };
    return `<aside class="psum" aria-label="per resource">
      <div class="side-h">per resource ${Tally(lanes.length)}</div>
      <div class="res-list">${lanes.map(([lid, b]) => { const L = lane(lid); const q = qpos(lid); return `<div class="res">
        <div class="res-h"><span class="lane-chip l-${lid.replace(".", "-")}">${esc(L.label)}</span><span class="mono">${b.n} job${b.n > 1 ? "s" : ""}</span>${q ? `<span class="chip" style="height:20px">queue <b>#${q}</b></span>` : ""}</div>
        <div class="res-bar"><i style="width:${Math.round((b.min / maxMin) * 100)}%"></i></div>
        <div class="res-n"><span class="mono">${fmtDur(b.min)}</span><span class="mono">${fmtUsd(+b.usd.toFixed(2))}</span></div></div>`; }).join("")}</div>
      <div class="side-h" style="margin-top:14px">total</div>
      <div class="sum-grid"><span>work</span><b>${fmtDur(t.min)}</b><span>cost est</span><b>${t.hi !== t.lo ? `$${t.lo.toFixed(0)}–${t.hi.toFixed(0)}` : fmtUsd(t.usd)}</b><span>spent</span><b>${fmtUsd(t.spent)}</b><span>${pre ? "eta if launched" : "eta"}</span><b>${pre && pre.totals.eta ? when(pre.totals.eta) : t.eta ? when(t.eta) : "—"}</b><span>gates</span><b>${ST.jobsOf(p.id).filter((j) => j.part === "gate").length} · yours</b></div>
      ${p.launched === false ? `<button class="launch-plan" data-act="launch">Launch plan <span class="mono">${t.hi !== t.lo ? `$${t.lo.toFixed(0)}–${t.hi.toFixed(0)}` : fmtUsd(t.usd)} · ${fmtDur(t.min)}</span><kbd class="keycap">⏎</kbd></button>${p.draft ? `<button class="btn sm rose" data-act="discard" style="align-self:flex-start">Discard plan</button>` : ""}`
        : `<a class="btn cyan" href="#runs/${esc(p.id)}">Open in Runs <kbd class="keycap">R</kbd></a>`}
      <div class="kv" style="margin-top:6px">${Src("model")}<span class="mono" style="font-size:12px;color:var(--faint)">1.6 min/plate · $47–92/article · 4 min/Suno prompt · 31.5 min encode</span></div>
    </aside>`;
  }
  function renderPlan() {
    const p = proj(S.pid);
    const js = ST.jobsOf(p.id);
    return `<div class="plan" data-component="PlanBreakdown">
      <div class="plan-main"><table class="plan-t" aria-label="plan per resource"><thead><tr><th>part</th><th>resource</th><th>model</th><th>units</th><th class="num">time</th><th class="num">cost</th><th>start</th><th>after</th><th>state</th></tr></thead>
        <tbody>${js.map(PlanRow).join("")}</tbody></table>
        ${p.recipe === "album" && p.take ? (() => { const tk = M.takes.find((x) => x.id === p.take); return tk ? `<div class="h4">track · kept take ${Src("fixture")}</div><div class="take-line">${GT.Wave(tk.peaks, 220, 28, "#a78bfa")}<span class="ell" style="color:var(--ink-bright)">${esc(tk.title)}</span><span class="mono">${M.fmt.dur(tk.durationS)} · ${tk.tempoBpm || "—"} bpm · ${esc(tk.key || "")}</span></div>` : ""; })() : ""}
        ${p.style && M.styleById[p.style] ? `<div class="h4">style · Library</div><a class="style-line" href="library.html#kind=style&sel=${encodeURIComponent(p.style)}">${M.styleById[p.style].hero ? `<img src="${M.styleById[p.style].hero}" alt="">` : ""}<span><b>${esc(M.styleById[p.style].name)}</b><span class="mono">${esc(M.styleById[p.style].family)} · ${M.styleById[p.style].shelf ? "locked" : M.styleById[p.style].status}</span></span></a>` : ""}
      </div>
      ${ResourceSummary(p)}
    </div>`;
  }

  /* ───────────── runs: the day-line ───────────── */
  const ZOOMS = [{ id: "12h", pph: 132 }, { id: "24h", pph: 66 }, { id: "3d", pph: 24 }, { id: "week", pph: 11 }];
  const T0 = Date.parse("2026-10-12T18:00:00Z"), T1 = Date.parse("2026-10-20T00:00:00Z");
  const LABEL_W = 214;
  function rowsOf() {
    const rows = ST.LANES.map((l) => ({ ...l, kind: "lane" }));
    rows.push({ id: "gate", label: "Weir · operator", engines: "verdicts", kind: "gate", cap: 1 });
    rows.push({ id: "calendar", label: "Calendar", engines: "slots · publish", kind: "calendar", cap: 1 });
    return rows;
  }
  function visibleJobs() {
    return ST.jobs.filter((j) => j.s != null && j.e != null && (!j.pid || proj(j.pid).launched !== false || (S.pid === j.pid)));
  }
  // Pack bars into sub-tracks in SCREEN space: a bar's footprint is its drawn width (never narrower
  // than the minimum) plus a gap, so two bars that are apart in time but touch on screen still stack.
  // The lane shows up to `vis` tracks; the rest sit in an overflow track behind a +N chip.
  const BAR_MIN = 8, GATE_MIN = 14, GAP = 4, LABEL_PAD = 16;
  let _mc = null;
  function textW(str) {
    if (!_mc) { _mc = document.createElement("canvas").getContext("2d"); _mc.font = "600 12.5px " + (getComputedStyle(document.body).fontFamily || "sans-serif"); }
    return Math.ceil(_mc.measureText(str).width);
  }
  const barLabel = (j) => (j.part === "gate" ? "◆ " + (j.of || "") : jobTitle(j));
  function pack(list, x, vis, prio) {
    list.sort((a, b) => (prio(b) - prio(a)) || a.s - b.s || (a.order || 0) - (b.order || 0));
    const trk = [];
    list.forEach((j) => {
      const l = x(j.s), r = l + Math.max(j.part === "gate" ? GATE_MIN : BAR_MIN, x(j.e) - l) + GAP;
      let k = trk.findIndex((t) => t.every((q) => q[1] <= l || q[0] >= r));
      if (k < 0) { k = trk.length; trk.push([]); }
      trk[k].push([l, r]); j._track = k; j._l = l; j._r = r - GAP;
    });
    return { n: Math.max(1, trk.length), tracks: trk, over: list.filter((j) => j._track >= vis) };
  }
  // where the label goes: inside the bar, beside it in free track space, or on hover/focus only
  function seatLabels(list, shown) {
    const by = {}; shown.forEach((j) => (by[j._track] = by[j._track] || []).push(j));
    Object.values(by).forEach((t) => {
      t.sort((a, b) => a._l - b._l);
      t.forEach((j, i) => {
        const w = j._r - j._l, tw = textW(barLabel(j));
        const next = t[i + 1] ? t[i + 1]._l : Infinity;
        j._lab = w >= tw + LABEL_PAD ? "in" : next - j._r - 6 >= tw + 6 ? "beside" : "hover";
        j._tw = tw;
      });
    });
  }
  function renderRuns() {
    const pph = ZOOMS[S.zoom].pph;
    const x = (t) => ((t - T0) / H) * pph;
    const W = Math.ceil(x(T1));
    const p = S.pid ? proj(S.pid) : null;
    const pre = p && p.launched === false ? ST.previewLaunch(p) : null;
    const all = visibleJobs();
    if (pre) ST.jobsOf(p.id).forEach((j) => { const q = pre.pos[j.id]; if (q && q.s != null) { j.s = q.s; j.e = q.e; if (!all.includes(j)) all.push(j); j._ghost = true; } });
    const rows = rowsOf();
    let top = 0; const layout = {};
    const body = rows.map((r) => {
      const list = all.filter((j) => j.lane === r.id);
      const th = 30;
      const vis = r.cap > 1 ? r.cap : 2;
      const pk = pack(list, x, vis, (j) => (S.job === j.id ? 3 : S.pid && j.pid === S.pid ? 2 : 0));
      const open = pk.over.length && (S.open[r.id] || (S.job && pk.over.some((j) => j.id === S.job)));
      const shown = open ? list : list.filter((j) => j._track < vis);
      const n = open ? pk.n : Math.min(pk.n, vis);
      seatLabels(list, shown);
      const h = Math.max(58, n * (th + 4) + 12);
      layout[r.id] = { top, h, th };
      const bars = shown.map((j) => Bar(j, x, th)).join("");
      const chip = pk.over.length ? `<button class="ovf ${open ? "on" : ""}" data-act="ovf" data-lane="${esc(r.id)}" aria-expanded="${!!open}" aria-label="${pk.over.length} more on ${esc(r.label)}, ${open ? "collapse" : "show"}">${open ? "−" : "+"}${pk.over.length}</button>` : "";
      const util = r.kind === "lane" ? list.filter((j) => j.e > NOW && j.s < NOW + 24 * H && j.status !== "done").reduce((n, j) => n + (Math.min(j.e, NOW + 24 * H) - Math.max(j.s, NOW)), 0) / (24 * H * (r.cap || 1)) : null;
      const slots = r.kind === "calendar" ? M.slots.filter((s) => s.at.getTime() >= T0 && s.at.getTime() <= T1).map((s) => `<a class="pin ${s.status} ${p && s.projectId === p.id ? "lit" : ""}" href="index.html#slot=${esc(s.id)}" style="left:${x(s.at.getTime()).toFixed(1)}px" aria-label="${esc(s.title)} ${s.status}"><i></i></a>`).join("") : "";
      const html = `<div class="dl-row r-${r.kind} ${r.kind === "lane" ? "l-" + r.id.replace(".", "-") : ""}" style="height:${h}px" data-lane="${esc(r.id)}">
        <div class="dl-label"><span class="ln">${r.kind === "gate" ? '<i class="wallmark"></i>' : r.kind === "calendar" ? '<i class="calmark"></i>' : `<span class="lic">${I[r.icon] || ""}</span>`}${esc(r.label)}${r.cap > 1 ? `<span class="cap">×${r.cap}</span>` : ""}${chip}</span><span class="en">${esc(r.engines)}</span>${util != null ? `<span class="util" title=""><i style="width:${Math.min(100, Math.round(util * 100))}%"></i></span>` : ""}</div>
        <div class="dl-track" style="width:${W}px">${slots}${bars}</div></div>`;
      top += h;
      return html;
    }).join("");
    // axis
    let ticks = ""; const step = pph >= 60 ? 1 : pph >= 20 ? 3 : 6;
    for (let t = T0; t <= T1; t += step * H) {
      const d = dt(t); const midnight = d.getUTCHours() === 0;
      ticks += `<span class="tick ${midnight ? "day" : ""}" style="left:${(LABEL_W + x(t)).toFixed(1)}px">${midnight ? `<b>${day(t)}</b>` : ""}${hm(t)}</span>`;
    }
    const nightBands = []; for (let t = T0; t < T1; t += 24 * H) { const n0 = Date.UTC(dt(t).getUTCFullYear(), dt(t).getUTCMonth(), dt(t).getUTCDate(), 22); nightBands.push(`<i class="night" style="left:${x(n0).toFixed(1)}px;width:${(8 * pph).toFixed(1)}px"></i>`); }
    const lit = p ? p.id : S.hoverPid;
    const html = `<div class="runs" data-component="RunsDayline">
      <div class="dl">
        <div class="dl-bar">
          <div class="seg" role="group" aria-label="zoom">${ZOOMS.map((z, i) => `<button data-act="zoom" data-z="${i}" aria-pressed="${S.zoom === i}">${z.id}</button>`).join("")}</div>
          <button class="btn sm" data-act="now">NOW ${hm(NOW)}</button>
          ${p ? `<button class="btn sm" data-act="fit">fit project</button>` : ""}
          <div class="legend">${[["running", "running"], ["queued", "queued"], ["gate", "at weir"], ["failed", "failed"], ["paused", "paused"], ["done", "done"]].map(([s, l]) => `<span class="lg ${s}"><i></i>${l}</span>`).join("")}${pre ? '<span class="lg ghost"><i></i>plan · not launched</span>' : ""}</div>
          ${Src("illustrative")}
        </div>
        <div class="dl-scroll" id="dlscroll">
          <div class="dl-canvas" style="width:${W + LABEL_W}px;height:${top + 34}px" data-lit="${lit ? esc(lit) : ""}">
            <div class="dl-axis" style="width:${W + LABEL_W}px">${ticks}<div class="dl-corner"><span class="mono">UTC</span><span class="mono">${ZOOMS[S.zoom].id}</span></div></div>
            <div class="dl-rows">${body}</div>
            <svg class="dl-links" id="dllinks" width="${W}" height="${top}" style="left:${LABEL_W}px;top:34px" aria-hidden="true"></svg>
            <div class="nowline" style="left:${(LABEL_W + x(NOW)).toFixed(1)}px;height:${top + 34}px"><b>NOW ${hm(NOW)}</b></div>
          </div>
        </div>
      </div>
      <aside class="inspector" id="insp" aria-label="inspector">${Inspector()}</aside>
    </div>`;
    S._x = x; S._layout = layout; S._W = W;
    if (pre) ST.jobsOf(p.id).forEach((j) => { delete j._ghost; }), ST.schedule();
    return html;
  }
  function Bar(j, x, th) {
    const l = j._l, w = Math.max(j.part === "gate" ? GATE_MIN : BAR_MIN, x(j.e) - x(j.s));
    const p = j.pid ? proj(j.pid) : null;
    const lab = j._lab || "in";
    const cls = ["bar", "s-" + j.status, j.part === "gate" ? "gatebar" : "", j.part === "slot" ? "slotbar" : "", j._ghost || (p && p.launched === false) ? "ghost" : "", j.blockedBy ? "blocked" : "", j.afterGate ? "aftergate" : "", S.job === j.id ? "sel" : "", j.pid ? "" : "floor", S.pid && j.pid === S.pid ? "thread" : "", "lab-" + lab].join(" ");
    const label = barLabel(j);
    const sub = j.part === "gate" ? "" : j.pid ? (p.title.length > 28 ? p.title.slice(0, 26) + "…" : p.title) : j.model;
    const prog = j.status === "running" && j.progress != null ? `<i class="prog" style="width:${Math.round(j.progress * 100)}%"></i>` : "";
    const top = 6 + j._track * (th + 4);
    const bar = `<button class="${cls}" data-job="${esc(j.id)}" data-pid="${esc(j.pid || "")}" style="left:${l.toFixed(1)}px;width:${w.toFixed(1)}px;top:${top}px;height:${th}px" aria-label="${esc((p ? p.title + ", " : "") + label)}, ${j.status}, ${when(j.s)} to ${when(j.e)}">${prog}<span class="bl">${esc(label)}</span>${lab === "in" && w > (j._tw || 0) + 110 ? `<span class="bs">${esc(sub)}</span>` : ""}</button>`;
    const beside = lab === "beside" ? `<span class="bo s-${j.status}" data-for="${esc(j.id)}" aria-hidden="true" style="left:${(l + w + 6).toFixed(1)}px;top:${top}px;height:${th}px">${esc(label)}</span>` : "";
    return bar + beside;
  }
  // dependency curves for the lit project; the selected job's chain is drawn heavier
  function drawLinks() {
    const svg = $("#dllinks"); if (!svg) return;
    const pid = S.pid || S.hoverPid; if (!pid) { svg.innerHTML = ""; return; }
    const js = ST.jobsOf(pid);
    const pos = (j) => { const el = $(`.bar[data-job="${CSS.escape(j.id)}"]`); if (!el) return null; return { l: el.offsetLeft, r: el.offsetLeft + el.offsetWidth, y: el.offsetTop + el.offsetHeight / 2 + el.closest(".dl-row").offsetTop }; };
    const sel = S.job ? job(S.job) : null;
    const up = sel ? ST.upstream(sel) : new Set(), down = sel ? ST.downstream(sel) : new Set();
    let d = "";
    js.forEach((j) => ST.deps(j).forEach((dp) => {
      const a = pos(dp), b = pos(j); if (!a || !b) return;
      const x1 = a.r, y1 = a.y, x2 = b.l, y2 = b.y; const mx = Math.max(24, Math.abs(x2 - x1) / 2);
      const k = sel && (j.id === sel.id || dp.id === sel.id || (up.has(dp.id) && (up.has(j.id) || j.id === sel.id)) || (down.has(j.id) && (down.has(dp.id) || dp.id === sel.id))) ? (up.has(dp.id) || j.id === sel.id ? "up" : "down") : "";
      const bad = j.blockedBy ? "bad" : "";
      d += `<path class="lk ${k} ${bad}" d="M${x1},${y1} C${x1 + mx},${y1} ${x2 - mx},${y2} ${x2},${y2}"/><circle class="lk-end ${k}" cx="${x2}" cy="${y2}" r="2.6"/>`;
    }));
    svg.innerHTML = d;
  }

  /* ───────────── inspector ───────────── */
  function Inspector() {
    const j = S.job ? job(S.job) : null;
    if (!j) return S.pid ? ProjectInspector(proj(S.pid)) : LanesInspector();
    const p = j.pid ? proj(j.pid) : null;
    const L = lane(j.lane);
    const st = STATUS_TO_STATE[j.status];
    const deps = ST.deps(j), dn = ST.dependents(j);
    const q = ST.queuePos(j);
    const canMove = (j.status === "queued" || j.status === "planned") && j.lane !== "gate" && j.lane !== "calendar" && !j.blockedBy;
    const opts = j.pid || j.part ? (ST.CATALOG[j.part] || { opts: [] }).opts : [];
    const rerouteable = opts.length > 1 && j.status !== "done" && j.status !== "running" && j.part !== "gate" && (!p || true);
    let alt = "";
    if (rerouteable && j.pid) {
      alt = opts.map((o, i) => {
        if (i === j.opt) return `<div class="alt cur"><span class="lane-chip l-${o.lane.replace(".", "-")}">${esc(lane(o.lane).label)}</span><span class="am">${esc(o.model)}</span><span class="chip" style="height:20px">current</span></div>`;
        const pv = ST.preview(j, (x) => ST.reroute(x, i));
        const n = Math.max(1, j.units); const cost = o.usdRange ? `$${o.usdRange[0]}–${o.usdRange[1]}` : fmtUsd(+(o.usd * n).toFixed(2));
        return `<button class="alt" data-act="reroute" data-i="${i}" aria-label="re-route to ${esc(o.model)} on ${esc(lane(o.lane).label)}">
          <span class="lane-chip l-${o.lane.replace(".", "-")}">${esc(lane(o.lane).label)}</span><span class="am">${esc(o.model)}</span>
          <span class="ad"><span class="mono">${fmtDur(Math.max(2, o.min * n))} · ${cost}</span><span class="d ${pv.dEta < 0 ? "good" : pv.dEta > 0 ? "bad" : ""}">eta ${rel(pv.dEta)}</span><span class="d ${pv.dUsd > 0 ? "bad" : pv.dUsd < 0 ? "good" : ""}">${pv.dUsd > 0 ? "+" : pv.dUsd < 0 ? "−" : "±"}${fmtUsd(Math.abs(pv.dUsd))}</span>${pv.queue ? `<span class="mono">q#${pv.queue}</span>` : ""}</span></button>`;
      }).join("");
    }
    const pkt = j.packet ? M.packets.find((x) => x.id === j.packet) : null;
    const slot = j.slot ? M.slots.find((s) => s.id === j.slot) : null;
    return `<div class="insp-in">
      <div class="insp-h"><span class="lane-chip l-${j.lane.replace(".", "-")}">${esc(L.label)}</span>${State(st, j.status === "gate" ? "at weir" : j.status)}<button class="chip" data-act="unsel" style="margin-left:auto" aria-label="close job">✕</button></div>
      <h2 class="insp-t">${esc(j.part === "gate" ? "Verdict · " + j.of : jobTitle(j))}</h2>
      ${p ? `<a class="insp-p" href="#${S.view}/${esc(p.id)}">${I[RECIPE_ICON[p.recipe]]}${esc(p.title)}</a>` : `<span class="insp-p">${I.grid}Floor · Foundry</span>`}
      <dl class="kvs">
        <dt>model</dt><dd class="mono">${esc(j.model)}</dd>
        ${j.part !== "gate" && j.part !== "slot" ? `<dt>units</dt><dd>${j.units} ${esc(j.unit || "")}${j.units > 1 ? "s" : ""}</dd><dt>time</dt><dd>${fmtDur(j.dur)} ${Src(srcOf(j))}</dd><dt>cost</dt><dd>${money(j)}</dd>` : ""}
        <dt>start</dt><dd class="mono">${when(j.s)}${j.s > NOW ? ` <span class="faint">in ${fmtDur((j.s - NOW) / MIN)}</span>` : ""}</dd>
        <dt>end</dt><dd class="mono">${when(j.e)}</dd>
        ${q && j.status !== "done" ? `<dt>queue</dt><dd>#${q} on ${esc(L.label)}</dd>` : ""}
        ${j.attempt > 1 ? `<dt>attempt</dt><dd>${j.attempt}</dd>` : ""}
      </dl>
      ${j.error ? `<div class="err">${I.warn}<span>${esc(j.error)}</span></div>` : ""}
      ${j.blockedBy ? `<div class="block-note"><span class="chip rose lc">blocked by ${esc(partTitle(j.blockedBy))} · ${esc(j.blockedBy.status)}</span><button class="chip" data-job="${esc(j.blockedBy.id)}">open ›</button></div>` : ""}
      ${j.afterGate && !j.blockedBy ? `<div class="block-note"><span class="chip amber lc">after your verdict · ${esc(j.afterGate.of)}</span></div>` : ""}
      ${deps.length ? `<div class="side-h">after ${Tally(deps.length)}</div><div class="deplist">${deps.map((d) => `<button class="deprow" data-job="${esc(d.id)}">${State(STATUS_TO_STATE[d.status], d.status)}<span class="ell">${esc(partTitle(d))}</span><span class="mono">${when(d.e)}</span></button>`).join("")}</div>` : ""}
      ${dn.length ? `<div class="side-h">blocks ${Tally(dn.length)}</div><div class="deplist">${dn.map((d) => `<button class="deprow" data-job="${esc(d.id)}">${State(STATUS_TO_STATE[d.status], d.status)}<span class="ell">${esc(partTitle(d))}</span><span class="mono">${when(d.s)}</span></button>`).join("")}</div>` : ""}
      <div class="acts">
        ${canMove ? `<button class="btn sm" data-act="move" data-d="-1">${I.up.replace("<svg", '<svg width="13" height="13"')} earlier <kbd class="keycap">[</kbd></button><button class="btn sm" data-act="move" data-d="1">${I.down.replace("<svg", '<svg width="13" height="13"')} later <kbd class="keycap">]</kbd></button>` : ""}
        ${j.status === "queued" || j.status === "running" || j.status === "planned" ? `<button class="btn sm" data-act="pause">${I.pause.replace("<svg", '<svg width="11" height="11"')} pause <kbd class="keycap">P</kbd></button>` : ""}
        ${j.status === "paused" ? `<button class="btn sm cyan" data-act="resume">${I.play.replace("<svg", '<svg width="11" height="11"')} resume <kbd class="keycap">P</kbd></button>` : ""}
        ${j.status === "failed" ? `<button class="btn sm amber" data-act="retry">${I.retry.replace("<svg", '<svg width="13" height="13"')} retry · same route <kbd class="keycap">T</kbd></button>` : ""}
        ${pkt ? `<a class="btn sm amber" href="index.html#open=${esc(pkt.id)}">open at the weir ›</a>` : ""}
        ${slot ? `<a class="btn sm violet" href="index.html#slot=${esc(slot.id)}">slot · ${esc(slot.status)} ›</a>` : ""}
        ${LedgerLink(j.run || j.id, "ledger")}
      </div>
      ${alt ? `<div class="side-h">re-route ${Tally(opts.length - 1, "options")}</div><div class="alts">${alt}</div>` : ""}
    </div>`;
  }
  function ProjectInspector(p) {
    const t = ST.projectTotals(p.id);
    const js = ST.jobsOf(p.id);
    const need = js.filter((j) => j.status === "failed" || j.status === "gate" || j.status === "paused" || j.blockedBy);
    const lanes = Object.entries(t.byLane).sort((a, b) => b[1].min - a[1].min);
    return `<div class="insp-in">
      <div class="insp-h">${State(t.state, t.state === "awaiting_gate" ? "at the weir" : t.state)}<span class="mono" style="margin-left:auto;color:var(--faint)">${t.done}/${t.n} done</span></div>
      <h2 class="insp-t">${esc(p.title)}</h2>
      <div class="side-h">needs you ${Tally(need.length)}</div>
      <div class="deplist">${need.length ? need.map((j) => `<button class="deprow" data-job="${esc(j.id)}">${State(STATUS_TO_STATE[j.blockedBy && j.status !== "failed" ? "blocked" : j.status] || "blocked", j.status === "gate" ? "at weir" : j.blockedBy && j.status !== "failed" ? "blocked" : j.status)}<span class="ell">${esc(partTitle(j))}</span><span class="mono">${when(j.s)}</span></button>`).join("") : '<div class="ghost-card" style="height:32px"></div>'}</div>
      <div class="side-h">resources ${Tally(lanes.length)}</div>
      <div class="res-list">${lanes.map(([lid, b]) => `<div class="res compact"><span class="lane-chip l-${lid.replace(".", "-")}">${esc(lane(lid).label)}</span><span class="mono">${fmtDur(b.min)}</span><span class="mono">${fmtUsd(+b.usd.toFixed(2))}</span></div>`).join("")}</div>
      <div class="acts"><a class="btn sm" href="#plan/${esc(p.id)}">Plan <kbd class="keycap">P</kbd></a>${LedgerLink(p.id, "ledger")}</div>
      ${Keycaps([[["J", "K"], "job"], [["["], "earlier"], [["]"], "later"], [["P"], "pause"], [["Esc"], "clear"]])}
    </div>`;
  }
  function LanesInspector() {
    const now = ST.jobs.filter((j) => j.status === "running");
    const bad = ST.jobs.filter((j) => j.status === "failed");
    const gates = ST.jobs.filter((j) => j.status === "gate");
    const row = (j) => `<button class="deprow" data-job="${esc(j.id)}">${State(STATUS_TO_STATE[j.status], j.status === "gate" ? "at weir" : j.status)}<span class="ell">${esc(j.pid ? proj(j.pid).title + " · " + partTitle(j) : j.title)}</span><span class="mono">${esc(lane(j.lane).label)}</span></button>`;
    return `<div class="insp-in">
      <h2 class="insp-t">Every resource</h2>
      <div class="side-h" style="color:var(--rose)">failed ${Tally(bad.length)}</div><div class="deplist">${bad.map(row).join("") || '<div class="ghost-card" style="height:30px"></div>'}</div>
      <div class="side-h" style="color:var(--amber)">at the weir ${Tally(gates.length)}</div><div class="deplist">${gates.map(row).join("")}</div>
      <div class="side-h" style="color:var(--cyan)">running ${Tally(now.length)}</div><div class="deplist">${now.map(row).join("")}</div>
    </div>`;
  }

  /* ───────────── compose ───────────── */
  function renderCompose() {
    const el = $("#compose");
    if (!S.composing) { el.hidden = true; el.innerHTML = ""; return; }
    const proven = M.styles.filter((s) => s.shelf);
    const kept = M.keptTakes.filter((t) => t.kind === "music");
    el.hidden = false;
    el.innerHTML = `<div class="cp" role="dialog" aria-label="compose" aria-modal="false">
      <div class="cp-h"><span class="side-h">compose</span><kbd class="keycap" style="margin-left:auto">Esc</kbd></div>
      <form class="cp-recipes" onsubmit="return false">${Object.entries(ST.RECIPES).map(([k, r], i) => `<button type="button" class="recipe" data-act="recipe" data-r="${k}"><span class="ri">${I[RECIPE_ICON[k]]}</span><span><b>${esc(r.label)}</b><span class="mono">${esc(r.sub)}</span></span><kbd class="keycap">${i + 1}</kbd></button>`).join("")}</form>
      <div class="cp-src">
        <label class="mono">style <select class="field" id="cp-style">${proven.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label>
        <label class="mono">take <select class="field" id="cp-take">${kept.map((t) => `<option value="${t.id}" ${ST.projects.some((p) => p.take === t.id) ? "" : "selected"}>${esc(t.title)}</option>`).join("")}</select></label>
        <label class="mono">topic <select class="field" id="cp-topic">${M.topics.filter((t) => t.bundle === "media-generation" || t.bundle === "software-engineering").slice(0, 24).map((t) => `<option value="${t.slug}">${esc(t.title)}</option>`).join("")}</select></label>
      </div></div>`;
    const f = el.querySelector(".recipe"); if (f) f.focus();
  }
  function composeRecipe(r) {
    const style = ($("#cp-style") || {}).value, take = ($("#cp-take") || {}).value, topic = ($("#cp-topic") || {}).value;
    const tk = M.takes.find((t) => t.id === take); const tp = M.topics.find((t) => t.slug === topic);
    const title = r === "album" ? (tk ? tk.title + " — music video" : "Album video") : r === "explainer" ? (tp ? GT.titleCase(tp.title) + " — explainer" : "Explainer") : "Untitled film";
    const o = { title, style: r === "album" ? null : style, take: r === "album" ? take : null, topic: r === "explainer" ? topic : null, length: r === "album" && tk ? M.fmt.dur(tk.durationS) : r === "explainer" ? "1:30" : "2:00" };
    const p = ST.compose(r, o);
    GT.journal.add({ k: "compose", r, o, id: p.id });
    p.fresh = true;
    S.composing = false; renderCompose();
    go("plan", p.id);
    setTimeout(() => { const t = $("#title-in"); if (t && r === "film") { t.focus(); t.select(); } }, 80);
  }

  /* ───────────── render + routing ───────────── */
  function autoZoom() {
    if (!S.pid || !S.autoZoom) return; S.autoZoom = false;
    const span = focusSpan(); if (!span) return;
    const avail = Math.max(400, (window.innerWidth - 300 - 360 - LABEL_W) * 0.8);
    const hours = Math.max(1, (span[1] - span[0]) / H);
    let z = ZOOMS.length - 1; ZOOMS.forEach((Z, i) => { if (Z.pph * hours <= avail && i < z && ZOOMS[i].pph >= ZOOMS[z].pph) z = Math.min(z, i); });
    for (let i = 0; i < ZOOMS.length; i++) if (ZOOMS[i].pph * hours <= avail) { z = i; break; }
    S.zoom = z;
  }
  function render() {
    renderList();
    if ((S.pid ? S.view : "runs") === "runs") autoZoom();
    const m = $("#pmain");
    const view = S.pid ? S.view : "runs";
    const keepScroll = $("#dlscroll") ? { l: $("#dlscroll").scrollLeft, t: $("#dlscroll").scrollTop } : null;
    m.innerHTML = renderTop() + `<div class="pview">${view === "plan" ? renderPlan() : renderRuns()}</div>`;
    document.title = "Gravitone · " + (S.pid ? proj(S.pid).title : "Runs");
    $("#hdr").innerHTML = GT.header({ current: view === "runs" ? "runs" : "projects" });
    if (view === "runs") {
      const sc = $("#dlscroll");
      if (keepScroll && !S.first && !S.recenter) { sc.scrollLeft = keepScroll.l; sc.scrollTop = keepScroll.t; }
      else centerOn(S.pid && S.recenter !== "now" ? focusSpan() : null);
      S.first = false; S.recenter = null;
      drawLinks();
    }
  }
  function focusSpan() {
    const js = ST.jobsOf(S.pid).filter((j) => j.s != null && j.part !== "slot");
    if (S.job) { const j = job(S.job); if (j && j.s) return [j.s, j.e]; }
    const live = js.filter((j) => j.e >= NOW - 3 * H || j.status === "failed" || j.status === "gate");
    const use = S.fitAll || !live.length ? js : live;
    if (!use.length) return null;
    return [Math.min(...use.map((j) => j.s)), Math.max(...use.map((j) => j.e))];
  }
  function centerOn(span) {
    const sc = $("#dlscroll"); if (!sc || !S._x) return;
    const vw = sc.clientWidth - LABEL_W;
    let target;
    if (span) { const a = S._x(span[0]), b = S._x(span[1]); target = b - a < vw * 0.9 ? (a + b) / 2 - vw / 2 : a - 40; }
    else target = S._x(NOW) - vw * 0.3;
    sc.scrollLeft = Math.max(0, target);
  }
  function go(view, pid, jobId, push) {
    if ((pid || null) !== S.pid) S.autoZoom = true;
    S.view = view; S.pid = pid || null; S.job = jobId || null; S.recenter = true;
    const h = "#" + view + (S.pid ? "/" + S.pid : jobId ? "/all" : "") + (jobId ? "/" + jobId : "");
    if (location.hash !== h) history[push === false ? "replaceState" : "pushState"](null, "", h);
    render();
  }
  function fromHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    const [v, pid, jid] = h.split("/");
    S.view = v === "plan" || v === "runs" ? v : "plan";
    S.pid = pid && pid !== "all" && proj(pid) ? pid : v === "runs" || !h ? (v === "runs" ? null : ST.projects[0].id) : ST.projects[0].id;
    if (!h) S.pid = "seed-glass-harbor-trailer";
    if (v === "plan" && !S.pid) S.pid = ST.projects[0].id;
    S.job = jid && job(jid) ? jid : null;
    S.recenter = true; S.autoZoom = true; if (!S.pid) S.zoom = 1;
    render();
  }

  /* ───────────── acts ───────────── */
  // the state half of an act, shared by the screen and the journal replay
  function applyAct(j, kind, extra) {
    if (kind === "move") return ST.move(j, extra);
    if (kind === "pause") return j.status === "paused" ? ST.resume(j) : ST.pause(j);
    if (kind === "resume") return ST.resume(j);
    if (kind === "retry") return ST.retry(j);
    if (kind === "reroute") return ST.reroute(j, extra);
    return null;
  }
  function setUnits(j, n) { j.units = n; const o = ST.CATALOG[j.part].opts[j.opt]; j.dur = Math.max(2, Math.round(o.min * n)); j.usd = +(o.usd * n).toFixed(2); ST.schedule(); }
  function act(kind, extra) {
    const j = job(S.job); if (!j) return;
    const p = j.pid ? proj(j.pid) : null;
    const before = p ? ST.projectTotals(p.id) : null;
    if (kind === "retry" && j.status !== "failed") return;
    const res = applyAct(j, kind, extra);
    if (!res) { GT.toast(kind === "move" ? "end of the lane queue" : "no change"); return; }
    GT.journal.add({ k: "act", kind, id: j.id, x: extra === undefined ? null : extra });
    const after = p ? ST.projectTotals(p.id) : null;
    const dEta = before && after && before.eta && after.eta ? after.eta - before.eta : 0;
    emit(res.type, j, res.note + (p ? " · eta " + rel(dEta) : ""));
    render();
    flash(j.id);
    GT.toast(`${esc(jobTitle(j))} · ${esc(res.note)}${p ? ` · eta <b>${rel(dEta)}</b>` : ""} <span class="chip">ledger · operator</span>`, true);
  }
  function flash(id) { const el = $(`.bar[data-job="${CSS.escape(id)}"]`); if (el) { el.classList.remove("moved"); void el.offsetWidth; el.classList.add("moved"); } }
  function launch() {
    const p = proj(S.pid); if (!p || p.launched !== false) return;
    const t = ST.projectTotals(p.id);
    ST.launch(p);
    GT.journal.add({ k: "launch", pid: p.id });
    GT.store.emit({ type: "plan.launch", actor: OPERATOR, subject: { kind: "project", id: p.id, label: p.title, href: "projects.html#plan/" + p.id }, projectId: p.id, costUsd: t.usd, costSrc: "illustrative", note: `${ST.jobsOf(p.id).length} jobs · ${fmtDur(t.min)} · ${Object.keys(t.byLane).length} resources` });
    go("runs", p.id);
    // ghost bars turn solid: stagger them in
    $$(`.bar[data-pid="${CSS.escape(p.id)}"]`).forEach((b, i) => { b.style.animationDelay = i * 55 + "ms"; b.classList.add("solidify"); });
    GT.toast(`${esc(p.title)} · launched · ${ST.jobsOf(p.id).length} jobs on ${Object.keys(t.byLane).length} resources <span class="chip">ledger · operator</span>`, true);
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]");
    if (a) {
      const k = a.dataset.act;
      if (k === "compose") { S.composing = !S.composing; renderCompose(); return; }
      if (k === "recipe") return composeRecipe(a.dataset.r);
      if (k === "zoom") { S.zoom = +a.dataset.z; S.recenter = true; return render(); }
      if (k === "ovf") { S.open[a.dataset.lane] = !S.open[a.dataset.lane]; S.recenter = false; return render(); }
      if (k === "now") { S.recenter = "now"; return render(); }
      if (k === "fit") { S.recenter = true; S.job = null; S.fitAll = true; S.autoZoom = true; render(); S.fitAll = false; return; }
      if (k === "unsel") { S.job = null; history.replaceState(null, "", "#" + S.view + (S.pid ? "/" + S.pid : "")); return render(); }
      if (k === "launch") return launch();
      if (k === "discard") { const p = proj(S.pid); GT.journal.add({ k: "discard", pid: p.id }); ST.discard(p); return go("plan", ST.projects[0].id); }
      if (k === "move") return act("move", +a.dataset.d);
      if (k === "pause" || k === "resume" || k === "retry") return act(k);
      if (k === "reroute") return act("reroute", +a.dataset.i);
    }
    if (S.composing && !e.target.closest("#compose")) { S.composing = false; renderCompose(); }
    const b = e.target.closest("[data-job]");
    if (b && !e.target.closest("select,input")) {
      const j = job(b.dataset.job); if (!j) return;
      if (S.view === "plan" && b.tagName === "TR") { S.job = S.job === j.id ? null : j.id; render(); return; }
      const pid = j.pid || (S.pid && !j.pid ? null : S.pid);
      if (S.view !== "runs" || pid !== S.pid) { go("runs", j.pid || null, j.id); return; }
      S.job = S.job === j.id ? null : j.id;
      history.replaceState(null, "", "#runs" + (S.pid ? "/" + S.pid : "/all") + (S.job ? "/" + S.job : ""));
      render();
    }
  });
  document.addEventListener("change", (e) => {
    const sel = e.target.closest(".model-sel");
    if (sel) { S.job = sel.dataset.job; const j = job(S.job); const i = +sel.value; if (i !== j.opt) act("reroute", i); return; }
    const u = e.target.closest(".units-in");
    if (u) { const j = job(u.dataset.job); const n = Math.max(1, Math.min(200, +u.value || 1)); GT.journal.add({ k: "units", id: j.id, n }, "units:" + j.id); setUnits(j, n); render(); return; }
  });
  document.addEventListener("input", (e) => { if (e.target.id === "title-in") { const p = proj(S.pid); p.title = e.target.value || "Untitled"; GT.journal.add({ k: "title", pid: p.id, v: p.title }, "title:" + p.id); renderList(); } });
  // hovering a bar lights its project's thread across lanes
  document.addEventListener("mouseover", (e) => {
    const b = e.target.closest(".bar[data-pid]"); const c = $(".dl-canvas"); if (!c || S.pid) return;
    const pid = b ? b.dataset.pid : "";
    if (pid !== (S.hoverPid || "")) { S.hoverPid = pid || null; c.dataset.lit = pid; $$(".bar").forEach((x) => x.classList.toggle("thread", !!pid && x.dataset.pid === pid)); drawLinks(); }
  });
  document.addEventListener("keydown", (e) => {
    const tgt = e.target; if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "SELECT" || tgt.tagName === "TEXTAREA")) { if (e.key === "Escape") tgt.blur(); if (e.key === "Enter" && tgt.id === "title-in") { tgt.blur(); render(); } return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (S.composing) { if (k === "Escape") { S.composing = false; renderCompose(); } else if (["1", "2", "3"].includes(k)) composeRecipe(Object.keys(ST.RECIPES)[+k - 1]); return; }
    if (k === "n" || k === "N") { e.preventDefault(); S.composing = true; renderCompose(); return; }
    if (k === "p" && S.job && S.view === "runs") { const j = job(S.job); if (j.status === "paused") act("resume"); else if (["queued", "running", "planned"].includes(j.status)) act("pause"); return; }
    if (k === "p" || k === "P") { if (S.pid) go("plan", S.pid, null, false); return; }
    if (k === "r" || k === "R") { go("runs", S.pid, null, false); return; }
    if (k === "t" && S.job) return act("retry");
    if ((k === "[" || k === "]") && S.job) return act("move", k === "[" ? -1 : 1);
    if (k === "Enter" && S.pid && proj(S.pid).launched === false) { e.preventDefault(); return launch(); }
    if (k === "Escape") { if (S.job) { S.job = null; render(); } return; }
    if (k === "j" || k === "k" || k === "ArrowDown" && e.shiftKey || k === "ArrowUp" && e.shiftKey) {
      const pool = (S.pid ? ST.jobsOf(S.pid) : ST.jobs.filter((j) => j.status !== "done")).filter((j) => j.s != null);
      if (!pool.length) return;
      pool.sort((a, b) => a.s - b.s);
      const i = pool.findIndex((j) => j.id === S.job);
      const n = pool[(i + (k === "j" || k === "ArrowDown" ? 1 : pool.length - 1) + (i < 0 && (k === "k" || k === "ArrowUp") ? 1 : 0)) % pool.length];
      S.job = n.id; S.recenter = S.view === "runs"; render(); e.preventDefault(); return;
    }
    if (k === "ArrowDown" || k === "ArrowUp") {
      const order = ST.projects.map((p) => p.id); const i = order.indexOf(S.pid);
      const n = order[Math.max(0, Math.min(order.length - 1, i + (k === "ArrowDown" ? 1 : -1)))];
      if (n && n !== S.pid) { e.preventDefault(); go(S.view, n, null, false); }
    }
  });
  window.addEventListener("hashchange", fromHash);
  window.addEventListener("resize", () => { if (S.view === "runs") drawLinks(); });
  // acts of this session re-applied over the fixture baseline, in order, before the first paint
  GT.journal.replay((acts) => acts.forEach((e) => {
    try {
      if (e.k === "compose") ST.compose(e.r, Object.assign({}, e.o, { id: e.id }));
      else if (e.k === "launch") { const p = proj(e.pid); if (p && p.launched === false) ST.launch(p); }
      else if (e.k === "discard") { const p = proj(e.pid); if (p) ST.discard(p); }
      else if (e.k === "title") { const p = proj(e.pid); if (p) p.title = e.v; }
      else if (e.k === "units") { const j = job(e.id); if (j) setUnits(j, e.n); }
      else if (e.k === "act") { const j = job(e.id); if (j) applyAct(j, e.kind, e.x); }
    } catch (err) { /* a stale entry never blocks the route */ }
  }));
  fromHash();
})();
