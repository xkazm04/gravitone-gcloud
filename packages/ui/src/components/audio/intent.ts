// INTENT -> BRIEF, FOR HANDS THAT ARE NOT MUSICIANS - pure, deterministic, no I/O.
// Plain words for what a piece is FOR and how it should FEEL compile to the same Seed, section
// plan and vendor fields every time (./recipe.ts, so the doors never drift). The hash covers
// the canonical intent plus COMPILER_VERSION; a change shows as a golden diff.

import { err, ok, type Result } from "@gt/domain/errors";

import { keyPitch } from "./brief.ts";
import { compose, sunoCut, sunoFieldsOf, type Seed, type SunoFieldsDraft } from "./recipe.ts";

export const COMPILER_VERSION = "audio-intent-v1";
export const MAX_LENGTH_S = 600;
export const MIN_LENGTH_S = 3;

export type Energy = "calm" | "steady" | "driving";
export type Vocals = "none" | "soft" | "full";

export type AudioIntent = {
  readonly use?: string;
  readonly sentence?: string;
  readonly mood: readonly string[];
  readonly genres?: readonly string[];
  readonly instruments?: readonly string[];
  readonly paletteId?: string;
  readonly lengthS: number;
  readonly loop?: boolean;
  readonly avoid?: readonly string[];
  readonly bpm?: number | null;
  readonly key?: string | null;
  readonly energy?: Energy;
  readonly vocals?: Vocals;
};

export type InstrumentEntry = {
  readonly id: string;
  readonly name: string;
  readonly plain: string;
  readonly family: string;
  readonly role: "lead" | "body" | "bass" | "pulse" | "air";
  readonly feels: readonly string[];
  readonly suno: string;
  readonly keywords: readonly string[];
};

