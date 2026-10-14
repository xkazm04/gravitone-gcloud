/* studio.js — a project is a composition on top of the pipeline.
   Resources (lanes) · a model catalogue per part · compositions (projects) broken into jobs ·
   a list scheduler that places every job on its lane from deps + lane capacity.
   Pure data + functions, no DOM. Reads window.GT_MODEL (model.js).

   window.GT_STUDIO = {
     NOW, LANES, laneById, CATALOG, RECIPES, projects, jobs, foundryJobs,
     schedule(), projectTotals(pid), jobsOf(pid), deps(job), dependents(job),
     reroute(job, optionIdx) / pause(job) / resume(job) / retry(job) / move(job, dir),
     preview(job, mutate) -> {dEta, dUsd}, compose(recipe, opts) -> project (planned, not launched),
     launch(project), fmtDur(min), fmtUsd(n)
   }
   Durations: forge 1.6 min/plate, article 38 min + $47–92 per run, Suno 4 min/prompt, MV encode 31.5 min
   come from the model's estimates; every other minute and dollar is illustrative and says so. */
(function () {
  "use strict";
  const M = window.GT_MODEL;
  const NOW = M.NOW.getTime();
  const MIN = 60e3, H = 60 * MIN;

  /* ── resources: one row each on the Runs day-line ─────────────────────── */
  const LANES = [
    { id: "gpu.local", label: "GPU box", engines: "Flux 2 dev fp8 · Wan 2.2 · qwen3.8:27b", cap: 1, kind: "local", icon: "machine" },
    { id: "box.render", label: "Render box", engines: "ffmpeg · compositor · strips", cap: 1, kind: "local", icon: "machine" },
    { id: "box.chrome", label: "Render box · Chrome", engines: "Suno v6 · Leonardo (CDP)", cap: 1, kind: "local", icon: "machine" },
    { id: "seat.text", label: "Text seat", engines: "article turns · scripts · CLIs · 4 sessions", cap: 4, kind: "seat", icon: "agent" },
    { id: "cloud.google", label: "Google", engines: "Nano Banana · Gemini", cap: 3, kind: "cloud", icon: "route" },
    { id: "cloud.elevenlabs", label: "ElevenLabs", engines: "music · sfx · voice", cap: 2, kind: "cloud", icon: "route" },
    { id: "cloud.leonardo", label: "Leonardo", engines: "image", cap: 2, kind: "cloud", icon: "route" },
  ];
  const laneById = Object.fromEntries(LANES.map((l) => [l.id, l]));

  /* ── the catalogue: for each part, which model on which lane, per unit ─── */
  // src "model" = the figure comes from model.js estimates; "illustrative" otherwise
  const CATALOG = {
    research: { unit: "brief", opts: [
      { lane: "seat.text", model: "text CLI · research turn", min: 9, usd: 0, src: "illustrative" },
      { lane: "cloud.google", model: "Gemini · grounded search", min: 4, usd: 0.27, src: "illustrative" } ] },
    script: { unit: "draft", opts: [
      { lane: "seat.text", model: "text CLI · 2 turns", min: 14, usd: 0, src: "illustrative" },
      { lane: "cloud.google", model: "Gemini · script", min: 6, usd: 0.12, src: "illustrative" } ] },
    frames: { unit: "plate", opts: [
      { lane: "gpu.local", model: "Flux 2 dev fp8 · ComfyUI", min: 1.6, usd: 0, src: "model" },
      { lane: "cloud.google", model: "Nano Banana", min: 0.35, usd: 0.04, src: "illustrative" },
      { lane: "cloud.leonardo", model: "Leonardo · image", min: 0.5, usd: 0.06, src: "illustrative" } ] },
    motion: { unit: "shot", opts: [
      { lane: "gpu.local", model: "Wan 2.2 · i2v", min: 6, usd: 0, src: "illustrative" },
      { lane: "box.render", model: "strips · HTML/SVG 240f", min: 0.7, usd: 0, src: "illustrative" } ] },
    score: { unit: "prompt", opts: [
      { lane: "box.chrome", model: "Suno v6 · serial", min: 4, usd: 0, src: "model" },
      { lane: "cloud.elevenlabs", model: "ElevenLabs · music", min: 1.5, usd: 0.36, src: "illustrative" } ] },
    voice: { unit: "take", opts: [
      { lane: "cloud.elevenlabs", model: "ElevenLabs · voice", min: 2, usd: 0.18, src: "illustrative" },
      { lane: "seat.text", model: "local TTS", min: 5, usd: 0, src: "illustrative" } ] },
    still: { unit: "still", opts: [
      { lane: "box.chrome", model: "Leonardo · CDP", min: 3, usd: 0, src: "illustrative" },
      { lane: "cloud.google", model: "Nano Banana", min: 0.4, usd: 0.04, src: "illustrative" },
      { lane: "gpu.local", model: "Flux 2 dev fp8", min: 1.6, usd: 0, src: "model" } ] },
    words: { unit: "turn", opts: [
      { lane: "seat.text", model: "text CLI · title + description", min: 3, usd: 0, src: "illustrative" },
      { lane: "cloud.google", model: "Gemini", min: 1, usd: 0.02, src: "illustrative" } ] },
    article: { unit: "run", opts: [
      { lane: "seat.text", model: "lib/articles · 4-model critique", min: 38, usd: 69.5, usdRange: [47, 92], src: "model" } ] },
    strips: { unit: "card", opts: [
      { lane: "box.render", model: "strips · HTML/SVG 240f", min: 0.7, usd: 0, src: "illustrative" } ] },
    render: { unit: "encode", opts: [
      { lane: "box.render", model: "libx264 · full encode", min: 31.5, usd: 0, src: "model" },
      { lane: "box.render", model: "libx264 · draft preset", min: 9, usd: 0, src: "illustrative" } ] },
    cut: { unit: "cut", opts: [
      { lane: "box.render", model: "ffmpeg · compositor", min: 7, usd: 0, src: "illustrative" } ] },
    gate: { unit: "verdict", opts: [{ lane: "gate", model: "operator", min: 0, usd: 0, src: "model" }] },
    slot: { unit: "slot", opts: [{ lane: "calendar", model: "publish", min: 0, usd: 0, src: "fixture" }] },
  };
  const PART_LABEL = { research: "research", script: "script", frames: "frames", motion: "motion", score: "score", voice: "voice", still: "still", words: "words", article: "article", strips: "strips", render: "render", cut: "cut", gate: "gate", slot: "slot" };

  /* ── recipes: what a composition is made of ──────────────────────────── */
  // each part: [part, units, deps(by part key), optIdx]
  const RECIPES = {
    film: { label: "Film", sub: "script · frames · motion · score · cut", icon: "video",
      parts: (u) => [["research", 1, []], ["script", 1, ["research"]], ["frames", u.plates || 24, ["script"]], ["gate:frames", 0, ["frames"]],
        ["motion", u.shots || 8, ["gate:frames"]], ["score", u.prompts || 2, ["script"]], ["gate:score", 0, ["score"]], ["cut", 1, ["motion", "gate:score"]], ["gate:cut", 0, ["cut"]], ["slot", 0, ["gate:cut"]]] },
    album: { label: "Album video", sub: "track · still · words · render", icon: "audio",
      parts: (u) => [["still", u.stills || 2, []], ["gate:still", 0, ["still"]], ["words", 2, []], ["render", 1, ["gate:still", "words"]], ["gate:render", 0, ["render"]], ["slot", 0, ["gate:render"]]] },
    explainer: { label: "Explainer", sub: "article · strips · voice · cut", icon: "article",
      parts: (u) => [["article", 1, []], ["gate:article", 0, ["article"]], ["strips", u.cards || 6, ["gate:article"]], ["voice", u.voice || 3, ["gate:article"]], ["gate:strips", 0, ["strips"]], ["cut", 1, ["gate:strips", "voice"]], ["gate:cut", 0, ["cut"]], ["slot", 0, ["gate:cut"]]] },
  };
  const recipeOfTemplate = (t) => (t === "music-video" ? "album" : "film");

  /* ── compositions ────────────────────────────────────────────────────── */
  const projects = [];
  const jobs = [];
  let seq = 0;
  // status per part key: done | running | queued | gate | failed | blocked | paused | planned
  function build(p, recipe, units, status, extras) {
    p.recipe = recipe; p.jobs = [];
    const parts = RECIPES[recipe].parts(units);
    parts.forEach(([key, n, dep], i) => {
      const part = key.split(":")[0];
      const cat = CATALOG[part];
      const ex = (extras && extras[key]) || {};
      const opt = ex.opt || 0;
      const o = cat.opts[opt];
      const j = { id: "job_" + p.id.replace(/^seed-/, "") + "_" + key.replace(":", "-"), pid: p.id, key, part, of: key.includes(":") ? key.split(":")[1] : null,
        units: n, unit: cat.unit, opt, lane: o.lane, model: o.model, dur: Math.max(part === "gate" || part === "slot" ? 0 : 2, Math.round(o.min * Math.max(1, n))),
        usd: +(o.usd * Math.max(1, n)).toFixed(2), usdRange: o.usdRange || null, src: o.src, depKeys: dep, status: status[key] || "planned", order: i + 1000 * projects.length, attempt: 1 };
      Object.assign(j, ex);
      delete j.opt_; p.jobs.push(j.id); jobs.push(j);
    });
    p.parts = parts.map((x) => x[0]);
    projects.push(p);
    return p;
  }
  const T = (iso) => Date.parse(iso);
  const mp = Object.fromEntries(M.projects.map((p) => [p.id, p]));
  const P = (id, more) => Object.assign({ id, title: mp[id] ? mp[id].title : id, template: mp[id] ? mp[id].template : "", discipline: mp[id] ? mp[id].discipline : "", length: mp[id] ? mp[id].length : "", style: mp[id] ? mp[id].style : null, src: "fixture" }, more || {});

  // Glass Harbor — trailer: everything ran overnight; the cut waits at the weir (pkt_prj_glass_harbor_trailer_cut)
  build(P("seed-glass-harbor-trailer"), "film", { plates: 24, shots: 10, prompts: 2 }, {
    research: "done", script: "done", frames: "done", "gate:frames": "done", motion: "done", score: "done", "gate:score": "done", cut: "done", "gate:cut": "gate", slot: "planned" }, {
    research: { t0: T("2026-10-13T16:40:00Z") }, script: { t0: T("2026-10-13T17:00:00Z") }, frames: { t0: T("2026-10-13T19:10:00Z") }, "gate:frames": { t0: T("2026-10-13T21:50:00Z"), dur: 20 },
    motion: { t0: T("2026-10-13T22:15:00Z") }, score: { t0: T("2026-10-13T17:20:00Z") }, "gate:score": { t0: T("2026-10-13T18:05:00Z"), dur: 15 }, cut: { t0: T("2026-10-14T06:40:00Z") },
    "gate:cut": { t0: T("2026-10-14T07:02:00Z"), packet: "pkt_prj_glass_harbor_trailer_cut" } });
  // Glass Harbor (short clip): frames at the weir as a pile
  build(P("seed-glass-harbor"), "film", { plates: 12, shots: 6, prompts: 1 }, {
    research: "done", script: "done", frames: "done", "gate:frames": "gate" }, {
    research: { t0: T("2026-10-13T20:00:00Z") }, script: { t0: T("2026-10-13T20:20:00Z") }, frames: { t0: T("2026-10-14T02:20:00Z") }, "gate:frames": { t0: T("2026-10-14T02:40:00Z"), packet: "pkt_forge_sweep01" } });
  // Why the Bitcoin price does not rise: script on the seat now, 40 plates queued behind it on the GPU
  build(P("seed-why-bitcoin"), "film", { plates: 40, shots: 14, prompts: 3 }, {
    research: "done", script: "running" }, {
    research: { t0: T("2026-10-14T07:30:00Z") }, script: { t0: T("2026-10-14T08:58:00Z"), progress: 0.55 } });
  // The quiet tariff: frames rejected at the gate; the re-run is blocked until re-routed or retried
  build(P("seed-the-quiet-tariff"), "film", { plates: 18, shots: 8, prompts: 2 }, {
    research: "done", script: "done", frames: "failed", score: "done", "gate:score": "done" }, {
    research: { t0: T("2026-10-13T09:00:00Z") }, script: { t0: T("2026-10-13T09:20:00Z") }, frames: { t0: T("2026-10-14T05:10:00Z"), error: "gate: 0 of 18 plates kept · reason style · re-run needs a new route" },
    score: { t0: T("2026-10-13T10:00:00Z") }, "gate:score": { t0: T("2026-10-13T10:40:00Z"), dur: 15 } });
  // Two hundred days of rain: shipped
  build(P("seed-two-hundred-days"), "film", { plates: 20, shots: 9, prompts: 2 }, {
    research: "done", script: "done", frames: "done", "gate:frames": "done", motion: "done", score: "done", "gate:score": "done", cut: "done", "gate:cut": "done", slot: "done" }, {
    research: { t0: T("2026-10-12T22:00:00Z") }, script: { t0: T("2026-10-12T22:20:00Z") }, frames: { t0: T("2026-10-13T00:00:00Z") }, "gate:frames": { t0: T("2026-10-13T00:40:00Z"), dur: 20 },
    motion: { t0: T("2026-10-13T01:10:00Z") }, score: { t0: T("2026-10-12T22:40:00Z") }, "gate:score": { t0: T("2026-10-12T23:20:00Z"), dur: 10 }, cut: { t0: T("2026-10-13T02:20:00Z") }, "gate:cut": { t0: T("2026-10-13T03:00:00Z"), dur: 25 }, slot: { t0: T("2026-10-13T15:00:00Z") } });
  // Untitled — the port strike one: a plan only, nothing launched
  build(P("seed-untitled", { launched: false }), "film", { plates: 16, shots: 6, prompts: 1 }, {});
  // Album video from a kept take (fixture take), score already ratified
  const take = M.keptTakes.find((t) => t.kind === "music") || M.takes[0];
  build({ id: "mv-" + take.id, title: take.title + " — music video", template: "music-video", discipline: "music-video", length: M.fmt.dur(take.durationS), style: null, src: "fixture", take: take.id }, "album", { stills: 2 }, {
    still: "queued" }, {});
  // Explainer over the article at the weir (illustrative draft)
  const art = M.topics.find((t) => t.slug === "generative-provider-routing");
  build({ id: "xp-provider-routing", title: (art ? art.title : "Provider routing") + " — explainer", template: "explainer", discipline: "educational", length: "1:30", style: "ink-graphic-novel", src: "illustrative", topic: art && art.slug }, "explainer", { cards: 6, voice: 3 }, {
    article: "done", "gate:article": "gate" }, {
    article: { t0: T("2026-10-14T05:20:00Z"), usd: 69.5 }, "gate:article": { t0: T("2026-10-14T06:20:00Z"), packet: "pkt_art_generative-provider-routing" } });

  // Foundry runs that belong to no project yet (the floor's own work), from model.js runs
  const foundryJobs = [];
  const fj = (o) => { const j = Object.assign({ pid: null, key: o.id, units: 1, unit: "run", opt: 0, usd: 0, src: "model", depKeys: [], order: 5000 + foundryJobs.length, attempt: 1 }, o); foundryJobs.push(j); jobs.push(j); return j; };
  M.runs.filter((r) => r.status === "running").forEach((r) => {
    if (r.media === "article") fj({ id: "job_" + r.id, title: r.title, part: "article", lane: "seat.text", model: "lib/articles · " + r.stage, dur: 38, usd: 69.5, usdRange: [47, 92], status: "running", stage: r.stage, run: r.id, progress: r.progress, t0: NOW - Math.round(r.progress * 38) * MIN });
    else if (r.media === "audio") fj({ id: "job_" + r.id, title: r.title, part: "score", lane: "box.chrome", model: "Suno v6 + v6-wild · serial", dur: 32, status: "running", progress: r.progress, t0: NOW - 11 * MIN, run: r.id, src: "fixture" });
  });
  fj({ id: "job_sweep01", title: "Forge sweep-01 · 20 plates", part: "frames", lane: "gpu.local", model: "Flux 2 dev fp8 · ComfyUI", dur: 32, status: "done", t0: T("2026-10-14T01:30:00Z"), run: "2026-08-26-sweep-01", units: 20, unit: "plate" });
  fj({ id: "job_strips", title: "Strips · 12 edu cards", part: "strips", lane: "box.render", model: "strips · HTML/SVG 240f", dur: 9, status: "done", t0: T("2026-10-13T21:50:00Z"), run: "strips-edu-0913", units: 12, unit: "card" });
  fj({ id: "job_dojo", title: "Dojo · 2 cycles", part: "frames", lane: "cloud.google", model: "Nano Banana · Gemini judge", dur: 40, usd: 0.9, status: "done", t0: T("2026-10-14T00:40:00Z"), run: "dojo-cycles-0901", src: "illustrative" });

  const jobById = () => Object.fromEntries(jobs.map((j) => [j.id, j]));
  const projectById = (id) => projects.find((p) => p.id === id);
  function jobsOf(pid) { return jobs.filter((j) => j.pid === pid); }
  function deps(j) { if (!j.pid) return []; return j.depKeys.map((k) => jobs.find((x) => x.pid === j.pid && x.key === k)).filter(Boolean); }
  function dependents(j) { if (!j.pid) return []; return jobs.filter((x) => x.pid === j.pid && x.depKeys.includes(j.key)); }
  function upstream(j, acc = new Set()) { deps(j).forEach((d) => { if (!acc.has(d.id)) { acc.add(d.id); upstream(d, acc); } }); return acc; }
  function downstream(j, acc = new Set()) { dependents(j).forEach((d) => { if (!acc.has(d.id)) { acc.add(d.id); downstream(d, acc); } }); return acc; }

  /* ── the scheduler: fixed history, then a list schedule forward from NOW ─ */
  function schedule() {
    const laneFree = {}; LANES.forEach((l) => (laneFree[l.id] = Array(l.cap).fill(NOW)));
    jobs.forEach((j) => { j.s = null; j.e = null; j.waitingOn = null; });
    // history and live work keep their real clock
    jobs.forEach((j) => {
      if (j.status === "done" || j.status === "failed" || j.status === "running" || j.status === "gate") {
        j.s = j.t0 != null ? j.t0 : NOW - j.dur * MIN; j.e = j.status === "gate" ? Math.max(NOW, j.s + (j.dur || 0) * MIN) : j.s + j.dur * MIN;
        if (j.status === "running") { j.e = Math.max(j.e, NOW + 3 * MIN); const slots = laneFree[j.lane]; if (slots) { slots.sort((a, b) => a - b); slots[0] = Math.max(slots[0], j.e); } }
        if (j.status === "failed") j.e = j.s + Math.max(6, j.dur * 0.2) * MIN;
      }
    });
    // forward: repeatedly place the earliest-ready job by order.
    // A failed or paused job is drawn as if released NOW (hatched), and everything after it carries blockedBy.
    jobs.forEach((j) => { j.blockedBy = null; j.afterGate = null; });
    jobs.forEach((j) => { if (j.status === "paused") { j.s = NOW; j.e = NOW + Math.max(10, j.dur) * MIN; } });
    const pending = jobs.filter((j) => j.s == null && (!j.pid || projectById(j.pid).launched !== false));
    let guard = 0;
    while (pending.length && guard++ < 4000) {
      let best = null, bestT = Infinity;
      pending.forEach((j) => {
        let t = NOW, ok = true; j.blockedBy = null; j.afterGate = null;
        deps(j).forEach((d) => {
          if (d.e == null) { ok = false; return; }
          if (d.status === "failed" || d.status === "paused") { j.blockedBy = d; t = Math.max(t, NOW + d.dur * MIN); return; }
          if (d.blockedBy) j.blockedBy = d.blockedBy;
          if (d.status === "gate" || d.afterGate) j.afterGate = d.status === "gate" ? d : d.afterGate;
          t = Math.max(t, d.e);
        });
        if (!ok) return;
        if (j.lane !== "gate" && j.lane !== "calendar" && !j.blockedBy) { const slots = laneFree[j.lane]; t = Math.max(t, Math.min(...slots)); }
        const key = t + j.order * 1e-3;
        if (key < bestT) { bestT = key; best = j; }
      });
      if (!best) break;
      const t = Math.floor(bestT);
      best.s = t;
      if (best.lane === "gate") best.e = t + 20 * MIN; // drawn width only — the verdict is the operator's
      else if (best.lane === "calendar") best.e = t + 10 * MIN;
      else { best.e = t + best.dur * MIN; if (!best.blockedBy) { const slots = laneFree[best.lane]; const i = slots.indexOf(Math.min(...slots)); slots[i] = best.e; } }
      pending.splice(pending.indexOf(best), 1);
    }
    // slots: tie a project's slot to its real calendar slot when one exists
    projects.forEach((p) => {
      const sl = jobs.find((j) => j.pid === p.id && j.part === "slot");
      const real = M.slots.filter((s) => s.projectId === p.id && s.status !== "cancelled").sort((a, b) => a.at - b.at);
      if (sl && real.length) { const fut = real.find((s) => s.at.getTime() >= (sl.s || NOW)) || real[real.length - 1]; sl.slot = fut.id; if (sl.status !== "done") { sl.s = Math.max(sl.s || 0, fut.at.getTime()); sl.e = sl.s + 10 * MIN; } }
    });
    return jobs;
  }

  function projectTotals(pid) {
    const js = jobsOf(pid); let usd = 0, spent = 0, min = 0, lo = 0, hi = 0;
    const byLane = {};
    js.forEach((j) => {
      if (j.part === "gate" || j.part === "slot") return;
      usd += j.usd; min += j.dur;
      if (j.usdRange) { lo += j.usdRange[0]; hi += j.usdRange[1]; } else { lo += j.usd; hi += j.usd; }
      if (j.status === "done" || j.status === "running") spent += j.usd;
      const b = (byLane[j.lane] = byLane[j.lane] || { min: 0, usd: 0, n: 0 }); b.min += j.dur; b.usd += j.usd; b.n++;
    });
    const ends = js.filter((j) => j.e != null && j.part !== "slot").map((j) => j.e);
    const slotJob = js.find((j) => j.part === "slot");
    const eta = ends.length ? Math.max(...ends) : null;
    const count = (st) => js.filter((j) => j.status === st).length;
    const st = count("failed") || count("blocked") ? "blocked" : count("gate") ? "awaiting_gate" : count("running") ? "running" : js.every((j) => j.status === "done") ? "ratified" : count("queued") ? "queued" : "draft";
    return { slotAt: slotJob && slotJob.s, slotId: slotJob && slotJob.slot, usd: +usd.toFixed(2), spent: +spent.toFixed(2), lo: +lo.toFixed(2), hi: +hi.toFixed(2), min, byLane, eta, state: st, gates: count("gate"), running: count("running"), failed: count("failed") + count("blocked"), paused: count("paused"), n: js.length, done: count("done") };
  }

  /* ── management: every act returns a description for the ledger ──────── */
  function applyOpt(j, i) { const o = CATALOG[j.part].opts[i]; j.opt = i; j.lane = o.lane; j.model = o.model; j.dur = Math.max(2, Math.round(o.min * Math.max(1, j.units))); j.usd = +(o.usd * Math.max(1, j.units)).toFixed(2); j.usdRange = o.usdRange || null; j.src = o.src; }
  function snapshot() { return jobs.map((j) => ({ j, opt: j.opt, lane: j.lane, model: j.model, dur: j.dur, usd: j.usd, usdRange: j.usdRange, src: j.src, status: j.status, order: j.order, attempt: j.attempt })); }
  function restore(snap) { snap.forEach((x) => Object.assign(x.j, { opt: x.opt, lane: x.lane, model: x.model, dur: x.dur, usd: x.usd, usdRange: x.usdRange, src: x.src, status: x.status, order: x.order, attempt: x.attempt })); }
  // what an act would do, before it is done: Δ ETA of the project, Δ cost, new queue position
  function preview(j, mutate) {
    const pid = j.pid; schedule();
    const before = pid ? projectTotals(pid) : null; const s0 = j.s;
    const snap = snapshot(); mutate(j); schedule();
    const after = pid ? projectTotals(pid) : null; const s1 = j.s; const q = queuePos(j);
    restore(snap); schedule();
    return { dEta: before && after && before.eta && after.eta ? after.eta - before.eta : 0, dUsd: before && after ? +(after.usd - before.usd).toFixed(2) : 0, dStart: s0 != null && s1 != null ? s1 - s0 : 0, queue: q, eta: after && after.eta };
  }
  function queuePos(j) {
    if (j.lane === "gate" || j.lane === "calendar") return null;
    const ahead = jobs.filter((x) => x.lane === j.lane && x !== j && x.s != null && j.s != null && x.e > NOW && x.s <= j.s && x.status !== "done");
    return ahead.length + 1;
  }
  function reroute(j, i) { const from = j.model + " @ " + laneById[j.lane].label; applyOpt(j, i); if (j.status === "failed" || j.status === "blocked") { j.status = "queued"; j.attempt++; } schedule(); return { type: "job.reroute", note: from + " → " + j.model + " @ " + laneById[j.lane].label }; }
  function pause(j) { j.prev = j.status; j.status = "paused"; schedule(); return { type: "job.pause", note: "held at " + (j.prev || "queued") }; }
  function resume(j) { j.status = j.prev === "running" ? "running" : "queued"; schedule(); return { type: "job.resume", note: "back to " + j.status }; }
  function retry(j) { j.status = "queued"; j.attempt++; j.error = null; schedule(); return { type: "job.retry", note: "attempt " + j.attempt + " · same route" }; }
  function move(j, dir) {
    const lane = jobs.filter((x) => x.lane === j.lane && (x.status === "queued" || x.status === "planned") && x.s != null).sort((a, b) => a.s - b.s);
    const i = lane.indexOf(j); const k = lane[i + dir]; if (!k) return null;
    const a = j.order; j.order = k.order; k.order = a;
    if (dir < 0 && j.order >= k.order) j.order = k.order - 0.5;
    if (dir > 0 && j.order <= k.order) j.order = k.order + 0.5;
    schedule(); return { type: "job.reorder", note: (dir < 0 ? "ahead of " : "behind ") + (k.pid ? k.key : k.title) };
  }

  /* ── compose: a plan before launch (ghost jobs on real lanes) ──────────── */
  function compose(recipe, o) {
    const n = ++seq;
    const id = o.id || "new-" + n + "-" + Date.now().toString(36).slice(-4);
    const p = { id, title: o.title || "Untitled composition", template: recipe === "album" ? "music-video" : recipe === "explainer" ? "explainer" : o.template || "short-educational-video", discipline: recipe === "album" ? "music-video" : "educational", length: o.length || "1:00", style: o.style || null, src: "session", launched: false, draft: true, take: o.take, topic: o.topic };
    build(p, recipe, o.units || {}, {}, {});
    schedule();
    return p;
  }
  function discard(p) { const i = projects.indexOf(p); if (i >= 0) projects.splice(i, 1); for (let k = jobs.length - 1; k >= 0; k--) if (jobs[k].pid === p.id) jobs.splice(k, 1); schedule(); }
  function launch(p) { p.launched = true; p.draft = false; jobsOf(p.id).forEach((j) => { if (j.status === "planned") j.status = "queued"; }); schedule(); return p; }
  // composing previews a launched schedule
  function previewLaunch(p) { const was = p.launched; p.launched = true; schedule(); const t = projectTotals(p.id); const pos = {}; jobsOf(p.id).forEach((j) => (pos[j.id] = { s: j.s, e: j.e, q: queuePos(j) })); p.launched = was; schedule(); return { totals: t, pos }; }

  const fmtDur = (min) => { min = Math.round(min); if (min < 60) return min + "m"; const h = Math.floor(min / 60), m = min % 60; return h < 48 ? h + "h" + (m ? " " + String(m).padStart(2, "0") + "m" : "") : Math.round(h / 24) + "d"; };
  const fmtUsd = (n) => (n == null ? "—" : n === 0 ? "$0" : n < 1 ? "$" + n.toFixed(2) : "$" + (Math.round(n * 100) / 100).toFixed(n < 10 ? 2 : 0));

  // launched flags for seeds
  projects.forEach((p) => { if (p.launched === undefined) p.launched = true; if (p.launched) jobsOf(p.id).forEach((j) => { if (j.status === "planned") j.status = "queued"; }); });
  schedule();

  window.GT_STUDIO = { NOW, MIN, H, LANES, laneById, CATALOG, RECIPES, PART_LABEL, recipeOfTemplate, projects, jobs, foundryJobs, schedule, projectTotals, jobsOf, deps, dependents, upstream, downstream,
    projectById, jobById, reroute, pause, resume, retry, move, preview, queuePos, compose, discard, launch, previewLaunch, fmtDur, fmtUsd };
})();
