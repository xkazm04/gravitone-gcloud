// STEER BY EAR, FROM A TERMINAL - the /audio composer's compile for a developer (@gt/ui steer.ts):
//
//   npx tsx pipeline/steer.mts "<sentence>" [--shape arc|rise|bed|sting|two-peaks] [--length <s>] [--json] [--hear]
//
// Prints the words heard (and the sentence words behind each), the words unheard, Suno's form
// fields (section tags in the lyrics when the sentence or --shape gives the piece a shape), the
// sections, and the ElevenLabs plan quoted in credits - DRY: nothing here launches or spends.
// --hear renders, locally and free, one audition per playable instrument and the sketch of them
// together over the shape (pipeline/audio/audition.py, sketch.py) from the sample libraries named
// by GRAVITONE_SAMPLE_ROOTS, and prints the WAV paths. No store is opened.
import { playableBpm, playableIds, standInsOf } from "@gt/ui/components/audio/atlas.ts";
import { clock, LEVEL_WORDS, PRESETS } from "@gt/ui/components/audio/shape.ts";
import { steerBrief } from "@gt/ui/components/audio/steer.ts";

import { auditionFile, audibleIds, sampleRoots, SAMPLE_ROOTS_ENV, sketchFile } from "../lib/audio/atlas.ts";
import { priceCall } from "../lib/music/pricing.ts";

const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(name);
const value = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const sentence = argv.filter((a, i) => !a.startsWith("--") && !["--shape", "--length"].includes(argv[i - 1] ?? "")).join(" ").trim();
if (sentence === "") {
  console.error(`usage: npx tsx pipeline/steer.mts "<sentence>" [--shape ${PRESETS.map((p) => p.id).join("|")}] [--length <s>] [--json] [--hear]`);
  process.exit(2);
}
const shape = value("--shape");
if (shape !== undefined && !PRESETS.some((p) => p.id === shape)) {
  console.error(`--shape ${shape}: not one of ${PRESETS.map((p) => p.id).join(", ")}`);
  process.exit(2);
}
const length = value("--length");
const lengthS = length === undefined ? undefined : Number(length);
if (lengthS !== undefined && (!Number.isFinite(lengthS) || lengthS < 10 || lengthS > 600)) {
  console.error(`--length ${length}: seconds, 10-600`);
  process.exit(2);
}

const b = steerBrief({ sentence, ...(shape === undefined ? {} : { shape }), ...(lengthS === undefined ? {} : { lengthS }) });
const quote = b.plan === null ? null : priceCall({ op: "compose", seconds: b.planSeconds });

const heard: { auditions: { term: string; file: string | null; why?: string }[]; sketch: string | null; standIns: { word: string; as: string }[] } = { auditions: [], sketch: null, standIns: [] };
if (flag("--hear")) {
  if (sampleRoots().length === 0) {
    console.error(`--hear: no sample library is configured (${SAMPLE_ROOTS_ENV})`);
    process.exit(1);
  }
  const can = new Set(await audibleIds());
  const bpm = playableBpm(b.seed.bpm);
  for (const i of b.instruments) {
    if (i.atlas === null || !can.has(i.atlas)) {
      heard.auditions.push({ term: i.term, file: null, why: "no library here files it" });
      continue;
    }
    const r = await auditionFile({ id: i.atlas, bpm, key: b.seed.key });
    heard.auditions.push(r.ok ? { term: i.term, file: r.value } : { term: i.term, file: null, why: r.error.message });
  }
  const ids = playableIds(b.seed.instruments, can);
  heard.standIns = standInsOf(b.seed.instruments, can).map((x) => ({ word: x.word, as: x.as.term }));
  if (ids.length > 0) {
    const r = await sketchFile({ ids, levels: b.levels ?? [3], bpm, key: b.seed.key });
    if (r.ok) heard.sketch = r.value;
    else console.error(`sketch: ${r.error.message}`);
  }
}

if (flag("--json")) {
  console.log(JSON.stringify({ ...b, elevenlabs: b.plan === null ? null : { seconds: b.planSeconds, credits: quote?.credits ?? null, basis: quote?.basis, dry: true }, heard }, null, 2));
} else {
  const pad = (s: string): string => s.padEnd(12);
  for (const h of b.heard) console.log(`${pad(h.list)} ${h.term.padEnd(24)} <- ${h.from.join(" ")}`);
  console.log(`${pad("unheard")} ${b.unheard.length === 0 ? "-" : b.unheard.join(", ")}`);
  for (const n of b.near) console.log(`${pad("did you mean")} ${n.word} -> ${n.to}`);
  if (b.seed.bpm !== null) console.log(`${pad("tempo")} ${b.seed.bpm} bpm`);
  if (b.key !== null) console.log(`${pad("key")} ${b.key.value.padEnd(24)} <- ${b.key.from.join(" ")}`);
  for (const p of b.pulls) console.log(`${pad(`${p.kind} pulls`)} ${p.sides.map((x) => `${x.words.join(" ")} ${x.says} (say "${x.settle}")`).join("  <->  ")}`);
  console.log("");
  if (b.suno === null) console.log("suno       (no style words: nothing to send)");
  else {
    console.log(`suno style    ${b.suno.style}`);
    if (b.suno.exclude !== undefined) console.log(`suno exclude  ${b.suno.exclude}`);
    console.log(`suno lyrics   ${b.suno.lyrics.split("\n").join("\n              ")}`);
  }
  if (b.sections.length > 0) {
    console.log("");
    for (const s of b.sections) console.log(`${pad(s.label)} ${clock(s.startS)}-${clock(s.endS)}  ${String(s.bars).padStart(2)} bars  ${LEVEL_WORDS[s.level]}`);
    console.log(`elevenlabs plan  ${b.plan?.sections.length ?? 0} sections, ${Math.round(b.planSeconds)} s, ${quote?.credits === undefined ? "unpriced" : `${Math.round(quote.credits)} credits`} - quoted, dry`);
  }
  if (flag("--hear")) {
    console.log("");
    for (const a of heard.auditions) console.log(`hear ${a.term.padEnd(22)} ${a.file ?? `- (${a.why ?? ""})`}`);
    console.log(`hear ${"(together)".padEnd(22)} ${heard.sketch ?? "-"}${heard.standIns.length === 0 ? "" : `  (${heard.standIns.map((x) => `${x.word} ≈ ${x.as}`).join(", ")})`}`);
  }
}