/** Ear-checked vocabulary: name a sound by what it feels like, not by its music-school name. */
export const INSTRUMENT_CATALOG: readonly InstrumentEntry[] = [
  { id: "felt-piano", name: "Felt piano", plain: "soft keys, close and warm", family: "keys", role: "lead", feels: ["calm", "hopeful", "sad", "warm", "gentle"], suno: "felt piano", keywords: ["felt", "piano", "keys"] },
  { id: "grand-piano", name: "Piano", plain: "clear keys that carry a tune", family: "keys", role: "lead", feels: ["hopeful", "bright", "sad", "focused"], suno: "piano", keywords: ["piano", "grand"] },
  { id: "music-box", name: "Music box", plain: "tiny bright bells, childlike", family: "keys", role: "air", feels: ["playful", "calm", "curious", "gentle"], suno: "music box", keywords: ["musicbox", "music box", "celesta"] },
  { id: "electric-piano", name: "Electric piano", plain: "mellow keys with a soft glow", family: "keys", role: "body", feels: ["warm", "calm", "hopeful", "night"], suno: "electric piano", keywords: ["rhodes", "epiano", "electric piano"] },
  { id: "acoustic-guitar", name: "Acoustic guitar", plain: "plucked strings, human and near", family: "strings", role: "lead", feels: ["warm", "hopeful", "calm", "honest"], suno: "acoustic guitar", keywords: ["acoustic", "guitar"] },
  { id: "nylon-guitar", name: "Soft guitar", plain: "gentle plucked strings, unhurried", family: "strings", role: "body", feels: ["calm", "gentle", "sad", "warm"], suno: "nylon guitar", keywords: ["nylon", "classical guitar"] },
  { id: "strings", name: "String section", plain: "sweeping bowed strings, cinematic", family: "strings", role: "body", feels: ["hopeful", "sad", "epic", "bright"], suno: "strings", keywords: ["strings", "violin", "orchestra"] },
  { id: "cello", name: "Cello", plain: "one deep singing string voice", family: "strings", role: "lead", feels: ["sad", "warm", "hopeful", "night"], suno: "cello", keywords: ["cello"] },
  { id: "synth-pad", name: "Synth pad", plain: "a warm electronic wash underneath", family: "synth", role: "body", feels: ["calm", "night", "focused", "hopeful"], suno: "synth pad", keywords: ["pad", "synth"] },
  { id: "analog-synth", name: "Analog synth", plain: "retro electronic melody, slightly wobbly", family: "synth", role: "lead", feels: ["playful", "curious", "driving", "night"], suno: "analog synth", keywords: ["analog", "synth", "moog"] },
  { id: "marimba", name: "Marimba", plain: "soft wooden taps that bounce", family: "keys", role: "lead", feels: ["playful", "calm", "curious", "warm"], suno: "marimba", keywords: ["marimba", "kalimba"] },
  { id: "flute", name: "Flute", plain: "breathy high melody, light as air", family: "wind", role: "air", feels: ["bright", "hopeful", "playful", "calm"], suno: "flute", keywords: ["flute"] },
  { id: "soft-brass", name: "Soft brass", plain: "distant warm horns, no fanfare", family: "wind", role: "body", feels: ["hopeful", "epic", "warm", "bright"], suno: "soft brass", keywords: ["brass", "horn", "trumpet"] },
  { id: "sub-bass", name: "Sub bass", plain: "low pulse you feel more than hear", family: "bass", role: "bass", feels: ["driving", "night", "focused", "epic"], suno: "sub bass", keywords: ["sub", "bass"] },
  { id: "warm-bass", name: "Warm bass", plain: "round low notes holding the floor", family: "bass", role: "bass", feels: ["calm", "warm", "steady", "hopeful"], suno: "warm bass guitar", keywords: ["bass"] },
  { id: "electric-bass", name: "Electric bass", plain: "smooth low notes with a little bounce", family: "bass", role: "bass", feels: ["steady", "warm", "playful", "focused"], suno: "electric bass", keywords: ["electric bass", "bass guitar"] },
  { id: "soft-drums", name: "Soft drums", plain: "a gentle beat that stays out of the way", family: "pulse", role: "pulse", feels: ["steady", "calm", "focused", "hopeful"], suno: "soft drums", keywords: ["drums", "kit", "percussion"] },
  { id: "driving-drums", name: "Driving drums", plain: "a beat that pushes forward", family: "pulse", role: "pulse", feels: ["driving", "epic", "bright", "playful"], suno: "drums", keywords: ["drums", "kit"] },
  { id: "hand-percussion", name: "Hand percussion", plain: "shakers and taps, human groove", family: "pulse", role: "pulse", feels: ["playful", "warm", "steady", "curious"], suno: "hand percussion", keywords: ["shaker", "percussion", "tambourine"] },
  { id: "soft-brushes", name: "Brushes", plain: "whispered swishes instead of hits", family: "pulse", role: "pulse", feels: ["calm", "gentle", "sad", "night"], suno: "brushes", keywords: ["brush", "brushes"] },
  { id: "choir-pad", name: "Wordless choir", plain: "voices humming, no words", family: "voice", role: "air", feels: ["epic", "hopeful", "sad", "night"], suno: "wordless choir", keywords: ["choir", "vocal", "voice"] },
  { id: "vinyl-texture", name: "Vinyl texture", plain: "soft crackle, old-record warmth", family: "synth", role: "air", feels: ["night", "warm", "sad", "calm"], suno: "vinyl crackle", keywords: ["vinyl", "crackle", "texture"] },
];

export const instrumentById = (id: string): InstrumentEntry | undefined =>
  INSTRUMENT_CATALOG.find((e) => e.id === id.trim().toLowerCase());

/** A catalog entry by id, exact name, or a contained word; undefined when it is not catalogued. */
export function findInstrument(word: string): InstrumentEntry | undefined {
  const w = word.trim().toLowerCase();
  return INSTRUMENT_CATALOG.find((e) => e.id === w || e.name.toLowerCase() === w || e.suno === w);
}

/** A catalog entry named in free words ("the marimba", "a cello"): the longest name the words hold. */
export function findInstrumentLoose(phrase: string): InstrumentEntry | undefined {
  const p = phrase.trim().toLowerCase().replace(/\s+/g, " ").replace(/^(the|a|an) /, "");
  return findInstrument(p) ?? INSTRUMENT_CATALOG.find((e) => e.id === p.replace(/ /g, "-")) ?? INSTRUMENT_CATALOG.find((e) => e.keywords.some((k) => k.toLowerCase() === p)) ?? INSTRUMENT_CATALOG.filter((e) => { const n = e.name.toLowerCase(); return p.includes(n) || p.includes(e.suno) || n.includes(p) || e.suno.includes(p); }).sort((a, b) => b.name.length - a.name.length)[0];
}

