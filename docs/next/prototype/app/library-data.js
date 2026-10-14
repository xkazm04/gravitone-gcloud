/* library-data.js — the Library corpus. Pure data, no DOM.
   Real records from window.GT_MODEL (styles, media, fixture takes, fixture exports, registry
   topics), then a deterministic scaled illustration derived from them so the corpus reaches
   exactly 5,000 items. Every item carries src: real | fixture | illustrative.
   window.GT_LIB = { items, real, KINDS, GROUPS, SHARED, label(key, value), groupLabel(key), byId, TOTAL } */
(function () {
  "use strict";
  const M = window.GT_MODEL;
  const F = window.GT_FIXTURES || { takes: [], hunts: [], exports: [] };
  const TOTAL = 5000;

  const KINDS = [
    { id: "all", label: "All", icon: "grid" },
    { id: "image", label: "Images · references", short: "image", icon: "ref" },
    { id: "plate", label: "Plates", short: "plate", icon: "image" },
    { id: "style", label: "Styles", short: "style", icon: "style" },
    { id: "motion", label: "Motion", short: "motion", icon: "motion" },
    { id: "audio", label: "Audio", short: "audio", icon: "audio" },
    { id: "video", label: "Video", short: "video", icon: "video" },
    { id: "doc", label: "Documents", short: "document", icon: "doc" },
  ];
  const OBS = ["render_mode", "palette_strategy", "black_handling", "atmospherics", "edge_treatment", "detail_density", "surface_realism"];
  // facet groups per kind — keys into item.f; the vocabulary is read from the data, never typed here
  const GROUPS = {
    all: [],
    image: ["set", "scene", "style", "aspect"],
    plate: ["style", "family", ...OBS, "station", "mechanism", "lesson"],
    style: ["family", ...OBS, "derivation"],
    motion: ["subject", "format"],
    audio: ["type", "genre", "mood", "instrument", "provider", "group", "stage"],
    video: ["format", "captions"],
    doc: ["bundle", "techniques"],
  };
  const SHARED = { state: ["state"], collections: ["project", "run", "hunt", "pin"], origin: ["src"], attention: ["attention"] };
  const STATES = ["reference", "candidate", "ratified", "rejected", "unjudged"];
  const GROUP_LABEL = { render_mode: "render mode", palette_strategy: "palette", black_handling: "blacks", atmospherics: "atmospherics", edge_treatment: "edges",
    detail_density: "detail density", surface_realism: "surface realism", src: "origin", pin: "pinned", project: "projects", run: "runs", hunt: "hunts", attention: "attention" };

  const dateOf = (s) => { const m = /(\d{4}-\d{2}-\d{2})/.exec(s || ""); return m ? m[1] + "T12:00:00Z" : null; };
  const cap = (s) => String(s || "").replace(/^\w/, (c) => c.toUpperCase());
  const words = (s) => String(s || "").replace(/[-_]/g, " ");
  const aspectOf = (w, h) => { if (!w || !h) return null; const r = w / h; return r > 1.7 ? "16:9" : r > 1.42 ? "3:2" : r > 1.2 ? "4:3" : r >= 0.95 ? "1:1" : "portrait"; };
  const styleById = M.styleById;
  const projById = Object.fromEntries(M.projects.map((p) => [p.id, p]));
  // run ids for lanes that are not encoded in a media record, read from the model's run list
  const runOf = (lane) => (M.runs.find((r) => r.lane === lane && r.status === "awaiting_gate") || {}).id || null;
  const RUN = { audio: runOf("audio"), dojo: runOf("dojo"), strips: runOf("strips") };

  const items = [];
  const byId = new Map();
  function add(o) {
    o.f = o.f || {};
    o.f.state = [o.state];
    o.f.src = [o.src];
    o.f.kind = [o.kind];
    ["project", "run", "hunt", "attention"].forEach((k) => { if (!o.f[k]) o.f[k] = []; });
    o.f.pin = [];
    o.t = o.date ? Date.parse(o.date) : 0;
    o.n = items.length;
    items.push(o);
    byId.set(o.id, o);
    return o;
  }
  function styleFacets(sid) {
    const s = styleById[sid];
    const f = { style: sid ? [sid] : [] };
    if (!s) return f;
    f.family = [s.family];
    OBS.forEach((k) => { if (s.observables && s.observables[k]) f[k] = [s.observables[k]]; });
    return f;
  }
  const consumers = (sid) => M.projects.filter((p) => p.style === sid).map((p) => p.id);

  /* ── styles (27, real) ── */
  M.styles.forEach((s) => {
    const ev = s.evidence || [];
    const last = ev.map((e) => e.at).sort().pop();
    const f = styleFacets(s.id);
    delete f.style;
    f.derivation = [s.origin && s.origin.kind].filter(Boolean);
    f.project = consumers(s.id);
    f.run = [...new Set(ev.map((e) => e.run))];
    if (s.origin && s.origin.kind === "extracted" && s.origin.source) f.run.push(s.origin.source);
    add({ id: s.id, kind: "style", sub: "style", title: s.name, meta: s.family + " · " + (s.origin ? s.origin.kind : ""),
      state: s.status === "proven" ? "ratified" : "candidate", src: "real", date: last || dateOf(s.origin && s.origin.source),
      url: s.hero, style: s, f });
  });

  /* ── media (104, real) ── */
  const forgeByScene = {};
  M.media.filter((m) => m.kind === "forge.candidate").forEach((m) => { (forgeByScene[m.scene] = forgeByScene[m.scene] || new Set()).add(m.style); });
  const stripPoster = {};
  M.media.filter((m) => m.kind === "strip.poster").forEach((m) => { stripPoster[m.card] = m.url; });
  M.media.forEach((m) => {
    const base = { id: m.file, url: m.url, w: m.w, h: m.h, src: "real", media: m };
    const asp = aspectOf(m.w, m.h);
    if (m.kind === "forge.source") {
      add({ ...base, kind: "image", sub: "forge.source", title: cap(words(m.scene)), meta: "forge · " + m.scene, state: "reference", date: "2026-08-26T12:00:00Z",
        f: { set: [m.run], scene: [m.scene], style: [...(forgeByScene[m.scene] || [])], aspect: [asp], run: [m.run] } });
    } else if (m.kind === "extract.source") {
      const r = M.extractRuns[m.run];
      const s = (/src-(s\d+)/.exec(m.file) || [])[1] || "src";
      add({ ...base, kind: "image", sub: "extract.source", title: "Gallery " + s + " · " + m.run.replace(/^\d{4}-\d{2}-\d{2}-/, ""), meta: "extract · " + m.run,
        state: "reference", date: dateOf(m.run), f: { set: [m.run], style: r ? Object.keys(r.looks) : [], aspect: [asp], run: [m.run] } });
    } else if (m.kind === "forge.candidate") {
      const st = styleById[m.style];
      const f = styleFacets(m.style);
      f.station = ["forge"]; f.mechanism = [m.mechanism]; f.run = [m.run]; f.project = consumers(m.style); f.scene = [m.scene];
      add({ ...base, kind: "plate", sub: "forge.candidate", title: (st ? st.name : m.style) + " · " + m.scene, meta: m.mechanism + " · " + (m.candidate || "").split("--").pop(),
        state: m.verdict === "keep" ? "ratified" : m.verdict === "reject" ? "rejected" : "unjudged", src: "real", date: "2026-08-27T07:13:28Z", f });
    } else if (m.kind === "extract.replica" || m.kind === "extract.transfer") {
      const role = m.kind === "extract.replica" ? "replica" : "transfer";
      const st = styleById[m.style];
      const f = styleFacets(m.style);
      f.station = ["extract · " + role]; f.run = [m.run]; f.project = consumers(m.style);
      const tag = role === "replica" ? (/replica-(s\d+)/.exec(m.file) || [])[1] || "" : "transfer";
      add({ ...base, kind: "plate", sub: m.kind, title: (st ? st.name : cap(words(m.style))) + " · " + (role === "replica" ? "replica " + tag : "transfer"),
        meta: "extract · " + m.run.replace(/^\d{4}-\d{2}-\d{2}-/, ""), state: "unjudged", date: dateOf(m.run), f });
    } else if (m.kind === "dojo.thumb") {
      const lesson = m.cycle.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/^nb-/, "").replace(/--imp-\d+$/, "");
      const gen = /-nb-/.test(m.cycle) ? "generator b" : "generator a";
      add({ ...base, kind: "plate", sub: "dojo.thumb", title: cap(words(lesson)) + " · " + gen, meta: "dojo · " + m.cycle.slice(0, 10), state: "unjudged",
        date: dateOf(m.cycle), f: { station: ["dojo"], lesson: [lesson], run: [RUN.dojo].filter(Boolean), aspect: [asp] } });
    } else if (m.kind === "strip.poster" || m.kind === "strip.video") {
      const [subj, ...rest] = m.card.split("--");
      const clip = m.kind === "strip.video";
      add({ ...base, kind: "motion", sub: m.kind, title: cap(subj.replace(/^edu-/, "")) + " · " + rest.join(" ") + (clip ? " · clip" : ""),
        meta: (clip ? "mp4 · " : "poster · ") + m.card, state: "unjudged", date: "2026-10-13T22:05:00Z",
        url: clip ? stripPoster[m.card] || null : m.url, video: clip ? m.url : (M.media.find((v) => v.kind === "strip.video" && v.card === m.card) || {}).url || null,
        f: { subject: [subj.replace(/^edu-/, "")], format: [clip ? "clip" : "poster"], run: [RUN.strips].filter(Boolean) } });
    }
  });

  /* ── audio takes (79, fixture) ── */
  const huntOfPrompt = {};
  (F.hunts || []).forEach((h) => h.nodes.forEach((n) => { huntOfPrompt[n.prompt] = { hunt: h, node: n }; }));
  const huntLabel = {};
  (F.hunts || []).forEach((h) => { huntLabel[h.id] = cap((h.idea.split(/[,.;:]/)[0] || h.id).replace(/^(The|One|A|An) /, "").split(" ").slice(0, 6).join(" ")); });
  M.takes.forEach((t) => {
    const hn = huntOfPrompt[t.prompt];
    add({ id: t.id, kind: "audio", sub: t.kind, title: t.title, meta: [t.tempoBpm ? t.tempoBpm + " bpm" : null, t.key, M.fmt.dur(t.durationS)].filter(Boolean).join(" · "),
      state: t.verdict === "kept" ? "ratified" : t.verdict === "rejected" ? "rejected" : "unjudged", src: "fixture", date: t.createdAt,
      audio: t.url, peaks: t.peaks, take: t, huntNode: hn ? hn.node : null,
      f: { type: [t.kind], genre: t.terms.genre || [], mood: t.terms.mood || [], instrument: t.terms.instrument || [], provider: [t.provider], group: [t.group].filter(Boolean),
        stage: [t.stage].filter(Boolean), project: [t.projectId].filter(Boolean), hunt: hn ? [hn.hunt.id] : [], run: t.verdict === "unjudged" && RUN.audio ? [RUN.audio] : [] } });
  });

  /* ── video exports (9, fixture) ── */
  const inPacket = new Set(M.packets.filter((p) => p.export).map((p) => p.export.id));
  const pktAt = Object.fromEntries(M.packets.filter((p) => p.export).map((p) => [p.export.id, p.createdAt]));
  M.exports.forEach((e) => {
    const p = projById[e.projectId];
    const cut = p ? p.steps.find((s) => s.key === "cut") : null;
    const capt = e.captions ? (/^WEBVTT/.test(e.captions) ? "vtt" : "srt") : "none";
    const chan = [...new Set((F.slots || []).filter((s) => s.exportId === e.id).map((s) => s.channelId))];
    add({ id: e.id, kind: "video", sub: e.kind, title: (p ? p.title : e.projectId) + " · " + (e.kind === "ad" ? "ad spot" : "music video"), meta: e.id.slice(0, 8) + " · captions " + capt,
      state: inPacket.has(e.id) ? "unjudged" : cut && cut.state === "ratified" ? "ratified" : "unjudged", src: "fixture", date: pktAt[e.id] || null,
      video: M.D + e.file, exp: e, chan, pstyle: p ? p.style : null, f: { format: [e.kind], captions: [capt], project: [e.projectId] } });
  });

  /* ── documents: registry topics (123, real) ── */
  const band = (n) => (n <= 4 ? "1–4" : n <= 8 ? "5–8" : n <= 15 ? "9–15" : "16+");
  const artRun = Object.fromEntries(M.articleRuns.map((a) => [a.topic.slug, a]));
  M.topics.forEach((t) => {
    const ar = artRun[t.slug];
    add({ id: "topic:" + t.slug, kind: "doc", sub: "topic", title: cap(t.title), meta: t.bundle + " · " + t.techniques + " techniques", state: "reference", src: "real", date: null,
      topic: t, articleRun: ar || null, f: { bundle: [t.bundle], techniques: [band(t.techniques)], run: ar ? [ar.runId] : [] } });
  });

  const REAL = items.length;

  /* ── media that cannot lead: flagged unreadable (probed in the browser) or missing (no file at all) ── */
  const NEEDS_MEDIA = new Set(["image", "plate", "motion", "video"]);
  function flag(it, why) {
    if (it.bad) return false;
    it.bad = why;
    it.f.attention = ["needs-attention"];
    if (it.nf) it.nf.attention = "needs attention|needs attention";
    return true;
  }

  /* ── scaled illustration: deterministic, every item derived from a real parent ── */
  let seed = 0x5eed2026;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const some = (a, lo, hi) => { const n = lo + Math.floor(rnd() * (hi - lo + 1)); const out = new Set(); for (let i = 0; i < n * 3 && out.size < n; i++) out.add(pick(a)); return [...out]; };
  const weighted = (pairs) => { const r = rnd() * pairs.reduce((s, p) => s + p[1], 0); let a = 0; for (const p of pairs) { a += p[1]; if (r < a) return p[0]; } return pairs[0][0]; };
  const T0 = Date.parse("2025-11-03T00:00:00Z"), T1 = Date.parse("2026-10-13T20:00:00Z");
  const randDate = () => new Date(T0 + Math.floor(rnd() * (T1 - T0))).toISOString();
  const vocab = (key, kind) => [...new Set(items.filter((i) => i.kind === kind).flatMap((i) => i.f[key] || []))];
  const parents = (k) => items.filter((i) => i.kind === k);
  const V = { genre: vocab("genre", "audio"), mood: vocab("mood", "audio"), instrument: vocab("instrument", "audio"), provider: vocab("provider", "audio"),
    key: [...new Set(M.takes.map((t) => t.key).filter(Boolean))], scene: Object.keys(forgeByScene), lesson: vocab("lesson", "plate") };
  const obsVocab = Object.fromEntries(OBS.map((k) => [k, [...new Set(M.styles.map((s) => s.observables && s.observables[k]).filter(Boolean))]]));
  const posters = M.media.filter((m) => m.kind === "strip.poster").map((m) => m.url);
  const PROJ = M.projects.map((p) => p.id);
  const share = [["image", 0.17], ["plate", 0.37], ["style", 0.025], ["motion", 0.07], ["audio", 0.225], ["video", 0.03], ["doc", 0.11]];
  const ILL = TOTAL - REAL;
  const quota = share.map(([k, w]) => [k, Math.round(ILL * w)]);
  quota[1][1] += ILL - quota.reduce((s, q) => s + q[1], 0); // plates absorb rounding
  let n = 0;
  const nextId = () => "ill-" + String(++n).padStart(5, "0");
  const seq = () => 100 + Math.floor(rnd() * 9800);
  quota.forEach(([kind, count]) => {
    const pool = parents(kind);
    for (let i = 0; i < count; i++) {
      const p = pick(pool);
      const o = { id: nextId(), kind, sub: p.sub, parent: p.id, src: "illustrative", date: randDate(), url: p.url, w: p.w, h: p.h, f: {} };
      const proj = rnd() < 0.14 ? [pick(PROJ)] : [];
      if (kind === "image") {
        const scene = p.f.scene ? pick(V.scene) : null;
        o.title = (scene ? cap(words(scene)) : p.title.split(" · ")[0]) + " · frame " + String(seq()).padStart(4, "0");
        o.meta = (p.sub === "forge.source" ? "forge" : "extract") + " · " + (scene || p.f.set[0]);
        o.state = "reference";
        o.f = { set: p.f.set, scene: scene ? [scene] : [], style: p.f.style, aspect: p.f.aspect, project: proj };
      } else if (kind === "plate") {
        const scene = pick(V.scene), s = seq();
        o.title = p.title.split(" · ")[0] + " · " + (p.sub === "dojo.thumb" ? pick(V.lesson).replace(/-/g, " ") : scene);
        o.meta = (p.f.mechanism ? p.f.mechanism[0] + " · " : "") + "s" + s;
        o.state = weighted([["ratified", 0.26], ["rejected", 0.3], ["unjudged", 0.44]]);
        o.f = { ...p.f, scene: p.sub === "forge.candidate" ? [scene] : [], project: proj.length ? proj : p.f.project, run: [], hunt: [] };
      } else if (kind === "style") {
        const obs = Object.assign({}, p.style ? p.style.observables : p.obs);
        const swaps = 1 + Math.floor(rnd() * 2);
        for (let k = 0; k < swaps; k++) { const key = pick(OBS); obs[key] = pick(obsVocab[key]); }
        const base = p.style || p;
        o.title = (base.name || p.title) + " · v" + (2 + Math.floor(rnd() * 9));
        o.meta = (p.f.family || [""])[0] + " · variant";
        o.state = weighted([["candidate", 0.82], ["ratified", 0.08], ["rejected", 0.1]]);
        o.obs = obs; o.recipe = base.recipe || null;
        o.f = { family: p.f.family, derivation: p.f.derivation, project: proj };
        OBS.forEach((k) => { if (obs[k]) o.f[k] = [obs[k]]; });
      } else if (kind === "motion") {
        const subj = p.f.subject[0];
        o.url = pick(posters); o.video = null;
        o.title = cap(subj) + " · E" + (20 + Math.floor(rnd() * 80));
        o.meta = "poster · edu-" + subj;
        o.state = weighted([["ratified", 0.3], ["rejected", 0.2], ["unjudged", 0.5]]);
        o.f = { subject: [subj], format: ["poster"], project: proj };
      } else if (kind === "audio") {
        const t = p.take;
        const pk = p.peaks || [];
        const rot = Math.floor(rnd() * pk.length);
        const amp = 0.75 + rnd() * 0.3;
        o.peaks = pk.length ? pk.slice(rot).concat(pk.slice(0, rot)).map((v) => Math.min(1, +(v * amp).toFixed(3))) : null;
        o.audio = p.audio;
        const mood = some(V.mood, 1, 2), genre = rnd() < 0.5 ? (t.terms.genre || []).slice(0, 1) : [pick(V.genre)];
        const bpm = t.tempoBpm ? Math.max(50, Math.round(t.tempoBpm + (rnd() - 0.5) * 40)) : null;
        const dur = Math.max(2, Math.round((t.durationS || 30) * (0.6 + rnd() * 0.9)));
        o.title = cap(mood[0]) + " " + (genre[0] || t.kind) + " · take " + (1 + Math.floor(rnd() * 40));
        o.meta = [bpm ? bpm + " bpm" : null, pick(V.key), M.fmt.dur(dur)].filter(Boolean).join(" · ");
        o.bpm = bpm; o.dur = dur;
        o.state = weighted([["ratified", 0.3], ["rejected", 0.38], ["unjudged", 0.32]]);
        o.f = { type: [t.kind], genre, mood, instrument: some(V.instrument, 1, 3), provider: [pick(V.provider)], group: p.f.group, stage: [], project: proj };
      } else if (kind === "video") {
        const pid = pick(PROJ), fmtK = rnd() < 0.7 ? "music-video" : "ad";
        o.url = pick(posters); o.video = null;
        o.title = projById[pid].title + " · " + (fmtK === "ad" ? "ad spot " + (1 + Math.floor(rnd() * 12)) : "cut v" + (2 + Math.floor(rnd() * 14)));
        o.meta = "poster · " + fmtK;
        o.state = weighted([["ratified", 0.4], ["rejected", 0.25], ["unjudged", 0.35]]);
        o.f = { format: [fmtK], captions: [pick(["none", "srt", "vtt"])], project: [pid] };
      } else if (kind === "doc") {
        o.title = p.title + " · note " + (1 + Math.floor(rnd() * 24));
        o.meta = p.f.bundle[0] + " · excerpt";
        o.state = "reference"; o.topic = p.topic;
        o.f = { bundle: p.f.bundle, techniques: p.f.techniques, project: proj };
      }
      add(o);
    }
  });

  items.forEach((i) => { if (NEEDS_MEDIA.has(i.kind) && !i.url && !i.video) flag(i, "missing"); });

  // haystack for free-text search: title, ids, every facet value
  items.forEach((i) => {
    const vals = Object.entries(i.f).filter(([k]) => k !== "src" && k !== "kind").flatMap(([, v]) => v);
    i.hay = (i.title + " " + i.id + " " + (i.meta || "") + " " + (i.parent || "") + " " + vals.join(" ")).toLowerCase().replace(/[-_]/g, " ");
  });

  const label = (key, v) => {
    if (key === "style") return styleById[v] ? styleById[v].name : words(v);
    if (key === "project") return projById[v] ? projById[v].title : v;
    if (key === "hunt") return huntLabel[v] || v;
    if (key === "run" || key === "set") return v;
    if (key === "src" || key === "state") return v;
    return words(v);
  };
  const groupLabel = (key) => GROUP_LABEL[key] || words(key);

  window.GT_LIB = { items, REAL, TOTAL, KINDS, GROUPS, SHARED, STATES, OBS, byId, flag, label, groupLabel, huntLabel, projById };
})();
