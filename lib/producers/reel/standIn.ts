// THE DRY STAND-INS for the reel's two seat turns (spark reel-studio WP2): what a DRY job's turns write instead of
// the seat, so a dry job walks the whole loop - the table door, the continuity gate, the film check, the landing -
// without a seat turn. Both say what they are on their face: the source is named a stand-in, the film draws its own
// label. Neither is ever shown as a real reel.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ReelTable } from "../../reel/types.ts";

const PERIODS = 72;
const NAMES = ["Amber", "Basalt", "Cobalt", "Dune", "Ember", "Fjord", "Garnet", "Harbor", "Iris", "Juniper", "Kestrel", "Lumen"];

/** A table that passes the table door and the continuity gate: twelve rows weaving past each other over 72 months. */
export function standInTable(title: string): ReelTable {
  const periods = Array.from({ length: PERIODS }, (_, i) => `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
  const entities = NAMES.map((name, e) => ({
    id: name.toLowerCase(),
    name,
    values: periods.map((_, i) => Math.round(100 + 40 * Math.sin(i / 6 + e * 0.9) + e * 3 + i * (1 + (e % 3)))),
  }));
  const events = [6, 18, 30, 42, 54, 66].map((p, k) => ({ id: `e${k + 1}`, period: p, title: `Stand-in event ${k + 1}`, date: periods[p] ?? "", fact: `A dry stand-in for ${title.slice(0, 80)}: no seat was called.`, url: "https://example.org/dry-stand-in" }));
  return { v: 1, unit: "points", granularity: "month", cumulative: false, periods, entities, events, source: { name: "dry stand-in", url: "https://example.org/dry-stand-in", licence: "none: a dry stand-in, never published", fetchedAt: "2026-11-18" } };
}

/** The film's length a stand-in declares: 60 s of desktop time. */
export const STAND_IN_FRAMES = 1800;

const MODULE = `// dry stand-in: no seat was called
export function mount(w, h) {
  const label = document.getElementById("t");
  window.REEL = { width: w, height: h, fps: 30, frames: ${STAND_IN_FRAMES} };
  window.renderFrameAt = (i) => { label.textContent = "dry stand-in " + i; label.style.opacity = String(0.4 + 0.6 * (i % 60) / 60); };
  window.REEL_READY = true;
}
`;

const page = (w: number, h: number): string =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#f4f1ea;width:${w}px;height:${h}px;overflow:hidden}#t{font:600 64px sans-serif;position:absolute;left:10%;top:40%}</style></head><body><div id="t"></div><script type="module">import { mount } from "./film.js"; mount(${w}, ${h});</script></body></html>\n`;

/** The pages a dry author turn leaves in out/: both faces on one module, and the declared length. */
export async function standInFilm(out: string): Promise<void> {
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "film.js"), MODULE);
  await writeFile(path.join(out, "reel-desktop.html"), page(1920, 1080));
  await writeFile(path.join(out, "reel.html"), page(1080, 1920));
  await writeFile(path.join(out, "reel.json"), `${JSON.stringify({ frames: STAND_IN_FRAMES })}\n`);
}