export type Palette = {
  readonly id: string;
  readonly label: string;
  readonly plain: string;
  readonly instruments: readonly InstrumentEntry[];
  readonly genres: readonly string[];
};

const FEEL_GENRE: Readonly<Record<string, string>> = {
  calm: "ambient", hopeful: "indie folk", sad: "neo-classical", playful: "indie pop", driving: "electronic", night: "downtempo",
  focused: "minimal electronic", epic: "cinematic", warm: "indie folk", bright: "indie pop", gentle: "ambient", curious: "indie electronic", honest: "indie folk", steady: "ambient electronic",
};

const words = (xs: readonly string[] | undefined): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs ?? []) {
    const w = x.trim().toLowerCase().replace(/\s+/g, " ");
    if (w !== "" && !seen.has(w)) { seen.add(w); out.push(w); }
  }
  return out;
};

const scoreOf = (e: InstrumentEntry, mood: readonly string[], use: string, energy?: Energy): number => {
  let s = 0;
  for (const m of mood) if (e.feels.includes(m)) s += 3;
  for (const m of mood) for (const f of e.feels) if (f.includes(m) || m.includes(f)) s += 1;
  if (/menu|game|app|loop|ui/.test(use) && (e.role === "body" || e.role === "bass")) s += 1;
  // A gentle brief must not be backed by the loudest kit on an alphabetical tie.
  const gentle = energy === "calm" || (energy !== "driving" && mood.some((m) => ["calm", "sad", "gentle", "night", "focused"].includes(m)) && !mood.includes("driving") && !mood.includes("epic"));
  if (gentle && (e.id === "driving-drums" || e.id === "sub-bass")) s -= 3;
  return s;
};

/** Three palettes that differ in their lead sound, best first. Deterministic for one input. */
export function suggestPalettes(input: { readonly mood: readonly string[]; readonly use?: string; readonly energy?: Energy }): Palette[] {
  const mood = words(input.mood);
  const use = (input.use ?? "").toLowerCase();
  const ranked = INSTRUMENT_CATALOG.map((e) => ({ e, s: scoreOf(e, mood, use, input.energy) })).sort((a, b) => b.s - a.s || a.e.id.localeCompare(b.e.id));
  const leads = ranked.filter((r) => r.e.role === "lead").slice(0, 6);
  // Each palette takes the next-best backing; a gentle brief never rotates onto the loud kit while a softer one exists.
  const gentle = input.energy === "calm" || (input.energy !== "driving" && mood.some((m) => ["calm", "sad", "gentle", "night", "focused"].includes(m)) && !mood.includes("driving") && !mood.includes("epic"));
  const pick = (role: InstrumentEntry["role"], skip: ReadonlySet<string>, offset: number): InstrumentEntry => {
    const all = ranked.filter((r) => r.e.role === role && !skip.has(r.e.id));
    const soft = gentle ? all.filter((r) => r.e.id !== "driving-drums" && r.e.id !== "sub-bass") : all;
    const cands = soft.length ? soft : all;
    return (cands[offset % Math.max(1, cands.length)] ?? cands[0] ?? ranked[0])!.e;
  };
  const genres = [...new Set(mood.map((m) => FEEL_GENRE[m]).filter((g): g is string => g !== undefined))];
  const out: Palette[] = [];
  const usedLeads = new Set<string>();
  for (const lead of leads) {
    if (out.length >= 3) break;
    if (usedLeads.has(lead.e.family)) continue;
    usedLeads.add(lead.e.family);
    const skip = new Set([lead.e.id]);
    const at = out.length;
    const body = pick("body", skip, at); skip.add(body.id);
    const bass = pick("bass", skip, at); skip.add(bass.id);
    const pulse = pick("pulse", skip, at);
    const instruments = [lead.e, body, bass, pulse].filter((e, i, a) => a.indexOf(e) === i);
    out.push({
      id: `palette-${lead.e.id}`,
      label: `${lead.e.name} first`,
      plain: `${lead.e.plain}; ${body.plain}`,
      instruments,
      genres: genres.length ? genres : ["ambient"],
    });
  }
  return out;
}

