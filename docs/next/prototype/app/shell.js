/* shell.js — what every route is built from: icons, the signal vocabulary as render
   functions, the studio header, the session ledger store, toast. No route logic here.
   window.GT = { $, $$, esc, I, Tally, StackBar, PipRow, Hint, Keycaps, Wave, Src, State,
                 header(current), store, toast, announce, titleCase, LANE_ICON } */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const titleCase = (id) => String(id).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const I = {
    image: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><circle cx="7" cy="8" r="1.6"/><path d="M3 15l4.5-4.5 3 3 2.5-2.5L17 15"/></svg>',
    article: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 2.5h7l3.5 3.5v11.5H5z"/><path d="M8 9h5M8 12h5M8 15h3"/></svg>',
    audio: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 10h2l2-5 3 10 3-12 2.5 9 1.5-2h2"/></svg>',
    video: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="4" width="11" height="12" rx="2"/><path d="M13.5 8.5l4-2.5v8l-4-2.5"/></svg>',
    style: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="4"/><circle cx="13" cy="7" r="4"/><circle cx="10" cy="12.5" r="4"/></svg>',
    motion: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M2.5 8h15M6 5v3M10 5v3M14 5v3"/></svg>',
    doc: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 2.5h7l3.5 3.5v11.5H5z"/><path d="M12 2.5V6h3.5"/></svg>',
    ref: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 3.5h9l3 3v10H4z"/><circle cx="9" cy="10" r="2.5"/><path d="M11 12l3 3"/></svg>',
    search: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
    ledger: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2.5h10v11H3z"/><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3"/></svg>',
    cull: '<svg viewBox="0 0 12 12" fill="currentColor"><rect x="0" y="0" width="5" height="5" rx="1"/><rect x="7" y="0" width="5" height="5" rx="1"/><rect x="0" y="7" width="5" height="5" rx="1"/><rect x="7" y="7" width="5" height="5" rx="1" opacity=".4"/></svg>',
    pair: '<svg viewBox="0 0 12 12" fill="currentColor"><rect x="0" y="1" width="5" height="10" rx="1"/><rect x="7" y="1" width="5" height="10" rx="1"/></svg>',
    review: '<svg viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="0" width="10" height="12" rx="1" opacity=".35"/><rect x="3" y="3" width="6" height="1.4"/><rect x="3" y="6" width="6" height="1.4"/><rect x="3" y="9" width="4" height="1.4"/></svg>',
    lock: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor"/><path d="M4 5.5V4a2 2 0 014 0v1.5"/></svg>',
    play: '<svg viewBox="0 0 10 10" fill="currentColor"><path d="M2 1l7 4-7 4z"/></svg>',
    pause: '<svg viewBox="0 0 10 10" fill="currentColor"><rect x="2" y="1" width="2.2" height="8"/><rect x="5.8" y="1" width="2.2" height="8"/></svg>',
    retry: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M11.5 5A5 5 0 102.5 8"/><path d="M11.5 1.5V5H8"/></svg>',
    route: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1.5 3.5h6a3 3 0 010 6H4"/><path d="M10 7.5l2.5 2-2.5 2"/><path d="M4 9.5H12.5"/></svg>',
    up: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 8.5L7 4.5l4 4"/></svg>',
    down: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 5.5L7 9.5l4-4"/></svg>',
    warn: '<svg viewBox="0 0 14 14" fill="currentColor"><path d="M7 1l6.5 12h-13z"/><rect x="6.3" y="5" width="1.4" height="4" fill="#3b0712"/><rect x="6.3" y="10" width="1.4" height="1.4" fill="#3b0712"/></svg>',
    expand: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 5V2h3M12 5V2H9M2 9v3h3M12 9v3H9"/></svg>',
    collapse: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 2v3H2M9 2v3h3M5 12V9H2M9 12V9h3"/></svg>',
    grid: '<svg viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="1" width="5" height="5" rx="1"/><rect x="8" y="1" width="5" height="5" rx="1"/><rect x="1" y="8" width="5" height="5" rx="1"/><rect x="8" y="8" width="5" height="5" rx="1"/></svg>',
    list: '<svg viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="2" width="12" height="2" rx="1"/><rect x="1" y="6" width="12" height="2" rx="1"/><rect x="1" y="10" width="12" height="2" rx="1"/></svg>',
    chevL: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8.5 3L4.5 7l4 4"/></svg>',
    chevR: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5.5 3l4 4-4 4"/></svg>',
    operator: '<svg viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="4.5" r="2.6"/><path d="M2 13c0-3 2.2-4.8 5-4.8s5 1.8 5 4.8z"/></svg>',
    agent: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="4" width="9" height="7.5" rx="2"/><path d="M7 1.5V4M5 7.5h.01M9 7.5h.01"/></svg>',
    machine: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="10" height="10" rx="1.5"/><path d="M5 5h4v4H5z" fill="currentColor"/></svg>',
    mark: '<svg viewBox="0 0 26 26" fill="none"><rect x="1" y="1" width="24" height="24" rx="7" stroke="rgba(255,255,255,.2)"/><path d="M7 17v-3M10.5 17v-6M14 17v-9M17.5 17v-5" stroke="#67e8f9" stroke-width="2" stroke-linecap="round"/><path d="M20.5 6v14" stroke="#fbbf24" stroke-width="2.2"/></svg>',
  };

  /* signal vocabulary */
  function Tally(value, label, of) { return `<span class="tally" aria-label="${esc(label || "")} ${value}${of != null ? " of " + of : ""}"><span aria-hidden="true">${value}${of != null ? "/" + of : ""}</span>${label ? `<small aria-hidden="true">${esc(label)}</small>` : ""}</span>`; }
  function StackBar(k, x, u, label) {
    const t = Math.max(1, k + x + u);
    return `<div class="stackbar" role="img" aria-label="${esc(label || "")} kept ${k}, rejected ${x}, undecided ${u}"><i class="k" style="flex-grow:${k}"></i><i class="x" style="flex-grow:${x}"></i><i class="u" style="flex-grow:${u || (k + x ? 0 : t)}"></i></div>`;
  }
  function PipRow(states, label) { return `<span class="piprow" role="img" aria-label="${esc(label)}">${states.map((s) => `<i class="pip ${s}" aria-hidden="true"></i>`).join("")}</span>`; }
  let hid = 0;
  function Hint(text) { const id = "h" + (++hid); return `<span class="hint"><button type="button" aria-describedby="${id}" aria-label="more">?</button><span role="tooltip" id="${id}">${esc(text)}</span></span>`; }
  function Keycaps(map) { return `<div class="keymap" data-component="Keycaps" aria-label="keyboard">${map.map(([k, d]) => `<span>${k.map((x) => `<kbd class="keycap">${esc(x)}</kbd>`).join("")} ${esc(d)}</span>`).join("")}</div>`; }
  function Wave(peaks, w, h, color, played) {
    if (!peaks || !peaks.length) return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${color}" stroke-dasharray="3 3" opacity=".5"/></svg>`;
    const n = peaks.length, bw = w / n;
    let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`;
    peaks.forEach((p, i) => { const bh = Math.max(1.5, p * (h - 2)); s += `<rect x="${(i * bw).toFixed(1)}" y="${((h - bh) / 2).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${bh.toFixed(1)}" rx="0.8" fill="${color}" opacity="${played != null && i / n > played ? 0.35 : 0.95}"/>`; });
    return s + "</svg>";
  }
  /* provenance of what is shown: real · fixture · illustrative · session */
  function Src(kind) { return `<span class="src ${kind}" title="">${esc(kind)}</span>`; }
  function State(s, label) { return `<span class="state ${s}">${esc(label || String(s).replace("_", " "))}</span>`; }
  function LedgerLink(q, label) { return `<a class="ledger-link" href="ledger.html#q=${encodeURIComponent(q)}" aria-label="ledger events for ${esc(label || q)}">${I.ledger}${esc(label || "ledger")}</a>`; }

  /* ── session store: acts in this browser, appended to the ledger route ── */
  const KEY = "gravitone.next.session.v1";
  const JKEY = "gravitone.next.journal.v1";
  // true while a route re-applies the journal: nothing it does is an act, so nothing is emitted or journaled
  const replay = { on: false };
  const store = {
    read() { try { return JSON.parse(localStorage.getItem(KEY) || '{"events":[]}'); } catch (_) { return { events: [] }; } },
    write(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (_) { /* file:// without storage: session stays in memory */ } },
    events() { return store.read().events || []; },
    // the operator's and agents' acts; a machine arrival is a ledger event, never a session act
    acts() { return store.events().filter((e) => !(e.actor && e.actor.kind === "machine")); },
    // ev: {type, actor:{kind,id}, subject:{kind,id,label,href}, costUsd?, note?, lane?}
    emit(ev) {
      if (replay.on) return null;
      const d = store.read(); d.events = d.events || [];
      const e = Object.assign({ at: new Date().toISOString(), src: "session" }, ev);
      e.id = "ses_" + String(d.events.length + 1).padStart(4, "0");
      d.events.push(e); store.write(d);
      store._mem = d;
      document.dispatchEvent(new CustomEvent("gt:ledger", { detail: e }));
      return e;
    },
    clear() { store.write({ events: [] }); },
  };

  /* ── journal: the acts themselves, in order, replayed over the fixture baseline on load ──
     Why a journal and not a snapshot: every route already owns the functions that apply an act (cullSet,
     commit, ST.reroute ...), so replaying plain arguments through them cannot drift from what the screen
     did live, and one append-only list serves four routes. Entry: {k, a:"operator"|"agent"|"machine", ...args}.
     Machine entries (a run arriving at the weir) are replayed but are never counted as session acts. */
  const journal = {
    mem: null,
    read() {
      try { const d = JSON.parse(localStorage.getItem(JKEY) || "null"); if (d && Array.isArray(d.acts)) return d.acts; } catch (_) { /* blocked storage */ }
      return journal.mem || [];
    },
    write(acts) { journal.mem = acts; try { localStorage.setItem(JKEY, JSON.stringify({ v: 1, acts })); } catch (_) { /* blocked: this tab keeps the list in memory */ } },
    // ck: a coalescing key, so consecutive edits of one field (typing a title) stay one act
    add(e, ck) {
      if (replay.on) return null;
      const acts = journal.read().slice();
      const rec = Object.assign({ a: "operator" }, e); if (ck) rec.ck = ck;
      if (ck && acts.length && acts[acts.length - 1].ck === ck) acts[acts.length - 1] = rec; else acts.push(rec);
      journal.write(acts);
      document.dispatchEvent(new CustomEvent("gt:journal", { detail: rec }));
      return rec;
    },
    count() { return journal.read().filter((e) => e.a !== "machine").length; },
    // run fn over the journal with emit and add disabled
    replay(fn) { const acts = journal.read(); replay.on = true; try { fn(acts); } finally { replay.on = false; } },
    // a packet decided on the floor stays decided in every route's header
    applyStatuses() {
      const M = window.GT_MODEL; if (!M) return;
      journal.read().forEach((e) => { if (e.pid && e.st) { const p = M.packets.find((x) => x.id === e.pid); if (p) p.status = e.st; } });
    },
    reset() {
      try { localStorage.removeItem(KEY); localStorage.removeItem(JKEY); } catch (_) { /* blocked */ }
      journal.mem = null; store._mem = null;
    },
  };
  Object.defineProperty(journal, "replaying", { get: () => replay.on });

  /* ── header ── */
  const NAV = [
    ["floor", "index.html", "Floor"],
    ["board", "index.html#board", "Board"],
    ["sep"],
    ["projects", "projects.html", "Projects"],
    ["runs", "projects.html#runs", "Runs"],
    ["sep"],
    ["library", "library.html", "Library"],
    ["calendar", "index.html#calendar", "Calendar"],
    ["ledger", "ledger.html", "Ledger"],
  ];
  const resetChip = (n) => `<button type="button" class="chip rose" id="hdr-reset" aria-label="discard ${n} session acts">reset <b>${n}</b></button>`;
  // header({current, awaiting, next:{id,title,count}, spend, right}) — floor passes live values; other routes read the model
  function header(o) {
    o = o || {};
    const M = window.GT_MODEL;
    const awaiting = o.awaiting != null ? o.awaiting : M ? M.packets.filter((p) => p.status === "awaiting_gate").length : 0;
    const nx = o.next !== undefined ? o.next : M ? M.packets.find((p) => p.status === "awaiting_gate") : null;
    const ses = store.acts().length, nAct = journal.count();
    const nav = NAV.map((n) => {
      if (n[0] === "sep") return '<span class="sep" aria-hidden="true"></span>';
      const [id, href, label] = n;
      return `<a href="${href}" data-nav="${id}" ${o.current === id ? 'aria-current="page"' : ""}>${label}${id === "board" && awaiting ? `<span class="n" aria-label="${awaiting} awaiting">${awaiting}</span>` : ""}</a>`;
    }).join("");
    const title = nx ? (nx.media === "article" ? titleCase(nx.title) : nx.title) : "";
    return `<a class="brand" href="index.html" aria-label="Gravitone floor">${I.mark}<span>Gravitone</span></a>
      <nav class="nav" aria-label="modules">${nav}</nav>
      <div class="hdr-right">
        ${nx ? `<a class="next-btn" href="index.html#open=${esc(nx.id)}" data-act-next="${esc(nx.id)}" aria-label="Open next decision: ${esc(title)}"><span class="lbl">NEXT</span><span class="t">${esc(title)}</span>${Tally(nx.count)}<kbd class="keycap">⏎</kbd></a>` : `<span class="chip emerald"><span class="dot"></span>weir clear</span>`}
        <span class="chip hdr-spend" aria-label="spend today">spend 24h <b id="hdr-spend">${esc(o.spend || "$0.00")}</b></span>
        <a class="chip" href="ledger.html" aria-label="session acts in ledger" id="hdr-ses">${I.ledger.replace("<svg", '<svg width="12" height="12"')} ledger <b>+${ses}</b></a>
        ${nAct ? resetChip(nAct) : ""}
        <a class="kit-link" href="kit.html" ${o.current === "kit" ? 'aria-current="page"' : ""}>Kit</a>
      </div>`;
  }
  document.addEventListener("gt:ledger", () => { const h = document.getElementById("hdr-ses"); if (h) { const b = h.querySelector("b"); if (b) b.textContent = "+" + store.acts().length; h.classList.add("cyan"); setTimeout(() => h.classList.remove("cyan"), 900); } });
  // the reset control exists only while the journal holds an operator or agent act
  function syncReset() {
    const h = document.getElementById("hdr-ses"); if (!h) return;
    const n = journal.count(), cur = document.getElementById("hdr-reset");
    if (!n) { if (cur) cur.remove(); return; }
    if (cur) { const b = cur.querySelector("b"); if (b) b.textContent = n; cur.setAttribute("aria-label", "discard " + n + " session acts"); return; }
    h.insertAdjacentHTML("afterend", resetChip(n));
  }
  document.addEventListener("gt:journal", syncReset);
  document.addEventListener("gt:ledger", syncReset);
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("#hdr-reset"); if (!b) return;
    const n = journal.count();
    if (window.confirm("Discard " + n + " session act" + (n === 1 ? "" : "s") + "? Board verdicts, launches, plan edits and ledger entries return to the fixture baseline.")) { journal.reset(); location.reload(); }
  });

  function toast(msg, html) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t[html ? "innerHTML" : "textContent"] = msg; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 3400); announce(t.textContent);
  }
  function announce(s) { let l = document.getElementById("live"); if (!l) { l = document.createElement("div"); l.id = "live"; l.className = "sr-only"; l.setAttribute("aria-live", "polite"); document.body.appendChild(l); } l.textContent = s; }
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.GT = { $, $$, esc, titleCase, I, Tally, StackBar, PipRow, Hint, Keycaps, Wave, Src, State, LedgerLink, store, journal, header, toast, announce, reduced, NAV };
})();
