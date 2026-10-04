/* WORKBENCH CORE — the data, the ledger, the local signal tools and the player.
 *
 * Shared vocabulary for one variant's page. Nothing here touches the network:
 * the working set is window.AUDIO_ITEMS (../data/audio-items.js), judgments
 * persist to localStorage, fixture rows play through a small WebAudio synth
 * seeded from the row (tempo, key, genre, sfx category), and a returned file
 * plays through a real <audio> element. Both feed the SAME controlled player.
 *
 * kit/Player.tsx is a controlled React part (playing/position/duration in,
 * onToggle/onSeek out). This page has no build step, so WB.Player is a
 * line-for-line DOM transliteration of it: same class names (k-player,
 * k-wave, k-transport), same slider semantics (ArrowLeft/Right, Shift for the
 * long stride, Home/End, pointer drag), same `clock()`. The one addition is
 * `set()`, which is what a React re-render would do.
 */
(function () {
  "use strict";
  const SRC = (window.AUDIO_ITEMS && window.AUDIO_ITEMS.items) || [];
  const LS = "gt.audio-ledger.v1";
  const RUBRIC = [
    { key: "melody", short: "MEL", label: "Melody" },
    { key: "instrument_choice", short: "CHO", label: "Instrument choice" },
    { key: "instrument_quality", short: "QUA", label: "Instrument quality" },
  ];

  /* ── persistence ─────────────────────────────────────────────────────── */
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(LS) || "{}");
      return { overlay: s.overlay || {}, added: s.added || [], vocab: s.vocab || {}, drafts: s.drafts || [], storageError: null };
    } catch (e) {
      return { overlay: {}, added: [], vocab: {}, drafts: [], storageError: null };
    }
  }
  const state = loadState();
  const blobs = new Map(); // id -> object URL (session only)
  const listeners = new Set();
  function save() {
    try {
      localStorage.setItem(LS, JSON.stringify({ overlay: state.overlay, added: state.added, vocab: state.vocab, drafts: state.drafts }));
      state.storageError = null;
    } catch (e) {
      state.storageError = "This browser's storage is full; the last judgment is held in memory only and a reload would lose it.";
    }
    listeners.forEach((fn) => fn());
  }

  function build() {
    const base = SRC.map((r) => Object.assign({}, r, state.overlay[r.id] || {}));
    const extra = state.added.map((r) => Object.assign({}, r, state.overlay[r.id] || {}));
    return base.concat(extra);
  }
  let items = build();
  let byId = new Map(items.map((i) => [i.id, i]));
  function refresh() {
    items = build();
    byId = new Map(items.map((i) => [i.id, i]));
  }
  function patch(id, p) {
    state.overlay[id] = Object.assign({}, state.overlay[id] || {}, p, { judged_at: Date.now() });
    refresh();
    save();
  }

  /* ── the ledger ─────────────────────────────────────────────────────── */
  function score(it) {
    if (!it.ratings) return null;
    const v = RUBRIC.map((r) => it.ratings[r.key]).filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  // "proven" = a person kept it AND it scores well. Kept-but-weak is its own state.
  function verdict(it) {
    if (it.status === "rejected") return "rejected";
    if (it.status === "kept") return score(it) >= 7 ? "proven" : "kept";
    return "unjudged";
  }
  function rate(id, key, value) {
    const it = byId.get(id);
    const ratings = Object.assign({ melody: null, instrument_choice: null, instrument_quality: null }, it.ratings || {});
    ratings[key] = value;
    patch(id, { ratings });
  }
  function keep(id) {
    patch(id, { status: "kept", reject_reason: undefined });
  }
  function reject(id, reason) {
    reason = (reason || "").trim();
    if (!reason) return false;
    patch(id, { status: "rejected", reject_reason: reason });
    return true;
  }
  function clearVerdict(id) {
    patch(id, { status: "unrated", reject_reason: undefined });
  }
  function setField(id, field, value) {
    const p = {};
    p[field] = value;
    patch(id, p);
  }
  function reasons() {
    const c = new Map();
    items.forEach((i) => i.reject_reason && c.set(i.reject_reason, (c.get(i.reject_reason) || 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }

  /* ── the vocabulary: terms, their evidence, and the team's hand ─────────
   * A term's evidence is read off the ledger every time (never stored), and the
   * team's layer — prefer / avoid, and the phrasing a term becomes in a prompt —
   * is the only part that persists. The evidence moves the term; the team decides.
   */
  const FACETS = [
    { key: "genre_tags", label: "Genre" },
    { key: "mood_tags", label: "Mood" },
    { key: "instrumentation", label: "Instrument" },
  ];
  function vocabulary() {
    const m = new Map();
    items.forEach((it) => {
      if (it.kind !== "track") return;
      FACETS.forEach((f) =>
        (it[f.key] || []).forEach((t) => {
          const k = f.key + ":" + t;
          if (!m.has(k)) m.set(k, { id: k, term: t, facet: f.key, facetLabel: f.label, n: 0, kept: 0, proven: 0, rejected: 0, sum: 0, rated: 0, reasons: {} });
          const e = m.get(k);
          e.n++;
          const v = verdict(it);
          if (v === "proven") e.proven++;
          if (v === "proven" || v === "kept") e.kept++;
          if (v === "rejected") {
            e.rejected++;
            if (it.reject_reason) e.reasons[it.reject_reason] = (e.reasons[it.reject_reason] || 0) + 1;
          }
          const s = score(it);
          if (s != null) {
            e.sum += s;
            e.rated++;
          }
        })
      );
    });
    return [...m.values()].map((e) => {
      const hand = state.vocab[e.id] || {};
      const judged = e.kept + e.rejected;
      return Object.assign(e, {
        avg: e.rated ? e.sum / e.rated : null,
        keepRate: judged ? e.kept / judged : null,
        judged,
        stance: hand.stance || null, // "prefer" | "avoid" | null
        phrase: hand.phrase || "",
        topReason: Object.entries(e.reasons).sort((a, b) => b[1] - a[1])[0] || null,
      });
    });
  }
  function setVocab(id, p) {
    state.vocab[id] = Object.assign({}, state.vocab[id] || {}, p);
    save();
  }
  function phraseOf(facet, term) {
    const h = state.vocab[facet + ":" + term];
    return (h && h.phrase) || term;
  }

  /* ── prompts: text for a human to paste, never a request ──────────────── */
  function compose(seed, target) {
    const g = (seed.genres || []).map((t) => phraseOf("genre_tags", t));
    const mo = (seed.moods || []).map((t) => phraseOf("mood_tags", t));
    const ins = (seed.instruments || []).map((t) => phraseOf("instrumentation", t));
    const avoid = seed.avoid || [];
    const tk = [seed.bpm ? Math.round(seed.bpm) + " BPM" : null, seed.key || null].filter(Boolean);
    if (target === "elevenlabs") {
      const head = [mo.join(", "), g.join(" / ")].filter(Boolean).join(" ");
      let s = (head ? head.charAt(0).toUpperCase() + head.slice(1) : "Instrumental") + " instrumental";
      if (tk.length) s += ", " + tk.join(", ");
      if (ins.length) s += ". Built on " + ins.slice(0, -1).join(", ") + (ins.length > 1 ? " and " : "") + ins[ins.length - 1] + ".";
      if (avoid.length) s += " No " + avoid.join(", no ") + ".";
      return s;
    }
    const style = g.concat(mo, ins, tk).join(", ");
    const lines = ["Style: " + style];
    if (avoid.length) lines.push("Exclude: " + avoid.join(", "));
    lines.push("", "[Instrumental]", "[Intro]", "[Build]", "[Drop]", "[Breakdown]", "[Outro]");
    return lines.join("\n");
  }
  function seedOf(it) {
    return { genres: (it.genre_tags || []).slice(), moods: (it.mood_tags || []).slice(), instruments: (it.instrumentation || []).slice(), bpm: it.tempo_bpm, key: it.key, avoid: [] };
  }
  const REL = { "A minor": "C major", "C major": "A minor", "F minor": "Ab major", "D minor": "F major", "F major": "D minor", "E minor": "G major", "G minor": "Bb major", "C minor": "Eb major", "B minor": "D major", "G major": "E minor" };
  /* Variations change ONE axis each, so a verdict on the result says which axis mattered. */
  function variations(it) {
    if (it.kind !== "track") return [];
    const voc = vocabulary();
    const best = (facet, not) =>
      voc
        .filter((v) => v.facet === facet && !not.includes(v.term) && v.stance !== "avoid" && v.judged >= 2)
        .sort((a, b) => (b.stance === "prefer") - (a.stance === "prefer") || (b.keepRate || 0) - (a.keepRate || 0) || (b.avg || 0) - (a.avg || 0))[0];
    const worst = (facet, among) =>
      voc.filter((v) => v.facet === facet && among.includes(v.term)).sort((a, b) => (a.stance === "avoid" ? -1 : 0) || (a.keepRate ?? 1) - (b.keepRate ?? 1))[0];
    const base = seedOf(it);
    const out = [];
    const wi = worst("instrumentation", base.instruments);
    const bi = best("instrumentation", base.instruments);
    if (wi && bi) {
      const s = seedOf(it);
      s.instruments = s.instruments.map((t) => (t === wi.term ? bi.term : t));
      out.push({ axis: "swap", diff: ["−" + wi.term, "+" + bi.term], seed: s, why: bi.keepRate != null ? Math.round(bi.keepRate * 100) + "% kept" : "" });
    }
    const wm = worst("mood_tags", base.moods);
    const bm = best("mood_tags", base.moods);
    if (wm && bm) {
      const s = seedOf(it);
      s.moods = s.moods.map((t) => (t === wm.term ? bm.term : t));
      out.push({ axis: "mood", diff: ["−" + wm.term, "+" + bm.term], seed: s, why: bm.keepRate != null ? Math.round(bm.keepRate * 100) + "% kept" : "" });
    }
    const bpm = it.tempo_bpm || 100;
    [{ d: -6 }, { d: +6 }].forEach(({ d }) => {
      const s = seedOf(it);
      s.bpm = bpm + d;
      out.push({ axis: "tempo", diff: [(d > 0 ? "+" : "") + d + " BPM"], seed: s, why: Math.round(bpm + d) + " BPM" });
    });
    if (it.key && REL[it.key]) {
      const s = seedOf(it);
      s.key = REL[it.key];
      out.push({ axis: "key", diff: [it.key + " → " + REL[it.key]], seed: s, why: "relative" });
    }
    const avoidTerm = voc.find((v) => v.stance === "avoid" && v.facet === "instrumentation" && !base.instruments.includes(v.term)) ||
      voc.filter((v) => v.facet === "instrumentation" && v.judged >= 4 && !base.instruments.includes(v.term)).sort((a, b) => (a.keepRate ?? 1) - (b.keepRate ?? 1))[0];
    if (avoidTerm) {
      const s = seedOf(it);
      s.avoid = [avoidTerm.term];
      out.push({ axis: "fence", diff: ["no " + avoidTerm.term], seed: s, why: avoidTerm.keepRate != null ? Math.round(avoidTerm.keepRate * 100) + "% kept" : "" });
    }
    return out;
  }

  /* ── drafts and returns: the manual round-trip through Suno / ElevenLabs ── */
  function addDraft(d) {
    const draft = Object.assign({ id: "dr-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), created_at: Date.now(), copied_at: null, returns: [] }, d);
    state.drafts.unshift(draft);
    save();
    return draft;
  }
  function markCopied(draftId) {
    const d = state.drafts.find((x) => x.id === draftId);
    if (d) {
      d.copied_at = Date.now();
      save();
    }
  }
  /* A returned file becomes a new unrated take whose parent and prompt are recorded on it. */
  function attachReturn(file, opts) {
    const parent = opts.parentId ? byId.get(opts.parentId) : null;
    const draft = opts.draftId ? state.drafts.find((x) => x.id === opts.draftId) : null;
    const id = "au-ret-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
    const seed = (draft && draft.seed) || (parent ? seedOf(parent) : {});
    const row = {
      id,
      kind: (parent && parent.kind) || opts.kind || "track",
      title: (file.name || "returned take").replace(/\.[a-z0-9]+$/i, ""),
      duration_s: 0,
      vendor: (draft && draft.target) || opts.vendor || "suno",
      status: "unrated",
      created_at: Date.now(),
      parent_id: parent ? parent.id : null,
      draft_id: draft ? draft.id : null,
      prompt_text: draft ? draft.text : null,
      genre_tags: seed.genres || (parent && parent.genre_tags) || [],
      mood_tags: seed.moods || (parent && parent.mood_tags) || [],
      instrumentation: seed.instruments || (parent && parent.instrumentation) || [],
      tempo_bpm: seed.bpm || null,
      key: seed.key || null,
      reference_track_id: parent ? parent.reference_track_id : null,
      prompt_round: null,
      sfx_category: parent ? parent.sfx_category : undefined,
      loopable: parent ? parent.loopable : undefined,
      file_name: file.name,
      file_size: file.size,
    };
    if (draft) draft.returns.push(id);
    const url = URL.createObjectURL(file);
    blobs.set(id, url);
    state.added.push(row);
    refresh();
    save();
    // learn the real duration
    const a = new Audio();
    a.preload = "metadata";
    a.src = url;
    a.onloadedmetadata = () => {
      const r = state.added.find((x) => x.id === id);
      if (r && isFinite(a.duration)) {
        r.duration_s = Math.round(a.duration * 100) / 100;
        refresh();
        save();
      }
    };
    return byId.get(id);
  }
  function children(id) {
    return items.filter((i) => i.parent_id === id);
  }
  function hasFile(it) {
    return !it.id.startsWith("au-ret-") || blobs.has(it.id);
  }

  /* ── reference tracks: the three real measurements ───────────────────── */
  const REFDATA = window.REFERENCE_ANALYSIS || null;
  const REF_NAMES = {
    "ref-french79-4807": { artist: "French 79", title: "4807" },
    "ref-ratatat-breaking-away": { artist: "Ratatat", title: "Breaking Away" },
    "ref-sappheiros-falling": { artist: "Sappheiros", title: "Falling" },
  };
  /* What kind of tempo error a method made: the method matters, not just the number. */
  function tempoError(est, truth) {
    const r = est / truth;
    const pct = Math.abs(r - 1) * 100;
    const named = [
      [0.5, "half-time"],
      [2, "double-time"],
      [2 / 3, "2:3"],
      [3 / 2, "3:2"],
      [3 / 4, "3:4"],
      [4 / 3, "4:3"],
    ].find(([k]) => Math.abs(r / k - 1) < 0.03);
    if (pct <= 3) return { ok: true, pct, kind: "within " + pct.toFixed(1) + "%" };
    if (named) return { ok: false, pct, kind: named[1] + " error" };
    return { ok: false, pct, kind: pct.toFixed(0) + "% off" };
  }
  const REL_OF = { "D minor": "F major", "F major": "D minor", "A minor": "C major", "C major": "A minor", "G minor": "Bb major", "Bb major": "G minor", "F minor": "Ab major", "Ab major": "F minor" };
  function keyRelation(est, truth) {
    if (est === truth) return "exact";
    if (REL_OF[est] === truth) return "relative";
    return "wrong";
  }
  function references() {
    const L = (REFDATA && REFDATA.local_signal_analysis) || {};
    return Object.keys(L).map((id) => {
      const m = L[id];
      const truth = m.ground_truth_tunebat;
      const kids = items.filter((i) => i.reference_track_id === id);
      return {
        id,
        name: REF_NAMES[id] || { artist: id, title: "" },
        truth,
        methods: [
          { id: "librosa", label: "librosa", tempo: m.librosa.tempo_bpm, key: m.librosa.key, err: tempoError(m.librosa.tempo_bpm, truth.tempo_bpm), keyOk: m.librosa.key === truth.key, keyRel: keyRelation(m.librosa.key, truth.key) },
          { id: "fft_autocorr", label: "fft autocorr", tempo: m.fft_autocorr.tempo_bpm, key: m.fft_autocorr.key, err: tempoError(m.fft_autocorr.tempo_bpm, truth.tempo_bpm), keyOk: m.fft_autocorr.key === truth.key, keyRel: keyRelation(m.fft_autocorr.key, truth.key) },
        ],
        retired: REFDATA.gemini_structured_analysis && REFDATA.gemini_structured_analysis[id] ? { genres: REFDATA.gemini_structured_analysis[id].genre_tags, tempo: REFDATA.gemini_structured_analysis[id].tempo_bpm, key: REFDATA.gemini_structured_analysis[id].key } : null,
        children: kids,
        kept: kids.filter((k) => k.status === "kept").length,
        rejected: kids.filter((k) => k.status === "rejected").length,
      };
    });
  }
  /* The concept derived from a reference: measured tempo/key + the vocabulary terms
   * that its kept descendants share. No model guesses a genre here. */
  function conceptFor(refId, measured) {
    const kids = items.filter((i) => i.reference_track_id === refId && i.kind === "track");
    const tally = (k) => {
      const c = new Map();
      kids.forEach((i) => {
        const w = verdict(i) === "proven" ? 2 : verdict(i) === "kept" ? 1 : verdict(i) === "rejected" ? -1 : 0;
        (i[k] || []).forEach((t) => c.set(t, (c.get(t) || 0) + w));
      });
      return [...c.entries()].filter((e) => e[1] > 0).sort((a, b) => b[1] - a[1]);
    };
    return {
      bpm: measured.tempo,
      key: measured.key,
      genres: tally("genre_tags").slice(0, 2).map((e) => e[0]),
      moods: tally("mood_tags").slice(0, 2).map((e) => e[0]),
      instruments: tally("instrumentation").slice(0, 4).map((e) => e[0]),
      evidence: kids.length,
    };
  }

  /* ── local signal analysis of an uploaded reference (in-browser, offline) ──
   * Onset-envelope autocorrelation for tempo, Goertzel chroma + Krumhansl
   * profiles for key, RMS and spectral centroid for energy/brightness. The same
   * family of measurement librosa makes; nothing leaves the machine.
   */
  const NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function corr(a, b) {
    const ma = a.reduce((x, y) => x + y) / 12,
      mb = b.reduce((x, y) => x + y) / 12;
    let n = 0,
      da = 0,
      db = 0;
    for (let i = 0; i < 12; i++) {
      n += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return n / Math.sqrt(da * db || 1);
  }
  async function analyzeFile(file, onStage) {
    const stage = (s) => onStage && onStage(s);
    stage("decode");
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    ctx.close && ctx.close();
    await tick();
    // mono, downsample to ~11 kHz, at most 60 s from 15% in (skip intros)
    const sr0 = buf.sampleRate;
    const ch = buf.numberOfChannels;
    const step = Math.max(1, Math.round(sr0 / 11025));
    const sr = sr0 / step;
    const start = Math.floor(buf.length * 0.15);
    const len = Math.min(Math.floor((buf.length - start) / step), Math.floor(sr * 60));
    const x = new Float32Array(len);
    for (let c = 0; c < ch; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) x[i] += d[start + i * step] / ch;
    }
    stage("tempo");
    await tick();
    const hop = 256;
    const frames = Math.floor(len / hop);
    const env = new Float32Array(frames);
    let prev = 0;
    for (let f = 0; f < frames; f++) {
      let e = 0;
      for (let i = 0; i < hop; i++) e += x[f * hop + i] ** 2;
      e = Math.log(1 + 100 * e);
      env[f] = Math.max(0, e - prev);
      prev = e;
    }
    const fps = sr / hop;
    let bestLag = 0,
      bestV = -1;
    const scores = [];
    for (let bpm = 60; bpm <= 180; bpm += 0.5) {
      const lag = (60 / bpm) * fps;
      let v = 0;
      for (let f = 0; f + lag * 2 < frames; f++) {
        const l = Math.round(f + lag);
        v += env[f] * env[l];
      }
      // a mild prior around 120, as librosa's beat tracker uses
      v *= Math.exp(-0.5 * Math.log2(bpm / 120) ** 2 / 0.8);
      scores.push([bpm, v]);
      if (v > bestV) {
        bestV = v;
        bestLag = bpm;
      }
    }
    stage("key");
    await tick();
    const chroma = new Array(12).fill(0);
    const win = 2048;
    for (let s = 0; s + win < len; s += win * 4) {
      for (let pc = 0; pc < 12; pc++) {
        for (let oct = 2; oct <= 5; oct++) {
          const f = 440 * Math.pow(2, (pc - 9) / 12 + (oct - 4));
          const w = (2 * Math.PI * f) / sr;
          const cw = 2 * Math.cos(w);
          let s1 = 0,
            s2 = 0;
          for (let i = 0; i < win; i++) {
            const s0 = x[s + i] + cw * s1 - s2;
            s2 = s1;
            s1 = s0;
          }
          chroma[pc] += s1 * s1 + s2 * s2 - cw * s1 * s2;
        }
      }
    }
    let key = null,
      kv = -2;
    for (let r = 0; r < 12; r++) {
      const rot = chroma.slice(r).concat(chroma.slice(0, r));
      const a = corr(rot, MAJ),
        b = corr(rot, MIN);
      if (a > kv) {
        kv = a;
        key = NOTES[r] + " major";
      }
      if (b > kv) {
        kv = b;
        key = NOTES[r] + " minor";
      }
    }
    stage("spectrum");
    await tick();
    let rms = 0;
    for (let i = 0; i < len; i++) rms += x[i] * x[i];
    rms = Math.sqrt(rms / len);
    // centroid by a crude zero-crossing proxy (cheap and monotonic with brightness)
    let zc = 0;
    for (let i = 1; i < len; i++) if ((x[i] >= 0) !== (x[i - 1] >= 0)) zc++;
    const centroidHz = (zc / 2 / (len / sr)) | 0;
    const peaks = [];
    const n = 120;
    for (let p = 0; p < n; p++) {
      let m = 0;
      const a = Math.floor((p / n) * buf.length),
        b = Math.floor(((p + 1) / n) * buf.length);
      const d = buf.getChannelData(0);
      for (let i = a; i < b; i += 64) m = Math.max(m, Math.abs(d[i]));
      peaks.push(m);
    }
    const mx = Math.max(...peaks, 0.001);
    stage("done");
    return {
      tempo: bestLag,
      key,
      keyConfidence: kv,
      rms,
      energy: rms > 0.2 ? "high" : rms > 0.09 ? "medium" : "low",
      centroidHz,
      brightness: centroidHz > 2600 ? "bright" : centroidHz > 1200 ? "balanced" : "dark",
      duration: buf.duration,
      peaks: peaks.map((p) => p / mx),
      method: "onset autocorr · goertzel chroma",
    };
  }
  const tick = () => new Promise((r) => setTimeout(r, 30));
  function nearestTerms(measured) {
    // Tracks in the ledger near this tempo whose verdict is proven: their terms are the suggestion.
    const near = items.filter((i) => i.kind === "track" && i.tempo_bpm && Math.abs(i.tempo_bpm - measured.tempo) <= 8 && verdict(i) === "proven");
    const pool = near.length ? near : items.filter((i) => i.kind === "track" && verdict(i) === "proven");
    const t = (k) => {
      const c = new Map();
      pool.forEach((i) => (i[k] || []).forEach((x) => c.set(x, (c.get(x) || 0) + 1)));
      return [...c.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
    };
    return { genres: t("genre_tags").slice(0, 2), moods: t("mood_tags").slice(0, 2), instruments: t("instrumentation").slice(0, 4), evidence: pool.length };
  }

  /* ── deterministic shape per row ─────────────────────────────────────── */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const peakCache = new Map();
  function peaks(it, n) {
    n = n || 96;
    const k = it.id + ":" + n;
    if (peakCache.has(k)) return peakCache.get(k);
    const r = rng(hash(it.id));
    const out = [];
    if (it.kind === "sfx") {
      const att = 0.04 + r() * 0.1;
      const loop = it.loopable;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const env = loop ? 0.55 + 0.25 * Math.sin(t * 14 + r()) : t < att ? t / att : Math.exp(-(t - att) * (3 + r() * 5));
        out.push(Math.max(0.04, Math.min(1, env * (0.7 + r() * 0.3))));
      }
    } else {
      const secs = [0.12 + r() * 0.08, 0.4 + r() * 0.1, 0.62 + r() * 0.08, 0.86 + r() * 0.06];
      for (let i = 0; i < n; i++) {
        const t = i / n;
        let lvl = t < secs[0] ? 0.25 + t * 2 : t < secs[1] ? 0.6 : t < secs[2] ? 0.35 : t < secs[3] ? 0.9 : 0.9 - (t - secs[3]) * 6;
        out.push(Math.max(0.05, Math.min(1, lvl * (0.6 + r() * 0.4))));
      }
    }
    peakCache.set(k, out);
    return out;
  }

  /* ── the transport engine: synth for fixture rows, <audio> for returned files ── */
  const KEYROOT = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
  const engine = {
    ctx: null,
    current: null, // {id, playing, position, duration}
    subs: new Set(),
    _start: 0,
    _offset: 0,
    _timer: null,
    _nodes: [],
    _el: null,
    _nextBeat: 0,
    on(fn) {
      this.subs.add(fn);
      return () => this.subs.delete(fn);
    },
    emit() {
      this.subs.forEach((fn) => fn(this.current));
    },
    state(id) {
      const c = this.current;
      const it = byId.get(id);
      if (c && c.id === id) return c;
      return { id, playing: false, position: 0, duration: it ? it.duration_s || 0 : 0 };
    },
    _ac() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    },
    toggle(id) {
      const c = this.current;
      if (c && c.id === id && c.playing) return this.pause();
      if (c && c.id === id) return this.play(id, c.position >= c.duration - 0.05 ? 0 : c.position);
      return this.play(id, 0);
    },
    play(id, from) {
      this._halt();
      const it = byId.get(id);
      if (!it) return;
      const dur = it.duration_s || 0;
      this.current = { id, playing: true, position: from || 0, duration: dur };
      if (blobs.has(id)) {
        const el = new Audio(blobs.get(id));
        this._el = el;
        el.currentTime = from || 0;
        el.play().catch(() => {});
        el.onloadedmetadata = () => {
          if (this.current && this.current.id === id) this.current.duration = el.duration;
        };
        el.onended = () => this._end();
      } else if (it.id.startsWith("au-ret-")) {
        this.current.playing = false;
        this.emit();
        return;
      } else {
        const ac = this._ac();
        this._start = ac.currentTime;
        this._offset = from || 0;
        this._spec = specFor(it);
        this._nextBeat = Math.ceil(((from || 0) / this._spec.beat) - 1e-6);
        this._sfxFired = false;
      }
      this._timer = setInterval(() => this._tick(), 40);
      this.emit();
    },
    pause() {
      if (!this.current) return;
      const p = this.position();
      this._halt();
      this.current = Object.assign({}, this.current, { playing: false, position: p });
      this.emit();
    },
    seek(id, t) {
      const c = this.current;
      if (c && c.id === id && c.playing) return this.play(id, t);
      const it = byId.get(id);
      this.current = { id, playing: false, position: t, duration: c && c.id === id ? c.duration : it.duration_s || 0 };
      this.emit();
    },
    stop() {
      this._halt();
      if (this.current) this.current = Object.assign({}, this.current, { playing: false });
      this.emit();
    },
    position() {
      const c = this.current;
      if (!c) return 0;
      if (!c.playing) return c.position;
      if (this._el) return this._el.currentTime;
      return this._offset + (this.ctx.currentTime - this._start);
    },
    _halt() {
      clearInterval(this._timer);
      this._timer = null;
      if (this._el) {
        this._el.pause();
        this._el = null;
      }
      this._nodes.forEach((n) => {
        try {
          n.stop();
        } catch (e) {}
      });
      this._nodes = [];
    },
    _end() {
      this._halt();
      if (this.current) this.current = Object.assign({}, this.current, { playing: false, position: this.current.duration });
      this.emit();
      if (this.onEnded) this.onEnded(this.current && this.current.id);
    },
    _tick() {
      const c = this.current;
      if (!c || !c.playing) return;
      const p = this.position();
      c.position = Math.min(p, c.duration);
      if (p >= c.duration) {
        if (!this._el) {
          const it = byId.get(c.id);
          if (it && it.loopable) return this.play(c.id, 0);
        }
        return this._end();
      }
      if (!this._el) this._schedule();
      this.emit();
    },
    _schedule() {
      const ac = this.ctx;
      const sp = this._spec;
      const horizon = this.position() + 0.25;
      if (sp.sfx) {
        if (!this._sfxFired) {
          this._sfxFired = true;
          playSfx(ac, this.master, sp, this._start - this._offset, this._nodes);
        }
        return;
      }
      while (this._nextBeat * sp.beat < horizon) {
        const b = this._nextBeat;
        const when = this._start + (b * sp.beat - this._offset);
        if (when >= ac.currentTime - 0.01) playBeat(ac, this.master, sp, b, Math.max(when, ac.currentTime), this._nodes);
        this._nextBeat++;
      }
      if (this._nodes.length > 200) this._nodes = this._nodes.slice(-120);
    },
  };
  function specFor(it) {
    const r = rng(hash(it.id + "s"));
    if (it.kind === "sfx") return { sfx: true, cat: it.sfx_category, dur: it.duration_s, loop: it.loopable, r, beat: 1 };
    const g = (it.genre_tags || []).join(" ");
    const bpm = it.tempo_bpm || (/drum and bass|dnb/.test(g) ? 172 : /trap|dubstep|chillstep/.test(g) ? 140 : /hip hop|boom bap|lo-fi|trip hop/.test(g) ? 88 : /ambient|drone|cinematic/.test(g) ? 70 : 118);
    const k = (it.key || "A minor").split(" ");
    const root = KEYROOT[k[0]] ?? 9;
    const minor = (k[1] || "minor") === "minor";
    const scale = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const four = /house|disco|synthwave|outrun|retro|french/.test(g);
    const half = /trap|dubstep|chillstep|dnb|drum and bass|hip hop|boom bap|lo-fi|trip/.test(g);
    const ambient = /ambient|drone|cinematic|textural/.test(g);
    const prog = [0, 5, 3, 4].map((d) => (d + Math.floor(r() * 2)) % 7);
    const arp = Array.from({ length: 8 }, () => Math.floor(r() * 7));
    return { bpm, beat: 60 / bpm / 2, root, scale, four, half, ambient, prog, arp, bright: 0.4 + r() * 0.6, swing: /boom bap|lo-fi|jazz/.test(g) ? 0.12 : 0 };
  }
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  function tone(ac, out, f, when, dur, type, gain, nodes, cutoff) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    let node = o;
    if (cutoff) {
      const fl = ac.createBiquadFilter();
      fl.type = "lowpass";
      fl.frequency.value = cutoff;
      o.connect(fl);
      node = fl;
    }
    node.connect(g);
    g.connect(out);
    o.start(when);
    o.stop(when + dur + 0.05);
    nodes.push(o);
  }
  let noiseBuf = null;
  function noise(ac, out, when, dur, gain, type, freq, nodes, sweepTo) {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, when);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, when + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.connect(f);
    f.connect(g);
    g.connect(out);
    s.start(when);
    s.stop(when + dur + 0.05);
    nodes.push(s);
  }
  function kick(ac, out, when, nodes) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.setValueAtTime(140, when);
    o.frequency.exponentialRampToValueAtTime(42, when + 0.18);
    g.gain.setValueAtTime(1, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
    o.connect(g);
    g.connect(out);
    o.start(when);
    o.stop(when + 0.4);
    nodes.push(o);
  }
  function playBeat(ac, out, sp, b, when, nodes) {
    const step = b % 16; // eighth-notes, two bars
    const bar = Math.floor(b / 8) % 4;
    const chordDeg = sp.prog[bar];
    const note = (deg, oct) => 12 * oct + sp.root + sp.scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
    const sw = step % 2 ? sp.swing * sp.beat : 0;
    const t = when + sw;
    if (sp.ambient) {
      if (step % 8 === 0) [0, 2, 4].forEach((d) => tone(ac, out, hz(note(chordDeg + d, 4)), t, sp.beat * 8.5, "sine", 0.12, nodes));
      if (step % 4 === 2) tone(ac, out, hz(note(sp.arp[step % 8], 6)), t, sp.beat * 3, "triangle", 0.05, nodes);
      return;
    }
    if (sp.four ? step % 2 === 0 : step === 0 || step === 5 || step === 10) kick(ac, out, t, nodes);
    if (sp.half ? step % 8 === 4 : step % 4 === 2) noise(ac, out, t, 0.14, 0.35, "bandpass", 1800, nodes);
    if (!(sp.half && step % 2)) noise(ac, out, t, 0.04, 0.12, "highpass", 7000, nodes);
    if (step % 4 === 0) tone(ac, out, hz(note(chordDeg, 2)), t, sp.beat * 1.8, "sawtooth", 0.18, nodes, 420);
    if (step % 8 === 0) [0, 2, 4].forEach((d) => tone(ac, out, hz(note(chordDeg + d, 4)), t, sp.beat * 7.5, "triangle", 0.05, nodes, 2400));
    if (step % 2 === 0 || sp.bright > 0.7) tone(ac, out, hz(note(chordDeg + sp.arp[step % 8], 5)), t, sp.beat * 0.9, "square", 0.035 * sp.bright, nodes, 3200);
  }
  function playSfx(ac, out, sp, t0, nodes) {
    const d = Math.max(0.15, sp.dur);
    const r = sp.r;
    const at = Math.max(ac.currentTime, t0);
    const c = sp.cat;
    if (c === "footstep") {
      for (let i = 0; i < Math.max(1, Math.round(d / 0.45)); i++) noise(ac, out, at + i * 0.45, 0.12, 0.7, "lowpass", 900 + r() * 400, nodes);
    } else if (c === "impact" || c === "explosion") {
      kick(ac, out, at, nodes);
      noise(ac, out, at, d, 0.9, "lowpass", 3000, nodes, 120);
    } else if (c === "door") {
      noise(ac, out, at, 0.5, 0.5, "bandpass", 500, nodes, 300);
      kick(ac, out, at + Math.min(d - 0.3, 0.6), nodes);
    } else if (c === "glass-break") {
      noise(ac, out, at, d * 0.6, 0.6, "highpass", 4000, nodes);
      for (let i = 0; i < 6; i++) tone(ac, out, 2500 + r() * 3000, at + r() * 0.3, 0.3, "sine", 0.08, nodes);
    } else if (c === "whoosh") {
      noise(ac, out, at, d, 0.6, "bandpass", 300, nodes, 4000);
    } else if (c === "magic-spell") {
      for (let i = 0; i < 10; i++) tone(ac, out, 600 * Math.pow(2, i / 6), at + i * (d / 12), d / 2, "sine", 0.08, nodes);
      noise(ac, out, at, d, 0.2, "highpass", 6000, nodes);
    } else if (c === "weapon-fire") {
      noise(ac, out, at, 0.3, 1, "lowpass", 5000, nodes, 200);
      kick(ac, out, at, nodes);
    } else if (c === "pickup-chime" || c === "notification") {
      [0, 4, 7, 12].forEach((s, i) => tone(ac, out, hz(76 + s), at + i * 0.08, 0.5, "triangle", 0.16, nodes));
    } else if (c === "ui-click") {
      tone(ac, out, 1800, at, 0.04, "square", 0.2, nodes);
    } else if (c === "creature-growl") {
      tone(ac, out, 70 + r() * 30, at, d, "sawtooth", 0.3, nodes, 500);
      noise(ac, out, at, d, 0.3, "bandpass", 300, nodes);
    } else {
      // ambience / environment loops
      noise(ac, out, at, d, 0.25, "lowpass", 700, nodes);
      tone(ac, out, 110, at, d, "sine", 0.08, nodes);
    }
  }

  /* ── kit/Player.tsx, transliterated ──────────────────────────────────── */
  function clock(seconds) {
    const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    const two = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
  }
  const ICO = {
    back: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M11 6 5 12l6 6M19 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fwd: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m13 6 6 6-6 6M5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
  };
  const PLOT_H = 48;
  function Player(host, props) {
    // props: label, peaks, playing, position, duration, disabled, marks, onToggle, onSeek, step, compact
    let p = Object.assign({ step: 5 }, props);
    const root = document.createElement("div");
    root.className = "k-player k-player--audio" + (p.compact ? " k-player--compact" : "");
    root.setAttribute("role", "group");
    root.innerHTML =
      '<div class="k-wave"><div class="k-wave__plot" role="slider" aria-valuemin="0"><svg class="k-wave__svg" preserveAspectRatio="none" aria-hidden="true" focusable="false"></svg><span class="k-wave__head" aria-hidden="true"><i></i></span></div><div class="k-wave__marks" role="group"></div></div>' +
      '<div class="k-transport" role="group"><button type="button" class="k-tp" data-a="back">' + ICO.back + '</button><button type="button" class="k-tp k-tp--main" data-a="main"></button><button type="button" class="k-tp" data-a="fwd">' + ICO.fwd + '</button><span class="k-tp__time k-num" aria-hidden="true"></span></div>';
    host.appendChild(root);
    const plot = root.querySelector(".k-wave__plot");
    const svg = root.querySelector("svg");
    const head = root.querySelector(".k-wave__head");
    const marksEl = root.querySelector(".k-wave__marks");
    const time = root.querySelector(".k-tp__time");
    const [bBack, bMain, bFwd] = root.querySelectorAll(".k-tp");
    let lines = [];
    let drawnPeaks = null;
    const clamp = (t) => Math.min(p.duration, Math.max(0, t));
    function seekFromPointer(x) {
      const r = plot.getBoundingClientRect();
      if (!r || r.width === 0 || p.duration <= 0) return;
      p.onSeek(Math.min(p.duration, Math.max(0, ((x - r.left) / r.width) * p.duration)));
    }
    plot.addEventListener("pointerdown", (e) => {
      if (p.disabled) return;
      plot.setPointerCapture(e.pointerId);
      seekFromPointer(e.clientX);
    });
    plot.addEventListener("pointermove", (e) => {
      if (!p.disabled && plot.hasPointerCapture(e.pointerId)) seekFromPointer(e.clientX);
    });
    plot.addEventListener("keydown", (e) => {
      if (p.disabled) return;
      const stride = Math.max(1, p.duration / 40);
      const d = e.shiftKey ? stride * 3 : stride;
      const to = e.key === "ArrowRight" || e.key === "ArrowUp" ? p.position + d : e.key === "ArrowLeft" || e.key === "ArrowDown" ? p.position - d : e.key === "Home" ? 0 : e.key === "End" ? p.duration : null;
      if (to === null) return;
      e.preventDefault();
      e.stopPropagation();
      p.onSeek(Math.min(p.duration, Math.max(0, to)));
    });
    bBack.onclick = () => p.onSeek(clamp(p.position - p.step));
    bFwd.onclick = () => p.onSeek(clamp(p.position + p.step));
    bMain.onclick = () => p.onToggle();
    function draw() {
      if (drawnPeaks === p.peaks && !p._dirty) return;
      drawnPeaks = p.peaks;
      const n = Math.max(1, p.peaks.length);
      svg.setAttribute("viewBox", `0 0 ${n} ${PLOT_H}`);
      if (p.disabled) {
        svg.innerHTML = `<line class="k-wave__rest" x1="0" x2="${n}" y1="${PLOT_H / 2}" y2="${PLOT_H / 2}" stroke-dasharray="4 6"/>`;
        lines = [];
        return;
      }
      svg.innerHTML = p.peaks
        .map((v, i) => {
          const h = Math.max(2, Math.min(1, Math.max(0, v)) * (PLOT_H - 4));
          const x = i + 0.5;
          return `<line class="k-wave__rest" x1="${x}" x2="${x}" y1="${PLOT_H / 2 - h / 2}" y2="${PLOT_H / 2 + h / 2}"/>`;
        })
        .join("");
      lines = [...svg.querySelectorAll("line")];
    }
    function render() {
      const label = p.label;
      root.setAttribute("aria-label", label);
      root.classList.toggle("is-playing", !!p.playing);
      root.querySelector(".k-wave").classList.toggle("is-off", !!p.disabled);
      plot.setAttribute("aria-label", label + " position");
      plot.tabIndex = p.disabled ? -1 : 0;
      plot.setAttribute("aria-valuemax", Math.round(p.duration));
      plot.setAttribute("aria-valuenow", Math.round(p.position));
      plot.setAttribute("aria-valuetext", `${clock(p.position)} of ${clock(p.duration)}`);
      if (p.disabled) plot.setAttribute("aria-disabled", "true");
      else plot.removeAttribute("aria-disabled");
      draw();
      const n = Math.max(1, p.peaks.length);
      const frac = p.duration > 0 ? Math.min(1, Math.max(0, p.position / p.duration)) : 0;
      const playedTo = frac * n;
      for (let i = 0; i < lines.length; i++) lines[i].setAttribute("class", i + 0.5 <= playedTo ? "k-wave__on" : "k-wave__rest");
      head.style.display = p.disabled ? "none" : "";
      head.style.left = frac * 100 + "%";
      root.querySelector(".k-transport").setAttribute("aria-label", label + " transport");
      [bBack, bMain, bFwd].forEach((b) => (b.disabled = !!p.disabled));
      bBack.setAttribute("aria-label", `Back ${p.step} seconds`);
      bFwd.setAttribute("aria-label", `Forward ${p.step} seconds`);
      bMain.className = "k-tp k-tp--main" + (p.playing ? " is-playing" : "");
      bMain.setAttribute("aria-label", `${p.playing ? "Pause" : "Play"} ${label}`);
      bMain.setAttribute("aria-pressed", String(!!p.playing));
      bMain.innerHTML = p.playing ? ICO.pause : ICO.play;
      time.innerHTML = `${clock(p.position)} <span class="k-tp__of">/ ${clock(p.duration)}</span>`;
      const marks = p.marks || [];
      marksEl.style.display = marks.length && p.duration > 0 ? "" : "none";
      marksEl.setAttribute("aria-label", label + " position, marks");
      marksEl.innerHTML = marks
        .map((m, i) => `<button type="button" class="k-wave__mark" data-i="${i}" style="left:${Math.min(1, Math.max(0, m.at / p.duration)) * 100}%" aria-label="${esc(m.label)}, at ${clock(m.at)}"><span aria-hidden="true"></span></button>`)
        .join("");
      marksEl.querySelectorAll("button").forEach((b) => (b.onclick = () => p.onSeek(marks[+b.dataset.i].at)));
    }
    render();
    return {
      el: root,
      set(next) {
        if (next.disabled !== undefined && next.disabled !== p.disabled) p._dirty = true;
        p = Object.assign(p, next);
        render();
        p._dirty = false;
      },
      focus() {
        plot.focus();
      },
    };
  }
  /* Bind a Player to the engine for one row — the "caller holds the media element" half. */
  function bindPlayer(host, it, extra) {
    const st = engine.state(it.id);
    const pl = Player(
      host,
      Object.assign(
        {
          label: it.title,
          peaks: peaks(it, (extra && extra.n) || 96),
          playing: st.playing,
          position: st.position,
          duration: st.duration || it.duration_s,
          disabled: !hasFile(it),
          onToggle: () => engine.toggle(it.id),
          onSeek: (t) => engine.seek(it.id, t),
        },
        extra || {}
      )
    );
    const off = engine.on((c) => {
      if (!pl.el.isConnected) return off();
      const s = c && c.id === it.id ? c : { playing: false, position: 0, duration: it.duration_s };
      pl.set({ playing: s.playing, position: s.position, duration: s.duration || it.duration_s });
    });
    return pl;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function ago(ms) {
    const d = (Date.now() - ms) / 86400000;
    if (d < 0) {
      // fixture timestamps sit slightly in the future of some clocks — read them against the newest row
      return new Date(ms).toISOString().slice(0, 10);
    }
    if (d < 1 / 24) return Math.max(1, Math.round(d * 1440)) + "m";
    if (d < 1) return Math.round(d * 24) + "h";
    if (d < 60) return Math.round(d) + "d";
    return Math.round(d / 30) + "mo";
  }
  function dur(s) {
    if (s == null) return "—";
    return s < 10 ? s.toFixed(1) + "s" : clock(s);
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const t = document.createElement("textarea");
      t.value = text;
      document.body.appendChild(t);
      t.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e2) {}
      t.remove();
      return ok;
    }
  }

  window.WB = {
    RUBRIC,
    FACETS,
    get items() {
      return items;
    },
    get(id) {
      return byId.get(id);
    },
    get drafts() {
      return state.drafts;
    },
    get storageError() {
      return state.storageError;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    score,
    verdict,
    rate,
    keep,
    reject,
    clearVerdict,
    setField,
    reasons,
    vocabulary,
    setVocab,
    compose,
    seedOf,
    variations,
    addDraft,
    markCopied,
    attachReturn,
    children,
    hasFile,
    references,
    conceptFor,
    analyzeFile,
    nearestTerms,
    peaks,
    engine,
    Player,
    bindPlayer,
    clock,
    esc,
    ago,
    dur,
    copy,
    hash,
    rng,
    resetAll() {
      localStorage.removeItem(LS);
      location.reload();
    },
  };
})();