export type LintFinding = { readonly code: string; readonly level: "fix" | "warn" | "note"; readonly message: string };
export type PlanSectionOut = {
  readonly name: string; readonly durationS: number; readonly durationMs: number;
  readonly positiveStyles: readonly string[]; readonly negativeStyles: readonly string[];
  readonly directions: readonly string[];
};

export type CompiledBrief = {
  readonly compiler: string;
  readonly hash: string;
  readonly canonicalIntent: AudioIntent;
  readonly seed: Seed;
  readonly paletteId: string | null;
  readonly suno: SunoFieldsDraft | null;
  readonly elevenlabsSentence: string;
  readonly sections: readonly PlanSectionOut[];
  readonly plan: { readonly positiveGlobalStyles: readonly string[]; readonly negativeGlobalStyles: readonly string[]; readonly sections: readonly PlanSectionOut[] };
  readonly lint: readonly LintFinding[];
};

/** Canonical JSON: sorted keys, undefined dropped, so two spellings of one intent hash alike. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (typeof v === "object" && v !== null) {
    const keys = Object.keys(v as Record<string, unknown>).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** FNV-1a 64-bit over the canonical text: stable across processes, runtimes and word order. */
export function intentHash(canonical: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < canonical.length; i++) { h ^= BigInt(canonical.charCodeAt(i)); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return `ai-${COMPILER_VERSION.replace("audio-intent-", "")}-${h.toString(16).padStart(16, "0")}`;
}

export function canonicalIntent(raw: AudioIntent): AudioIntent {
  const avoid = words(raw.avoid).sort();
  return {
    ...(raw.use?.trim() ? { use: raw.use.trim() } : {}),
    ...(raw.sentence?.trim() ? { sentence: raw.sentence.trim() } : {}),
    mood: words(raw.mood),
    ...(raw.genres?.length ? { genres: words(raw.genres) } : {}),
    ...(raw.instruments?.length ? { instruments: words(raw.instruments) } : {}),
    ...(raw.paletteId ? { paletteId: raw.paletteId.trim().toLowerCase() } : {}),
    lengthS: raw.lengthS,
    ...(raw.loop !== undefined ? { loop: raw.loop } : {}),
    ...(avoid.length ? { avoid } : {}),
    // Null is the door's "unset" marker: it canonicalises away, so bpm: null hashes as omitting it.
    ...(raw.bpm != null ? { bpm: raw.bpm } : {}),
    ...(raw.key != null ? { key: raw.key } : {}),
    ...(raw.energy ? { energy: raw.energy } : {}),
    ...(raw.vocals ? { vocals: raw.vocals } : {}),
  };
}

const SECTION_WORDS: Readonly<Record<string, string>> = {
  intro: "sparse opening", build: "rising energy", main: "fullest section", lift: "lift, brightest section", outro: "arrival, hard ending on the beat", "loop a": "loop body, no ending", "loop b": "loop body, variation, no ending",
};

function sectionsFor(wordsFor: (name: string) => readonly string[], avoid: readonly string[], total: number, loop: boolean): PlanSectionOut[] {
  // Section count is capped so every section can hold the 3 s vendor floor; weights are normalised, so the last section never inherits a rounding lump.
  const names = loop
    ? total >= MIN_LENGTH_S * 2 ? ["loop a", "loop b"] : ["loop a"]
    : total < MIN_LENGTH_S * 2 ? ["main"] : total < MIN_LENGTH_S * 3 ? ["intro", "main"] : total < 20 ? ["intro", "main", "outro"] : total < 45 ? ["intro", "main", "lift", "outro"] : ["intro", "build", "main", "lift", "outro"];
  const weights: Readonly<Record<string, number>> = { intro: 0.14, build: 0.26, main: 0.34, lift: 0.14, outro: 0.12, "loop a": 0.5, "loop b": 0.5 };
  const sumW = names.reduce((a, n) => a + (weights[n] ?? 0.2), 0);
  const durations = names.map((n) => Math.max(total >= MIN_LENGTH_S * names.length ? MIN_LENGTH_S : 1, Math.floor((total * (weights[n] ?? 0.2)) / sumW)));
  let diff = total - durations.reduce((a, d) => a + d, 0);
  const mainAt = Math.max(0, names.findIndex((n) => n === "main" || n === "loop a"));
  while (diff > 0) { durations[mainAt] = (durations[mainAt] ?? 0) + 1; diff--; }
  while (diff < 0) {
    const at = durations.indexOf(Math.max(...durations));
    if ((durations[at] ?? 0) <= 1) break;
    durations[at] = (durations[at] ?? 0) - 1; diff++;
  }
  return names.map((name, i) => {
    const durationS = durations[i] ?? 0;
    return {
      name, durationS, durationMs: durationS * 1000,
      positiveStyles: [...wordsFor(name), SECTION_WORDS[name] ?? name],
      negativeStyles: loop ? [...avoid, "fade-out ending", "ending sting"] : avoid,
      directions: [loop ? "loops back to the first bar without a gap" : name === "intro" ? "opens the piece" : name === "outro" ? "ends the piece" : "carries the piece"],
    };
  });
}

