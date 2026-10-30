// THE BOARD TEMPLATES - template-literal functions that turn a timeline, the
// authored directions and the authored story into standalone HTML. No fs, no
// browser: boards.ts reads and writes, this file only spells pages.
//
// SELF-CONTAINED BY CONSTRUCTION. Every page carries a Content-Security-Policy
// with `default-src 'none'`: inline CSS and script, data: images and fonts, and
// nothing that leaves the machine. A fragment the model session wrote with a
// Google Fonts link does not quietly fetch; it renders without the font, and
// the board stays the same page on a plane as on the box.
//
// THE TEXT IS THE WORK. Names, palettes, story beats, risks, section labels and
// numbers. The only words that are not data are the units and the field names
// the data already has (animation, type, risk) - a board that explains itself
// is the defect the repo's narration law was written against.

import type { Direction, LyricConfidence, TimelineSection, TimelineV1, Treatment } from "./types";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** JSON safe to put inside a <script>: a `</script>` in a lyric cannot end the block. */
export const scriptJson = (v: unknown) => JSON.stringify(v).replace(/[<\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

export const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:";

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export const LABEL_COLOUR: Record<TimelineSection["label"], string> = {
  intro: "#4a6fa5",
  verse: "#5f9e6e",
  prechorus: "#c9a227",
  chorus: "#d1495b",
  bridge: "#8e6cc2",
  breakdown: "#3aa6a6",
  outro: "#6b7280",
};

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0e0f12;color:#e8e6e1;font:15px/1.4 ui-sans-serif,system-ui,"Segoe UI",sans-serif;padding:28px}
.mono{font-family:ui-monospace,"Cascadia Mono",Consolas,monospace}
.dim{color:#9a978f}
header.track{display:grid;gap:12px;margin-bottom:28px}
.facts{display:flex;gap:28px;align-items:baseline;flex-wrap:wrap}
.facts h1{font-size:28px;font-weight:650;letter-spacing:.01em}
.facts span{font-size:15px}
.sections{display:flex;height:64px;border-radius:6px;overflow:hidden;gap:2px;background:#16181d}
.sections>div{position:relative;min-width:0;display:flex;flex-direction:column;justify-content:flex-end}
.sections .lvl{position:absolute;left:0;right:0;bottom:0}
.sections .lab{position:relative;font-size:12px;padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;text-shadow:0 1px 2px #000}
svg.curve{width:100%;height:90px;background:#16181d;border-radius:6px;display:block}
.tally{display:flex;gap:10px;flex-wrap:wrap}
.tally span{border:1px solid #33363d;border-radius:999px;padding:2px 10px;font-size:13px}
`;

export function page(title: string, css: string, body: string, csp = CSP): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${BASE_CSS}${css}</style></head>
<body>${body}</body></html>
`;
}

export const trackTitle = (t: TimelineV1) => (t.track.file.split(/[\\/]/).pop() ?? t.track.file).replace(/\.[^.]+$/, "");

/** Downsample a per-frame curve to at most `n` points, keeping each bucket's peak (a flash is not averaged away). */
export function peaks(xs: readonly number[], n: number): number[] {
  if (xs.length <= n) return [...xs];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * xs.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * xs.length) / n));
    out.push(Math.max(...xs.slice(a, b)));
  }
  return out;
}

export function intensitySvg(t: TimelineV1): string {
  const pts = peaks(t.intensity, 600);
  const W = 1000;
  const H = 100;
  const line = pts.map((v, i) => `${((i / Math.max(1, pts.length - 1)) * W).toFixed(1)},${(H - 4 - v * (H - 8)).toFixed(1)}`).join(" ");
  const marks = t.sections.map((s) => {
    const x = ((s.startS / t.track.durationS) * W).toFixed(1);
    return `<line x1="${x}" x2="${x}" y1="0" y2="${H}" stroke="#3a3d45" stroke-width="1"/>`;
  });
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="intensity">${marks.join("")}<polygon points="0,${H} ${line} ${W},${H}" fill="#d1495b33"/><polyline points="${line}" fill="none" stroke="#e8735f" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

export function sectionStrip(t: TimelineV1): string {
  const cells = t.sections.map((s) => {
    const c = LABEL_COLOUR[s.label];
    const span = Math.max(0.001, s.endS - s.startS);
    const tip = `${s.id} ${s.label} ${mmss(s.startS)}-${mmss(s.endS)} intensity ${s.intensity.toFixed(2)} cuts/bar ${s.cutsPerBar}`;
    return `<div style="flex:${span.toFixed(3)};background:${c}33" title="${esc(tip)}"><div class="lvl" style="height:${Math.round(s.intensity * 100)}%;background:${c}"></div><div class="lab">${esc(s.lyricTag ?? s.label)} <span class="mono">${mmss(s.startS)}</span></div></div>`;
  });
  return `<div class="sections" role="img" aria-label="sections">${cells.join("")}</div>`;
}

export function lyricTally(t: TimelineV1): string {
  const order: LyricConfidence[] = ["high", "medium", "low", "section-only"];
  const n = (c: LyricConfidence) => t.lyrics.filter((l) => l.confidence === c).length;
  return `<div class="tally mono">${order.map((c) => `<span>${c} ${n(c)}</span>`).join("")}</div>`;
}

export function trackHeader(t: TimelineV1): string {
  const bpm = t.tempo.bpmPrior !== undefined && Math.abs(t.tempo.bpmPrior - t.tempo.bpmGlobal) >= 0.5 ? `${t.tempo.bpmGlobal.toFixed(1)} bpm <span class="dim">(prompt ${t.tempo.bpmPrior})</span>` : `${t.tempo.bpmGlobal.toFixed(1)} bpm`;
  return `<header class="track">
<div class="facts"><h1>${esc(trackTitle(t))}</h1><span class="mono">${mmss(t.track.durationS)}</span><span class="mono">${bpm}</span><span class="mono">${t.sections.length} sections</span><span class="mono">${t.lyrics.length} lines</span></div>
${sectionStrip(t)}
${intensitySvg(t)}
${lyricTally(t)}
</header>`;
}

/** The card a direction gets when the session wrote no fragment for it: its palette, as bands. */
export function defaultSwatch(d: Direction): string {
  const bands = d.palette.map((c) => `<div style="flex:1;background:${c}"></div>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000}.b{display:flex;height:100%}.n{position:absolute;left:16px;bottom:12px;font:600 22px system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000}</style></head><body><div class="b">${bands}</div><div class="n">${esc(d.name)}</div></body></html>`;
}

const CARD_CSS = `
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:20px}
article{background:#16181d;border:1px solid #262930;border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
article iframe{width:100%;aspect-ratio:16/9;border:0;display:block;background:#000}
article .body{padding:14px 16px;display:grid;gap:8px}
article h2{font-size:19px;font-weight:650;display:flex;justify-content:space-between;gap:10px;align-items:baseline}
article h2 .mono{font-size:12px;color:#9a978f;font-weight:400}
.pal{display:flex;gap:4px}.pal span{flex:1;height:22px;border-radius:3px;position:relative}
.pal span i{position:absolute;bottom:-16px;left:0;font:10px ui-monospace,monospace;font-style:normal;color:#9a978f}
.pal{margin-bottom:14px}
dl{display:grid;grid-template-columns:88px 1fr;gap:4px 10px;font-size:14px}
dt{color:#9a978f;font-size:12px;padding-top:2px}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chips span{border:1px solid #33363d;border-radius:4px;padding:0 6px;font-size:12px}
dd.risk{color:#f0b37e}
`;

export function directionCard(d: Direction, fragment: string | undefined): string {
  const doc = fragment ?? defaultSwatch(d);
  const pal = d.palette.map((c) => `<span style="background:${c}"><i>${esc(c)}</i></span>`).join("");
  return `<article data-direction="${esc(d.id)}" aria-label="${esc(d.name)}">
<iframe sandbox="allow-scripts" srcdoc="${esc(doc)}" title="${esc(d.name)}"></iframe>
<div class="body">
<h2><span>${esc(d.name)}</span><span class="mono">${esc(d.id)}</span></h2>
<div class="pal">${pal}</div>
<dl><dt>animation</dt><dd>${esc(d.animation)}</dd><dt>type</dt><dd>${esc(d.type)}</dd><dt>story</dt><dd>${esc(d.story)}</dd>
<dt>transitions</dt><dd class="chips">${d.transitions.map((x) => `<span>${esc(x)}</span>`).join("")}</dd>
<dt>risk</dt><dd class="risk">${esc(d.risk)}</dd></dl>
</div></article>`;
}

export function boardAPage(t: TimelineV1, directions: readonly Direction[], fragments: ReadonlyMap<string, string>): string {
  const cards = directions.map((d) => directionCard(d, fragments.get(d.id))).join("\n");
  return page(`${trackTitle(t)} - A`, CARD_CSS, `${trackHeader(t)}\n<main class="grid">\n${cards}\n</main>`);
}

/** Put the timeline slice into the hero document before any of its own scripts run. */
export function injectTimeline(heroHtml: string, slice: unknown): string {
  const tag = `<script>window.__TIMELINE__=${scriptJson(slice)};</script>`;
  const head = /<head\b[^>]*>/i.exec(heroHtml);
  if (head) return heroHtml.slice(0, head.index + head[0].length) + tag + heroHtml.slice(head.index + head[0].length);
  return tag + heroHtml;
}

const B_CSS = `
.hero{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:start;margin-bottom:24px}
#hero{width:1280px;height:720px;border:0;background:#000;display:block;border-radius:6px}
.ctl{display:flex;gap:12px;align-items:center;margin-top:10px}
.ctl button{background:#22252c;color:#e8e6e1;border:1px solid #33363d;border-radius:6px;width:40px;height:32px;font-size:15px;cursor:pointer}
.ctl input{flex:1}
.facts2{display:grid;gap:6px;font-size:14px}
.story{display:grid;gap:6px}
.story>div{border-radius:8px;padding:10px 12px;display:grid;grid-template-columns:220px 1fr 1fr 70px;gap:12px;align-items:start;border:1px solid #262930}
.story .hero-mark{outline:2px solid #e8735f}
.story h3{font-size:15px;font-weight:650}
`;

export interface StoryCell {
  id: string;
  title: string;
  beat: string;
  visual: string;
  cutsPerBar: number;
  label: TimelineSection["label"];
  intensity: number;
  startS: number;
  endS: number;
  hero: boolean;
}

/**
 * Board B: the hero in an iframe, driven by the shell. The driver is the ONLY
 * clock: it calls the hero's pure `render(t)` from requestAnimationFrame,
 * looping start..end; the scrubber stops it and draws the scrubbed time.
 * `#t=<seconds>` in the URL holds one time instead of playing - the contact
 * sheet loads the page that way, once per frame, so each frame is drawn cold.
 */
export function boardBPage(t: TimelineV1, direction: Direction, heroDoc: string, hero: { startS: number; endS: number }, cells: readonly StoryCell[]): string {
  const step = (1 / t.fps).toFixed(5);
  const strip = cells
    .map((c) => {
      const col = LABEL_COLOUR[c.label];
      const a = Math.round(20 + c.intensity * 60).toString(16).padStart(2, "0");
      return `<div class="${c.hero ? "hero-mark" : ""}" data-section="${esc(c.id)}" style="background:linear-gradient(90deg,${col}${a},#16181d 70%)"><div><h3>${esc(c.title)}</h3><span class="mono dim">${esc(c.id)} ${c.label} ${mmss(c.startS)}-${mmss(c.endS)}</span></div><div>${esc(c.beat)}</div><div>${esc(c.visual)}</div><div class="mono">${c.cutsPerBar}/bar</div></div>`;
    })
    .join("\n");
  const driver = `(function(){
var S=${hero.startS},E=${hero.endS},f=document.getElementById("hero"),r=document.getElementById("scrub"),o=document.getElementById("now"),b=document.getElementById("play");
var m=/[#&]t=([0-9.]+)/.exec(location.hash),playing=!m,t=m?parseFloat(m[1]):S,t0=null,err=null;
function draw(x){var w=f.contentWindow;try{if(w&&typeof w.render==="function"){w.render(x);window.__HERO_RENDER__=true}else{window.__HERO_RENDER__=false}}catch(e){err=String(e&&e.message||e);window.__HERO_ERROR__=err}r.value=String(x);o.textContent=x.toFixed(2)+" s";}
function tick(now){if(playing){if(t0===null)t0=now-(t-S)*1000;t=S+((now-t0)/1000)%(E-S);draw(t)}requestAnimationFrame(tick)}
function ready(){draw(t);window.__HERO_READY__=true;requestAnimationFrame(tick)}
if(!playing){b.textContent="\\u25b6";b.setAttribute("aria-label","play")}
b.addEventListener("click",function(){playing=!playing;t0=null;b.textContent=playing?"\u275a\u275a":"\u25b6";b.setAttribute("aria-label",playing?"pause":"play")});
r.addEventListener("input",function(){playing=false;t0=null;t=parseFloat(r.value);draw(t);b.textContent="\u25b6";b.setAttribute("aria-label","play")});
if(f.contentDocument&&f.contentDocument.readyState==="complete"&&f.contentWindow&&f.contentWindow.render)ready();else f.addEventListener("load",ready);
})();`;
  const body = `${trackHeader(t)}
<section class="hero"><div><iframe id="hero" title="${esc(direction.name)}" srcdoc="${esc(heroDoc)}"></iframe>
<div class="ctl"><button id="play" aria-label="pause">&#x275a;&#x275a;</button><input id="scrub" type="range" min="${hero.startS}" max="${hero.endS}" step="${step}" value="${hero.startS}" aria-label="time"><span id="now" class="mono">${hero.startS.toFixed(2)} s</span></div></div>
<div class="facts2"><h2>${esc(direction.name)}</h2><span class="mono dim">${esc(direction.id)}</span><span class="mono">${mmss(hero.startS)}-${mmss(hero.endS)} (${(hero.endS - hero.startS).toFixed(1)} s)</span><div class="pal" style="display:flex;gap:4px">${direction.palette.map((c) => `<span style="flex:1;height:18px;border-radius:3px;background:${c}"></span>`).join("")}</div></div></section>
<section class="story">
${strip}
</section>
<script>${driver}</script>`;
  return page(`${trackTitle(t)} - B`, B_CSS, body);
}

/** The Board B contact sheet: the three cold hero frames over the whole board. */
export function sheetBPage(title: string, frames: readonly { t: number; png: string }[], differ: boolean, boardPng: string): string {
  const css = `.row{display:grid;grid-template-columns:repeat(${frames.length},1fr);gap:12px;margin-bottom:20px}.row figure img{width:100%;display:block;border-radius:4px}.row figcaption{font:13px ui-monospace,monospace;color:#9a978f;padding-top:4px}.board{width:100%;display:block;border-top:1px solid #262930;padding-top:20px}.flag{font:600 14px ui-monospace,monospace;margin-bottom:10px;color:${differ ? "#7fd18b" : "#f06b6b"}}`;
  const figs = frames.map((f) => `<figure><img src="data:image/png;base64,${f.png}" alt="t ${f.t.toFixed(2)} s"><figcaption>t ${f.t.toFixed(2)} s</figcaption></figure>`).join("");
  return page(title, css, `<div class="flag">${differ ? "frames differ" : "frames identical"}</div><div class="row">${figs}</div><img class="board" src="data:image/png;base64,${boardPng}" alt="board">`);
}

// ---- Board T: the treatments, each a wide band of keyframes over its text.
//
// The frames are the one thing on a board that is not inline: a treatment's
// keyframes are 1920x1080 PNGs shot on the GPU, and base64-ing four of them per
// treatment into the page would make a 30 MB board. So the page names them by
// RELATIVE path (`board-t/<id>/frames/...`) and its CSP widens img-src to
// 'self' and nothing else - still no byte from off the machine.

export const CSP_T = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; font-src data:";

export interface TreatmentShot {
  /** One relative src per keyframe; undefined where no frame exists. */
  frames: (string | undefined)[];
  scene: boolean;
  renderer?: string;
  msPerFrame?: number;
  errors: number;
}

const T_CSS = `
.dir{display:flex;gap:14px;align-items:center;margin:-12px 0 24px}.dir .pal{display:flex;gap:3px}.dir .pal span{width:28px;height:14px;border-radius:2px}
section.tr{background:#16181d;border:1px solid #262930;border-radius:10px;padding:20px 22px;margin-bottom:28px;display:grid;gap:16px}
section.tr h2{font-size:26px;font-weight:650;display:flex;gap:16px;align-items:baseline}
section.tr h2 .mono{font-size:16px;color:#e8735f;font-weight:500}
.logline{font-size:18px;max-width:1400px}
.frames{display:grid;gap:10px}
.frames figure{display:grid;gap:4px}
.frames img,.frames .none{width:100%;aspect-ratio:16/9;display:block;border-radius:4px;background:#000;object-fit:cover}
.frames .none{border:1px dashed #3a3d45;display:flex;align-items:center;justify-content:center;color:#9a978f;font:13px ui-monospace,monospace}
.frames figcaption{font-size:13px;display:flex;gap:8px;align-items:baseline}
.sec{border-radius:3px;padding:0 6px;color:#fff;font-size:12px;white-space:nowrap}
.cols{display:grid;grid-template-columns:minmax(380px,1fr) 2fr;gap:22px;align-items:start}
dl{display:grid;grid-template-columns:120px 1fr;gap:6px 12px;font-size:14px}
dt{color:#9a978f;font-size:12px;padding-top:2px}
dd.risk{color:#f0b37e}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chips span{border:1px solid #33363d;border-radius:4px;padding:0 6px;font-size:12px}
table.plot{width:100%;border-collapse:separate;border-spacing:0 3px;font-size:13px}
table.plot td{padding:5px 8px;vertical-align:top;background:#1b1d23}
table.plot td:first-child{border-left:4px solid var(--c);white-space:nowrap;width:150px}
.gpu{font-size:13px}.gpu.bad{color:#f06b6b;font-weight:600}
`;

export interface TreatmentCell {
  treatment: Treatment;
  shot: TreatmentShot;
}

function treatmentBand(t: TimelineV1, c: TreatmentCell): string {
  const tr = c.treatment;
  const sec = (id: string) => t.sections.find((s) => s.id === id);
  const secChip = (id: string) => {
    const s = sec(id);
    return s ? `<span class="sec" style="background:${LABEL_COLOUR[s.label]}">${esc(s.lyricTag ?? s.label)}</span>` : `<span class="sec">${esc(id)}</span>`;
  };
  const figs = tr.keyframes
    .map((k, i) => {
      const src = c.shot.frames[i];
      const img = src ? `<img src="${esc(src)}" alt="${esc(tr.name)} ${k.t.toFixed(2)} s">` : `<div class="none">${c.shot.scene ? "not shot" : "no scene.html"}</div>`;
      return `<figure>${img}<figcaption>${secChip(k.sectionId)}<span class="mono">${mmss(k.t)} · ${k.t.toFixed(2)} s</span><span>${esc(k.caption)}</span></figcaption></figure>`;
    })
    .join("");
  const rows = tr.plot
    .map((b) => {
      const s = sec(b.sectionId);
      const col = s ? LABEL_COLOUR[s.label] : "#3a3d45";
      return `<tr style="--c:${col}"><td>${secChip(b.sectionId)} <span class="mono dim">${esc(b.sectionId)}${s ? ` ${mmss(s.startS)}` : ""}</span></td><td>${esc(b.beat)}</td><td>${esc(b.shot)}</td></tr>`;
    })
    .join("");
  const sl = tr.shotLengthS;
  const gpu = c.shot.renderer === undefined ? "" : `<div class="gpu mono${/swiftshader/i.test(c.shot.renderer) ? " bad" : ""}">${esc(c.shot.renderer)}${c.shot.msPerFrame === undefined ? "" : ` · ${Math.round(c.shot.msPerFrame)} ms/frame`} · ${c.shot.errors} console error${c.shot.errors === 1 ? "" : "s"}${/swiftshader/i.test(c.shot.renderer) ? " · SwiftShader: CPU raster, not the GPU" : ""}</div>`;
  return `<section class="tr" data-treatment="${esc(tr.id)}" aria-label="${esc(tr.name)}">
<h2><span>${esc(tr.name)}</span><span class="mono">${esc(tr.id)}</span></h2>
<div class="logline">${esc(tr.logline)}</div>
<div class="frames" style="grid-template-columns:repeat(${Math.min(4, Math.max(1, tr.keyframes.length))},1fr)">${figs}</div>
<div class="cols"><dl>
<dt>characters</dt><dd>${esc(tr.characters)}</dd><dt>built as</dt><dd>${esc(tr.characterTech)}</dd>
<dt>signature device</dt><dd>${esc(tr.signatureDevice)}</dd><dt>motif</dt><dd>${esc(tr.motif)}</dd>
<dt>transitions</dt><dd class="chips">${tr.transitions.map((x) => `<span><b>${esc(x.grid)}</b> ${esc(x.move)}</span>`).join("")}</dd>
<dt>shot length</dt><dd class="mono">verse ${sl.verse} s · chorus ${sl.chorus} s · bridge ${sl.bridge} s</dd>
<dt>post</dt><dd class="chips">${tr.post.map((x) => `<span>${esc(x)}</span>`).join("")}</dd>
<dt>risk</dt><dd class="risk">${esc(tr.risk)}</dd>
</dl>
<table class="plot">${rows}</table></div>
${gpu}
</section>`;
}

export function boardTPage(t: TimelineV1, direction: Direction | undefined, cells: readonly TreatmentCell[]): string {
  const dir = direction ? `<div class="dir"><span class="mono dim">${esc(direction.id)}</span><span>${esc(direction.name)}</span><div class="pal">${direction.palette.map((c) => `<span style="background:${c}"></span>`).join("")}</div><span class="dim">${esc(direction.type)}</span></div>` : "";
  return page(`${trackTitle(t)} - T`, T_CSS, `${trackHeader(t)}\n${dir}\n<main>\n${cells.map((c) => treatmentBand(t, c)).join("\n")}\n</main>`, CSP_T);
}
