// film/core/env.js - timeline helpers, seeded randomness, small math, and the APPROVED nod.
// Everything here is a pure function of its arguments (and of window.__TIMELINE__, which never changes).
// The nod formula, its numbers and the refrain set are the operator-approved ones from
// board-t/unit-0451/scene-approved-nod.html - do not change them.

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const sm = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
export const lerp = (a, b, u) => a + (b - a) * u;
export const ease = (u) => { u = clamp(u, 0, 1); return u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
export function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
export const hash1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function createEnv(TL) {
  const BPM = TL.tempo.bpmGlobal || 125, BEAT = 60 / BPM;
  const SECTIONS = TL.sections, BEATS = TL.beats, DOWN = BEATS.filter(b => b.downbeat);
  const S = Object.fromEntries(SECTIONS.map(s => [s.id, s]));
  function lastIdx(arr, t) { let lo = 0, hi = arr.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; }
  const sectionAt = (t) => SECTIONS.find(s => t >= s.startS && t < s.endS) || (t < SECTIONS[0].startS ? SECTIONS[0] : SECTIONS[SECTIONS.length - 1]);
  const lyric = (t) => TL.lyrics.find(l => t >= l.startS && t < l.endS);
  const lyricStart = (txt, fallback) => (TL.lyrics.find(l => l.text.toLowerCase().startsWith(txt.toLowerCase())) || { startS: fallback }).startS;
  const lyricById = (id, fallback) => (TL.lyrics.find(l => l.id === id) || { startS: fallback }).startS;
  /** the beat at or before t: {i, t, bar, beat, downbeat, since} (since = seconds after it) */
  function beatAt(t) { const i = lastIdx(BEATS, t); if (i < 0) return { i: -1, t: 0, bar: 0, beat: 0, downbeat: false, since: t }; const b = BEATS[i]; return { ...b, i, since: t - b.t }; }
  const barOf = (t) => { const i = lastIdx(BEATS, t); return i < 0 ? 0 : BEATS[i].bar; };
  const downbeatAt = (t) => { const i = lastIdx(DOWN, t); return i < 0 ? null : DOWN[i]; };
  /** 1 on the beat, decaying with rate k */
  const beatPulse = (t, k = 6) => { const i = lastIdx(BEATS, t); return i < 0 ? 0 : Math.exp(-(t - BEATS[i].t) * k); };
  const downPulse = (t, k = 4) => { const d = downbeatAt(t); return d ? Math.exp(-(t - d.t) * k) : 0; };
  const band = (k, t) => { const a = TL.bands[k]; return a[Math.max(0, Math.min(a.length - 1, Math.floor(t * 30)))] || 0; };
  /** low band smoothed over the last 8 frames (267 ms) */
  function lowSmooth(t) { let a = 0; for (let k = 0; k < 8; k++) a += band("low", t - k / 30); return a / 8; }
  // ---- the approved refrain nod ----
  const REFRAIN = new Set(["s05", "s09", "s11", "s12"]); // s06 is a 0.28-intensity instrumental tail: no nod
  const isRefrain = (t) => REFRAIN.has(sectionAt(t).id);
  // s = signed time from the nearest beat (the next beat counts once it is < 70 ms away).
  // fast down-stroke over [-70 ms, +45 ms] (smoothstep), peak 45 ms after the beat,
  // exponential return (tau 120 ms); downbeats hit 1.35x.
  function nodEnv(t) {
    const i = lastIdx(BEATS, t), nb = BEATS[i + 1];
    let b;
    if (nb && nb.t - t < 0.07) b = nb; else if (i >= 0) b = BEATS[i]; else return 0;
    const s = t - b.t;
    const e = s < 0.045 ? sm(-0.07, 0.045, s) : Math.exp(-(s - 0.045) / 0.12);
    return e * (b.downbeat ? 1.35 : 1);
  }
  function nodAmp(t, sec) { return REFRAIN.has(sec.id) ? 0.48 * (0.55 + 0.45 * lowSmooth(t)) * (sec.intensity / 0.8) : 0; }
  /** this frame's nod: head now, body (neck/spine follow-through) one frame later; per-unit weight is applied by the army; head capped at 0.5 rad there */
  function nod(t) { const A = nodAmp(t, sectionAt(t)); return { head: A * nodEnv(t), body: A * nodEnv(t - 1 / 30) }; }
  const STEP = BEAT * 4; // one walk cycle = 4 beats (a step on beats 1 and 3)
  const phaseAt = (t, off = 0) => (t / STEP + off) * Math.PI * 2;
  // story anchors
  const tLock = lyricStart("Lock: released", 172.516);          // green is allowed from here on
  const tWave = S.s11.startS;
  const tStop = S.s05.startS;
  const tVox11 = lyricById("L033", 198.264);
  const tCut11 = (DOWN.filter(d => d.t <= tVox11 && d.t >= tWave).pop() || { t: tVox11 }).t;
  return { TL, BPM, BEAT, STEP, SECTIONS, BEATS, DOWN, S, lastIdx, sectionAt, lyric, lyricStart, lyricById, beatAt, barOf, downbeatAt, beatPulse, downPulse, band, lowSmooth,
    REFRAIN, isRefrain, nodEnv, nodAmp, nod, phaseAt, tLock, tWave, tStop, tCut11, greenAllowed: (t) => t >= tLock };
}

/** handheld shake as multi-octave noise of t (pure) */
export function handheld(t, amt, seed = 0) {
  return [Math.sin(t * 1.3 + seed) * .6 + Math.sin(t * 3.7 + 1 + seed) * .3, Math.sin(t * 1.7 + 2 + seed) * .5 + Math.sin(t * 4.3 + seed) * .2, Math.sin(t * 1.1 + 4 + seed) * .3].map(v => v * amt);
}

// camera paths for one-take shots (sets/cable-room/onetake.js, sets/outside.js)
/** Monotone cubic Hermite through timed keys: keys = [[t, ...values]] -> the values at t. A key that is a local
 *  extreme (or flat on one side) gets a zero tangent, others the harmonic mean of the two slopes (Fritsch-Butland),
 *  so the path never overshoots a key - a Catmull-Rom tangent swung the look target 5 m past the gauge. */
export function hermite(keys, t) {
  const n = keys.length, D = keys[0].length - 1;
  if (t <= keys[0][0]) return keys[0].slice(1);
  if (t >= keys[n - 1][0]) return keys[n - 1].slice(1);
  let k = 0; while (keys[k + 1][0] <= t) k++;
  const a = keys[k], b = keys[k + 1], h = b[0] - a[0], s = (t - a[0]) / h;
  const tan = (i, d) => { if (i === 0) return 0; const p = keys[i - 1], c = keys[i];
    const d0 = (c[d] - p[d]) / (c[0] - p[0]); if (i === n - 1) return d0; const q = keys[i + 1], d1 = (q[d] - c[d]) / (q[0] - c[0]);
    return d0 * d1 <= 0 ? 0 : 2 / (1 / d0 + 1 / d1); };
  const h00 = 2 * s ** 3 - 3 * s * s + 1, h10 = s ** 3 - 2 * s * s + s, h01 = -2 * s ** 3 + 3 * s * s, h11 = s ** 3 - s * s;
  const out = []; for (let d = 1; d <= D; d++) out.push(h00 * a[d] + h10 * h * tan(k, d) + h01 * b[d] + h11 * h * tan(k + 1, d));
  return out;
}