export type SteerVariant = {
  readonly complaint: string;
  readonly axis: string;
  readonly change: string;
  readonly intent: AudioIntent;
  readonly hash: string;
  readonly seed: Seed;
};

type SteerRule = { readonly axis: string; readonly change: string; readonly hits: readonly string[]; readonly apply: (i: AudioIntent, seed: Seed) => AudioIntent };

const bpmOf = (i: AudioIntent, seed: Seed): number => i.bpm ?? seed.bpm ?? 96;

/** Plain complaint words -> one axis moved. A non-musician never has to name the axis. */
const STEER_RULES: readonly SteerRule[] = [
  { axis: "tempo", change: "tempo up", hits: ["too slow", "dragging", "sluggish", "plodding"], apply: (i, s) => ({ ...i, bpm: Math.min(220, bpmOf(i, s) + 12) }) },
  { axis: "tempo", change: "tempo down", hits: ["too fast", "frantic", "rushed", "hectic"], apply: (i, s) => ({ ...i, bpm: Math.max(40, bpmOf(i, s) - 12) }) },
  { axis: "length", change: "half as long again", hits: ["too short", "not long enough", "longer"], apply: (i) => ({ ...i, lengthS: Math.min(MAX_LENGTH_S, Math.round(i.lengthS * 1.5)) }) },
  { axis: "length", change: "a third shorter", hits: ["too long", "shorter"], apply: (i) => ({ ...i, lengthS: Math.max(MIN_LENGTH_S, Math.round((i.lengthS * 2) / 3)) }) },
  { axis: "variation", change: "curious added for contrast", hits: ["repetitive", "samey", "monotonous", "same thing"], apply: (i) => ({ ...i, mood: [...new Set([...i.mood, "curious"])] }) },
  { axis: "energy", change: "calmer, pulse removed", hits: ["too busy", "crowded", "too much", "overwhelming", "too intense"], apply: (i, s) => ({ ...i, energy: "calm", mood: [...new Set([...i.mood, "calm"])], instruments: s.instruments.filter((x) => !/drum|percussion/.test(x)) }) },
  { axis: "energy", change: "more drive, drums added", hits: ["too empty", "sparse", "boring", "lifeless", "flat", "more energy"], apply: (i, s) => ({ ...i, energy: "driving", instruments: [...new Set([...s.instruments.filter((x) => !/soft drums/.test(x)), "driving drums"])] }) },
  { axis: "brightness", change: "brighter, air added", hits: ["too dark", "heavy", "muddy", "dull"], apply: (i, s) => ({ ...i, mood: [...new Set([...i.mood, "bright"])], instruments: [...new Set([...s.instruments, "flute"])] }) },
  { axis: "brightness", change: "warmer, softer keys", hits: ["too bright", "harsh", "thin", "shrill", "cold"], apply: (i, s) => ({ ...i, mood: [...new Set([...i.mood, "warm"])], instruments: [...new Set([...s.instruments, "felt piano"])] }) },
  { axis: "mood", change: "more hopeful", hits: ["too sad", "depressing", "gloomy"], apply: (i) => ({ ...i, mood: [...new Set([...i.mood.filter((m) => m !== "sad"), "hopeful", "bright"])] }) },
  { axis: "mood", change: "less cheerful", hits: ["too happy", "cheesy", "sugary", "too cheerful"], apply: (i) => ({ ...i, mood: [...new Set([...i.mood.filter((m) => m !== "playful" && m !== "bright"), "night"])] }) },
  { axis: "loop", change: "loops cleanly", hits: ["doesn't loop", "wont loop", "won't loop", "not loopable", "loop seam"], apply: (i) => ({ ...i, loop: true, avoid: [...new Set([...(i.avoid ?? []), "fade-out ending"])] }) },
  { axis: "vocals", change: "voices fenced out", hits: ["voices", "singing", "vocals", "lyrics"], apply: (i) => ({ ...i, vocals: "none", avoid: [...new Set([...(i.avoid ?? []), "vocals", "singing"])] }) },
];

