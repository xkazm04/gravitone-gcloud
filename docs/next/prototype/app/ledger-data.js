/* ledger-data.js — the studio's append-only event log, derived from the real catalogue
   (window.GRAVITONE via GT_MODEL), the fixture universe and the Runs schedule (GT_STUDIO).
   Pure data + a query function, no DOM. Ports to lib/ledger/ as-is.

   THE CONTRACT (agent-readable; keys are stable):
   {
     n:        1..N, monotonic, ordered by `at` (derived first, then this browser's session acts)
     id:       "ev_000123"
     at:       ISO-8601 UTC
     atSrc:    "real"     the timestamp is in the data (styles.json evidence, take judgedAt, publishedAt)
               "fixture"  the timestamp comes from a fixture or the Runs schedule
               "derived"  computed here from a run id date or a model estimate (1.6 min/plate, 38 min/article)
     type:     dot-namespaced verb (TYPES below; any session type string is accepted)
     actor:    { kind: "operator"|"agent"|"machine", id }
     subject:  { kind, id, label, href }      href always resolves to the record's own route
     lane?, costUsd?: number|null, costSrc?: "real"|"fixture"|"illustrative"|"model", costRange?: [lo, hi],
     runId?, projectId?, packetId?, styleId?, verdict?, reason?, error? (verbatim), note?,
     dueAt?:   publish.schedule only — the slot's publishAt
     src:      "real"|"fixture"|"illustrative"|"session"   provenance of the content
     sesId?:   the session store's own id ("ses_0001") for session acts
   }
   Nothing here is invented without a label: where a time had to be computed, atSrc says so;
   where a record is the design's own (article runs, Runs schedule), src says so. */
