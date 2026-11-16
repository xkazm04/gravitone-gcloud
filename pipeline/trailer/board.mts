// The concept board of a /trailer-clip: one band per concept, its art beside its beats drawn to scale.
// Work text only (names, beats, sounds, risks): no sentence about the board or how to use it.

export const BEATS = ["shift", "blast", "black", "arrival", "reboot", "standoff", "rampage"] as const;
export type Beat = (typeof BEATS)[number] | "sting";

export interface Concept {
  id: string;
  name: string;
  logline: string;
  /** The ONE camera or form device carried through the trailer. */
  device: string;
  /** The recurring object and how it changes. */
  motif: string;
  /** Who the voices and the ghost companions are, with their skills. */
  ghosts: string;
  /** What the concept sounds like on H3's own audio alone, the only sound of the first version. */
  sound: string;
  risk: string;
  /** The concept's core image: scene only, the shared look sentence is prepended. */
  art: string;
  beats: { beat: Beat; seconds: number; picture: string; sound: string }[];
}

export interface Concepts {
  v: 1;
  title: string;
  look: string;
  /** One fixed phrase for the hero, repeated verbatim in every image prompt. */
  rivet: string;
  castPrompt: string;
  concepts: Concept[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TONE: Record<Beat, string> = {
  shift: "#c9a15a", blast: "#e8622c", black: "#000", arrival: "#5b7c99",
  reboot: "#8fa3a8", standoff: "#3f6f9e", rampage: "#c8342b", sting: "#e8e4da",
};

function band(x: Concept, hasArt: boolean, picked: boolean): string {
  const total = x.beats.reduce((n, b) => n + b.seconds, 0);
  const strip = x.beats.map((b) => `<i style="flex:${b.seconds};background:${TONE[b.beat]}" title="${esc(b.beat)} ${b.seconds} s"></i>`).join("");
  const rows = x.beats.map((b) =>
    `<tr><th><u style="background:${TONE[b.beat]}"></u>${esc(b.beat)}</th><td class="n">${b.seconds}s</td><td>${esc(b.picture)}</td><td class="s">${esc(b.sound)}</td></tr>`).join("");
  const img = hasArt
    ? `<img src="art/${esc(x.id)}.png" alt="${esc(x.name)}: ${esc(x.logline)}">`
    : `<div class="none" role="img" aria-label="no art yet">${esc(x.id)}</div>`;
  return `<section${picked ? ' class="picked"' : ""}>
  <div class="art">${img}</div>
  <div class="body">
    <h2>${esc(x.name)} <code>${esc(x.id)}</code> <span>${total} s</span></h2>
    <p class="log">${esc(x.logline)}</p>
    <div class="strip" role="img" aria-label="${x.beats.map((b) => `${b.beat} ${b.seconds} seconds`).join(", ")}">${strip}</div>
    <dl><dt>device</dt><dd>${esc(x.device)}</dd><dt>motif</dt><dd>${esc(x.motif)}</dd><dt>ghosts</dt><dd>${esc(x.ghosts)}</dd><dt>sound</dt><dd>${esc(x.sound)}</dd><dt>risk</dt><dd>${esc(x.risk)}</dd></dl>
  </div>
  <table>${rows}</table>
</section>`;
}

export function boardPage(c: Concepts, hasArt: (id: string) => boolean, pick?: string): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(c.title)} concepts</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:32px;background:#0e0f11;color:#e8e4da;font:15px/1.45 system-ui,sans-serif}
h1{margin:0 0 4px;font-size:28px;letter-spacing:.04em}.look{color:#a7a59c;margin:0 0 24px;max-width:1500px}
section{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px 24px;padding:20px;margin:0 0 20px;background:#17191c;border:1px solid #2b2e33;border-radius:6px}
section.picked{border-color:#e8a33d}
.art img,.none{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#000;border-radius:3px}.none{display:grid;place-items:center;color:#a7a59c}
h2{margin:0;font-size:22px}h2 code{font-size:13px;color:#a7a59c;font-weight:400;margin-left:6px}h2 span{float:right;font-size:14px;font-weight:400;color:#a7a59c}
.log{margin:6px 0 12px;font-size:16px}.strip{display:flex;height:12px;gap:2px;margin:0 0 12px}.strip i{display:block;outline:1px solid #4a4e55}
dl{display:grid;grid-template-columns:64px 1fr;gap:5px 10px;margin:0}dt{color:#a7a59c}dd{margin:0}
table{grid-column:1/-1;border-collapse:collapse;width:100%;font-size:14px}td,th{padding:5px 8px;border-top:1px solid #2b2e33;text-align:left;vertical-align:top}
th{white-space:nowrap;font-weight:500}th u{display:inline-block;width:9px;height:9px;margin-right:7px;outline:1px solid #4a4e55;text-decoration:none}
td.n{white-space:nowrap;color:#a7a59c}td.s{width:34%;color:#bdbbb1}
</style>
<h1>${esc(c.title)}</h1>
<p class="look">${esc(c.look)}</p>
${c.concepts.map((x) => band(x, hasArt(x.id), x.id === pick)).join("\n")}
</html>`;
}