type InstrumentVariant = { readonly change: string; readonly intent: AudioIntent };

/** "add strings", "swap marimba for cello", "remove hand percussion" against the base seed.
 *  Null when the words name no catalogued (or unheld) instrument, so the complaint rules get their turn. */
function instrumentVariant(text: string, canon: AudioIntent, seed: Seed): InstrumentVariant | null {
  const cur = [...seed.instruments];
  const swap = /^swap (.+?) (?:for|to) (.+)$/.exec(text) ?? /^replace (.+?) with (.+)$/.exec(text);
  const add = /^add (.+)$/.exec(text);
  const drop = /^(?:remove|drop|no) (.+)$/.exec(text);
  if (swap) {
    const a = findInstrumentLoose(swap[1] ?? ""); const b = findInstrumentLoose(swap[2] ?? ""); const at = a ? cur.indexOf(a.suno) : -1;
    if (!a || !b || at < 0 || cur.includes(b.suno)) return null;
    cur[at] = b.suno;
    return { change: `${a.name} swapped for ${b.name}`, intent: { ...canon, instruments: cur } };
  }
  if (add) { const word = (add[1] ?? "").trim().toLowerCase(); const first = findInstrumentLoose(word); const e = first && !cur.includes(first.suno) ? first : INSTRUMENT_CATALOG.find((x) => !cur.includes(x.suno) && (x.name.toLowerCase().includes(word) || x.keywords.some((k) => k.toLowerCase().includes(word)))); return !e || cur.includes(e.suno) ? null : { change: `${e.name} added`, intent: { ...canon, instruments: [...cur, e.suno] } }; }
  if (drop) { const e = findInstrumentLoose(drop[1] ?? ""); return !e || !cur.includes(e.suno) || cur.length <= 1 ? null : { change: `${e.name} removed`, intent: { ...canon, instruments: cur.filter((x) => x !== e.suno) } }; }
  return null;
}

/** One variant per recognised complaint (one axis each), plus a combined fold when more than one lands. */
export function steerIntent(raw: AudioIntent, complaints: readonly string[]): Result<{ readonly base: CompiledBrief; readonly variants: readonly SteerVariant[]; readonly combined?: SteerVariant; readonly noop: readonly string[]; readonly unrecognised: readonly string[] }> {
  const base = compileIntent(raw);
  if (!base.ok) return base;
  const variants: SteerVariant[] = [];
  const unrecognised: string[] = [];
  for (const c of complaints) {
    const text = c.trim().toLowerCase();
    const dyn = instrumentVariant(text, canonicalIntent(raw), base.value.seed);
    if (dyn) {
      const compiled = compileIntent(dyn.intent);
      if (!compiled.ok) { unrecognised.push(c); continue; }
      variants.push({ complaint: c, axis: "instrument", change: dyn.change, intent: compiled.value.canonicalIntent, hash: compiled.value.hash, seed: compiled.value.seed });
      continue;
    }
    const rule = STEER_RULES.find((r) => r.hits.some((h) => text.includes(h)));
    if (!rule) { unrecognised.push(c); continue; }
    const next = rule.apply(canonicalIntent(raw), base.value.seed);
    const compiled = compileIntent(next);
    if (!compiled.ok) { unrecognised.push(c); continue; }
    variants.push({ complaint: c, axis: rule.axis, change: rule.change, intent: compiled.value.canonicalIntent, hash: compiled.value.hash, seed: compiled.value.seed });
  }
  // A variant landing on the base hash moved nothing: named a no-op, never handed back as a new option.
  const noop = variants.filter((v) => v.hash === base.value.hash).map((v) => v.complaint);
  const landed = variants.filter((v) => v.hash !== base.value.hash);
  let combined: SteerVariant | undefined;
  if (landed.length > 1) {
    let cur: AudioIntent = canonicalIntent(raw); let last: SteerVariant | undefined;
    for (const v of landed) { const step = steerIntent(cur, [v.complaint]); if (!step.ok || !step.value.variants[0]) { last = undefined; break; } last = step.value.variants[0]; cur = last.intent; }
    if (last) combined = { complaint: landed.map((v) => v.complaint).join(", "), axis: "combined", change: landed.map((v) => v.change).join("; "), intent: last.intent, hash: last.hash, seed: last.seed };
  }
  return ok({ base: base.value, variants: landed, ...(combined ? { combined } : {}), noop, unrecognised });
}