(function () {
  "use strict";
  const M = window.GT_MODEL, S = window.GT_STUDIO, F = window.GT_FIXTURES || {}, G = window.GRAVITONE || { styles: { styles: [] }, media: [] };
  const NOW = M.NOW.getTime();
  const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const iso = (t) => new Date(t).toISOString();
  const T = (s) => Date.parse(s);
  const h32 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const dateOf = (id) => { const m = /(\d{4}-\d{2}-\d{2})/.exec(id || ""); return m ? T(m[1] + "T00:00:00Z") : null; };

  /* ── vocabulary ─────────────────────────────────────────────────────── */
  const ACTORS = {
    operator: { label: "Operator", color: "var(--actor-operator)" },
    agent: { label: "Agent", color: "var(--actor-agent)" },
    machine: { label: "Machine", color: "var(--actor-machine)" },
  };
  // group drives the facet; tone drives the chip colour (one meaning each, from tokens.css)
  const TYPES = {
    "idea.capture": { group: "capture", tone: "violet" },
    "run.start": { group: "run", tone: "cyan" },
    "job.lease": { group: "job", tone: "cyan" },
    "job.done": { group: "job", tone: "emerald" },
    "job.fail": { group: "job", tone: "rose" },
    "candidate.mint": { group: "candidate", tone: "" },
    "judge.pick": { group: "verdict", tone: "violet" },
    "verdict.keep": { group: "verdict", tone: "emerald" },
    "verdict.reject": { group: "verdict", tone: "rose" },
    "commit": { group: "commit", tone: "emerald" },
    "ratify": { group: "commit", tone: "emerald" },
    "style.lock": { group: "commit", tone: "emerald" },
    "gate.arrive": { group: "gate", tone: "amber" },
    "publish.schedule": { group: "publish", tone: "violet" },
    "publish.ok": { group: "publish", tone: "emerald" },
    "publish.fail": { group: "publish", tone: "rose" },
    "publish.missed": { group: "publish", tone: "rose" },
    "publish.cancel": { group: "publish", tone: "" },
    "metric.pull": { group: "metric", tone: "cyan" },
    "job.reroute": { group: "session", tone: "cyan" },
    "job.pause": { group: "session", tone: "" },
    "job.resume": { group: "session", tone: "cyan" },
    "job.retry": { group: "session", tone: "amber" },
    "job.reorder": { group: "session", tone: "" },
    "library.pin": { group: "session", tone: "emerald" },
    "plan.launch": { group: "session", tone: "cyan" },
  };
  const GROUPS = ["capture", "run", "job", "candidate", "verdict", "commit", "gate", "publish", "metric", "session"];
  function typeInfo(t) {
    if (TYPES[t]) return TYPES[t];
    const g = String(t).split(".")[0];
    const tone = /fail|reject|miss|block/.test(t) ? "rose" : /keep|ok|ratif|commit|lock|approve|accept/.test(t) ? "emerald" : /^gate/.test(t) ? "amber" : "";
    return { group: g === "gate" ? "gate" : GROUPS.includes(g) && g !== "job" ? g : "session", tone };
  }

  /* ── hrefs back to each record ─────────────────────────────────────── */
  const href = {
    style: (id) => "library.html#kind=style&sel=" + encodeURIComponent(id),
    media: (file) => "library.html#sel=" + encodeURIComponent(file),
    take: (id) => "library.html#sel=" + encodeURIComponent(id),
    topic: (slug) => "library.html#sel=topic:" + encodeURIComponent(slug),
    project: (pid) => "projects.html#plan/" + encodeURIComponent(pid),
    floorJob: (jid) => "projects.html#runs/all/" + encodeURIComponent(jid),
    job: (pid, jid) => "projects.html#runs/" + encodeURIComponent(pid) + "/" + encodeURIComponent(jid),
    packet: (id) => "index.html#open=" + encodeURIComponent(id),
    slot: (id) => "index.html#slot=" + encodeURIComponent(id),
    self: (q) => "ledger.html#q=" + encodeURIComponent(q),
  };

  const raw = [];
  let seq = 0;
  function add(e) {
    e._seq = seq++;
    if (e.costUsd === undefined) e.costUsd = null;
    raw.push(e);
    return e;
  }
  const OP = { kind: "operator", id: "operator" };
  const projTitle = (pid) => { const p = S.projectById(pid) || M.projects.find((x) => x.id === pid); return p ? p.title : pid; };

  /* ── 1. forge: references, plates, verdicts, commits (styles.json evidence = ledger.json, 87 rows) ── */
  const styleName = (id) => (M.styleById[id] || {}).name || id;
  const evidence = [];
  G.styles.styles.forEach((s) => (s.evidence || []).forEach((e) => evidence.push(Object.assign({ style: s.id }, e))));
  const forgeCands = M.media.filter((m) => m.kind === "forge.candidate");
  const forgeSources = M.media.filter((m) => m.kind === "forge.source");
  const evRuns = {};
  evidence.forEach((e) => { (evRuns[e.run] = evRuns[e.run] || []).push(e); });
  const FORGE_ACTOR = { kind: "machine", id: "gpu.local · Flux 2 dev fp8" };

  Object.keys(evRuns).sort().forEach((run) => {
    const rows = evRuns[run];
    const commitAt = Math.max(...rows.map((r) => T(r.at)));
    // plates of this run: every judged row + the surviving undecided plates
    const plates = rows.map((r) => ({ scene: r.scene, style: r.style, mechanism: r.mechanism, row: r,
      media: forgeCands.find((c) => c.run === run && c.scene === r.scene && c.style === r.style && c.mechanism === r.mechanism) }));
    forgeCands.filter((c) => c.run === run && c.verdict == null).forEach((c) => plates.push({ scene: c.scene, style: c.style, mechanism: c.mechanism, row: null, media: c }));
    plates.sort((a, b) => (a.scene + a.style + a.mechanism).localeCompare(b.scene + b.style + b.mechanism));
    const firstVerdict = Math.min(...rows.map((r) => T(r.at)));
    // the run starts on its id's date; plates follow at the model's 1.6 min/plate, finishing before the first verdict
    const day = dateOf(run) || firstVerdict - DAY;
    let start = day + (run.includes("dry") ? 16 * HOUR : 22 * HOUR);
    if (start + plates.length * 1.6 * MIN > firstVerdict) start = firstVerdict - plates.length * 1.6 * MIN - 25 * MIN;
    const pkt = M.packets.find((p) => p.runId === run);
    const scenes = [...new Set(plates.map((p) => p.scene))];
    // references the forge read (the operator's private frames)
    forgeSources.filter((m) => m.run === run).forEach((m, i) => add({ at: iso(start - 20 * MIN + i * MIN), atSrc: "derived", type: "idea.capture", actor: OP,
      subject: { kind: "reference", id: m.file, label: "reference · " + m.scene, href: href.media(m.file) }, runId: run, note: "forge source frame", src: "real" }));
    add({ at: iso(start), atSrc: "derived", type: "run.start", actor: OP, subject: { kind: "run", id: run, label: "forge " + run, href: pkt ? href.packet(pkt.id) : href.self(run) },
      runId: run, lane: "gpu.local", costUsd: 0, costSrc: "real", note: "CLI forge.py · " + scenes.length + " scenes · " + plates.length + " plates · local GPU", src: "real" });
    plates.forEach((p, i) => {
      const lbl = p.scene + " · " + styleName(p.style) + " · " + p.mechanism;
      const subj = p.media ? { kind: "plate", id: p.media.file, label: lbl, href: href.media(p.media.file) } : { kind: "plate", id: run + "/" + p.scene + "/" + p.style + "--" + p.mechanism, label: lbl, href: href.style(p.style) };
      add({ at: iso(start + (i + 1) * 1.6 * MIN), atSrc: "derived", type: "candidate.mint", actor: FORGE_ACTOR, subject: subj, runId: run, styleId: p.style, lane: "gpu.local",
        costUsd: 0, costSrc: "real", packetId: p.media && p.media.verdict == null && pkt ? pkt.id : undefined, src: "real" });
      p.subj = subj;
    });
    plates.filter((p) => p.row).forEach((p) => {
      const keep = p.row.verdict === "keep";
      add({ at: p.row.at, atSrc: "real", type: keep ? "verdict.keep" : "verdict.reject", actor: OP, subject: Object.assign({}, p.subj), runId: run, styleId: p.style,
        verdict: p.row.verdict, note: p.media ? undefined : "plate deleted at commit", src: "real" });
    });
    const k = rows.filter((r) => r.verdict === "keep").length;
    add({ at: iso(commitAt + 1000), atSrc: "real", type: "commit", actor: OP, subject: { kind: "run", id: run, label: "forge " + run, href: pkt ? href.packet(pkt.id) : href.self(run) },
      runId: run, note: k + " kept · " + (rows.length - k) + " rejected → styles.json evidence", src: "real" });
  });

  /* ── 2. styles proven: ratify + lock onto the shelf ── */
  M.styles.filter((s) => s.status === "proven").forEach((s) => {
    const keeps = (s.evidence || []).filter((e) => e.verdict === "keep");
    const at = keeps.length ? Math.max(...keeps.map((e) => T(e.at))) : null;
    if (at == null) return;
    const subj = { kind: "style", id: s.id, label: s.name, href: href.style(s.id) };
    add({ at: iso(at + 2000), atSrc: "real", type: "ratify", actor: OP, subject: subj, styleId: s.id, note: s.keep + " keep · " + s.reject + " reject · " + s.scenes.length + " scenes", src: "real" });
    add({ at: iso(at + 3000), atSrc: "real", type: "style.lock", actor: { kind: "machine", id: "catalogue · styles.json" }, subject: Object.assign({}, subj), styleId: s.id,
      note: "status proven · " + (s.family || ""), src: "real" });
  });

  /* ── 3. extract runs: gallery → replicas/transfers → kept looks → styles.json candidates ── */
  const EXTRACT_ACTOR = { kind: "machine", id: "gpu.local · extract.mts" };
  Object.values(M.extractRuns).sort((a, b) => a.id.localeCompare(b.id)).forEach((r, ri) => {
    const day = dateOf(r.id);
    const start = day + (9 + 2 * (ri % 3)) * HOUR;
    r.sources.forEach((m, i) => add({ at: iso(start - 15 * MIN + i * 30e3), atSrc: "derived", type: "idea.capture", actor: OP,
      subject: { kind: "reference", id: m.file, label: "gallery source " + (i + 1), href: href.media(m.file) }, runId: r.id, note: "extract gallery", src: "real" }));
    const looks = Object.values(r.looks);
    const pkt = "pkt_extract_" + r.id;
    add({ at: iso(start), atSrc: "derived", type: "run.start", actor: OP, subject: { kind: "run", id: r.id, label: "extract " + r.id, href: href.packet(pkt) }, runId: r.id, lane: "gpu.local",
      costUsd: 0, costSrc: "real", note: r.sources.length + " sources · " + looks.length + " looks", src: "real" });
    let t = start;
    looks.forEach((L) => {
      [...L.replicas, ...L.transfers].forEach((m) => {
        t += 3 * MIN;
        add({ at: iso(t), atSrc: "derived", type: "candidate.mint", actor: EXTRACT_ACTOR, subject: { kind: m.kind === "extract.replica" ? "replica" : "transfer", id: m.file, label: L.id + " · " + m.kind.split(".")[1], href: href.media(m.file) },
          runId: r.id, styleId: L.id, lane: "gpu.local", costUsd: 0, costSrc: "real", packetId: L.inCatalogue ? undefined : pkt, src: "real" });
      });
    });
    const kept = looks.filter((L) => L.inCatalogue);
    kept.forEach((L, i) => add({ at: iso(t + 30 * MIN + i * 20e3), atSrc: "derived", type: "verdict.keep", actor: OP, subject: { kind: "style", id: L.id, label: styleName(L.id), href: href.style(L.id) },
      runId: r.id, styleId: L.id, verdict: "keep", note: "look kept", src: "real" }));
    if (kept.length) add({ at: iso(t + 32 * MIN), atSrc: "derived", type: "commit", actor: OP, subject: { kind: "run", id: r.id, label: "extract " + r.id, href: href.packet(pkt) }, runId: r.id,
      note: kept.length + " looks → styles.json as candidate · " + (looks.length - kept.length) + " at the gate", src: "real" });
  });

  /* ── 4. dojo cycles: plan → render → judge → (operator) keep → commit ── */
  const dojo = M.media.filter((m) => m.kind === "dojo.thumb");
  dojo.forEach((m, i) => {
    const nb = /-nb-/.test(m.cycle);
    const day = dateOf(m.cycle);
    const start = day + (1 + (i % 4) * 2) * HOUR + (h32(m.cycle) % 40) * MIN;
    const subj = { kind: "cycle", id: m.file, label: "dojo " + m.cycle.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/--imp-1$/, ""), href: href.media(m.file) };
    const lane = nb ? "cloud.google" : "gpu.local";
    add({ at: iso(start), atSrc: "derived", type: "run.start", actor: { kind: "agent", id: "/dojo" }, subject: Object.assign({}, subj), runId: m.cycle, lane: "seat.text", note: nb ? "Google stack · Nano Banana + Gemini judge" : "local stack · Flux 2 + Ollama judge", src: "real" });
    add({ at: iso(start + 14 * MIN), atSrc: "derived", type: "candidate.mint", actor: { kind: "machine", id: nb ? "cloud.google · Nano Banana" : "gpu.local · Flux 2 dev fp8" }, subject: Object.assign({}, subj), runId: m.cycle, lane,
      costUsd: nb ? null : 0, costSrc: nb ? undefined : "real", packetId: nb ? "pkt_dojo" : undefined, src: "real" });
    add({ at: iso(start + 19 * MIN), atSrc: "derived", type: "judge.pick", actor: { kind: "agent", id: "dojo judge" }, subject: Object.assign({}, subj), runId: m.cycle, lane: nb ? "cloud.google" : "gpu.local",
      note: "dojo judge AUC 0.69 · pick masked until the operator chooses", src: "real" });
    if (!nb) {
      add({ at: iso(start + 6 * HOUR), atSrc: "derived", type: "verdict.keep", actor: OP, subject: Object.assign({}, subj), runId: m.cycle, verdict: "keep", note: "approved improvement · thumb kept", src: "real" });
      add({ at: iso(start + 6 * HOUR + 30e3), atSrc: "derived", type: "commit", actor: OP, subject: Object.assign({}, subj), runId: m.cycle, note: "training-ledger row · recipe diff", src: "real" });
    }
  });

  /* ── 5. strips: code-rendered motion cards (Runs schedule time) ── */
  const jStrips = S.jobs.find((j) => j.id === "job_strips");
  if (jStrips) {
    const run = jStrips.run;
    add({ at: iso(jStrips.s - 2 * MIN), atSrc: "fixture", type: "run.start", actor: OP, subject: { kind: "run", id: run, label: "strips " + run, href: href.packet("pkt_strips") }, runId: run, lane: "box.render", costUsd: 0, costSrc: "real", note: "CLI strips/run.mts · 12 cards", src: "real" });
    const posters = M.media.filter((m) => m.kind === "strip.poster");
    const vids = M.media.filter((m) => m.kind === "strip.video");
    posters.forEach((m, i) => add({ at: iso(jStrips.s + (i + 1) * 40e3), atSrc: "derived", type: "candidate.mint", actor: { kind: "machine", id: "box.render · strips 240f" },
      subject: { kind: "card", id: m.file, label: "strip " + m.card, href: href.media(m.file) }, runId: run, lane: "box.render", costUsd: 0, costSrc: "real", packetId: "pkt_strips", src: "real" }));
    vids.forEach((m, i) => add({ at: iso(jStrips.s + (posters.length + 1 + i) * 40e3), atSrc: "derived", type: "candidate.mint", actor: { kind: "machine", id: "box.render · strips 240f" },
      subject: { kind: "card", id: m.file, label: "strip " + m.card + " · mp4", href: href.media(m.file) }, runId: run, lane: "box.render", costUsd: 0, costSrc: "real", packetId: "pkt_strips_ctrl", src: "real" }));
  }

  /* ── 6. audio: hunts (ideas) and takes (79, fixture) ── */
  (F.hunts || []).forEach((hn) => {
    const at = T(hn.createdAt);
    const label = hn.idea.length > 64 ? hn.idea.slice(0, 62).replace(/\s+\S*$/, "") + "…" : hn.idea;
    add({ at: iso(at), atSrc: "fixture", type: "idea.capture", actor: OP, subject: { kind: "hunt", id: hn.id, label, href: href.self(hn.id) }, note: hn.idea, src: "fixture" });
    add({ at: iso(at + 2 * MIN), atSrc: "derived", type: "run.start", actor: { kind: "agent", id: "sound · hunt" }, subject: { kind: "hunt", id: hn.id, label, href: href.self(hn.id) }, runId: hn.id,
      note: hn.nodes.length + " branches · " + [...new Set(hn.nodes.map((n) => n.axis))].join(", "), src: "fixture" });
  });
  const TAKE_ACTOR = (t) => {
    const prov = t.provider === "suno" ? "box.chrome · Suno v6" : t.provider === "elevenlabs" ? "cloud.elevenlabs" : "local";
    if (t.origin === "agent") return { kind: "agent", id: "sound · " + t.op };
    if (t.origin === "hunt") return { kind: "agent", id: "sound · hunt" };
    if (t.origin === "score") return { kind: "agent", id: "score step · cue" };
    if (t.origin === "lab" || t.origin === "import") return OP;
    return { kind: "machine", id: prov }; // suno-return, fixture
  };
  const TAKE_LANE = (t) => (t.provider === "suno" ? "box.chrome" : t.provider === "elevenlabs" ? "cloud.elevenlabs" : undefined);
  (F.takes || []).forEach((t) => {
    const subj = { kind: "take", id: t.id, label: t.title, href: href.take(t.id) };
    add({ at: t.createdAt, atSrc: "fixture", type: "candidate.mint", actor: TAKE_ACTOR(t), subject: subj, lane: TAKE_LANE(t), projectId: t.projectId || undefined,
      packetId: t.verdict === "unjudged" ? "pkt_audio" : undefined, runId: t.verdict === "unjudged" ? "suno-batch-19" : undefined,
      note: t.kind + " · " + t.origin + " · " + t.op + " · " + t.provider + (t.durationS ? " · " + t.durationS + "s" : ""), src: "fixture" });
    if (t.judgedAt && (t.verdict === "kept" || t.verdict === "rejected")) {
      add({ at: t.judgedAt, atSrc: "fixture", type: t.verdict === "kept" ? "verdict.keep" : "verdict.reject", actor: OP, subject: Object.assign({}, subj), projectId: t.projectId || undefined,
        verdict: t.verdict === "kept" ? "keep" : "reject", reason: t.reasons && t.reasons.length ? t.reasons.join(", ") : undefined, src: "fixture" });
    }
  });

  /* ── 7. articles: topic → run → stages on the text seat (the design's runs over real topics) ── */
  const STG = M.ARTICLE_STAGES.filter((s) => s !== "awaiting_gate");
  const STAGE_MIN = 38 / STG.length;
  M.articleRuns.forEach((a) => {
    const job = S.jobs.find((j) => j.run === a.runId) || (a.topic.slug === "generative-provider-routing" ? S.jobs.find((j) => j.id === "job_xp-provider-routing_article") : null);
    const pkt = M.packets.find((p) => p.topic && p.topic.slug === a.topic.slug);
    let start = job ? job.s : pkt ? T(pkt.createdAt) - 38 * MIN - 22 * MIN : NOW - 3 * HOUR;
    const pid = job && job.pid ? job.pid : undefined;
    const topicSubj = { kind: "topic", id: "topic:" + a.topic.slug, label: a.topic.title, href: href.topic(a.topic.slug) };
    add({ at: iso(start - 50 * MIN), atSrc: "derived", type: "idea.capture", actor: { kind: "agent", id: "articles · topic scout" }, subject: topicSubj, runId: a.runId, projectId: pid,
      note: a.topic.bundle + " · " + a.topic.techniques + " techniques", src: "illustrative" });
    add({ at: iso(start), atSrc: job ? "fixture" : "derived", type: "run.start", actor: { kind: "agent", id: "lib/articles" }, subject: Object.assign({}, topicSubj), runId: a.runId, projectId: pid, lane: "seat.text",
      costUsd: 69.5, costSrc: "model", costRange: [47, 92], note: "turn " + a.turn + " · $47–92 per run (pipeline hint)", src: "illustrative" });
    const at = a.stage === "awaiting_gate" ? STG.length : STG.indexOf(a.stage);
    STG.forEach((st, i) => {
      if (i > at) return;
      const s0 = start + i * STAGE_MIN * MIN;
      if (s0 > NOW) return;
      add({ at: iso(s0 + 1000), atSrc: "derived", type: "job.lease", actor: { kind: "agent", id: "seat.text" }, subject: Object.assign({}, topicSubj, { label: a.topic.title + " · " + st }), runId: a.runId, projectId: pid, lane: "seat.text", note: st, src: "illustrative" });
      const e0 = s0 + STAGE_MIN * MIN;
      if (i < at && e0 <= NOW) add({ at: iso(e0), atSrc: "derived", type: "job.done", actor: { kind: "agent", id: "seat.text" }, subject: Object.assign({}, topicSubj, { label: a.topic.title + " · " + st }), runId: a.runId, projectId: pid, lane: "seat.text", note: st, src: "illustrative" });
    });
    a._pid = pid; a._pkt = pkt;
  });

  /* ── 8. the Runs schedule (GT_STUDIO): projects launched, jobs leased / done / failed, gates ── */
  const coveredJob = (j) => (j.run && /^run_art_/.test(j.run)) || j.id === "job_xp-provider-routing_article" || j.id === "job_strips";
  const actorOfLane = (lane, model) => (lane === "seat.text" ? { kind: "agent", id: "seat.text" } : { kind: "machine", id: lane + (model ? " · " + model.split(" · ")[0] : "") });
  S.projects.forEach((p) => {
    const started = S.jobsOf(p.id).filter((j) => j.s != null && j.s <= NOW && ["done", "failed", "running", "gate"].includes(j.status));
    if (!started.length) return;
    const t0 = Math.min(...started.map((j) => j.s));
    add({ at: iso(t0 - 3 * MIN), atSrc: "fixture", type: "run.start", actor: OP, subject: { kind: "project", id: p.id, label: p.title, href: href.project(p.id) }, projectId: p.id,
      note: (S.RECIPES[p.recipe] || {}).label + " · " + S.jobsOf(p.id).length + " jobs", src: p.src === "illustrative" ? "illustrative" : "fixture" });
  });
  S.jobs.forEach((j) => {
    if (coveredJob(j) || j.s == null || j.s > NOW) return;
    if (!["done", "failed", "running", "gate"].includes(j.status)) return;
    const proj = j.pid ? S.projectById(j.pid) : null;
    const src = proj ? (proj.src === "illustrative" ? "illustrative" : "fixture") : j.src === "illustrative" ? "illustrative" : "fixture";
    const pkt = j.packet || (j.run ? (M.runs.find((r) => r.id === j.run) || {}).packet : null);
    const label = (proj ? proj.title + " · " : "") + (j.part === "gate" ? j.of + " gate" : j.pid ? j.part : j.title);
    const subj = { kind: "job", id: j.id, label, href: j.pid ? href.job(j.pid, j.id) : href.floorJob(j.id) };
    const base = { subject: subj, projectId: j.pid || undefined, runId: j.run || undefined, lane: j.lane === "gate" || j.lane === "calendar" ? undefined : j.lane, src };
    if (j.part === "slot") return; // the calendar pass below owns publishing
    if (j.part === "gate") {
      if (j.status === "gate") { if (!j.packet) add(Object.assign({ at: iso(j.s), atSrc: "fixture", type: "gate.arrive", actor: { kind: "machine", id: "weir" }, note: j.of + " awaiting the operator" }, base)); return; }
      if (j.status === "done") add(Object.assign({ at: iso(j.s + (j.dur || 20) * MIN), atSrc: "fixture", type: "ratify", actor: OP, verdict: "keep", note: j.of + " signed off" }, base));
      return;
    }
    add(Object.assign({ at: iso(j.s), atSrc: "fixture", type: "job.lease", actor: actorOfLane(j.lane, j.model), packetId: undefined,
      note: j.model + " · " + j.units + " " + j.unit + (j.units > 1 ? "s" : "") + (j.attempt > 1 ? " · attempt " + j.attempt : "") }, base));
    if (j.status === "done" && j.e <= NOW) add(Object.assign({ at: iso(j.e), atSrc: "fixture", type: "job.done", actor: actorOfLane(j.lane, j.model), costUsd: j.usd, costSrc: j.src,
      costRange: j.usdRange || undefined, packetId: pkt || undefined, note: S.fmtDur(j.dur) + " on " + (S.laneById[j.lane] || { label: j.lane }).label }, base));
    if (j.status === "failed") add(Object.assign({ at: iso(Math.min(j.e, NOW)), atSrc: "fixture", type: "job.fail", actor: actorOfLane(j.lane, j.model), costUsd: j.usd, costSrc: j.src, error: j.error || "failed" }, base));
  });

  /* ── 9. the weir: packets arriving for the operator ── */
  M.packets.forEach((p) => {
    const gateJob = S.jobs.find((j) => j.packet === p.id);
    const src = p.fixture ? "fixture" : p.illustrative ? "illustrative" : "real";
    add({ at: p.createdAt, atSrc: "fixture", type: "gate.arrive", actor: { kind: "machine", id: "weir" }, subject: { kind: "packet", id: p.id, label: p.title, href: href.packet(p.id) },
      packetId: p.id, runId: p.runId || undefined, projectId: p.projectId || (gateJob && gateJob.pid) || undefined,
      note: p.deskMode + " · " + p.count + " item" + (p.count === 1 ? "" : "s") + " · " + p.oracle.summary, src });
  });

  /* ── 10. calendar: schedule → publish ok / fail (verbatim) / missed / cancelled; metrics ── */
  const pubById = Object.fromEntries((F.publications || []).map((p) => [p.id, p]));
  const pubBySlot = Object.fromEntries((F.publications || []).map((p) => [p.slotId, p]));
  (F.slots || []).forEach((s) => {
    const pa = T(s.publishAt), hh = h32(s.id);
    const subj = { kind: "slot", id: s.id, label: s.title, href: href.slot(s.id) };
    const lane = "channel." + s.channelId;
    let sched = pa - 2 * DAY - (hh % 30) * HOUR;
    if (sched > NOW - 30 * MIN) sched = NOW - (1 + (hh % 60)) * HOUR;
    const base = { projectId: s.projectId || undefined, lane, src: "fixture" };
    add(Object.assign({ at: iso(sched), atSrc: "derived", type: "publish.schedule", actor: OP, subject: subj, note: s.channelId + " · due " + s.publishAt.slice(0, 16).replace("T", " ") + "Z", dueAt: s.publishAt }, base));
    if (s.status === "published") {
      const pub = pubBySlot[s.id] || pubById[s.publicationId];
      add(Object.assign({ at: pub ? pub.publishedAt : s.publishAt, atSrc: "fixture", type: "publish.ok", actor: { kind: "machine", id: lane }, subject: Object.assign({}, subj),
        note: pub ? pub.id + " · " + pub.visibility + " · video " + pub.platformVideoId : s.publicationId }, base));
    } else if (s.status === "failed") {
      add(Object.assign({ at: s.publishAt, atSrc: "fixture", type: "publish.fail", actor: { kind: "machine", id: lane }, subject: Object.assign({}, subj), error: s.error || "failed" }, base));
    } else if (s.status === "missed" && pa <= NOW) {
      add(Object.assign({ at: s.publishAt, atSrc: "fixture", type: "publish.missed", actor: { kind: "machine", id: "calendar" }, subject: Object.assign({}, subj), note: "slot passed · nothing published" }, base));
    } else if (s.status === "cancelled") {
      const m = /\(([^)]+)\)\s*$/.exec(s.title);
      const reason = s.error || (m ? m[1] : null);
      let at = Math.min(pa - 6 * HOUR - (hh % 12) * HOUR, NOW - (2 + (hh % 20)) * HOUR);
      add(Object.assign({ at: iso(at), atSrc: "derived", type: "publish.cancel", actor: OP, subject: Object.assign({}, subj), reason: reason || undefined }, base));
    }
  });
  (F.metrics || []).forEach((mt, i) => {
    const pub = pubById[mt.publicationId];
    const s = pub && (F.slots || []).find((x) => x.id === pub.slotId);
    if (!s) return;
    const fmtN = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
    add({ at: iso(NOW - 40 * MIN + i * 30e3), atSrc: "derived", type: "metric.pull", actor: { kind: "machine", id: "channel." + s.channelId }, subject: { kind: "slot", id: s.id, label: s.title, href: href.slot(s.id) },
      projectId: s.projectId, lane: "channel." + s.channelId, note: fmtN(mt.views) + " views · " + fmtN(mt.likes) + " likes · " + fmtN(mt.comments) + " comments · fixture stamp " + mt.at.slice(0, 16).replace("T", " ") + "Z", src: "fixture" });
  });

  /* ── number: append-only order by time ── */
  raw.sort((a, b) => T(a.at) - T(b.at) || a._seq - b._seq);
  const KEYS = ["n", "id", "at", "atSrc", "type", "actor", "subject", "lane", "costUsd", "costSrc", "costRange", "runId", "projectId", "packetId", "styleId", "verdict", "reason", "error", "note", "dueAt", "src", "sesId"];
  const clean = (e) => { const o = {}; KEYS.forEach((k) => { if (k === "costUsd") o[k] = typeof e[k] === "number" ? e[k] : null; else if (e[k] !== undefined && e[k] !== null) o[k] = e[k]; }); return o; };
  const pad = (n) => "ev_" + String(n).padStart(6, "0");
  const events = raw.map((e, i) => { e.n = i + 1; e.id = pad(i + 1); return clean(e); });

  /* ── session acts from this browser (GT.store), numbered after the derived log ── */
  function normSession(se, n) {
    const a = se.actor && se.actor.kind ? { kind: se.actor.kind, id: se.actor.id || se.actor.kind } : { kind: "operator", id: "operator" };
    const sj = se.subject && (se.subject.id || se.subject.label) ? { kind: se.subject.kind || "record", id: se.subject.id || se.subject.label, label: se.subject.label || se.subject.id, href: se.subject.href || href.self(se.subject.id || se.subject.label) }
      : { kind: "session", id: se.id || "ses", label: se.title || se.type || "session act", href: href.self(se.id || "") };
    return clean({ n, id: pad(n), at: se.at || new Date().toISOString(), atSrc: "real", type: se.type || "session.act", actor: a, subject: sj, lane: se.lane, costUsd: typeof se.costUsd === "number" ? se.costUsd : null,
      costSrc: typeof se.costUsd === "number" ? se.costSrc || "illustrative" : undefined, runId: se.runId, projectId: se.projectId || se.pid, packetId: se.packetId, styleId: se.styleId,
      verdict: se.verdict, reason: se.reason, error: se.error, note: se.note, src: "session", sesId: se.id });
  }
  function sessionEvents() {
    let list = [];
    try { list = (window.GT && window.GT.store ? window.GT.store.events() : []) || []; } catch (_) { list = []; }
    return list.map((se, i) => normSession(se, events.length + i + 1));
  }
  function all() { return events.concat(sessionEvents()); }

  /* ── query: the same filter the route uses, for agents ── */
  const idsOf = (e) => [e.id, e.subject && e.subject.id, e.runId, e.projectId, e.packetId, e.styleId, e.sesId, e.actor && e.actor.id, e.lane].filter(Boolean);
  let idIndex = null;
  function knownIds(list) {
    if (!idIndex || idIndex.n !== list.length) { const s = new Set(); list.forEach((e) => idsOf(e).forEach((x) => s.add(String(x).toLowerCase()))); idIndex = { n: list.length, s }; }
    return idIndex.s;
  }
  function hay(e) {
    if (!e._hay) Object.defineProperty(e, "_hay", { value: [e.id, e.type, e.subject.kind, e.subject.label, e.note, e.error, e.reason, e.verdict, e.actor.kind, ...idsOf(e)].filter(Boolean).join(" \u0001 ").toLowerCase(), enumerable: false });
    return e._hay;
  }
  const typeMatch = (t, pat) => pat.split(",").some((p) => { p = p.trim(); if (!p) return false; if (p.endsWith(".*") || p.endsWith("*")) return t.startsWith(p.replace(/\*$/, "")); if (GROUPS.includes(p) && !TYPES[p]) return typeInfo(t).group === p; return t === p; });
  // parse "actor:agent type:publish.fail free words" into {filters, words}
  function parseQ(q) {
    const out = { words: [] };
    String(q || "").trim().split(/\s+/).filter(Boolean).forEach((tok) => {
      const m = /^(actor|type|lane|project|src|run|packet|subject|kind|id|style):(.+)$/i.exec(tok);
      if (m) { const k = m[1].toLowerCase(); out[k === "kind" ? "subject" : k] = m[2]; } else out.words.push(tok.toLowerCase());
    });
    return out;
  }
  const dayStart = (d) => T(String(d).slice(0, 10) + "T00:00:00Z");
  // f: {q, actor, type, lane, project, src, from, to} — from/to are YYYY-MM-DD (UTC, inclusive) or ISO
  function makeFilter(f, list) {
    f = f || {};
    const pq = parseQ(f.q);
    const actor = f.actor || pq.actor, type = f.type || pq.type, lane = f.lane || pq.lane, project = f.project || pq.project, src = f.src || pq.src;
    const from = f.from ? (String(f.from).length > 10 ? T(f.from) : dayStart(f.from)) : null;
    const to = f.to ? (String(f.to).length > 10 ? T(f.to) : dayStart(f.to) + DAY - 1) : null;
    const ids = knownIds(list);
    const words = pq.words.map((w) => ({ w, exact: ids.has(w) }));
    const inList = (v, pat) => String(pat).split(",").map((x) => x.trim()).filter(Boolean).includes(v);
    return (e) => {
      if (actor && actor !== "all" && !inList(e.actor.kind, actor)) return false;
      if (type && !typeMatch(e.type, type)) return false;
      if (lane && !inList(e.lane || "", lane) && !(e.lane || "").startsWith(lane)) return false;
      if (project && !inList(e.projectId || "", project)) return false;
      if (src && !inList(e.src, src)) return false;
      if (pq.run && e.runId !== pq.run) return false;
      if (pq.packet && e.packetId !== pq.packet) return false;
      if (pq.subject && e.subject.kind !== pq.subject) return false;
      if (pq.style && e.styleId !== pq.style) return false;
      if (pq.id && !idsOf(e).includes(pq.id)) return false;
      if (from != null || to != null) { const t = T(e.at); if (from != null && t < from) return false; if (to != null && t > to) return false; }
      for (const { w, exact } of words) {
        if (exact) { if (!idsOf(e).some((x) => String(x).toLowerCase() === w)) return false; }
        else if (!hay(e).includes(w)) return false;
      }
      return true;
    };
  }
  function query(f) { const list = all(); return list.filter(makeFilter(f, list)); }

  window.GT_LEDGER = { events, TYPES, ACTORS, GROUPS, typeInfo, all, sessionEvents, query, makeFilter, parseQ, typeMatch, idsOf, NOW, href };
})();
