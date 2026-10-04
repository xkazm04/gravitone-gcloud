/* THE RECIPE BOOK — terms on the left, the ledger in the middle, the take and its
 * recipe on the right. Every number on the page is read off WB (core.js) on each
 * render; the only page state here is view state (filters, sort, selection). */
(function () {
  "use strict";
  const WB = window.WB;
  const esc = WB.esc;
  const $ = (id) => document.getElementById(id);
  const VORDER = ["proven", "kept", "unjudged", "rejected"];
  const VLABEL = { proven: "proven", kept: "kept", unjudged: "unjudged", rejected: "rejected" };
  const DIMS = WB.RUBRIC; // melody, instrument_choice, instrument_quality
  // keyed by round prefix; round3 is the retired cloud-read path
  const ROUNDS = {
    round1: { s: "r1 fft", cls: "", label: "round 1 · fft autocorr" },
    round2: { s: "r2 librosa", cls: "", label: "round 2 · librosa" },
    round3: { s: "r3 cloud", cls: "chip--retired", label: "round 3 · cloud read" },
  };
  const ROUND = new Proxy({}, { get: (_, k) => ROUNDS[String(k).slice(0, 6)] || { s: String(k), cls: "", label: String(k) } });
  const REFNAME = {};
  WB.references().forEach((r) => (REFNAME[r.id] = r.name));
  const FAMILY = {
    "nu-disco": "House & disco", "80s french touch": "House & disco", "deep house": "House & disco", "melodic house": "House & disco", "progressive house": "House & disco", "organic house": "House & disco",
    synthwave: "Synth & retro", "retro electronic": "Synth & retro", outrun: "Synth & retro",
    "future bass": "Bass music", "melodic dubstep": "Bass music", chillstep: "Bass music", "drum and bass": "Bass music", "liquid dnb": "Bass music", trap: "Bass music", "dark trap": "Bass music", "808-driven": "Bass music",
    "boom bap": "Hip hop & downtempo", "jazz rap": "Hip hop & downtempo", "golden age hip hop": "Hip hop & downtempo", "lo-fi hip hop": "Hip hop & downtempo", "dusty sample": "Hip hop & downtempo", "trip hop": "Hip hop & downtempo", downtempo: "Hip hop & downtempo",
    "ambient drone": "Ambient & cinematic", textural: "Ambient & cinematic", "cinematic ambient": "Ambient & cinematic", "orchestral-electronic": "Ambient & cinematic",
  };

  const S = {
    type: "all",
    verdicts: new Set(),
    q: "",
    term: null, // {facet, term}
    ref: null,
    group: "recipe",
    sort: { col: "age", dir: "desc" },
    sel: null,
    dim: 0,
    queue: null,
    rejecting: null,
    rejectInsp: false,
    tab: "take",
    termSort: "rate",
    collapsed: new Set(),
    termCollapsed: new Set(),
    flash: null,
    seed: { genres: [], moods: [], instruments: [], bpm: null, key: null, avoid: [] },
    seedFrom: "blank",
    seedParent: null,
    seedRef: null,
    target: "suno",
    stages: null,
    analysis: null,
    kbd: false,
  };

  /* ── derived ─────────────────────────────────────────────────────────── */
  const V = (it) => WB.verdict(it);
  function recipeOf(it) {
    if (it.kind === "sfx") return "Effects · " + (it.draft_id ? "drafted" : "no recipe");
    if (it.draft_id) return "Draft returns";
    if (it.reference_track_id) {
      const n = REFNAME[it.reference_track_id];
      return "Ref · " + (n ? n.artist + " — " + n.title : it.reference_track_id);
    }
    if (it.prompt_round) return "Round · " + ROUND[it.prompt_round].label;
    return it.parent_id ? "Returns" : "Hand prompt";
  }
  function groupOf(it) {
    if (S.group === "recipe") return recipeOf(it);
    if (S.group === "family") return it.kind === "sfx" ? "Effects" : FAMILY[(it.genre_tags || [])[0]] || "Other";
    if (S.group === "sfx") return it.kind === "sfx" ? it.sfx_category || "uncategorized" : "Tracks";
    return null;
  }
  function tagsOf(it) {
    return it.kind === "sfx" ? [it.sfx_category].concat(it.loopable ? ["loop"] : []) : (it.genre_tags || []).concat(it.mood_tags || [], it.instrumentation || []);
  }
  function matches(it) {
    if (S.queue) return S.queue.includes(it.id);
    if (S.type === "track" && it.kind !== "track") return false;
    if (S.type === "sfx" && it.kind !== "sfx") return false;
    if (S.verdicts.size && !S.verdicts.has(V(it))) return false;
    if (S.ref && it.reference_track_id !== S.ref) return false;
    if (S.term) {
      const arr = S.term.facet === "sfx_category" ? [it.sfx_category] : it[S.term.facet] || [];
      if (!arr.includes(S.term.term)) return false;
    }
    if (S.q) {
      const hay = [it.title, it.id, it.vendor, it.reject_reason, it.prompt_round, it.key, recipeOf(it)].concat(tagsOf(it)).join(" ").toLowerCase();
      if (!S.q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }
  const COLS = [
    { id: "play", label: "", plain: true, cls: "play" },
    { id: "title", label: "Title", get: (i) => i.title.toLowerCase() },
    { id: "type", label: "Type", get: (i) => i.kind, cls: "type" },
    { id: "verdict", label: "Verdict", get: (i) => VORDER.indexOf(V(i)), cls: "verdict" },
    { id: "melody", cls: "n3", label: "Mel", num: true, get: (i) => (i.ratings ? i.ratings.melody : null) },
    { id: "instrument_choice", cls: "n3", label: "Cho", num: true, get: (i) => (i.ratings ? i.ratings.instrument_choice : null) },
    { id: "instrument_quality", cls: "n3", label: "Qua", num: true, get: (i) => (i.ratings ? i.ratings.instrument_quality : null) },
    { id: "score", cls: "score", label: "Score", num: true, get: (i) => WB.score(i) },
    { id: "tags", label: "Tags", plain: true, cls: "tags" },
    { id: "vendor", label: "Vendor", get: (i) => i.vendor || "~", cls: "vendor" },
    { id: "src", label: "Source", get: (i) => (i.reference_track_id || "") + (i.prompt_round || "~"), cls: "src" },
    { id: "age", label: "Age", num: true, get: (i) => i.created_at, cls: "age" },
  ];
  /* Columns drop by width, least-worked first: the inspector repeats every one of them. */
  function cols() {
    const w = window.innerWidth;
    const drop = new Set();
    if (w < 2100) drop.add("tags");
    if (w < 1600) drop.add("vendor");
    if (w < 1440) drop.add("age"), drop.add("type");
    if (w < 1280 && w >= 1000) drop.add("src");
    if (w < 1000) drop.add("vendor"), drop.add("src");
    if (w < 720) drop.add("age"), drop.add("type");
    return COLS.filter((c) => !drop.has(c.cls === "src" ? "src" : c.id));
  }
  function sorted(rows) {
    const c = COLS.find((x) => x.id === S.sort.col);
    if (!c || !c.get) return rows;
    const d = S.sort.dir === "asc" ? 1 : -1;
    return rows
      .map((r, i) => [r, i])
      .sort((a, b) => {
        const x = c.get(a[0]), y = c.get(b[0]);
        if (x == null && y == null) return a[1] - b[1];
        if (x == null) return 1; // nulls last in both directions
        if (y == null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * d || a[1] - b[1];
      })
      .map((p) => p[0]);
  }
  /* The visible order — groups by size, rows sorted within. Returns [{group, rows}] */
  function view() {
    const rows = sorted(WB.items.filter(matches));
    if (S.group === "none" || S.queue) return [{ group: null, rows }];
    const m = new Map();
    rows.forEach((r) => {
      const g = groupOf(r);
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(r);
    });
    // returns first (fresh work), buckets of the other type last, then by size
    const rank = (g) => (/^Draft returns|^Returns/.test(g) ? 0 : /^Effects|^Tracks$/.test(g) && S.type === "all" ? 2 : 1);
    return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].length - a[1].length).map(([group, rows]) => ({ group, rows }));
  }
  function visibleIds() {
    const out = [];
    view().forEach((g) => {
      if (g.group && S.collapsed.has(g.group)) return;
      g.rows.forEach((r) => out.push(r.id));
    });
    return out;
  }
  function counts(rows) {
    const c = { proven: 0, kept: 0, unjudged: 0, rejected: 0 };
    rows.forEach((r) => c[V(r)]++);
    return c;
  }
  function dimsFor(it) {
    return DIMS.map((d, i) => i).filter((i) => !(it && it.kind === "sfx" && it.loopable && i === 0));
  }

  /* ── header ──────────────────────────────────────────────────────────── */
  function renderTop() {
    const all = WB.items;
    const c = counts(all);
    const nT = all.filter((i) => i.kind === "track").length;
    $("census").innerHTML =
      `<span class="tally"><b>${all.length}</b><small>takes</small></span>` +
      `<span class="tally" style="color:var(--gt-accent-violet)"><b>${nT}</b><small>tracks</small></span>` +
      `<span class="tally" style="color:var(--al-gold)"><b>${all.length - nT}</b><small>effects</small></span>` +
      `<span class="tally"><b>${WB.reasons().length}</b><small>reasons</small></span>` +
      `<span class="tally"><b>${WB.vocabulary().filter((v) => v.stance || v.phrase).length}</b><small>curated terms</small></span>`;
    $("bigbar").innerHTML = VORDER.map(
      (v) => `<button type="button" class="seg-${v}" style="flex-grow:${c[v]}" data-v="${v}" aria-label="${c[v]} ${v}"></button>`
    ).join("");
    $("typeSeg").innerHTML = [["all", "All"], ["track", "Tracks"], ["sfx", "Effects"]]
      .map(([k, l]) => `<button type="button" data-type="${k}" aria-pressed="${S.type === k}">${l}</button>`)
      .join("");
    $("verdictChips").innerHTML = VORDER.map(
      (v) => `<button type="button" class="tally t-${v}" data-vf="${v}" aria-pressed="${S.verdicts.has(v)}"><b>${c[v]}</b><small>${VLABEL[v]}</small></button>`
    ).join("");
    const af = [];
    if (S.term) af.push(`<span class="filterchip">${esc(S.term.term)}<button type="button" data-clear="term" aria-label="Clear term filter">×</button></span>`);
    if (S.ref) af.push(`<span class="filterchip">ref · ${esc(REFNAME[S.ref] ? REFNAME[S.ref].title : S.ref)}<button type="button" data-clear="ref" aria-label="Clear reference filter">×</button></span>`);
    $("activeFilters").innerHTML = af.join("");
    $("storage").innerHTML = WB.storageError ? `<div class="storage" role="alert">${esc(WB.storageError)}</div>` : "";
  }

  /* ── terms ───────────────────────────────────────────────────────────── */
  function barHTML(e, scale) {
    const un = Math.max(0, e.n - e.kept - e.rejected);
    const w = (x) => (x / e.n) * 100 * scale;
    return (
      `<i class="seg-proven" style="width:${w(e.proven)}%"></i><i class="seg-kept" style="width:${w(e.kept - e.proven)}%"></i>` +
      `<i class="seg-unjudged" style="width:${w(un)}%"></i><i class="seg-rejected" style="width:${w(e.rejected)}%"></i>`
    );
  }
  function sfxVocab() {
    const m = new Map();
    WB.items.forEach((it) => {
      if (it.kind !== "sfx") return;
      const k = it.sfx_category;
      if (!m.has(k)) m.set(k, { id: "sfx_category:" + k, term: k, facet: "sfx_category", n: 0, kept: 0, proven: 0, rejected: 0, sum: 0, rated: 0, reasons: {} });
      const e = m.get(k);
      e.n++;
      const v = V(it);
      if (v === "proven") e.proven++;
      if (v === "proven" || v === "kept") e.kept++;
      if (v === "rejected") {
        e.rejected++;
        if (it.reject_reason) e.reasons[it.reject_reason] = (e.reasons[it.reject_reason] || 0) + 1;
      }
      const s = WB.score(it);
      if (s != null) (e.sum += s), e.rated++;
    });
    return [...m.values()].map((e) => {
      const judged = e.kept + e.rejected;
      return Object.assign(e, { avg: e.rated ? e.sum / e.rated : null, keepRate: judged ? e.kept / judged : null, judged, topReason: Object.entries(e.reasons).sort((a, b) => b[1] - a[1])[0] || null, sfx: true });
    });
  }
  function sortTerms(list) {
    const k = S.termSort;
    return list.slice().sort((a, b) =>
      k === "name" ? a.term.localeCompare(b.term) : k === "n" ? b.n - a.n || a.term.localeCompare(b.term) : (b.kept + 1) / (b.judged + 2) - (a.kept + 1) / (a.judged + 2) || b.judged - a.judged
    );
  }
  function renderTerms() {
    const host = $("colLeft");
    const keepScroll = host.scrollTop;
    const voc = WB.vocabulary();
    const secs = [
      { id: "genre_tags", label: "Genre", list: voc.filter((v) => v.facet === "genre_tags") },
      { id: "mood_tags", label: "Mood", list: voc.filter((v) => v.facet === "mood_tags") },
      { id: "instrumentation", label: "Instrument", list: voc.filter((v) => v.facet === "instrumentation") },
      { id: "sfx_category", label: "Effect category", list: sfxVocab() },
    ];
    let h = `<div class="colhead"><h2>Terms</h2><span class="grow"></span><div class="seg" role="group" aria-label="Sort terms">` +
      [["rate", "keep %"], ["n", "n"], ["name", "A–Z"]].map(([k, l]) => `<button type="button" data-tsort="${k}" aria-pressed="${S.termSort === k}">${l}</button>`).join("") +
      `</div></div>`;
    secs.forEach((sec) => {
      const open = !S.termCollapsed.has(sec.id);
      const maxN = Math.max(1, ...sec.list.map((e) => e.n));
      const pref = sec.list.filter((e) => e.stance === "prefer").length;
      const avoid = sec.list.filter((e) => e.stance === "avoid").length;
      h += `<section class="terms__sec"><button type="button" class="terms__sechead" data-tsec="${sec.id}" aria-expanded="${open}">` +
        `<span class="caret" aria-hidden="true">▾</span><span class="caps">${sec.label}</span><span class="grow"></span>` +
        (pref ? `<span class="tally t-proven"><b>${pref}</b><small>★</small></span>` : "") +
        (avoid ? `<span class="tally t-rejected"><b>${avoid}</b><small>⊘</small></span>` : "") +
        `<span class="tally"><b>${sec.list.length}</b></span></button>`;
      if (open) {
        sortTerms(sec.list).forEach((e) => {
          const on = S.term && S.term.facet === e.facet && S.term.term === e.term;
          const kr = e.keepRate == null ? "—" : Math.round(e.keepRate * 100) + "%";
          h += `<div class="term${on ? " is-on" : ""}${e.stance === "prefer" ? " is-prefer" : ""}${e.stance === "avoid" ? " is-avoid" : ""}">`;
          if (e.sfx) h += `<span></span><span></span>`;
          else
            h += `<button type="button" class="stance s-prefer" data-stance="prefer" data-vid="${esc(e.id)}" aria-pressed="${e.stance === "prefer"}" aria-label="Prefer ${esc(e.term)}">★</button>` +
              `<button type="button" class="stance s-avoid" data-stance="avoid" data-vid="${esc(e.id)}" aria-pressed="${e.stance === "avoid"}" aria-label="Avoid ${esc(e.term)}">⊘</button>`;
          h += `<button type="button" class="term__name" data-term="${esc(e.term)}" data-facet="${e.facet}" aria-pressed="${!!on}">${esc(e.term)}</button>` +
            `<span class="term__nums"><b>${kr}</b> · ${e.n} · ${e.avg == null ? "—" : e.avg.toFixed(1)}</span>` +
            `<span class="term__bar" style="width:${Math.max(12, (e.n / maxN) * 100)}%" aria-label="${e.proven} proven, ${e.kept - e.proven} kept, ${e.rejected} rejected of ${e.n}" role="img">${barHTML(e, 1)}</span>` +
            `<span class="term__foot">` +
            (e.sfx ? "" : `<span class="dim mono arrow${e.phrase ? " has" : ""}" aria-hidden="true">→</span><input class="phrase${e.phrase ? " has" : ""}" data-phrase="${esc(e.id)}" value="${esc(e.phrase)}" placeholder="as written" aria-label="Prompt phrasing for ${esc(e.term)}">`) +
            (e.topReason ? `<span class="reason" title="${esc(e.topReason[0])}">${esc(e.topReason[0])}</span>` : "") +
            `</span></div>`;
        });
      }
      h += `</section>`;
    });
    host.innerHTML = h;
    host.scrollTop = keepScroll;
  }

  /* ── ledger ──────────────────────────────────────────────────────────── */
  const ICO_PLAY = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
  const ICO_PAUSE = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>';
  function sc(it, key, di) {
    const v = it.ratings ? it.ratings[key] : null;
    const na = it.kind === "sfx" && it.loopable && key === "melody";
    const on = it.id === S.sel && di === S.dim && S.kbd;
    if (na) return `<span class="sc na${on ? " dim-on" : ""}">n/a</span>`;
    if (v == null) return `<span class="sc na${on ? " dim-on" : ""}">·</span>`;
    return `<span class="sc${v >= 7 ? " hi" : v <= 4 ? " lo" : ""}${on ? " dim-on" : ""}">${v}</span>`;
  }
  function rowHTML(it) {
    const v = V(it);
    const s = WB.score(it);
    const st = WB.engine.state(it.id);
    const tags = tagsOf(it);
    const src = [];
    if (it.reference_track_id) src.push(`<span class="chip chip--src chip--ref">ref·${esc((REFNAME[it.reference_track_id] || {}).title || "?")}</span>`);
    else if (it.prompt_round) src.push(`<span class="chip chip--src ${ROUND[it.prompt_round].cls}">${ROUND[it.prompt_round].s}</span>`);
    if (it.draft_id || it.parent_id) src.push(`<span class="chip chip--src chip--ret">return</span>`);
    const sel = it.id === S.sel;
    const cell = {
      play: `<td><button type="button" class="playbtn${st.playing ? " is-playing" : ""}" data-play="${it.id}" tabindex="-1" aria-label="${st.playing ? "Pause" : "Play"} ${esc(it.title)}"${WB.hasFile(it) ? "" : " disabled"}>${st.playing ? ICO_PAUSE : ICO_PLAY}</button></td>`,
      title: `<td class="c-title">${esc(it.title)}<small>${WB.dur(it.duration_s)}</small></td>`,
      type: `<td class="c-type"><span class="kind kind--${it.kind}">${it.kind === "track" ? "T" : "FX"}</span></td>`,
      verdict: `<td><span class="pill t-${v}">${v}</span></td>`,
      melody: `<td class="k-tbl__num">${sc(it, "melody", 0)}</td>`,
      instrument_choice: `<td class="k-tbl__num">${sc(it, "instrument_choice", 1)}</td>`,
      instrument_quality: `<td class="k-tbl__num">${sc(it, "instrument_quality", 2)}</td>`,
      score: `<td class="k-tbl__num"><span class="score">${s == null ? "—" : s.toFixed(1)}</span></td>`,
      tags: `<td class="c-tags">${tags.slice(0, 3).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}${tags.length > 3 ? `<span class="dim">+${tags.length - 3}</span>` : ""}</td>`,
      vendor: `<td class="c-vendor">${it.vendor ? esc(it.vendor) : '<span class="dim">—</span>'}</td>`,
      src: `<td class="c-src">${src.join("") || '<span class="dim">—</span>'}</td>`,
      age: `<td class="k-tbl__num c-age dim">${WB.ago(it.created_at)}</td>`,
    };
    const VC = cols();
    let h = `<tr class="row is-v-${v}${sel ? " is-sel" : ""}${S.flash === it.id ? " is-new" : ""}" data-id="${it.id}" tabindex="${sel ? 0 : -1}" aria-selected="${sel}">` + VC.map((c) => cell[c.id]).join("") + `</tr>`;
    if (S.rejecting === it.id) {
      const rs = WB.reasons().slice(0, 7);
      h += `<tr class="rej"><td colspan="${VC.length}"><div class="rejbox" id="rejbox">` +
        `<input id="rejInput" type="text" placeholder="Why rejected?" aria-label="Reject reason for ${esc(it.title)}" aria-required="true" autocomplete="off">` +
        `<button type="button" class="btn btn--rej" data-rejcommit="${it.id}">Reject <kbd>↵</kbd></button><button type="button" class="btn" data-rejcancel>Esc</button>` +
        `<span class="req" id="rejReq" hidden>reason required</span><span style="flex-basis:100%"></span>` +
        rs.map(([r, n]) => `<button type="button" class="chip" data-rejpick="${esc(r)}">${esc(r)} <span class="dim">${n}</span></button>`).join("") +
        `</div></td></tr>`;
    }
    return h;
  }
  function renderLedger() {
    const host = $("colMid");
    const keepScroll = host.scrollTop;
    const groups = view();
    const total = groups.reduce((a, g) => a + g.rows.length, 0);
    const unj = WB.items.filter((i) => !S.queue && matches(i) && V(i) === "unjudged").length;
    let h = `<div class="colhead"><h2>Ledger</h2><span class="tally"><b>${total}</b><small>shown</small></span><span class="grow"></span>` +
      `<div class="ledger-tools"><span class="caps">Group</span><div class="seg" role="group" aria-label="Group by">` +
      [["none", "none"], ["recipe", "recipe"], ["family", "genre family"], ["sfx", "sfx category"]].map(([k, l]) => `<button type="button" data-group="${k}" aria-pressed="${S.group === k}"${S.queue ? " disabled" : ""}>${l}</button>`).join("") +
      `</div>` +
      (S.queue ? "" : `<button type="button" class="btn btn--cyan" data-queue ${unj ? "" : "disabled"}>Queue · ${Math.min(20, unj)} unjudged</button>`) +
      `</div></div>`;
    if (S.queue) {
      const done = S.queue.filter((id) => V(WB.get(id)) !== "unjudged").length;
      h += `<div class="queue"><span class="caps">Queue</span><span class="pips" role="img" aria-label="${done} of ${S.queue.length} judged">` +
        S.queue.map((id) => `<i class="seg-${V(WB.get(id))}${id === S.sel ? " cur" : ""}"></i>`).join("") +
        `</span><span class="tally"><b>${done}/${S.queue.length}</b></span><span class="grow" style="flex:1"></span><button type="button" class="btn" data-queueexit>Exit queue</button></div>`;
    }
    const VC = cols();
    h += `<table class="k-tbl"><thead><tr>` +
      VC.map((c) => {
        const cls = (c.num ? "k-tbl__num " : "") + (c.cls ? "th-" + c.cls + " " : "");
        if (c.plain) return `<th class="${cls}" scope="col"><span class="plain">${c.label || '<span class="sr-only">Play</span>'}</span></th>`;
        const on = S.sort.col === c.id;
        const dir = on ? S.sort.dir : null;
        return `<th class="${cls}${on ? "k-tbl__on" : ""}" scope="col" aria-sort="${dir ? (dir === "asc" ? "ascending" : "descending") : "none"}"><button type="button" data-sort="${c.id}">${c.label}` +
          `<svg viewBox="0 0 10 14" aria-hidden="true" class="k-tbl__caret" data-dir="${dir || "none"}"><path class="k-tbl__up" d="M5 1 L9 6 H1 Z"/><path class="k-tbl__dn" d="M5 13 L9 8 H1 Z"/></svg></button></th>`;
      }).join("") +
      `</tr></thead><tbody>`;
    groups.forEach((g) => {
      if (g.group) {
        const c = counts(g.rows);
        const open = !S.collapsed.has(g.group);
        const sc = g.rows.map(WB.score).filter((x) => x != null);
        const avg = sc.length ? (sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(1) : "—";
        const retired = /round 3/.test(g.group);
        h += `<tr class="grp"><td colspan="${VC.length}"><button type="button" data-grp="${esc(g.group)}" aria-expanded="${open}">` +
          `<span class="caret" aria-hidden="true">▾</span><span class="g-name">${esc(g.group)}</span>${retired ? '<span class="tag-retired">retired path</span>' : ""}` +
          `<span class="tally"><b>${g.rows.length}</b></span>` +
          `<span class="g-bar" role="img" aria-label="${c.proven} proven, ${c.kept} kept, ${c.unjudged} unjudged, ${c.rejected} rejected">` +
          VORDER.map((v) => `<i class="seg-${v}" style="flex:${c[v]}"></i>`).join("") +
          `</span><span class="g-t"><span class="t-proven">${c.proven}</span> · <span class="t-kept">${c.kept}</span> · <span class="t-unjudged">${c.unjudged}</span> · <span class="t-rejected">${c.rejected}</span></span>` +
          `<span style="flex:1"></span><span class="g-t dim">avg ${avg}</span></button></td></tr>`;
        if (!open) return;
      }
      g.rows.forEach((r) => (h += rowHTML(r)));
    });
    h += `</tbody></table>`;
    if (!total) h += `<div class="empty">0 / ${WB.items.length}</div>`;
    h += `<div class="keycaps" aria-label="Keys"><span><kbd>↑</kbd><kbd>↓</kbd>take</span><span><kbd>←</kbd><kbd>→</kbd><kbd>Tab</kbd>MEL · CHO · QUA</span><span><kbd>1</kbd>–<kbd>9</kbd><kbd>0</kbd>score</span>` +
      `<span><kbd>↵</kbd>keep</span><span><kbd>X</kbd><kbd>⌫</kbd>reject</span><span><kbd>U</kbd>clear</span><span><kbd>Space</kbd>play</span></div>`;
    host.innerHTML = h;
    host.classList.toggle("has-queue", !!S.queue);
    const ch = host.querySelector(".colhead"), qb = host.querySelector(".queue");
    host.style.setProperty("--hh", (ch ? ch.offsetHeight : 44) + "px");
    host.style.setProperty("--th", (ch ? ch.offsetHeight : 44) + (qb ? qb.offsetHeight : 0) + "px");
    host.scrollTop = keepScroll;
    if (S.rejecting) {
      const inp = $("rejInput");
      if (inp) inp.focus();
    } else if (S.kbd && S.sel) {
      const tr = host.querySelector(`tr.row[data-id="${S.sel}"]`);
      if (tr) {
        tr.focus({ preventScroll: true });
        ensureVisible(tr);
      }
    }
    if (S.flash) setTimeout(() => (S.flash = null), 2500);
  }
  function ensureVisible(tr) {
    const host = $("colMid");
    const r = tr.getBoundingClientRect(), h = host.getBoundingClientRect();
    const head = host.querySelector(".k-tbl thead");
    const top = head ? head.getBoundingClientRect().bottom : h.top + 86;
    if (r.top < top) host.scrollTop -= top - r.top + 8;
    else if (r.bottom > h.bottom - 8) host.scrollTop += r.bottom - h.bottom + 40;
  }

  /* ── inspector ───────────────────────────────────────────────────────── */
  function lineageHTML(it) {
    const out = [];
    const parent = it.parent_id ? WB.get(it.parent_id) : null;
    if (parent && parent.parent_id) {
      // walk up for older ancestors
      const chain = [];
      let p = WB.get(parent.parent_id);
      while (p && chain.length < 4) {
        chain.unshift(p);
        p = p.parent_id ? WB.get(p.parent_id) : null;
      }
      chain.forEach((a) => out.push(`<li><div class="k">ancestor <span class="pill t-${V(a)}">${V(a)}</span></div><button type="button" class="linkrow" data-open="${a.id}">${esc(a.title)}</button></li>`));
    }
    const refId = it.reference_track_id || (parent && parent.reference_track_id);
    if (refId) {
      const ref = WB.references().find((r) => r.id === refId);
      const lib = ref && ref.methods[0];
      out.push(`<li><div class="k">reference</div><div class="v">${esc(ref ? ref.name.artist + " — " + ref.name.title : refId)}</div>` +
        (lib ? `<div class="k"><span class="chip mono">librosa ${lib.tempo.toFixed(1)} BPM</span><span class="chip mono">${esc(lib.key)}</span><span class="chip ${lib.err.ok ? "ok" : "bad"}">${esc(lib.err.kind)}</span></div>` : "") + `</li>`);
    } else if (it.kind === "track" && !parent) {
      out.push(`<li class="ghost"><div class="k">reference</div><div class="v dim">—</div></li>`);
    }
    if (parent) out.push(`<li><div class="k">parent take <span class="pill t-${V(parent)}">${V(parent)}</span></div><button type="button" class="linkrow" data-open="${parent.id}">${esc(parent.title)}</button></li>`);
    if (it.kind === "track") {
      const r = it.prompt_round && ROUND[it.prompt_round];
      out.push(`<li><div class="k">concept ${r ? `<span class="chip chip--src ${r.cls}">${r.s}</span>${r.cls ? '<span class="tag-retired">retired</span>' : ""}` : ""}</div>` +
        `<div class="v">${[(it.genre_tags || []).join(" / "), it.tempo_bpm ? Math.round(it.tempo_bpm) + " BPM" : "", it.key || ""].filter(Boolean).map(esc).join(" · ")}</div></li>`);
    }
    const draft = it.draft_id ? WB.drafts.find((d) => d.id === it.draft_id) : null;
    const text = it.prompt_text || (draft && draft.text);
    if (text) out.push(`<li><div class="k">draft <span class="chip">${esc((draft && draft.target) || it.vendor || "")}</span>${draft && draft.copied_at ? `<span class="dim">copied ${WB.ago(draft.copied_at)}</span>` : ""}</div><pre>${esc(text)}</pre></li>`);
    else if (it.kind === "track") out.push(`<li class="ghost"><div class="k">draft <span class="chip">re-composed</span></div><pre>${esc(WB.compose(WB.seedOf(it), it.vendor === "elevenlabs" ? "elevenlabs" : "suno"))}</pre></li>`);
    out.push(`<li class="here"><div class="k">this take <span class="pill t-${V(it)}">${V(it)}</span>${it.vendor ? `<span class="chip">${esc(it.vendor)}</span>` : ""}</div><div class="v">${esc(it.title)}</div></li>`);
    const kids = WB.children(it.id);
    const awaiting = WB.drafts.filter((d) => d.parent_id === it.id && !d.returns.length);
    kids.forEach((k) => out.push(`<li><div class="k">return <span class="pill t-${V(k)}">${V(k)}</span></div><button type="button" class="linkrow" data-open="${k.id}">${esc(k.title)}</button></li>`));
    awaiting.forEach((d) => out.push(`<li class="ghost"><div class="k"><span class="await-chip">awaiting return</span><span class="chip">${esc(d.target)}</span></div><div class="draft__t">${esc(d.text.split("\n")[0])}</div></li>`));
    return `<ol class="path">${out.join("")}</ol>`;
  }
  let inspPlayer = null;
  let lastInspSel = null;
  function renderInspector() {
    const host = $("colRight");
    const keepScroll = S.inspTop || (S.tab === "take" && S.sel !== lastInspSel) ? 0 : host.scrollTop;
    S.inspTop = false;
    lastInspSel = S.sel;
    const refs = WB.references();
    let h = `<div class="colhead"><div class="tabs" role="tablist">` +
      `<button type="button" role="tab" data-tab="take" aria-selected="${S.tab === "take"}">Take · Compose</button>` +
      `<button type="button" role="tab" data-tab="refs" aria-selected="${S.tab === "refs"}">References <span class="mono">${refs.length}</span></button>` +
      `</div><span class="grow"></span><button type="button" class="btn only-narrow" data-closedrawer aria-label="Close inspector">×</button></div>`;
    if (S.tab === "refs") h += refsHTML(refs);
    else h += takeHTML() + composerHTML();
    host.innerHTML = h;
    host.scrollTop = keepScroll;
    const ph = $("playerHost");
    if (ph) {
      const it = WB.get(S.sel);
      inspPlayer = WB.bindPlayer(ph, it, { n: 96 });
    }
    bindDrops(host);
  }
  function takeHTML() {
    const it = S.sel && WB.get(S.sel);
    if (!it) return `<section class="panel"><div class="empty">—</div></section>`;
    const v = V(it);
    const dims = dimsFor(it);
    let h = `<section class="panel" aria-label="Take">` +
      `<h2 class="insp-title">${esc(it.title)}</h2>` +
      `<div class="meta"><span class="kind kind--${it.kind}">${it.kind === "track" ? "T" : "FX"}</span><span class="pill t-${v}">${v}</span>` +
      `${it.vendor ? `<span class="chip">${esc(it.vendor)}</span>` : ""}<span class="mono">${esc(it.id)}</span><span class="dim">${WB.ago(it.created_at)}</span>` +
      `${WB.score(it) != null ? `<span class="tally"><b>${WB.score(it).toFixed(1)}</b><small>score</small></span>` : ""}</div>` +
      `<div id="playerHost"></div>` +
      `<div class="rubric" role="group" aria-label="Rubric">` +
      DIMS.map((d, di) => {
        const val = it.ratings ? it.ratings[d.key] : null;
        const off = !dims.includes(di);
        return `<div class="rub${di === S.dim ? " is-dim" : ""}"><span class="rub__l" title="${d.label}">${d.short}</span><div class="rub__s" role="radiogroup" aria-label="${d.label}">` +
          Array.from({ length: 10 }, (_, k) => k + 1).map((n) => `<button type="button" role="radio" aria-checked="${val === n}" class="${val === n ? "at" : val != null && n < val ? "fill" : ""}" data-rate="${d.key}" data-n="${n}"${off ? " disabled" : ""}>${n}</button>`).join("") +
          `</div><span class="rub__v">${off ? "n/a" : val == null ? "·" : val}</span></div>`;
      }).join("") +
      `</div><div class="actions">` +
      `<button type="button" class="btn btn--keep" data-keep="${it.id}"${v === "kept" || v === "proven" ? ' aria-pressed="true"' : ""}>Keep <kbd>↵</kbd></button>` +
      `<button type="button" class="btn btn--rej" data-rejinsp="${it.id}">Reject <kbd>X</kbd></button>` +
      (v !== "unjudged" ? `<button type="button" class="btn" data-clearv="${it.id}">Clear <kbd>U</kbd></button>` : "") +
      `<span style="flex:1"></span><button type="button" class="btn btn--cyan" data-seedfrom="${it.id}"${it.kind === "track" ? "" : " disabled"}>Seed composer</button></div>`;
    if (S.rejectInsp) {
      h += `<div class="rejbox" id="rejboxI" style="margin-top:10px"><input id="rejInputI" type="text" placeholder="Why rejected?" aria-label="Reject reason" autocomplete="off">` +
        `<button type="button" class="btn btn--rej" data-rejcommiti="${it.id}">Reject</button><span class="req" id="rejReqI" hidden>reason required</span><span style="flex-basis:100%"></span>` +
        WB.reasons().slice(0, 6).map(([r]) => `<button type="button" class="chip" data-rejpicki="${esc(r)}">${esc(r)}</button>`).join("") + `</div>`;
    }
    if (it.reject_reason && v === "rejected") h += `<p class="quote">${esc(it.reject_reason)}</p>`;
    h += `<dl class="facts">`;
    if (it.kind === "track") {
      h += `<dt>Genre</dt><dd>${(it.genre_tags || []).map((t) => `<button type="button" class="chip" data-fterm="genre_tags|${esc(t)}">${esc(t)}</button>`).join("")}</dd>` +
        `<dt>Mood</dt><dd>${(it.mood_tags || []).map((t) => `<button type="button" class="chip" data-fterm="mood_tags|${esc(t)}">${esc(t)}</button>`).join("")}</dd>` +
        `<dt>Instr.</dt><dd>${(it.instrumentation || []).map((t) => `<button type="button" class="chip" data-fterm="instrumentation|${esc(t)}">${esc(t)}</button>`).join("")}</dd>` +
        `<dt>Tempo</dt><dd class="mono">${it.tempo_bpm ? Math.round(it.tempo_bpm) + " BPM" : "—"} · ${esc(it.key || "—")}</dd>`;
    } else {
      h += `<dt>Category</dt><dd><button type="button" class="chip" data-fterm="sfx_category|${esc(it.sfx_category)}">${esc(it.sfx_category)}</button>${it.loopable ? '<span class="chip">loop</span>' : ""}</dd>`;
    }
    h += `<dt>Length</dt><dd class="mono">${WB.dur(it.duration_s)}${it.file_name ? ` · ${esc(it.file_name)}` : ""}</dd></dl></section>`;
    h += `<section class="panel"><h3>Recipe</h3>${lineageHTML(it)}</section>`;
    const vars = WB.variations(it);
    if (vars.length) {
      h += `<section class="panel"><h3>Variations <span class="tally"><b>${vars.length}</b></span><span class="grow"></span><span class="dim" style="text-transform:none;letter-spacing:0">one axis each</span></h3><div class="vars">` +
        vars.map((x, i) => `<div class="var"><div class="ax">${esc(x.axis)}<span>${esc(x.why)}</span></div><div>${x.diff.map((d) => `<span class="diff ${d[0] === "−" ? "minus" : d[0] === "+" && !/BPM/.test(d) ? "plus" : "same"}">${esc(d)}</span>`).join("")}</div>` +
          `<div class="actions"><button type="button" class="btn" data-varload="${i}">Load</button><button type="button" class="btn btn--cyan" data-varcopy="${i}">Copy</button></div></div>`).join("") + `</div></section>`;
    }
    return h;
  }
  function composerHTML() {
    const sd = S.seed;
    const voc = WB.vocabulary();
    const stanceOf = (facet, t) => (voc.find((v) => v.facet === facet && v.term === t) || {}).stance;
    const phraseOf = (facet, t) => (voc.find((v) => v.facet === facet && v.term === t) || {}).phrase;
    const facetRow = (key, label, facet) => {
      const list = sd[key] || [];
      const floats = voc.filter((v) => v.facet === facet && v.stance === "prefer" && !list.includes(v.term));
      return `<div class="facet"><span class="caps">${label}</span><div class="tchips">` +
        list.map((t, i) => {
          const st = stanceOf(facet, t);
          const ph = phraseOf(facet, t);
          return `<span class="tchip${st === "prefer" ? " pref" : st === "avoid" ? " avoid" : ""}">${esc(t)}${ph ? `<span class="ph">→ ${esc(ph)}</span>` : ""}<button type="button" data-rm="${key}|${i}" aria-label="Remove ${esc(t)}">×</button></span>`;
        }).join("") +
        floats.map((v) => `<button type="button" class="float" data-addt="${key}|${esc(v.term)}" aria-label="Add preferred ${esc(v.term)}">★ ${esc(v.term)}</button>`).join("") +
        `<input class="addterm" list="dl-${facet}" data-add="${key}" placeholder="+ term" aria-label="Add ${label.toLowerCase()} term"></div></div>`;
    };
    const text = WB.compose(sd, S.target);
    const drafts = WB.drafts.slice(0, 8);
    let h = `<section class="panel composer" id="composer" aria-label="Composer"><h3>Composer<span class="grow"></span><span class="src-chip">from <span class="chip">${esc(S.seedFrom)}</span></span>` +
      `<button type="button" class="btn" data-seedclear style="padding:2px 8px">Blank</button></h3>` +
      facetRow("genres", "Genre", "genre_tags") + facetRow("moods", "Mood", "mood_tags") + facetRow("instruments", "Instrument", "instrumentation") +
      `<div class="facet"><span class="caps">Exclude</span><div class="tchips">${(sd.avoid || []).map((t, i) => `<span class="tchip avoid">${esc(t)}<button type="button" data-rm="avoid|${i}" aria-label="Remove ${esc(t)}">×</button></span>`).join("")}` +
      voc.filter((v) => v.stance === "avoid" && !(sd.avoid || []).includes(v.term)).map((v) => `<button type="button" class="float" style="border-color:var(--al-ant);color:var(--al-ant-t)" data-addt="avoid|${esc(v.term)}">⊘ ${esc(v.term)}</button>`).join("") +
      `<input class="addterm" list="dl-instrumentation" data-add="avoid" placeholder="+ exclude" aria-label="Add excluded term"></div></div>` +
      `<div class="facet"><span class="caps">Tempo · key</span><div class="tk"><input type="number" min="40" max="220" step="1" id="seedBpm" value="${sd.bpm ? Math.round(sd.bpm) : ""}" placeholder="BPM" aria-label="Tempo BPM">` +
      `<input class="key" id="seedKey" list="dl-keys" value="${esc(sd.key || "")}" placeholder="key" aria-label="Key">` +
      `<span style="flex:1"></span><div class="seg" role="group" aria-label="Target">${[["suno", "Suno"], ["elevenlabs", "ElevenLabs"]].map(([k, l]) => `<button type="button" data-target="${k}" aria-pressed="${S.target === k}">${l}</button>`).join("")}</div></div></div>` +
      `<pre class="prompt" id="promptText" aria-label="Prompt text">${esc(text)}</pre>` +
      `<div class="actions" style="margin-top:8px"><span class="dim mono" style="font-size:var(--text-label)">${text.length} chars</span><span style="flex:1"></span><button type="button" class="btn btn--solid" data-copydraft>Copy for ${S.target === "suno" ? "Suno" : "ElevenLabs"}</button></div>` +
      `</section>`;
    h += `<section class="panel" aria-label="Drafts"><h3>Drafts <span class="tally"><b>${WB.drafts.filter((d) => !d.returns.length).length}</b><small>awaiting</small></span><span class="tally"><b>${WB.drafts.length}</b><small>sent</small></span></h3><div class="drafts">` +
      (drafts.length ? drafts.map((d) => {
        const par = d.parent_id ? WB.get(d.parent_id) : null;
        return `<div class="draft${d.returns.length ? "" : " await"}"><div class="draft__h"><span class="chip">${esc(d.target)}</span>` +
          (d.returns.length ? `<span class="tally t-kept"><b>${d.returns.length}</b><small>returned</small></span>` : `<span class="await-chip">awaiting return</span>`) +
          `${par ? `<button type="button" class="chip" data-open="${par.id}">↑ ${esc(par.title)}</button>` : d.ref_id ? `<span class="chip chip--ref">ref·${esc((REFNAME[d.ref_id] || {}).title || "")}</span>` : ""}<span class="dim">${WB.ago(d.created_at)}</span>` +
          d.returns.map((r) => (WB.get(r) ? `<button type="button" class="chip chip--ret" data-open="${r}">${esc(WB.get(r).title)}</button>` : "")).join("") +
          `</div><div class="draft__t" title="${esc(d.text)}">${esc(d.text.replace(/\n+/g, " · "))}</div>` +
          `<div class="k-drop k-drop--sm" tabindex="0" role="button" data-drop="${d.id}" aria-label="Attach returned file to this draft">${dropSvg()}<p>drop the file you downloaded · mp3 · wav · m4a</p><input type="file" accept="audio/*" hidden></div></div>`;
      }).join("") : "") + `</div></section>`;
    return h;
  }
  function dropSvg() {
    return `<svg viewBox="-30 -30 60 60" aria-hidden="true"><g fill="none" style="stroke:var(--al-gold)" stroke-width="1" stroke-linecap="round"><path d="M-22 -22 h8 M-22 -22 v8 M22 -22 h-8 M22 -22 v8 M-22 22 h8 M-22 22 v-8 M22 22 h-8 M22 22 v-8"/><circle r="9" stroke-dasharray="1.5 2.5"/><path d="M0 -4 V4 M-4 0 H4"/></g></svg>`;
  }
  function refsHTML(refs) {
    let h = `<section class="panel">`;
    refs.forEach((r) => {
      const relCls = (k) => (k === "exact" ? "ok" : k === "relative" ? "mid" : "bad");
      h += `<article class="ref"><h4>${esc(r.name.artist)} — ${esc(r.name.title)}</h4>` +
        `<div class="meta" style="margin:6px 0 0"><span class="tally"><b>${r.children.length}</b><small>takes</small></span><span class="tally t-kept"><b>${r.kept}</b><small>kept</small></span><span class="tally t-rejected"><b>${r.rejected}</b><small>rejected</small></span></div>` +
        `<table class="mtab"><thead><tr><th>method</th><th>tempo</th><th></th><th>key</th><th></th></tr></thead><tbody>` +
        r.methods.map((m) => `<tr><td class="mono">${esc(m.label)}</td><td class="mono">${m.tempo.toFixed(1)}</td><td><span class="chip ${m.err.ok ? "ok" : "bad"}">${esc(m.err.kind)}</span></td><td>${esc(m.key)}</td><td><span class="chip ${relCls(m.keyRel)}">${m.keyRel}</span></td></tr>`).join("") +
        `<tr class="truth"><td class="mono">tunebat</td><td class="mono">${Number(r.truth.tempo_bpm).toFixed(0)}</td><td><span class="chip mid">truth</span></td><td>${esc(r.truth.key)}</td><td></td></tr>` +
        (r.retired ? `<tr class="retired"><td class="mono x">cloud read</td><td class="mono x">${r.retired.tempo != null ? esc(r.retired.tempo) : "—"}</td><td><span class="tag-retired">retired</span></td><td class="x">${esc(r.retired.key || "—")}</td><td></td></tr>` +
          `<tr class="retired"><td colspan="5" class="x" style="white-space:normal">${esc((r.retired.genres || []).slice(0, 3).join(" · "))}</td></tr>` : "") +
        `</tbody></table><div class="actions"><button type="button" class="btn btn--cyan" data-refseed="${r.id}">Use as seed</button><button type="button" class="btn" data-refopen="${r.id}">${r.children.length} takes in ledger</button></div></article>`;
    });
    h += `</section><section class="panel" aria-label="Analyze a new reference"><h3>New reference<span class="grow"></span><span class="dim" style="text-transform:none;letter-spacing:0">local · offline</span></h3>` +
      `<div class="k-drop" tabindex="0" role="button" data-analyze aria-label="Analyze a reference file">${dropSvg()}<p>mp3 · wav · flac · m4a · first 60 s after the intro · tempo · key · energy</p><input type="file" accept="audio/*" hidden></div>`;
    if (S.stages) {
      const order = ["decode", "tempo", "key", "spectrum"];
      const at = order.indexOf(S.stages.now);
      h += `<div class="stages" role="status">${order.map((s, i) => `<span class="${S.stages.now === "done" || i < at ? "done" : i === at ? "now" : ""}">${s}</span>`).join("")}${S.stages.err ? `<span class="bad">${esc(S.stages.err)}</span>` : ""}</div>`;
    }
    const a = S.analysis;
    if (a) {
      const n = a.peaks.length;
      h += `<div class="ref"><h4>${esc(a.name)}<small>${WB.clock(a.duration)}</small></h4>` +
        `<svg class="mini-wave" viewBox="0 0 ${n} 36" preserveAspectRatio="none" aria-hidden="true">${a.peaks.map((p, i) => `<line x1="${i + 0.5}" x2="${i + 0.5}" y1="${18 - p * 16}" y2="${18 + p * 16}"/>`).join("")}</svg>` +
        `<table class="mtab"><tbody><tr><td class="caps">tempo</td><td class="mono">${a.tempo.toFixed(1)} BPM</td><td class="caps">key</td><td>${esc(a.key)} <span class="dim mono">r ${a.keyConfidence.toFixed(2)}</span></td></tr>` +
        `<tr><td class="caps">energy</td><td>${esc(a.energy)}</td><td class="caps">bright</td><td>${esc(a.brightness)} <span class="dim mono">~${a.centroidHz} Hz</span></td></tr></tbody></table>` +
        `<div class="meta"><span class="caps">nearest proven terms</span><span class="tally"><b>${a.terms.evidence}</b><small>takes</small></span></div>` +
        `<div class="tchips">${a.terms.genres.concat(a.terms.moods, a.terms.instruments).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>` +
        `<div class="actions" style="margin-top:10px"><span class="dim mono" style="font-size:var(--text-label)">${esc(a.method)}</span><span style="flex:1"></span><button type="button" class="btn btn--cyan" data-anaseed>Use as seed</button></div></div>`;
    }
    return h + `</section>`;
  }

  /* ── datalists (once) ── */
  function datalists() {
    const voc = WB.vocabulary();
    const keys = [...new Set(WB.items.map((i) => i.key).filter(Boolean))].sort();
    const d = document.createElement("div");
    d.hidden = true;
    d.innerHTML = ["genre_tags", "mood_tags", "instrumentation"].map((f) => `<datalist id="dl-${f}">${voc.filter((v) => v.facet === f).map((v) => `<option value="${esc(v.term)}">`).join("")}</datalist>`).join("") +
      `<datalist id="dl-keys">${keys.map((k) => `<option value="${esc(k)}">`).join("")}</datalist>`;
    document.body.appendChild(d);
  }

  /* ── actions ─────────────────────────────────────────────────────────── */
  let toastT = null;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("on"), 2200);
  }
  function renderAll() {
    renderTop();
    renderTerms();
    renderLedger();
    renderInspector();
  }
  function select(id, opts) {
    opts = opts || {};
    if (S.sel !== id) {
      S.rejectInsp = false;
      if (S.rejecting && S.rejecting !== id) S.rejecting = null;
      const it = WB.get(id);
      if (it && !dimsFor(it).includes(S.dim)) S.dim = dimsFor(it)[0];
    }
    S.sel = id;
    if (opts.tab) S.tab = opts.tab;
    if (opts.drawer) $("app").classList.add("drawer-open");
    renderLedger();
    renderInspector();
  }
  function nextUnjudged(fromId) {
    const ids = visibleIds();
    const i = ids.indexOf(fromId);
    for (let k = 1; k <= ids.length; k++) {
      const id = ids[(i + k) % ids.length];
      if (id !== fromId && V(WB.get(id)) === "unjudged") return id;
    }
    return null;
  }
  function verdictThen(id, fn) {
    const nxt = nextUnjudged(id);
    fn();
    if (nxt) {
      S.sel = nxt;
      const it = WB.get(nxt);
      S.dim = dimsFor(it)[0];
    }
    S.rejecting = null;
    S.rejectInsp = false;
    renderAll();
    if (S.queue && !S.queue.some((q) => V(WB.get(q)) === "unjudged")) toast(`queue ${S.queue.length}/${S.queue.length}`);
  }
  function commitReject(id, reason, inspector) {
    const ok = WB.reject(id, reason);
    if (!ok) return false;
    const it = WB.get(id);
    toast(`rejected · ${it.title}`);
    return true;
  }
  function doReject(id, inputId, reqId, boxId) {
    const val = ($(inputId) || {}).value || "";
    if (!val.trim()) {
      const req = $(reqId), box = $(boxId);
      if (req) req.hidden = false;
      if (box) {
        box.classList.remove("shake");
        void box.offsetWidth;
        box.classList.add("shake");
      }
      return;
    }
    S.kbd = true;
    verdictThen(id, () => commitReject(id, val));
  }
  function setSeed(seed, from, parent, ref) {
    S.seed = { genres: (seed.genres || []).slice(), moods: (seed.moods || []).slice(), instruments: (seed.instruments || []).slice(), bpm: seed.bpm || null, key: seed.key || null, avoid: (seed.avoid || []).slice() };
    S.seedFrom = from;
    S.seedParent = parent || null;
    S.seedRef = ref || null;
    S.tab = "take";
    renderInspector();
    const c = $("composer");
    if (c) c.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
  async function copyDraft(seed, target, parent, ref) {
    const text = WB.compose(seed, target);
    const d = WB.addDraft({ text, target, seed, parent_id: parent || null, ref_id: ref || null });
    const ok = await WB.copy(text);
    if (ok) WB.markCopied(d.id);
    toast(ok ? `copied for ${target === "suno" ? "Suno" : "ElevenLabs"} · awaiting return` : "clipboard blocked · draft kept");
  }
  function attach(file, draftId) {
    if (!file) return;
    const d = WB.drafts.find((x) => x.id === draftId);
    const row = WB.attachReturn(file, { parentId: d ? d.parent_id : null, draftId });
    S.flash = row.id;
    S.sel = row.id;
    S.queue = null;
    S.verdicts.clear();
    S.term = null;
    S.ref = null;
    S.q = "";
    $("search").value = "";
    S.collapsed.delete(groupOf(row));
    S.kbd = true;
    S.inspTop = true;
    renderAll();
    const tr = $("colMid").querySelector(`tr.row[data-id="${row.id}"]`);
    if (tr) $("colMid").scrollTop = Math.max(0, tr.offsetTop - $("colMid").clientHeight / 3);
    toast(`returned · ${row.title}`);
  }
  function bindDrops(root) {
    root.querySelectorAll(".k-drop").forEach((z) => {
      const input = z.querySelector("input[type=file]");
      const handle = (files) => {
        const f = files && files[0];
        if (!f) return;
        if (z.dataset.drop) attach(f, z.dataset.drop);
        else analyze(f);
      };
      z.addEventListener("click", (e) => {
        if (e.target !== input) input.click();
      });
      z.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.click();
        }
      });
      z.addEventListener("dragover", (e) => {
        e.preventDefault();
        z.classList.add("k-drop--on");
      });
      z.addEventListener("dragleave", () => z.classList.remove("k-drop--on"));
      z.addEventListener("drop", (e) => {
        e.preventDefault();
        z.classList.remove("k-drop--on");
        handle(e.dataTransfer.files);
      });
      input.addEventListener("change", () => handle(input.files));
    });
  }
  async function analyze(file) {
    S.stages = { now: "decode" };
    S.analysis = null;
    renderInspector();
    try {
      const a = await WB.analyzeFile(file, (st) => {
        S.stages = { now: st };
        if (S.tab === "refs") renderInspector();
      });
      a.name = file.name.replace(/\.[a-z0-9]+$/i, "");
      a.terms = WB.nearestTerms(a);
      S.analysis = a;
    } catch (e) {
      S.stages = { now: S.stages.now, err: "could not decode · " + (e && e.message ? e.message : "unsupported file") };
    }
    renderInspector();
  }

  /* ── events ──────────────────────────────────────────────────────────── */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, tr.row, [data-v]");
    if (!t) return;
    const d = t.dataset;
    if (d.type) (S.type = d.type), (S.queue = null), renderAll();
    else if (d.vf || (d.v && t.closest("#bigbar"))) {
      const v = d.vf || d.v;
      S.verdicts.has(v) ? S.verdicts.delete(v) : S.verdicts.add(v);
      S.queue = null;
      renderAll();
    } else if (d.clear) (S[d.clear] = null), renderAll();
    else if (d.tsort) (S.termSort = d.tsort), renderTerms();
    else if (d.tsec) S.termCollapsed.has(d.tsec) ? S.termCollapsed.delete(d.tsec) : S.termCollapsed.add(d.tsec), renderTerms();
    else if (d.stance) {
      const cur = WB.vocabulary().find((v) => v.id === d.vid);
      WB.setVocab(d.vid, { stance: cur && cur.stance === d.stance ? null : d.stance });
    } else if (d.term && d.facet) {
      const same = S.term && S.term.facet === d.facet && S.term.term === d.term;
      S.term = same ? null : { facet: d.facet, term: d.term };
      S.queue = null;
      $("app").classList.remove("terms-open");
      renderAll();
    } else if (d.fterm) {
      const [facet, term] = d.fterm.split("|");
      S.term = { facet, term };
      S.queue = null;
      renderAll();
    } else if (d.group) (S.group = d.group), renderLedger();
    else if (d.grp) S.collapsed.has(d.grp) ? S.collapsed.delete(d.grp) : S.collapsed.add(d.grp), renderLedger();
    else if (d.sort) {
      const col = d.sort;
      if (S.sort.col === col) S.sort.dir = S.sort.dir === "asc" ? "desc" : "asc";
      else S.sort = { col, dir: COLS.find((c) => c.id === col).num ? "desc" : "asc" };
      renderLedger();
    } else if (d.queue !== undefined) {
      const ids = visibleIds().filter((id) => V(WB.get(id)) === "unjudged").slice(0, 20);
      if (!ids.length) return;
      S.queue = ids;
      S.sel = ids[0];
      S.kbd = true;
      S.dim = dimsFor(WB.get(ids[0]))[0];
      renderAll();
    } else if (d.queueexit !== undefined) (S.queue = null), renderAll();
    else if (d.play) {
      e.stopPropagation();
      WB.engine.toggle(d.play);
    } else if (d.rejcommit) doReject(d.rejcommit, "rejInput", "rejReq", "rejbox");
    else if (d.rejcancel !== undefined) (S.rejecting = null), (S.kbd = true), renderLedger();
    else if (d.rejpick) {
      S.kbd = true;
      const id = S.rejecting;
      verdictThen(id, () => commitReject(id, d.rejpick));
    } else if (d.rejinsp) {
      S.rejectInsp = true;
      renderInspector();
      const i = $("rejInputI");
      if (i) i.focus();
    } else if (d.rejcommiti) doReject(d.rejcommiti, "rejInputI", "rejReqI", "rejboxI");
    else if (d.rejpicki) {
      const id = S.sel;
      verdictThen(id, () => commitReject(id, d.rejpicki));
    } else if (d.keep) verdictThen(d.keep, () => WB.keep(d.keep));
    else if (d.clearv) WB.clearVerdict(d.clearv);
    else if (d.rate) {
      S.dim = DIMS.findIndex((x) => x.key === d.rate);
      S.kbd = false;
      WB.rate(S.sel, d.rate, +d.n);
    } else if (d.open) select(d.open, { tab: "take" });
    else if (d.seedfrom) {
      const it = WB.get(d.seedfrom);
      setSeed(WB.seedOf(it), it.title, it.id, it.reference_track_id);
    } else if (d.varload || d.varcopy) {
      const it = WB.get(S.sel);
      const v = WB.variations(it)[+(d.varload || d.varcopy)];
      if (!v) return;
      if (d.varload) setSeed(v.seed, v.axis + " · " + it.title, it.id, it.reference_track_id);
      else copyDraft(v.seed, it.vendor === "elevenlabs" ? "elevenlabs" : S.target, it.id, it.reference_track_id);
    } else if (d.seedclear !== undefined) setSeed({}, "blank", null, null);
    else if (d.rm) {
      const [k, i] = d.rm.split("|");
      S.seed[k].splice(+i, 1);
      renderInspector();
    } else if (d.addt) {
      const [k, term] = d.addt.split("|");
      if (!S.seed[k].includes(term)) S.seed[k].push(term);
      renderInspector();
    } else if (d.target) (S.target = d.target), renderInspector();
    else if (d.copydraft !== undefined) copyDraft(S.seed, S.target, S.seedParent, S.seedRef);
    else if (d.tab) (S.tab = d.tab), renderInspector();
    else if (d.refseed) {
      const r = WB.references().find((x) => x.id === d.refseed);
      const lib = r.methods[0];
      const c = WB.conceptFor(r.id, { tempo: lib.tempo, key: lib.key });
      setSeed(c, r.name.artist + " — " + r.name.title, null, r.id);
    } else if (d.refopen) {
      S.ref = d.refopen;
      S.queue = null;
      S.group = "none";
      renderAll();
    } else if (d.anaseed !== undefined && S.analysis) {
      const a = S.analysis;
      setSeed({ genres: a.terms.genres, moods: a.terms.moods, instruments: a.terms.instruments, bpm: a.tempo, key: a.key }, a.name, null, null);
    } else if (d.closedrawer !== undefined) $("app").classList.remove("drawer-open");
    else if (t.matches("tr.row")) {
      S.kbd = true;
      select(d.id, { drawer: true });
    }
  });
  $("scrim").addEventListener("click", () => $("app").classList.remove("drawer-open", "terms-open"));
  $("drawerBtn").addEventListener("click", () => $("app").classList.toggle("drawer-open"));
  $("termsBtn").addEventListener("click", () => $("app").classList.toggle("terms-open"));
  let qT = null;
  $("search").addEventListener("input", (e) => {
    clearTimeout(qT);
    qT = setTimeout(() => {
      S.q = e.target.value.trim().toLowerCase();
      S.queue = null;
      renderTop();
      renderLedger();
    }, 90);
  });
  // phrase edits, tempo/key fields, add-term inputs
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.phrase) WB.setVocab(t.dataset.phrase, { phrase: t.value.trim() });
    else if (t.dataset.add) {
      const v = t.value.trim();
      const k = t.dataset.add;
      if (v && !S.seed[k].includes(v)) S.seed[k].push(v);
      renderInspector();
      const again = document.querySelector(`[data-add="${k}"]`);
      if (again) again.focus();
    }
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "seedBpm" || t.id === "seedKey") {
      if (t.id === "seedBpm") S.seed.bpm = +t.value || null;
      else S.seed.key = t.value.trim() || null;
      const p = $("promptText");
      if (p) p.textContent = WB.compose(S.seed, S.target);
    }
  });
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.phrase && e.key === "Enter") t.blur();
    if (t.id === "rejInput") {
      if (e.key === "Enter") (e.preventDefault(), doReject(S.rejecting, "rejInput", "rejReq", "rejbox"));
      else if (e.key === "Escape") (S.rejecting = null), (S.kbd = true), renderLedger();
      return;
    }
    if (t.id === "rejInputI") {
      if (e.key === "Enter") (e.preventDefault(), doReject(S.sel, "rejInputI", "rejReqI", "rejboxI"));
      else if (e.key === "Escape") (S.rejectInsp = false), renderInspector();
      return;
    }
    if (e.key === "Escape") $("app").classList.remove("drawer-open", "terms-open");
    if (e.key === "/" && !/INPUT|TEXTAREA/.test(t.tagName)) {
      e.preventDefault();
      $("search").focus();
      return;
    }
    // nothing focused yet: the selected row takes the keys, so rating starts on first load
    let row = t;
    if ((t === document.body || t === document.documentElement) && S.sel) {
      row = document.querySelector(`tr.row[data-id="${S.sel}"]`);
      if (row) row.focus({ preventScroll: true });
    }
    if (!row || !row.matches || !row.matches("tr.row")) return;
    const id = row.dataset.id;
    const it = WB.get(id);
    const dims = dimsFor(it);
    const k = e.key;
    S.kbd = true;
    if (k === "ArrowDown" || k === "ArrowUp" || k === "j" || k === "k") {
      e.preventDefault();
      const ids = visibleIds();
      const i = ids.indexOf(id);
      const n = ids[Math.max(0, Math.min(ids.length - 1, i + (k === "ArrowDown" || k === "j" ? 1 : -1)))];
      if (n && n !== id) select(n);
    } else if (k === "ArrowRight" || k === "ArrowLeft" || k === "Tab") {
      const fwd = k === "ArrowRight" || (k === "Tab" && !e.shiftKey);
      const pos = dims.indexOf(S.dim);
      const np = pos + (fwd ? 1 : -1);
      if (k === "Tab" && (np < 0 || np >= dims.length)) return; // let Tab leave the table at the ends
      e.preventDefault();
      S.dim = dims[Math.max(0, Math.min(dims.length - 1, np))];
      renderLedger();
      renderInspector();
    } else if (/^[0-9]$/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const v = k === "0" ? 10 : +k;
      const key = DIMS[S.dim].key;
      const pos = dims.indexOf(S.dim);
      if (pos < dims.length - 1) S.dim = dims[pos + 1];
      WB.rate(id, key, v);
    } else if (k === "Enter") {
      e.preventDefault();
      verdictThen(id, () => WB.keep(id));
      toast(`kept · ${it.title}`);
    } else if (k === "Backspace" || k === "x" || k === "X" || k === "Delete") {
      e.preventDefault();
      S.rejecting = id;
      renderLedger();
    } else if (k === "u" || k === "U") {
      e.preventDefault();
      WB.clearVerdict(id);
    } else if (k === " ") {
      e.preventDefault();
      WB.engine.toggle(id);
    } else if (k === "o" || k === "O") {
      $("app").classList.add("drawer-open");
    }
  });

  // playback state → only the tiny buttons (the inspector player binds itself)
  WB.engine.on((c) => {
    document.querySelectorAll(".playbtn").forEach((b) => {
      const on = c && c.id === b.dataset.play && c.playing;
      if (b.classList.contains("is-playing") !== !!on) {
        b.classList.toggle("is-playing", !!on);
        b.innerHTML = on ? ICO_PAUSE : ICO_PLAY;
        b.setAttribute("aria-label", (on ? "Pause " : "Play ") + WB.get(b.dataset.play).title);
      }
    });
  });
  WB.onChange(() => renderAll());
  let rzT = null, lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => {
      if (window.innerWidth !== lastW) (lastW = window.innerWidth), renderLedger();
    }, 120);
  });

  // first selection: the newest unjudged track, so the page opens on work
  const first = WB.items.filter((i) => V(i) === "unjudged").sort((a, b) => b.created_at - a.created_at)[0] || WB.items[0];
  S.sel = first && first.id;
  if (first && first.kind === "track") {
    S.seed = WB.seedOf(first);
    S.seedFrom = first.title;
    S.seedParent = first.id;
  }
  datalists();
  renderAll();
  const firstRow = S.sel && $("colMid").querySelector(`tr.row[data-id="${S.sel}"]`);
  if (firstRow) {
    const m = $("colMid");
    m.scrollTop = Math.max(0, firstRow.offsetTop - m.clientHeight / 3);
  }
})();
