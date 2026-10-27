// Builds a mirror queue from cards: film stills as Flux 2 reference latents, three shots per character on one seed
// (turnaround sheet, portrait, everyday scene). late 0 is the measured winner (parody-cast r3, 2026-10-27); pass
// --arms 0,0.25 to re-run the comparison.
// usage: node queue.mjs <cards.json> <outDir> [--seed 40000] [--arms 0]
// card: { key, kind: "masked"|"creature"|"human", core, rules, refs: [<=3 paths, <=1024 px], scene }
import fs from "node:fs";
import path from "node:path";

const [cardsPath, out, ...flags] = process.argv.slice(2);
const flag = (n, d) => { const i = flags.indexOf(n); return i < 0 ? d : flags[i + 1]; };
const arms = String(flag("--arms", "0")).split(",").map(Number);
let seed = Number(flag("--seed", 40000));
const cards = JSON.parse(fs.readFileSync(cardsPath, "utf8"));
const q = [];
for (const c of cards) {
  if (!["masked", "creature", "human"].includes(c.kind)) throw new Error(`${c.key}: kind must be masked, creature or human`);
  if (!Array.isArray(c.refs) || c.refs.length < 1 || c.refs.length > 3) throw new Error(`${c.key}: 1-3 refs`);
  for (const r of c.refs) if (!fs.existsSync(r)) throw new Error(`${c.key}: missing ${r}`);
  // A human character's refs are neck-down costume crops; its face is written in words and invented.
  const face = c.kind === "human" ? " The face is an original invented face, not from the reference photos; costume and build exactly as in the reference photos." : " Exactly as in the reference photos.";
  const core = c.core[0].toUpperCase() + c.core.slice(1);
  const shots = [
    ["sheet", "16:9", `Character turnaround reference sheet on a plain light-grey field, photographic film-costume reference, even neutral studio light. The same character shown side by side at the same scale: full-body front view, three-quarter view, side profile, back view, and a head close-up. ${core}. ${c.rules}. Identical in every view.${face}`],
    ["portrait", "1:1", `Studio portrait photograph, three-quarter view from the waist up, even soft light, plain mid-grey background. ${core}. ${c.rules}.${face}`],
    ["scene", "16:9", `Cinematic film still, 35mm, natural practical light. The character ${c.scene}. ${core}.${face}`],
  ];
  for (const [shot, aspect, prompt] of shots) {
    seed++;
    if (prompt.length > 2000) throw new Error(`${c.key} ${shot}: prompt ${prompt.length} chars`);
    for (const late of arms) q.push({ id: `m-${c.key}-${shot}-l${String(Math.round(late * 100)).padStart(2, "0")}`, key: c.key, shot, aspect, seed, late, refs: c.refs.map((r) => path.resolve(r)), prompt });
  }
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "queue.tmp"), q.map((x) => JSON.stringify(x) + "\n").join(""));
fs.renameSync(path.join(out, "queue.tmp"), path.join(out, "queue.jsonl"));
console.log(`queued ${q.length}`);
