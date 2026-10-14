/* model.js — the design's records, derived from real data (window.GRAVITONE) and the
   inlined fixture universe (window.GT_FIXTURES). Pure data, no DOM: ports to lib/ as-is.

   Records follow the round-1 design "Atelier & Assembly":
     Foundry (upstream mill)  -> runs         status: draft | running | awaiting_gate | ratified | blocked
     Board   (sovereign gate) -> packets      deskMode: matrix-cull | blind-pair | packet-review
     Library (ratified shelf) -> shelf        locked styles, motion styles, kept takes, prompt pins
     Projects (clock-locked)  -> projects     research -> script -> frames -> motion -> score -> cut
     Calendar                 -> slots        fixture schedule + publications + metrics
   Every BoardDecisionRecord carries actorKind:"human" — the gate is the operator's. */
(function () {
  const G = window.GRAVITONE || { styles: { styles: [] }, topics: [], media: [], projects: {} };
  const F = window.GT_FIXTURES || { takes: [], hunts: [], slots: [], publications: [], metrics: [], exports: [] };
  const D = "../data/";
  const url = (f) => (f ? D + f : null);

  // The studio clock. Fixture slots are written around this instant.
  const NOW = new Date("2026-10-14T09:12:00Z");

  // ---- styles -------------------------------------------------------------
  const media = G.media.map((m, i) => ({ ...m, idx: i, url: url(m.file) }));
  const styleOfCandidate = (c) => (c ? c.split("/")[1].split("--")[0] : null);
  const mechOfCandidate = (c) => (c ? c.split("--")[1] : null);
  media.forEach((m) => {
    if (m.kind === "forge.candidate") { m.style = styleOfCandidate(m.candidate); m.mechanism = mechOfCandidate(m.candidate); }
  });

  const styles = G.styles.styles.map((s) => {
    const ev = s.evidence || [];
    const keep = ev.filter((e) => e.verdict === "keep").length;
    const reject = ev.filter((e) => e.verdict === "reject").length;
    const scenes = [...new Set(ev.filter((e) => e.verdict === "keep").map((e) => e.scene))];
    const plates = media.filter((m) => m.style === s.id && /forge\.candidate|extract\.(replica|transfer)/.test(m.kind));
    return {
      ...s, keep, reject, scenes, plates,
      shelf: s.status === "proven",               // ratified -> on the /library shelf
      originLabel: s.origin && s.origin.kind,
      hero: plates[0] ? plates[0].url : null,
    };
  });
  const styleById = Object.fromEntries(styles.map((s) => [s.id, s]));

  // Extracted look groups (not yet in styles.json unless named there).
  const extractRuns = {};
  media.filter((m) => m.kind.startsWith("extract.")).forEach((m) => {
    const r = (extractRuns[m.run] = extractRuns[m.run] || { id: m.run, sources: [], looks: {} });
    if (m.kind === "extract.source") r.sources.push(m);
    else {
      const L = (r.looks[m.style] = r.looks[m.style] || { id: m.style, replicas: [], transfers: [], inCatalogue: !!styleById[m.style] });
      (m.kind === "extract.replica" ? L.replicas : L.transfers).push(m);
    }
  });

  // ---- calibration guard (SYSTEM.md, measured) ------------------------------
  const calibration = {
    craft: { auc: 0.29, status: "inverted", rows: 87 },
    style_score: { auc: 0.58, status: "chance", rows: 87 },
    dojo_judge: { auc: 0.69, status: "calibrated" },
    reflectBacklog: { unreflected: 13, of: 17 },
  };

  // ---- audio --------------------------------------------------------------
  const takes = F.takes.map((t) => ({ ...t, url: url(t.file) }));
  const unjudged = takes.filter((t) => t.verdict === "unjudged");
  const keptTakes = takes.filter((t) => t.verdict === "kept");

  // ---- articles -------------------------------------------------------------
  const topics = G.topics;
  const T = (slug) => topics.find((t) => t.slug === slug);
  const ARTICLE_STAGES = ["research", "outline", "draft", "critique", "check", "awaiting_gate"];
  const articleRuns = [
    { topic: T("generative-provider-routing"), stage: "awaiting_gate", turn: 2, quorum: [3, 4] },
    { topic: T("judge-calibration-and-drift"), stage: "critique", turn: 1 },
    { topic: T("evidence-and-sources"), stage: "draft", turn: 1 },
    { topic: T("honest-proof-and-illustrative-data"), stage: "research", turn: 1 },
    { topic: T("admission-queue"), stage: "outline", turn: 1 },
    { topic: T("copy-quality-gates"), stage: "awaiting_gate", turn: 1, quorum: [4, 4] },
  ].filter((a) => a.topic).map((a, i) => ({ ...a, id: "art_" + a.topic.slug, runId: "run_art_10" + (14 + i) }));

  // ILLUSTRATIVE: the article pipeline's real draft text is not in this export.
  const illustrativeDraft = {
    slug: "generative-provider-routing",
    title: "Route the shot, not the vendor",
    standfirst: "One studio, four image vendors, one budget. What decides which model gets the next frame.",
    sections: [
      { id: "s1", h: "The frame decides", p: "A request for a plate is not a request to a vendor. It carries a style block, a reference count and a deadline; the router reads those three and only then picks a model. A frame that needs four references cannot go to a model that takes one." },
      { id: "s2", h: "Price per kept frame", p: "Cost per call is the wrong number. A vendor at half the price that is kept one time in five costs more than one that is kept every other time. The router ranks on kept frames per dollar, read from the cull ledger, not on list price." },
      { id: "s3", h: "Reroute on refusal, not on error", p: "A refusal is an answer about the prompt. An error is an answer about the vendor. The first goes back to the prompt with the refusal attached; the second crosses to the next vendor with the same prompt, inside the hourly budget." },
      { id: "s4", h: "The budget is a clock", p: "A five-dollar hourly budget is spent as a rate, not a pool. When the rate is exceeded the queue slows; it never silently swaps to a cheaper model the style was not proven on." },
      { id: "s5", h: "What stays human", p: "No route decision lands a frame. The router fills a packet; the operator keeps or rejects it. A vendor that wins on price but loses at the gate drops in rank on the next run." },
    ],
    checks: [ { name: "deterministic checks", value: "0 errors", ok: true }, { name: "fact grounding", value: "11/12 claims sourced", ok: true }, { name: "reviewer quorum", value: "3/4 approve", ok: true } ],
    reviewers: [
      { who: "reviewer A", vote: "approve", note: "§2 is the post. Lead with it." },
      { who: "reviewer B", vote: "approve", note: "§3 distinction is sharp; keep the wording." },
      { who: "reviewer C", vote: "request", note: "§4 overstates: 'never' needs the exception for unproven styles." },
      { who: "reviewer D", vote: "approve", note: "Ending lands; trim §5 by one sentence." },
    ],
  };

  // ---- foundry runs (upstream mill) ------------------------------------------
  const forgeCands = media.filter((m) => m.kind === "forge.candidate");
  const forgeSources = media.filter((m) => m.kind === "forge.source");
  const strips = media.filter((m) => m.kind === "strip.poster");
  const stripVideos = media.filter((m) => m.kind === "strip.video");
  const dojo = media.filter((m) => m.kind === "dojo.thumb");

  const runs = [
    { id: "2026-08-26-sweep-01", station: "style-lab", lane: "forge", media: "image", title: "Forge sweep · 5 scenes × 9 styles", status: "awaiting_gate",
      progress: 1, plates: forgeCands.length, engine: "Flux 2 dev fp8 · ComfyUI · local GPU", costUsd: 0, costNote: "local GPU", packet: "pkt_forge_sweep01" },
    ...Object.values(extractRuns).map((r) => ({ id: r.id, station: "style-lab", lane: "extract", media: "image",
      title: "Extract · " + Object.keys(r.looks).length + " looks from " + r.sources.length + " sources", status: "awaiting_gate", progress: 1,
      plates: Object.values(r.looks).reduce((n, L) => n + L.replicas.length + L.transfers.length, 0), engine: "extract.mts · qwen3.8:27b read-back · local GPU", costUsd: 0, costNote: "local GPU", packet: "pkt_extract_" + r.id })),
    { id: "strips-edu-0913", station: "motion-lab", lane: "strips", media: "video", title: "Motion strips · 3 edu cards", status: "awaiting_gate", progress: 1,
      plates: strips.length, engine: "pipeline/strips/run.mts · 240f HTML/SVG", costUsd: 0, costNote: "code-rendered", packet: "pkt_strips" },
    { id: "dojo-cycles-0901", station: "dojo", lane: "dojo", media: "image", title: "Dojo · same lesson, two generators", status: "awaiting_gate", progress: 1,
      plates: dojo.length, engine: "dojo cycle · judge AUC 0.69", costUsd: 0, costNote: "local GPU", packet: "pkt_dojo" },
    ...articleRuns.map((a) => ({ id: a.runId, station: "batch-mill", lane: "articles", media: "article", title: a.topic.title, topic: a.topic,
      status: a.stage === "awaiting_gate" ? "awaiting_gate" : "running", stage: a.stage, progress: (ARTICLE_STAGES.indexOf(a.stage) + 1) / ARTICLE_STAGES.length,
      engine: "lib/articles · 4-model critique", costRange: [47, 92], costNote: "per run (pipeline hint)", packet: a.stage === "awaiting_gate" ? "pkt_" + a.id : null })),
    { id: "suno-batch-19", station: "batch-mill", lane: "audio", media: "audio", title: "Audio batch · " + unjudged.length + " takes", status: "awaiting_gate", progress: 1,
      plates: unjudged.length, engine: "Suno v6 serial CDP · ElevenLabs", costNote: "fixture", packet: "pkt_audio" },
    { id: "suno-queue-20", station: "batch-mill", lane: "audio", media: "audio", title: "Suno queue · 4 prompts", status: "running", progress: 0.35,
      plates: 8, engine: "Suno v6 + v6-wild · serial", costNote: "fixture", queue: 2 },
  ];

  // ---- board packets (sovereign gate) ----------------------------------------
  const digest = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return "sha256:" + (h >>> 0).toString(16).padStart(8, "0").slice(0, 4); };

  const cullItem = (m, extra) => ({ id: m.file, url: m.url, w: m.w, h: m.h, kind: m.kind, ledger: m.verdict || null, ...extra });

  const packets = [];
  packets.push({
    id: "pkt_forge_sweep01", origin: "foundry", sourceKind: "cull", deskMode: "matrix-cull", media: "image",
    title: "Forge · 2026-08-26-sweep-01", sub: forgeSources.length + " scenes · " + forgeCands.length + " plates",
    runId: "2026-08-26-sweep-01", projectId: null, createdAt: "2026-10-14T02:10:00Z",
    oracle: { passed: true, summary: "0 check errors · 20/20 plates rendered" }, spendUsd: 0, spendNote: "local GPU",
    sources: forgeSources.map((m) => ({ scene: m.scene, url: m.url })),
    rows: forgeSources.map((s) => ({ key: s.scene, label: s.scene, ref: s.url,
      items: forgeCands.filter((c) => c.scene === s.scene).map((c) => cullItem(c, { style: c.style, mechanism: c.mechanism, label: (styleById[c.style] || {}).name || c.style })) })),
  });
  Object.values(extractRuns).forEach((r) => packets.push({
    id: "pkt_extract_" + r.id, origin: "foundry", sourceKind: "extract", deskMode: "matrix-cull", media: "image",
    title: "Extract · " + r.id, sub: Object.keys(r.looks).length + " looks · " + r.sources.length + " sources",
    runId: r.id, projectId: null, createdAt: "2026-10-14T03:40:00Z",
    oracle: { passed: true, summary: "read-back ok · " + Object.keys(r.looks).length + " looks grouped" }, spendUsd: 0, spendNote: "local GPU",
    sources: r.sources.map((m) => ({ url: m.url })),
    rows: Object.values(r.looks).map((L) => ({ key: L.id, label: L.id, inCatalogue: L.inCatalogue,
      items: [...L.replicas.map((m) => cullItem(m, { role: "replica", label: L.id })), ...L.transfers.map((m) => cullItem(m, { role: "transfer", label: L.id }))] })),
  }));
  packets.push({
    id: "pkt_strips", origin: "foundry", sourceKind: "strips", deskMode: "matrix-cull", media: "video",
    title: "Strips · edu cards", sub: strips.length + " cards · 3 subjects", runId: "strips-edu-0913", projectId: null, createdAt: "2026-10-13T22:05:00Z",
    oracle: { passed: true, summary: "240f each · 0 render errors" }, spendUsd: 0, spendNote: "code-rendered",
    rows: ["edu-aqueduct", "edu-chokepoint", "edu-radar"].map((k) => ({ key: k, label: k,
      items: strips.filter((s) => s.card.startsWith(k)).map((s) => cullItem(s, { label: s.card.replace(k + "--", ""), video: (stripVideos.find((v) => v.card === s.card) || {}).url || null })) })),
  });
  // Blind pairs — every arm is a real render.
  const fc = (scene, style, mech) => forgeCands.find((c) => c.scene === scene && c.style === style && c.mechanism === mech);
  const stripP = (card) => strips.find((s) => s.card === card);
  const stripV = (card) => (stripVideos.find((v) => v.card === card) || {}).url || null;
  packets.push({
    id: "pkt_pairs_mech", origin: "foundry", sourceKind: "trials", deskMode: "blind-pair", media: "image",
    title: "Mechanism · text vs ref-early", sub: "3 blind pairs", projectId: null, createdAt: "2026-10-14T02:12:00Z",
    oracle: { passed: true, summary: "same seed · same scene · one variable" }, spendUsd: 0, spendNote: "local GPU",
    pairs: [["lotr-cavalry", "cold-photoreal-cg"], ["wow-helm", "cold-photoreal-cg"], ["wow-helm", "teal-orange-blockbuster"]].map(([sc, st], i) => {
      const a = fc(sc, st, "text"), b = fc(sc, st, "ref-early");
      return { id: "pair" + i, question: sc + " · " + st, a: { url: a.url, label: "text" }, b: { url: b.url, label: "ref-early" }, machinePick: i === 1 ? "a" : "b" };
    }),
  });
  packets.push({
    id: "pkt_strips_ctrl", origin: "foundry", sourceKind: "strips", deskMode: "blind-pair", media: "video",
    title: "Strips · control arm", sub: "3 blind pairs", projectId: null, createdAt: "2026-10-13T22:06:00Z",
    oracle: { passed: true, summary: "recipe vs bare control · same copy" }, spendUsd: 0, spendNote: "code-rendered",
    pairs: [["edu-radar--E17", "edu-radar--ctrl"], ["edu-aqueduct--E11", "edu-aqueduct--ctrl"], ["edu-chokepoint--E07", "edu-chokepoint--ctrl"]].map(([x, c], i) => {
      const ctrlPoster = stripP(c) || stripP(x);
      return { id: "sp" + i, question: x.split("--")[0], a: { url: stripP(x).url, video: stripV(x), label: x.split("--")[1] }, b: { url: ctrlPoster.url, video: stripV(c), label: "ctrl" }, machinePick: "a" };
    }),
  });
  const dj = (c) => dojo.find((d) => d.cycle === c);
  packets.push({
    id: "pkt_dojo", origin: "foundry", sourceKind: "dojo", deskMode: "blind-pair", media: "image",
    title: "Dojo · same lesson, two generators", sub: "2 blind pairs · pin on win", projectId: null, createdAt: "2026-10-14T01:30:00Z",
    oracle: { passed: true, summary: "judge AUC 0.69 · pick masked" }, spendUsd: 0, spendNote: "local GPU",
    pairs: [["2026-08-30-counted-beats--imp-1", "2026-09-01-nb-counted-beats--imp-1", "counted-beats"], ["2026-08-30-what-stays-dark--imp-1", "2026-09-01-nb-what-stays-dark--imp-1", "what-stays-dark"]].map(([x, y, q], i) => ({
      id: "dj" + i, question: q, a: { url: dj(x).url, label: x.slice(0, 10) }, b: { url: dj(y).url, label: "nb · " + y.slice(0, 10) }, machinePick: i ? "a" : "b" })),
  });
  articleRuns.filter((a) => a.stage === "awaiting_gate").forEach((a) => packets.push({
    id: "pkt_" + a.id, origin: "foundry", sourceKind: "article", deskMode: "packet-review", media: "article",
    title: a.topic.title, sub: a.topic.bundle + " · " + a.topic.techniques + " techniques", topic: a.topic, projectId: null, createdAt: "2026-10-14T06:20:00Z",
    oracle: { passed: true, summary: "0 check errors · " + a.quorum[0] + "/" + a.quorum[1] + " quorum" }, spendRange: [47, 92], spendNote: "per run (pipeline hint)",
    draft: a.topic.slug === illustrativeDraft.slug ? illustrativeDraft : null, illustrative: true, turn: a.turn,
  }));
  packets.push({
    id: "pkt_audio", origin: "foundry", sourceKind: "audio", deskMode: "matrix-cull", media: "audio", fixture: true,
    title: "Audio triage · batch 19", sub: unjudged.length + " takes · keep → spawn MV", projectId: null, createdAt: "2026-10-14T05:55:00Z",
    oracle: { passed: true, summary: "loudness measured · " + unjudged.length + "/" + unjudged.length + " files" }, spendNote: "fixture",
    rows: [["music", "Music"], ["sfx", "Sound effects"]].map(([k, l]) => ({ key: k, label: l,
      items: unjudged.filter((t) => t.kind === k).map((t) => ({ id: t.id, take: t, label: t.title })) })),
  });
  const ex = (pid) => F.exports.find((e) => e.projectId === pid && e.captions) || F.exports.find((e) => e.projectId === pid);
  packets.push({
    id: "pkt_prj_glass_harbor_trailer_cut", origin: "studio", sourceKind: "studio-step", deskMode: "packet-review", media: "video", fixture: true,
    title: "Glass Harbor — trailer · Cut", sub: "cut v1 · captions", projectId: "seed-glass-harbor-trailer", phase: "cut", createdAt: "2026-10-14T07:02:00Z",
    oracle: { passed: true, summary: "H.264 · captions 4/4 · loudness ok" }, spendNote: "fixture",
    export: ex("seed-glass-harbor-trailer"),
  });
  packets.push({
    id: "pkt_prj_two_hundred_days_spot", origin: "studio", sourceKind: "studio-step", deskMode: "packet-review", media: "video", fixture: true,
    title: "Two hundred days of rain · Ad spot", sub: "ad export · 9:16", projectId: "seed-two-hundred-days", phase: "cut", createdAt: "2026-10-14T07:40:00Z",
    oracle: { passed: true, summary: "H.264 · 9:16 · 3–90 s" }, spendNote: "fixture",
    export: F.exports.find((e) => e.kind === "ad" && e.projectId === "seed-two-hundred-days"),
  });
  packets.forEach((p) => {
    p.digest = digest(p.id);
    p.count = p.rows ? p.rows.reduce((n, r) => n + r.items.length, 0) : p.pairs ? p.pairs.length : 1;
    p.status = "awaiting_gate";
  });

  // ---- projects (downstream studio) -----------------------------------------
  const STEPS = G.projects.steps || ["research", "script", "frames", "motion", "score", "cut"];
  const mk = (id, title, discipline, template, length, state, style) => ({ id, title, discipline, template, length, steps: STEPS.map((s, i) => ({ key: s, state: state[i] })), style });
  const projects = [
    mk("seed-the-quiet-tariff", "The quiet tariff", "educational", "short-educational-video", "2:00", ["ratified", "ratified", "blocked", "draft", "draft", "draft"], "ink-graphic-novel"),
    mk("seed-glass-harbor", "Glass Harbor", "free", "short-form-clip", "0:31", ["ratified", "ratified", "awaiting_gate", "draft", "draft", "draft"], "painted-3d"),
    mk("seed-why-bitcoin", "Why the Bitcoin price does not rise", "educational", "mid-educational-video", "5:00", ["ratified", "running", "draft", "draft", "draft", "draft"], "cold-photoreal-cg"),
    mk("seed-glass-harbor-trailer", "Glass Harbor — trailer", "trailer", "trailer", "2:00", ["ratified", "ratified", "ratified", "ratified", "ratified", "awaiting_gate"], "painted-3d"),
    mk("seed-untitled", "Untitled — the port strike one", "free", "short-form-clip", "0:30", ["draft", "draft", "draft", "draft", "draft", "draft"], null),
    mk("seed-two-hundred-days", "Two hundred days of rain", "educational", "short-educational-video", "2:25", ["ratified", "ratified", "ratified", "ratified", "ratified", "ratified"], "cel-anime"),
  ];
  projects.forEach((p) => {
    p.exports = F.exports.filter((e) => e.projectId === p.id);
    p.slots = F.slots.filter((s) => s.projectId === p.id);
    p.next = p.steps.find((s) => s.state !== "ratified") || null;
  });

  // ---- calendar -------------------------------------------------------------
  const pubById = Object.fromEntries(F.publications.map((p) => [p.id, p]));
  const metricByPub = Object.fromEntries(F.metrics.map((m) => [m.publicationId, m]));
  const slots = F.slots.map((s) => ({ ...s, at: new Date(s.publishAt), pub: pubById[s.publicationId] || null, metric: metricByPub[s.publicationId] || null,
    project: projects.find((p) => p.id === s.projectId) }));

  // ---- composer estimates (shown before a run starts) -------------------------
  const estimate = {
    forge: (scenes, styleCount, mechs) => ({ plates: scenes * styleCount * mechs, minutes: Math.round(scenes * styleCount * mechs * 1.6), usd: 0, note: "local GPU · ~1.6 min/plate (illustrative)" }),
    article: () => ({ usdRange: [47, 92], minutes: 38, note: "per run (pipeline hint) · minutes illustrative" }),
    audio: (prompts) => ({ clips: prompts * 2, minutes: prompts * 4, queueAhead: 4, note: "serial Suno queue · minutes illustrative" }),
    mv: () => ({ minutes: 31.5, note: "full libx264 encode (design report figure)" }),
  };

  // ---- the decision ledger (in-memory BoardDecisionRecords) -------------------
  const decisions = [];
  function decide(packetId, verdict, payload) {
    const rec = { id: "bdr_" + (decisions.length + 1).toString().padStart(3, "0"), packetId, verdict, payload: payload || null, actorKind: "human", at: new Date().toISOString() };
    decisions.push(rec);
    const p = packets.find((x) => x.id === packetId);
    if (p) p.status = verdict === "reject" ? "blocked" : "ratified";
    return rec;
  }

  const fmt = {
    ago(iso) { const m = Math.round((NOW - new Date(iso)) / 60000); if (m < 60) return m + "m"; const h = Math.round(m / 60); return h < 48 ? h + "h" : Math.round(h / 24) + "d"; },
    day(d) { return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }); },
    time(d) { return d.toISOString().slice(11, 16); },
    dur(s) { s = Math.round(s || 0); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); },
    num(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n); },
  };

  window.GT_MODEL = {
    NOW, D, url, media, styles, styleById, extractRuns, calibration, takes, unjudged, keptTakes, topics, articleRuns, ARTICLE_STAGES,
    illustrativeDraft, runs, packets, projects, STEPS, slots, estimate, decisions, decide, fmt,
    disciplines: G.projects.disciplines || [], templates: G.projects.templates || [], hunts: F.hunts, exports: F.exports,
    counts: { styles: styles.length, proven: styles.filter((s) => s.shelf).length, topics: topics.length, media: media.length, takes: takes.length, slots: F.slots.length },
  };
})();