/** Compile one intent. Same intent -> same brief, hash and lint, forever, for one compiler version. */
export function compileIntent(raw: AudioIntent): Result<CompiledBrief> {
  if (!Number.isFinite(raw.lengthS) || raw.lengthS < MIN_LENGTH_S)
    return err("invalid", `audio intent: lengthS ${String(raw.lengthS)} is under the ${MIN_LENGTH_S} s floor; ask for at least ${MIN_LENGTH_S} seconds`);
  if (raw.lengthS > MAX_LENGTH_S)
    return err("invalid", `audio intent: lengthS ${raw.lengthS} exceeds the ${MAX_LENGTH_S} s ceiling (600 s of audio per hour); split it into sections under ${MAX_LENGTH_S} s`);
  const intent = canonicalIntent(raw);
  if (intent.mood.length === 0 && !intent.sentence && !intent.use)
    return err("invalid", "audio intent: give at least one mood word, a sentence, or a use (for example mood [\"calm\"], use \"puzzle game menu\") so there is something to steer by");
  if (raw.bpm != null && (raw.bpm < 40 || raw.bpm > 220))
    return err("invalid", `audio intent: bpm ${raw.bpm} is outside 40..220; pick a tempo in that range or omit bpm`);

  const lint: LintFinding[] = [];
  const knownMoods = new Set([...Object.keys(FEEL_GENRE), ...INSTRUMENT_CATALOG.flatMap((e) => e.feels)]);
  const fromSentence = intent.mood.length === 0 && intent.sentence ? [...new Set(intent.sentence.toLowerCase().split(/[^a-z]+/).filter((w) => knownMoods.has(w)))] : [];
  const moods: readonly string[] = intent.mood.length ? intent.mood : fromSentence.length ? fromSentence : intent.mood;
  for (const m of intent.mood) if (!knownMoods.has(m)) lint.push({ code: "mood-unknown", level: "warn", message: `"${m}" is not a mood word the catalog knows; it is kept as a style word - known words include calm, hopeful, sad, playful, driving, night, focused, epic, warm, bright` });
  if (fromSentence.length) lint.push({ code: "mood-from-sentence", level: "note", message: `mood words read from the sentence: ${fromSentence.join(", ")}` });
  if (!intent.mood.length && !fromSentence.length) lint.push({ code: "mood-assumed", level: "note", message: "no mood words were given, so calm was assumed; name how it should feel (calm, hopeful, night, driving) to steer it" });
  const explicit: InstrumentEntry[] = [];
  for (const w of intent.instruments ?? []) {
    const hit = findInstrumentLoose(w);
    if (hit) { if (!explicit.includes(hit)) explicit.push(hit); }
    else lint.push({ code: "instrument-uncatalogued", level: "warn", message: `"${w}" is not in the instrument catalog, so no preview can be offered for it; it is kept as a style word` });
  }
  const palettes = suggestPalettes({ mood: moods, ...(intent.use ? { use: intent.use } : {}), ...(intent.energy ? { energy: intent.energy } : {}) });
  const chosen = intent.paletteId ? palettes.find((p) => p.id === intent.paletteId) : undefined;
  if (intent.paletteId && !chosen && !explicit.length) lint.push({ code: "palette-unknown", level: "warn", message: `paletteId "${intent.paletteId}" is not one of ${palettes.map((p) => p.id).join(", ")}; the first palette was used` });
  const palette = chosen ?? palettes[0];
  const instruments = explicit.length ? explicit : (palette?.instruments ?? []);
  const paletteId = explicit.length ? null : (palette?.id ?? null);
  if (intent.paletteId && explicit.length) lint.push({ code: "palette-ignored", level: "note", message: `paletteId "${intent.paletteId}" was ignored because instruments were named; the named instruments win` });

  const energy: Energy = intent.energy ?? (moods.includes("driving") || moods.includes("epic") ? "driving" : moods.includes("calm") || moods.includes("gentle") ? "calm" : "steady");
  const bpm = intent.bpm ?? (energy === "calm" ? 72 : energy === "driving" ? 122 : 96);
  const vocals: Vocals = intent.vocals ?? "none";
  const avoid = [...(intent.avoid ?? []), ...(vocals === "none" ? ["vocals", "singing"] : []), ...(intent.loop ? ["fade-out ending"] : [])].filter((v, i, a) => a.indexOf(v) === i);
  const seed: Seed = {
    genres: intent.genres?.length ? intent.genres : (palette?.genres ?? ["ambient"]),
    moods: moods.length ? moods : ["calm"],
    instruments: [...new Set([...instruments.map((e) => e.suno), ...(intent.instruments ?? []).filter((w) => !findInstrumentLoose(w))])],
    bpm, key: intent.key ?? null, avoid,
  };

  for (const a of intent.avoid ?? []) if (seed.instruments.some((i) => i.toLowerCase().includes(a) || a.includes(i.toLowerCase())))
    lint.push({ code: "avoid-conflicts-instrument", level: "fix", message: `avoid "${a}" also names a chosen instrument; drop one of them before sending` });
  const opposites: readonly (readonly [string, string])[] = [["calm", "driving"], ["calm", "epic"], ["gentle", "driving"], ["sad", "playful"]];
  for (const [a, b] of opposites) if (seed.moods.includes(a) && seed.moods.includes(b)) lint.push({ code: "mood-opposites", level: "warn", message: `mood holds both "${a}" and "${b}"; a generator will average them - keep the one the piece is for` });
  if (seed.key && !keyPitch(seed.key)) lint.push({ code: "key-unreadable", level: "warn", message: `key "${seed.key}" is not a key the brief check can read; write it like "A minor" or "C major" - it is kept as written in the style line` });
  if (vocals !== "none") lint.push({ code: "vocals-instrumental-only", level: "warn", message: `vocals "${vocals}" asked for, but the compiled fields stay [Instrumental] with no lyrics; for voices without words add the wordless choir instrument, and for sung lyrics use the composer door that accepts them` });
  if (intent.loop && intent.lengthS > 120) lint.push({ code: "loop-long", level: "note", message: `a ${intent.lengthS} s loop is long; two shorter loops usually steer better` });
  if (!explicit.length && palette) lint.push({ code: "palette-applied", level: "note", message: `no instruments were named, so ${palette.id} was applied (${palette.instruments.map((e) => e.name).join(", ")}); hear them with audio_palette before sending` });

  const suno = sunoFieldsOf(seed, {});
  const cut = sunoCut(seed, {});
  if (cut > 0) lint.push({ code: "suno-cut", level: "warn", message: `Suno's style line holds ${200} characters; ${cut} word(s) fall off it - shorten mood or instrument words` });
  if (!suno) lint.push({ code: "seed-empty", level: "fix", message: "the seed produced no style words; add a mood or an instrument" });

  const seedWords = [...seed.genres, ...seed.moods, ...seed.instruments, `${bpm} bpm`, ...(seed.key ? [seed.key] : []), "instrumental"];
  // Sections are shaped by role (lead alone, then body, then full band, then thin); global styles keep every word.
  const wordsFor = (name: string): readonly string[] => [...seed.genres, ...seed.moods, ...(name === "intro" ? seed.instruments.slice(0, 1) : name === "build" ? seed.instruments.slice(0, 3) : name === "outro" ? seed.instruments.slice(0, 2) : seed.instruments), `${bpm} bpm`, ...(seed.key ? [seed.key] : []), "instrumental"];
  const sections = sectionsFor(wordsFor, avoid, intent.lengthS, intent.loop ?? false);
  const canonical = canonicalJson({ compiler: COMPILER_VERSION, intent });
  return ok({
    compiler: COMPILER_VERSION, hash: intentHash(canonical), canonicalIntent: intent, seed, paletteId, suno,
    elevenlabsSentence: compose(seed, "elevenlabs", {}), sections,
    plan: { positiveGlobalStyles: seedWords, negativeGlobalStyles: avoid, sections },
    lint,
  });
}
