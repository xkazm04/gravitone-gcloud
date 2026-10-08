// THE SOUND FIXTURES — a shelf of judged, half-judged and untouched takes, four
// hunts and the ledger that agrees with them, written exactly as lib/sound/
// store.ts reads them (fixtures-out/sound/{takes,hunts,groups}.json, files/, and
// fixtures-out/sound-ledger.json beside it).
//
// THE LEDGER IS NOT WRITTEN BY HAND. Every verdict row is the app's own
// `verdictRow` (lib/sound/ledger.ts) run over the takes below, so a fixture
// ledger and a ledger the app would have kept cannot disagree about who is a
// version-only return, who is a fixture, or what a rubric mean is. The lessons
// are the one hand-made part, and their evidence (n, keep rate, mean score) is
// COMPUTED from the rows each claim names rather than typed beside it.
//
// QUALITY HAS A CAUSE HERE. A take's ratings are drawn around the mean quality
// of the techniques it was briefed with, so "section plan as the brief" really
// does keep more than "single sentence", and the strengths map, the lessons
// and the heat table all find something to say instead of noise.
//
// The bytes are enveloped sine tones (kit.wav). They play and they have a shape;
// nothing claims they are music, which is why four rows are origin `fixture`
// with no file at all.

import { DAY, HOUR, MIN, NOW, iso, outFile, peaksOf, rng, wav, writeBytes, writeJson, type Tone } from "./kit";
import { DEFECTS, TECHNIQUES, RUBRIC } from "../../lib/sound/types";
import type {
  DefectCode,
  Hunt,
  HuntNode,
  HuntNodeState,
  Lesson,
  ProviderId,
  SoundGroups,
  SoundKind,
  SoundOp,
  SoundTake,
  SoundTerms,
  Stage,
  TakeOrigin,
} from "../../lib/sound/types";
import { verdictRow, type LedgerVerdict } from "../../lib/sound/ledger";

const R = rng("sound");
const SAMPLE_RATE = 16_000;

/* ── the shelf's rows ────────────────────────────────────────────────────── */

const GROUPS: SoundGroups = {
  music: ["ambient", "cinematic", "electronic", "hip hop", "tension"],
  sfx: ["impacts", "whooshes", "risers", "ambiences", "ui"],
};

const PROJECTS = { harbor: "seed-glass-harbor", bitcoin: "seed-why-bitcoin" } as const;
const REF_IDS = ["ref-french79-4807", "ref-ratatat-breaking-away", "ref-sappheiros-falling"] as const;
const ROUNDS = ["round1-fft", "round2-librosa", "round3-gemini"] as const;

interface MusicBrief {
  title: string;
  prompt: string;
  genre: string[];
  mood: string[];
  instrument: string[];
  bpm: number;
  key: string;
  dur: number;
  group: string;
  loop: boolean | null;
}
interface SfxBrief {
  title: string;
  prompt: string;
  cat: string;
  mood: string[];
  instrument: string[];
  dur: number;
  loop: boolean;
}

const MUSIC: MusicBrief[] = [
  { title: "Glass Harbor cold open drone", prompt: "A slow bowed-glass drone under distant harbour bells, one low pulse every four bars, nothing resolved, the feeling of a city before the heist.", genre: ["cinematic ambient", "dark ambient"], mood: ["suspended", "cold"], instrument: ["bowed glass", "sub drone", "bells"], bpm: 62, key: "D minor", dur: 60, group: "ambient", loop: false },
  { title: "Vault door tension bed", prompt: "Muted piano ostinato over a ticking low pulse, tension without drums so dialogue sits clean on top; hold the same figure for the full minute.", genre: ["suspense score", "minimal"], mood: ["tense", "restrained"], instrument: ["muted piano", "low pulse", "tape hiss"], bpm: 78, key: "F# minor", dur: 60, group: "tension", loop: true },
  { title: "Crew assembles montage", prompt: "Confident mid-tempo heist groove, upright bass and brushed kit with a wah guitar stab every second bar, charismatic and a little smug.", genre: ["jazz funk", "heist groove"], mood: ["confident", "playful"], instrument: ["upright bass", "brushed kit", "wah guitar"], bpm: 104, key: "G minor", dur: 45, group: "hip hop", loop: false },
  { title: "Why Bitcoin explainer bed", prompt: "Warm, unhurried explainer bed that stays under a voiceover for ninety seconds: soft electric piano, a round sub, no melody competing with speech.", genre: ["lo-fi", "downtempo"], mood: ["warm", "neutral"], instrument: ["electric piano", "sub bass", "vinyl crackle"], bpm: 84, key: "A minor", dur: 90, group: "ambient", loop: true },
  { title: "Price chart reveal sting", prompt: "A short rising orchestral sting that lands on a hard downbeat as the chart appears; strings and low brass only, 6 seconds.", genre: ["orchestral", "trailer"], mood: ["dramatic", "rising"], instrument: ["strings", "low brass", "timpani"], bpm: 96, key: "C minor", dur: 6, group: "cinematic", loop: false },
  { title: "Harbor dawn, strings and glass", prompt: "A slow string quartet theme at first light, glass harmonica doubling the melody an octave up, resolved and a little sad.", genre: ["neo-classical", "cinematic"], mood: ["melancholic", "hopeful"], instrument: ["string quartet", "glass harmonica"], bpm: 66, key: "E minor", dur: 75, group: "cinematic", loop: false },
  { title: "Neon chase, analog pulse", prompt: "Driving 118 BPM outrun chase with a gated analog bass arpeggio, big snare, and a lead that answers itself every eight bars.", genre: ["synthwave", "outrun"], mood: ["driving", "urgent"], instrument: ["analog bass", "gated snare", "lead synth"], bpm: 118, key: "A minor", dur: 60, group: "electronic", loop: false },
  { title: "Quiet tariff, newsroom pulse", prompt: "Procedural documentary pulse for a newsroom sequence: pizzicato strings, a restrained kick, wordless and unemotional.", genre: ["documentary", "electronic minimal"], mood: ["neutral", "focused"], instrument: ["pizzicato strings", "soft kick", "marimba"], bpm: 100, key: "D major", dur: 60, group: "electronic", loop: true },
  { title: "Rain on the corrugated roof", prompt: "Slow ambient pads with a distant piano figure recorded as if from the next room, rain texture implied not literal.", genre: ["ambient", "neo-classical"], mood: ["nostalgic", "serene"], instrument: ["ambient pads", "felt piano", "field recordings"], bpm: 58, key: "B minor", dur: 90, group: "ambient", loop: true },
  { title: "Trailer hit, glass breaks open", prompt: "Thirty-second trailer build: sparse low strings, a staggered rhythmic pulse, a huge hit at 0:24 and a long silent tail for the title card.", genre: ["trailer", "hybrid orchestral"], mood: ["epic", "ominous"], instrument: ["low strings", "braams", "taiko"], bpm: 90, key: "C# minor", dur: 30, group: "cinematic", loop: false },
  { title: "Boom bap, the long con", prompt: "Dusty 90 BPM boom-bap drums with a chopped soul loop and a warm rhodes line; head-nod energy for a flashback to the first job.", genre: ["boom bap", "jazz rap"], mood: ["nostalgic", "swaggering"], instrument: ["boom-bap drums", "rhodes", "vinyl crackle"], bpm: 90, key: "D minor", dur: 60, group: "hip hop", loop: false },
  { title: "Two hundred days, final credits", prompt: "A solo cello over soft pads that opens into a wide, patient resolution; final-credits music for a story that ended without a victory.", genre: ["cinematic", "neo-classical"], mood: ["bittersweet", "patient"], instrument: ["solo cello", "ambient pads", "piano"], bpm: 60, key: "G major", dur: 90, group: "cinematic", loop: false },
  { title: "Server room, sub-bass heartbeat", prompt: "A sparse tech-thriller bed: sub-bass heartbeat, data-glitch percussion and a single filtered arpeggio that never quite resolves.", genre: ["tech thriller", "idm"], mood: ["paranoid", "tense"], instrument: ["sub bass", "glitch percussion", "filtered arp"], bpm: 110, key: "E minor", dur: 45, group: "tension", loop: true },
  { title: "Dockside bar, late set", prompt: "Smoky small-combo jazz heard through a wall: brushed drums, double bass and a muted trumpet leaving long spaces.", genre: ["noir jazz"], mood: ["smoky", "lonely"], instrument: ["muted trumpet", "double bass", "brushed drums"], bpm: 72, key: "Bb major", dur: 75, group: "ambient", loop: false },
  { title: "Gold rush explainer theme", prompt: "Bright, bouncing explainer theme with pizzicato, glockenspiel and hand claps; it should read as curiosity, never as comedy.", genre: ["explainer pop", "indie"], mood: ["curious", "bright"], instrument: ["glockenspiel", "pizzicato", "hand claps"], bpm: 112, key: "C major", dur: 40, group: "electronic", loop: true },
  { title: "Countdown, ninety seconds out", prompt: "A ticking build from a single clock sample to full strings and a pounding kick over ninety seconds, with a clean cut to silence.", genre: ["suspense", "build"], mood: ["urgent", "escalating"], instrument: ["clock tick", "strings", "kick"], bpm: 120, key: "F minor", dur: 90, group: "tension", loop: false },
  { title: "Terminal glow, ambient loop", prompt: "A seamless ambient loop of detuned pads and a soft sine pulse, to sit behind a code-on-screen shot for two minutes without drawing the eye.", genre: ["ambient techno", "drone"], mood: ["calm", "focused"], instrument: ["detuned pads", "sine pulse"], bpm: 70, key: "A minor", dur: 60, group: "ambient", loop: true },
  { title: "Liquid heist, exit strategy", prompt: "Liquid drum and bass at 172 BPM for the getaway; rolling sub, chopped vocal-free stabs, a drop at bar 17.", genre: ["liquid dnb", "drum and bass"], mood: ["adrenaline", "slick"], instrument: ["sub bass", "break drums", "pads"], bpm: 172, key: "F minor", dur: 60, group: "electronic", loop: false },
  { title: "Archive footage, tape wobble", prompt: "Wobbling lo-fi tape piano and soft drums to sit under archive footage; imperfect, human, slightly out of tune on purpose.", genre: ["lo-fi", "hauntology"], mood: ["wistful", "faded"], instrument: ["tape piano", "soft drums", "tape hiss"], bpm: 76, key: "C minor", dur: 60, group: "hip hop", loop: true },
  { title: "Port strike, march", prompt: "A slow industrial march: heavy single-hit percussion, brass drones and a chant-less choir pad, grim and collective.", genre: ["industrial", "cinematic"], mood: ["grim", "resolute"], instrument: ["industrial percussion", "brass drones", "choir pad"], bpm: 84, key: "D minor", dur: 60, group: "cinematic", loop: false },
  { title: "Epilogue, the harbor wakes", prompt: "A gentle resolution of the opening drone: the glass tone now major, piano entering at bar 9, a single bell on the last bar.", genre: ["cinematic ambient"], mood: ["resolved", "gentle"], instrument: ["glass tone", "piano", "bell"], bpm: 62, key: "D major", dur: 60, group: "ambient", loop: false },
  { title: "Whisper network, pizzicato intrigue", prompt: "Playful conspiratorial pizzicato with a bassoon countermelody and finger snaps, a caper in miniature.", genre: ["caper", "chamber"], mood: ["conspiratorial", "light"], instrument: ["pizzicato", "bassoon", "finger snaps"], bpm: 108, key: "G major", dur: 45, group: "tension", loop: false },
  { title: "Exchange floor, rising arps", prompt: "Rising electronic arpeggios and a soft four-on-the-floor kick to underscore a market-open montage; optimistic, unrushed.", genre: ["melodic house", "progressive"], mood: ["optimistic", "driving"], instrument: ["arpeggios", "four-on-the-floor kick", "pads"], bpm: 122, key: "A minor", dur: 75, group: "electronic", loop: false },
  { title: "Vocal motif, harbor lullaby", prompt: "A wordless female vocal lullaby with a sparse harp, to be hummed against the opening drone; intimate, close-mic'd.", genre: ["folk", "ambient"], mood: ["intimate", "tender"], instrument: ["wordless vocal", "harp"], bpm: 56, key: "E major", dur: 60, group: "ambient", loop: false },
];

const SFX: SfxBrief[] = [
  { title: "Glass crack, slow fracture", prompt: "Thick plate glass fracturing under pressure: a slow ticking crack that spreads for two seconds before the final break, dry, no room.", cat: "impacts", mood: ["tense"], instrument: ["glass"], dur: 4, loop: false },
  { title: "Vault door thud", prompt: "A twelve-inch steel vault door closing from outside, one heavy thud with a short metallic ring and a faint bolt throw after it.", cat: "impacts", mood: ["heavy"], instrument: ["steel"], dur: 3, loop: false },
  { title: "Cinematic sub impact", prompt: "Sub-frequency trailer impact with a short noise tail; fast attack, clean low end, no reverb past 400 ms.", cat: "impacts", mood: ["epic"], instrument: ["sub drop"], dur: 3, loop: false },
  { title: "Scene transition whoosh, fast", prompt: "A fast left-to-right air whoosh, 700 ms, with a soft rising tail; for a hard cut between scenes.", cat: "whooshes", mood: ["quick"], instrument: ["air"], dur: 2, loop: false },
  { title: "Paper-slide whoosh", prompt: "A light paper-card slide whoosh for a collage cut-in, airy, almost no low end.", cat: "whooshes", mood: ["light"], instrument: ["paper"], dur: 2, loop: false },
  { title: "Camera push whoosh", prompt: "A slow whoosh that follows a push-in toward a monitor: builds for 1.5 seconds and ends in a soft thump.", cat: "whooshes", mood: ["building"], instrument: ["air"], dur: 3, loop: false },
  { title: "Tension riser, eight seconds", prompt: "A metallic riser that climbs for eight seconds with a tightening shimmer and cuts dead at the top, no tail.", cat: "risers", mood: ["tense", "rising"], instrument: ["metal shimmer"], dur: 8, loop: false },
  { title: "Reverse cymbal into drop", prompt: "A reverse cymbal swell of four seconds peaking exactly at the end, for an impact to land on.", cat: "risers", mood: ["rising"], instrument: ["cymbal"], dur: 4, loop: false },
  { title: "Warehouse ambience, empty", prompt: "A seamless loop of a large empty warehouse at night: distant ventilation, a drip, no voices, no machinery.", cat: "ambiences", mood: ["empty"], instrument: ["room tone"], dur: 6, loop: true },
  { title: "Harbor at dusk ambience", prompt: "Seamless harbour ambience: low water slap on hulls, distant gulls, a ship horn once at the half-way point.", cat: "ambiences", mood: ["calm"], instrument: ["water", "gulls"], dur: 6, loop: true },
  { title: "Server room hum loop", prompt: "A steady server-room hum, fans with a slight beating between two pitches; must loop without a click.", cat: "ambiences", mood: ["clinical"], instrument: ["fans"], dur: 5, loop: true },
  { title: "Rain on glass roof", prompt: "Steady rain on a glass roof, no thunder, no wind, evenly dense so it loops invisibly.", cat: "ambiences", mood: ["calm"], instrument: ["rain"], dur: 6, loop: true },
  { title: "UI tick, soft confirm", prompt: "A soft two-note confirmation tick for a UI beat, rounded and dry, under 300 ms.", cat: "ui", mood: ["neutral"], instrument: ["synth blip"], dur: 1, loop: false },
  { title: "Notification chime, warm", prompt: "A warm single-bell notification chime with a quick decay, friendly and not shrill.", cat: "ui", mood: ["warm"], instrument: ["bell"], dur: 1, loop: false },
  { title: "Keystroke burst", prompt: "A burst of mechanical keyboard typing, about 1.5 seconds, uneven human rhythm, one correction at the end.", cat: "ui", mood: ["busy"], instrument: ["keyboard"], dur: 2, loop: false },
  { title: "Chart tick-up", prompt: "A rising series of five short ticks, each a semitone higher, to sit under a chart line drawing itself.", cat: "ui", mood: ["rising"], instrument: ["synth blip"], dur: 2, loop: false },
  { title: "Metal grate slam", prompt: "A heavy metal grate slamming shut in a stairwell, long reverberant tail, one bounce.", cat: "impacts", mood: ["harsh"], instrument: ["metal"], dur: 4, loop: false },
  { title: "Low drone swell", prompt: "A low synthetic drone swell that builds over six seconds, sub-heavy, with a faint beating at the top.", cat: "risers", mood: ["ominous"], instrument: ["drone"], dur: 6, loop: false },
];

/* ── how a technique performs ────────────────────────────────────────────── */

// Mean rubric quality each technique tends to earn. Invented, but ordered the
// way the registry's own techniques are: a plan and a lock beat a bare sentence.
const TECH_Q: Record<string, number> = {
  "single-sentence": 4.4,
  "tag-list": 5.6,
  "section-plan-as-the-brief": 7.9,
  "sonic-style-vocabulary": 7.0,
  "negative-styles": 6.6,
  "duration-and-tempo-locking": 7.2,
  "reference-track-anchoring": 7.5,
  "lyrics-for-singability": 5.4,
  "envelope-first-briefing": 7.9,
  "layered-element-assembly": 7.4,
  "loop-seam-acceptance": 7.0,
  "picture-as-timing-brief": 7.2,
};

const MUSIC_DEFECTS: DefectCode[] = ["smeared-transients", "section-bleed", "tempo-instability", "broken-ending", "spectral-imbalance", "vocal-garble", "off-brief"];
const SFX_DEFECTS: DefectCode[] = ["wrong-event", "smeared-transients", "spectral-imbalance", "phase-width", "off-brief"];

const NOTES: Partial<Record<DefectCode, string[]>> = {
  "section-bleed": ["strings come in at bar 9 although the plan holds them to bar 17", "the drop leaks into the intro section"],
  "tempo-instability": ["drifts from 78 to 83 BPM by the second minute", "the pulse breathes; unusable under a locked cut"],
  "broken-ending": ["ends on a cut-off note instead of the planned tail", "no resolution, stops mid-bar"],
  "smeared-transients": ["the attack smears; hits arrive late and soft"],
  "spectral-imbalance": ["harsh above 4 kHz, thin below 120 Hz"],
  "vocal-garble": ["a half-word vocal appears at 0:38 despite the instrumental brief"],
  "off-brief": ["pleasant but it is the wrong piece; nothing of the vault tension"],
  "wrong-event": ["reads as a crash, not a fracture; no spreading crack"],
  "phase-width": ["collapses to mush in mono"],
  "loop-seam": ["audible click at the loop point"],
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const id = (prefix: "st" | "hn" | "ls" | "nd") => `${prefix}-${R.hex(10)}`;
const used = new Set<string>();
const mint = (prefix: "st" | "hn" | "ls" | "nd") => {
  let v = id(prefix);
  while (used.has(v)) v = id(prefix);
  used.add(v);
  return v;
};
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const gauss = () => (R.next() + R.next() + R.next() + R.next() - 2) * 1.7;
const round1 = (x: number) => Math.round(x * 10) / 10;

/* ── audio ───────────────────────────────────────────────────────────────── */

const NOTE_HZ: Record<string, number> = { C: 130.81, "C#": 138.59, D: 146.83, Eb: 155.56, E: 164.81, F: 174.61, "F#": 185.0, G: 196.0, "G#": 207.65, A: 220.0, Bb: 233.08, B: 246.94 };

function musicTones(key: string, bpm: number, lenS: number): Tone[] {
  const [rootName, mode] = key.split(" ");
  const root = NOTE_HZ[rootName] ?? 220;
  const third = mode === "minor" ? 1.1892 : 1.2599;
  const steps = [1, third, 1.4983, 2, 1.4983, third];
  const beat = 60 / bpm;
  const out: Tone[] = [{ f: root / 2, at: 0, len: lenS, gain: 0.25 }];
  for (let t = 0, i = 0; t < lenS - 0.2; t += beat / 2, i++) out.push({ f: root * steps[i % steps.length], at: t, len: Math.min(beat * 1.2, lenS - t), gain: 0.22 });
  return out;
}

function sfxTones(cat: string, lenS: number): Tone[] {
  switch (cat) {
    case "impacts":
      return [{ f: 52, at: 0.02, len: lenS - 0.05, gain: 0.7 }, { f: 104, at: 0.02, len: lenS * 0.6, gain: 0.35 }, { f: 1830, at: 0.02, len: 0.25, gain: 0.25 }];
    case "whooshes":
      return Array.from({ length: 8 }, (_, i) => ({ f: 300 + i * 260, at: i * (lenS / 10), len: lenS / 5, gain: 0.3 }));
    case "risers":
      return Array.from({ length: 16 }, (_, i) => ({ f: 180 * Math.pow(1.09, i), at: (i * (lenS - 0.4)) / 16, len: (lenS - 0.4) / 8, gain: 0.12 + i * 0.015 }));
    case "ambiences":
      return Array.from({ length: 6 }, (_, i) => ({ f: 90 + i * 37, at: (i * lenS) / 14, len: lenS * 0.8, gain: 0.14 }));
    default:
      return [{ f: 1318, at: 0.02, len: 0.22, gain: 0.5 }, { f: 1760, at: 0.14, len: 0.3, gain: 0.45 }];
  }
}

function rmsOf(buf: Buffer): number {
  const n = (buf.length - 44) / 2;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const v = buf.readInt16LE(44 + i * 2) / 32768;
    s += v * v;
  }
  return Math.sqrt(s / Math.max(1, n));
}

/* ── the take assembler ──────────────────────────────────────────────────── */

type Plan = Partial<SoundTake> & { kind: SoundKind; title: string; prompt: string; provider: ProviderId; op: SoundOp; origin: TakeOrigin; terms: SoundTerms };

const takes: SoundTake[] = [];
const wavs = new Map<string, Buffer>();
const byId = new Map<string, SoundTake>();

function techniquesFor(kind: SoundKind): string[] {
  const pool = TECHNIQUES[kind];
  const n = R.chance(0.3) ? 1 : R.chance(0.6) ? 2 : 3;
  return R.shuffle(pool).slice(0, n);
}

function promptWith(base: string, technique: string[], bpm: number | null, key: string | null): string {
  let p = base;
  if (technique.includes("duration-and-tempo-locking") && bpm) p += ` Lock the tempo at ${bpm} BPM${key ? `, key of ${key}` : ""}.`;
  if (technique.includes("section-plan-as-the-brief")) p += " Sections: intro (8 bars, sparse), build (16 bars), peak (8 bars), tail (4 bars).";
  if (technique.includes("sonic-style-vocabulary")) p += " Dry, close-mic'd, restrained dynamics, analog warmth.";
  if (technique.includes("envelope-first-briefing")) p += " Envelope: instant attack, one decaying body, tail gone by the end.";
  if (technique.includes("picture-as-timing-brief")) p += " Timed to picture: the event lands on the cut.";
  if (technique.includes("loop-seam-acceptance")) p += " Must loop without a seam.";
  return p;
}

/** Quality draw: the techniques' mean, a provider nudge and noise. */
function qualityOf(technique: string[], provider: ProviderId): number {
  const base = technique.reduce((a, t) => a + (TECH_Q[t] ?? 6), 0) / Math.max(1, technique.length);
  return base + (provider === "elevenlabs" ? 0.3 : provider === "suno" ? 0.1 : -0.6) + gauss() * 0.9;
}

function ratingsFor(kind: SoundKind, q: number, partial: boolean): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const dim of RUBRIC[kind]) out[dim] = R.chance(partial ? 0.4 : 0.04) ? null : clamp(Math.round(q + gauss() * 1.2), 1, 10);
  if (Object.values(out).every((v) => v === null)) out[RUBRIC[kind][0]] = clamp(Math.round(q), 1, 10);
  return out;
}

interface Made {
  take: SoundTake;
  q: number;
}

function assemble(p: Plan, o: { createdAt: number; verdict?: "unjudged" | "kept" | "rejected"; q?: number; stage?: Stage | null; finalized?: boolean; bpm?: number | null; key?: string | null; dur?: number; loop?: boolean | null; cat?: string; noFile?: boolean; partial?: boolean }): Made {
  const kind = p.kind;
  const technique = p.technique ?? techniquesFor(kind);
  const q = o.q ?? qualityOf(technique, p.provider);
  const tid = p.id ?? mint("st");
  const dur = o.dur ?? 30;
  const fileLen = o.noFile ? 0 : clamp(Math.round((kind === "sfx" ? Math.min(dur, 3.5) : R.float(2.2, 3.6)) * 10) / 10, 1, 4);
  let file: SoundTake["file"] = null;
  let peaks: number[] | null = null;
  let measured: SoundTake["measured"] = null;
  if (fileLen > 0) {
    const bpm = o.bpm ?? 90;
    const buf = wav(fileLen, kind === "music" ? musicTones(o.key ?? "A minor", bpm, fileLen) : sfxTones(o.cat ?? "ui", fileLen), SAMPLE_RATE);
    wavs.set(tid, buf);
    file = { path: `files/${tid}.wav`, mime: "audio/wav", bytes: buf.length };
    peaks = R.chance(0.08) ? null : peaksOf(buf, 64);
    measured = R.chance(0.1)
      ? null
      : {
          tempoBpm: kind === "music" && bpm ? Math.round((bpm + gauss() * 1.6) * 10) / 10 : null,
          key: kind === "music" ? o.key ?? null : null,
          energy: Math.round(rmsOf(buf) * 10000) / 10000,
          durationS: Math.round(((buf.length - 44) / 2 / SAMPLE_RATE) * 100) / 100,
          lufs: round1(-23 + R.float(0, 13)),
          truePeakDb: round1(-R.float(0.4, 6.5)),
        };
  }
  const verdict = o.verdict ?? "unjudged";
  const partial = o.partial ?? false;
  const ratings = verdict === "unjudged" ? (partial ? ratingsFor(kind, q, true) : {}) : ratingsFor(kind, q, partial);
  const created = clamp(o.createdAt, NOW - 21 * DAY, NOW - 20 * MIN);
  const judged = verdict === "unjudged" ? null : Math.min(NOW - MIN, created + R.int(4, 180) * MIN);
  let stage: Stage | null = null;
  let reasons: DefectCode[] = [];
  let note: string | null = null;
  if (verdict === "kept") stage = o.stage ?? "pending";
  if (verdict === "rejected") {
    const pool = kind === "music" ? MUSIC_DEFECTS : SFX_DEFECTS;
    const picks = new Set<DefectCode>();
    picks.add(technique.includes("single-sentence") && R.chance(0.4) ? "off-brief" : R.pick(pool));
    if (R.chance(0.3)) picks.add(R.pick(pool));
    if (kind === "sfx" && p.loop && R.chance(0.4)) picks.add("loop-seam");
    reasons = [...picks].filter((d) => DEFECTS.includes(d));
    if (R.chance(0.6)) note = R.pick(NOTES[reasons[0]] ?? ["not usable"]);
  }
  const finalizedAt = stage === "finalized" && judged ? Math.min(NOW - MIN, judged + R.int(1, 40) * HOUR) : null;
  const take: SoundTake = {
    id: tid,
    kind,
    title: p.title,
    provider: p.provider,
    op: p.op,
    origin: p.origin,
    technique,
    prompt: p.prompt ?? "",
    negative: p.negative ?? (technique.includes("negative-styles") ? (kind === "music" ? "no vocals, no stock trailer brass, no cheesy risers" : "no music, no voices, no room reverb") : null),
    terms: p.terms,
    tempoBpm: kind === "music" ? o.bpm ?? null : null,
    key: kind === "music" ? o.key ?? null : null,
    durationS: dur,
    loop: o.loop ?? null,
    file,
    peaks,
    measured,
    ratings,
    verdict,
    reasons,
    note,
    stage,
    group: p.group ?? null,
    label: null,
    parentId: p.parentId ?? null,
    huntId: p.huntId ?? null,
    nodeId: p.nodeId ?? null,
    songId: p.songId ?? null,
    plan: p.plan ?? null,
    referenceTrackId: p.referenceTrackId ?? null,
    promptRound: p.promptRound ?? null,
    draftId: p.draftId ?? null,
    variation: p.variation ?? null,
    editModes: p.editModes ?? null,
    fileName: p.fileName ?? null,
    projectId: p.projectId ?? null,
    cueId: p.cueId ?? null,
    createdAt: new Date(created).toISOString(),
    judgedAt: judged ? new Date(judged).toISOString() : null,
    finalizedAt: finalizedAt ? new Date(finalizedAt).toISOString() : null,
  };
  if (stage === "finalized") take.label = slug(p.title).slice(0, 48);
  takes.push(take);
  byId.set(take.id, take);
  return { take, q };
}

/** Judge from quality: the rubric mean decides, with the odd human override. */
function verdictFromQ(q: number): "kept" | "rejected" {
  const k = q >= 6.1;
  return R.chance(0.07) ? (k ? "rejected" : "kept") : k ? "kept" : "rejected";
}
function stageDraw(): Stage {
  const x = R.next();
  return x < 0.32 ? "pending" : x < 0.52 ? "remaster" : x < 0.68 ? "edit" : "finalized";
}
const daysAgo = (d: number) => NOW - d * DAY;

/* ── the ordinary shelf ──────────────────────────────────────────────────── */

const musicProviders: ProviderId[] = ["suno", "suno", "elevenlabs", "elevenlabs", "suno", "elevenlabs", "local"];

MUSIC.forEach((b) => {
  const provider = R.pick(musicProviders);
  const technique = techniquesFor("music");
  const suno = provider === "suno";
  const origin: TakeOrigin = suno ? (R.chance(0.7) ? "suno-return" : "import") : provider === "local" ? "import" : R.pick(["agent", "lab", "lab", "agent"] as const);
  const op: SoundOp = suno || provider === "local" ? "manual" : R.pick(["compose", "compose", "plan"] as const);
  const unjudged = R.chance(0.22);
  const q = qualityOf(technique, provider);
  const verdict = unjudged ? "unjudged" : verdictFromQ(q);
  const anchored = technique.includes("reference-track-anchoring");
  assemble(
    {
      kind: "music",
      title: b.title,
      provider,
      op,
      origin,
      technique,
      prompt: promptWith(b.prompt, technique, b.bpm, b.key),
      terms: { genre: b.genre, mood: b.mood, instrument: b.instrument, sfxCategory: null },
      group: b.group,
      referenceTrackId: anchored || (suno && R.chance(0.2)) ? R.pick(REF_IDS) : null,
      promptRound: suno ? R.pick(ROUNDS) : null,
      draftId: origin === "suno-return" ? `dr-${R.hex(8)}` : null,
      songId: origin === "suno-return" ? `sng_${R.hex(12)}` : null,
      fileName: suno || provider === "local" ? `${slug(b.title)}${suno ? "-suno" : ""}.wav` : null,
      plan: op === "plan" ? { sections: [{ name: "intro", bars: 8 }, { name: "build", bars: 16 }, { name: "peak", bars: 8 }, { name: "tail", bars: 4 }] } : null,
      variation: R.chance(0.12) ? { axis: "tempo", diff: [`${b.bpm + 12} → ${b.bpm} BPM`] } : null,
    },
    { createdAt: daysAgo(R.float(0.3, 20.5)), verdict, q, stage: verdict === "kept" ? stageDraw() : null, bpm: b.bpm, key: b.key, dur: b.dur, loop: b.loop, partial: R.chance(0.15) },
  );
});

SFX.forEach((b) => {
  const provider: ProviderId = R.chance(0.12) ? "local" : "elevenlabs";
  const technique = techniquesFor("sfx");
  const unjudged = R.chance(0.2);
  const q = qualityOf(technique, provider);
  const verdict = unjudged ? "unjudged" : verdictFromQ(q);
  assemble(
    {
      kind: "sfx",
      title: b.title,
      provider,
      op: provider === "local" ? "manual" : "sfx",
      origin: provider === "local" ? "import" : R.pick(["agent", "lab", "lab", "agent"] as const),
      technique,
      prompt: promptWith(b.prompt, technique, null, null),
      terms: { genre: [], mood: b.mood, instrument: b.instrument, sfxCategory: b.cat },
      group: b.cat,
      loop: b.loop,
      fileName: provider === "local" ? `${slug(b.title)}.wav` : null,
    },
    { createdAt: daysAgo(R.float(0.2, 20.5)), verdict, q, stage: verdict === "kept" ? stageDraw() : null, dur: b.dur, loop: b.loop, cat: b.cat, partial: R.chance(0.12) },
  );
});

/* ── Score cues ──────────────────────────────────────────────────────────── */

const CUES: { project: string; cue: string; title: string; prompt: string; bpm: number; key: string; dur: number; genre: string[]; mood: string[]; instrument: string[] }[] = [
  { project: PROJECTS.harbor, cue: "spot-cold-open", title: "Cold open, drone and bells", prompt: "Cue brief: night harbour, a tall glass tower, nobody awake. Drone and bells, no pulse until the first cut.", bpm: 62, key: "D minor", dur: 45, genre: ["cinematic ambient"], mood: ["suspended"], instrument: ["bowed glass", "bells"] },
  { project: PROJECTS.harbor, cue: "spot-vault", title: "Vault, the long minute", prompt: "Cue brief: the crew at the vault door, sixty seconds, tension rising with no percussion.", bpm: 78, key: "F# minor", dur: 60, genre: ["suspense score"], mood: ["tense"], instrument: ["muted piano", "low pulse"] },
  { project: PROJECTS.harbor, cue: "spot-vault", title: "Vault, the long minute (alt)", prompt: "Cue brief: the crew at the vault door, sixty seconds, strings tremolo instead of piano.", bpm: 78, key: "F# minor", dur: 60, genre: ["suspense score"], mood: ["tense"], instrument: ["tremolo strings", "low pulse"] },
  { project: PROJECTS.harbor, cue: "spot-getaway", title: "Getaway, harbour road", prompt: "Cue brief: the van leaves the dock, rain, 112 BPM, drive without a hero theme.", bpm: 112, key: "A minor", dur: 40, genre: ["tech thriller"], mood: ["urgent"], instrument: ["analog bass", "gated snare"] },
  { project: PROJECTS.bitcoin, cue: "spot-hook", title: "Hook, the price question", prompt: "Cue brief: opening hook of the explainer, a question mark in sound; light, curious, 20 seconds.", bpm: 100, key: "C major", dur: 20, genre: ["explainer pop"], mood: ["curious"], instrument: ["glockenspiel", "pizzicato"] },
  { project: PROJECTS.bitcoin, cue: "spot-supply", title: "Supply schedule, under VO", prompt: "Cue brief: halving-schedule explanation under voiceover for 75 seconds, nothing in the speech band.", bpm: 84, key: "A minor", dur: 75, genre: ["lo-fi"], mood: ["neutral"], instrument: ["electric piano", "sub bass"] },
];
CUES.forEach((c, i) => {
  const technique = i % 2 ? ["duration-and-tempo-locking", "section-plan-as-the-brief"] : ["section-plan-as-the-brief"];
  const q = qualityOf(technique, "elevenlabs") + 0.5;
  const verdict = i === 2 ? "unjudged" : i === 1 ? "rejected" : "kept";
  assemble(
    { kind: "music", title: c.title, provider: "elevenlabs", op: "cue", origin: "score", technique, prompt: c.prompt, terms: { genre: c.genre, mood: c.mood, instrument: c.instrument, sfxCategory: null }, group: "cinematic", projectId: c.project, cueId: c.cue },
    { createdAt: daysAgo(R.float(0.5, 9)), verdict, q: i === 1 ? 4 : q, stage: verdict === "kept" ? (i === 0 ? "finalized" : "pending") : null, bpm: c.bpm, key: c.key, dur: c.dur, loop: false },
  );
});

/* ── versions: a return from Suno's studio, a section edit ───────────────── */

function child(parent: SoundTake, how: "return-bare" | "return-scored" | "section-edit", stage: Stage, suffix: string): void {
  const sinceParent = parent.judgedAt ? Date.parse(parent.judgedAt) : Date.parse(parent.createdAt);
  const isReturn = how !== "section-edit";
  const q = how === "return-scored" ? 8 : how === "return-bare" ? 7 : 7.4;
  const made = assemble(
    {
      kind: "music",
      title: `${parent.title} (${suffix})`,
      provider: isReturn ? "suno" : "elevenlabs",
      op: isReturn ? "manual" : "section-edit",
      origin: isReturn ? "suno-return" : "lab",
      technique: parent.technique,
      prompt: parent.prompt,
      terms: parent.terms,
      group: parent.group,
      parentId: parent.id,
      draftId: isReturn ? `dr-${R.hex(8)}` : null,
      songId: isReturn ? `sng_${R.hex(12)}` : null,
      fileName: isReturn ? `${slug(parent.title)}-${slug(suffix)}.wav` : null,
      editModes: isReturn ? null : ["replace section: outro", "keep: intro, build"],
      referenceTrackId: parent.referenceTrackId,
      promptRound: parent.promptRound,
    },
    { createdAt: sinceParent + R.int(3, 30) * HOUR, verdict: "kept", q, stage, bpm: parent.tempoBpm, key: parent.key, dur: parent.durationS ?? 30, loop: parent.loop, partial: false },
  );
  // A bare return is a version, not a verdict: no score, no defect, no ledger row.
  if (how === "return-bare") made.take.ratings = {};
}

const parents = takes
  .filter((t) => t.kind === "music" && t.verdict === "kept" && t.origin !== "score" && t.stage !== "finalized" && Date.parse(t.createdAt) < NOW - 4 * DAY && t.provider !== "local")
  .slice(0, 5);
const plans: Parameters<typeof child>[1][] = ["return-bare", "return-scored", "return-bare", "section-edit", "section-edit"];
const stages: Stage[] = ["finalized", "edit", "remaster", "pending", "finalized"];
parents.forEach((p, i) => {
  if (p.stage === "pending") p.stage = "remaster";
  child(p, plans[i], stages[i], ["remaster", "edit pass", "remaster v2", "new outro", "alt outro"][i]);
});

/* ── hunts ───────────────────────────────────────────────────────────────── */

interface NodeSpec {
  key: string;
  parent: string | null;
  axis: string;
  label: string;
  rationale: string;
  provider: ProviderId;
  state: HuntNodeState;
  technique: string[];
  variant: string;
  takes?: number;
  winner?: boolean;
  error?: string;
}
interface HuntSpec {
  kind: SoundKind;
  idea: string;
  base: string;
  terms: SoundTerms;
  bpm: number | null;
  key: string | null;
  dur: number;
  loop: boolean | null;
  group: string;
  days: number;
  drafted: string;
  nodes: NodeSpec[];
}

const HUNTS: HuntSpec[] = [
  {
    kind: "music",
    idea: "The vault sequence in Glass Harbor needs pulse and dread without drums, so the dialogue stays clean on top. Find a bed that holds a full minute.",
    base: "Tension bed for a vault-door sequence, one repeating figure, nothing in the speech band",
    terms: { genre: ["suspense score", "minimal"], mood: ["tense", "restrained"], instrument: ["muted piano", "low pulse"], sfxCategory: null },
    bpm: 78, key: "F# minor", dur: 60, loop: true, group: "tension", days: 16, drafted: "claude-sonnet-5-5 (text router)",
    nodes: [
      { key: "a", parent: null, axis: "brief", label: "Baseline: piano ostinato", rationale: "The plain brief, as the anchor every branch is compared against.", provider: "elevenlabs", state: "rendered", technique: ["single-sentence"], variant: "muted piano ostinato over a low pulse", takes: 3 },
      { key: "b", parent: "a", axis: "tempo", label: "Slower, 72 BPM", rationale: "Dread usually tracks slowness; test whether six BPM less reads as heavier.", provider: "elevenlabs", state: "rendered", technique: ["duration-and-tempo-locking"], variant: "slower, locked at 72 BPM", takes: 2, winner: true },
      { key: "c", parent: "a", axis: "instrument swap", label: "Tremolo strings, no piano", rationale: "Strings sustain; the figure may hold a full minute without the piano's decay.", provider: "suno", state: "awaiting-return", technique: ["sonic-style-vocabulary"], variant: "tremolo strings replace the piano" },
      { key: "d", parent: "b", axis: "technique", label: "Section plan as the brief", rationale: "A four-section plan on the winner may fix the ending that drifted in b.", provider: "elevenlabs", state: "rendering", technique: ["section-plan-as-the-brief"], variant: "four-section plan, intro to tail" },
      { key: "e", parent: "a", axis: "technique", label: "Negative styles: no hi-hats", rationale: "Percussion leaks into the speech band; name what to avoid.", provider: "elevenlabs", state: "idea", technique: ["negative-styles"], variant: "no hi-hats, no snare, no risers" },
      { key: "f", parent: "b", axis: "key", label: "Down a tritone to B♭ minor", rationale: "A darker register for the same figure.", provider: "elevenlabs", state: "failed", technique: ["duration-and-tempo-locking"], variant: "transposed to Bb minor", error: "elevenlabs 422: composition plan rejected, section durations sum to 71 s, expected 60 s" },
    ],
  },
  {
    kind: "music",
    idea: "A warm explainer bed for Why Bitcoin that stays under a ninety-second voiceover and never asks for attention.",
    base: "Warm unhurried explainer bed under voiceover, no lead melody",
    terms: { genre: ["lo-fi", "downtempo"], mood: ["warm", "neutral"], instrument: ["electric piano", "sub bass"], sfxCategory: null },
    bpm: 84, key: "A minor", dur: 90, loop: true, group: "ambient", days: 11, drafted: "claude-sonnet-5-5 (text router)",
    nodes: [
      { key: "a", parent: null, axis: "brief", label: "Baseline: electric piano bed", rationale: "The plain brief, as the anchor.", provider: "elevenlabs", state: "rendered", technique: ["single-sentence"], variant: "soft electric piano and round sub", takes: 2 },
      { key: "b", parent: "a", axis: "technique", label: "Reference track anchoring", rationale: "Anchor on the French 79 reference, whose mix already sits under speech.", provider: "suno", state: "rendered", technique: ["reference-track-anchoring"], variant: "anchored on the French 79 reference", takes: 2, winner: true },
      { key: "c", parent: "b", axis: "tempo", label: "Faster, 96 BPM", rationale: "Check whether a livelier bed still stays out of the voice.", provider: "elevenlabs", state: "rendered", technique: ["duration-and-tempo-locking"], variant: "livelier, locked at 96 BPM", takes: 1 },
      { key: "d", parent: "a", axis: "instrument swap", label: "Marimba instead of electric piano", rationale: "Marimba decays faster and leaves more room for consonants.", provider: "elevenlabs", state: "idea", technique: ["sonic-style-vocabulary"], variant: "marimba replaces the electric piano" },
    ],
  },
  {
    kind: "sfx",
    idea: "The glass in the vault wall has to fracture slowly under pressure, a spreading crack that tells you it is about to go, then the break.",
    base: "Thick plate glass fracturing slowly under pressure, a spreading crack, then one final break, dry",
    terms: { genre: [], mood: ["tense"], instrument: ["glass"], sfxCategory: "impacts" },
    bpm: null, key: null, dur: 4, loop: false, group: "impacts", days: 8, drafted: "claude-sonnet-5-5 (text router)",
    nodes: [
      { key: "a", parent: null, axis: "brief", label: "Baseline: single sentence", rationale: "The plain brief, as the anchor.", provider: "elevenlabs", state: "rendered", technique: ["single-sentence"], variant: "a spreading crack then the break", takes: 3 },
      { key: "b", parent: "a", axis: "technique", label: "Envelope first", rationale: "State the envelope (slow ticking build, one break, short tail) before the material.", provider: "elevenlabs", state: "rendered", technique: ["envelope-first-briefing"], variant: "envelope-first: ticking build, one break, short tail", takes: 3, winner: true },
      { key: "c", parent: "b", axis: "technique", label: "Layered elements", rationale: "Assemble ticks, a low creak and a final shatter from separate generations.", provider: "elevenlabs", state: "rendered", technique: ["layered-element-assembly"], variant: "three separate layers: ticks, creak, shatter", takes: 2 },
      { key: "d", parent: "a", axis: "prompt influence", label: "Promptly literal, influence 0.9", rationale: "High prompt influence may stop the model fishing for a generic crash.", provider: "elevenlabs", state: "failed", technique: ["single-sentence"], variant: "prompt influence 0.9", error: "elevenlabs 429: concurrent generation limit reached (3 in flight)" },
    ],
  },
  {
    kind: "sfx",
    idea: "One family of whooshes for the scene transitions in Glass Harbor: same air, three weights, so cuts feel related.",
    base: "Air whoosh for a hard scene cut, no tonal content, clean tail",
    terms: { genre: [], mood: ["quick"], instrument: ["air"], sfxCategory: "whooshes" },
    bpm: null, key: null, dur: 2, loop: false, group: "whooshes", days: 4, drafted: "claude-sonnet-5-5 (text router)",
    nodes: [
      { key: "a", parent: null, axis: "brief", label: "Medium whoosh", rationale: "The middle weight, anchor for the family.", provider: "elevenlabs", state: "rendered", technique: ["picture-as-timing-brief"], variant: "medium weight, left to right", takes: 2, winner: true },
      { key: "b", parent: "a", axis: "weight", label: "Heavy, with a low thump", rationale: "Same air with a sub tail for the act breaks.", provider: "elevenlabs", state: "rendered", technique: ["layered-element-assembly"], variant: "heavy, ending in a soft low thump", takes: 2 },
      { key: "c", parent: "a", axis: "weight", label: "Light paper-card slide", rationale: "The lightest weight for collage cut-ins.", provider: "elevenlabs", state: "rendering", technique: ["single-sentence"], variant: "light, airy, almost no low end" },
      { key: "d", parent: "a", axis: "weight", label: "Reverse, building into the cut", rationale: "A swell that peaks on the cut instead of after it.", provider: "elevenlabs", state: "idea", technique: ["envelope-first-briefing"], variant: "reversed swell peaking on the cut" },
    ],
  },
];

const hunts: Hunt[] = [];
const huntTakeIds = new Map<string, string[]>(); // hunt id -> take ids

HUNTS.forEach((h, hi) => {
  const huntId = mint("hn");
  const keyToId = new Map<string, string>();
  for (const n of h.nodes) keyToId.set(n.key, mint("nd"));
  const created = daysAgo(h.days);
  const nodes: HuntNode[] = [];
  const allTakeIds: string[] = [];
  h.nodes.forEach((n, ni) => {
    const nodeId = keyToId.get(n.key)!;
    const takeIds: string[] = [];
    const prompt = promptWith(`${h.base}; ${n.variant}.`, n.technique, h.bpm, h.key);
    const count = n.state === "rendered" ? n.takes ?? 1 : 0;
    for (let k = 0; k < count; k++) {
      const winnerTake = !!n.winner && k === 0;
      const suno = n.provider === "suno";
      const q = qualityOf(n.technique, n.provider) + (winnerTake ? 1.6 : 0);
      const verdict = winnerTake ? "kept" : R.chance(0.2) ? "unjudged" : verdictFromQ(q);
      const m = assemble(
        {
          kind: h.kind,
          title: `${n.label}${count > 1 ? ` · ${k + 1}` : ""}`,
          provider: n.provider,
          op: suno ? "manual" : h.kind === "sfx" ? "sfx" : "compose",
          origin: suno ? "suno-return" : "hunt",
          technique: n.technique,
          prompt,
          terms: h.terms,
          group: h.group,
          huntId,
          nodeId,
          draftId: suno ? `dr-${R.hex(8)}` : null,
          songId: suno ? `sng_${R.hex(12)}` : null,
          fileName: suno ? `${slug(n.label)}-${k + 1}.wav` : null,
          referenceTrackId: n.technique.includes("reference-track-anchoring") ? REF_IDS[0] : null,
          variation: { axis: n.axis, diff: [n.variant] },
        },
        {
          createdAt: created + (ni * 3 + k + 1) * 40 * MIN,
          verdict,
          q,
          stage: verdict === "kept" ? (winnerTake && hi === 0 ? "finalized" : winnerTake ? "edit" : "pending") : null,
          bpm: h.bpm,
          key: h.key,
          dur: h.dur,
          loop: h.loop,
          cat: h.group,
        },
      );
      takeIds.push(m.take.id);
      allTakeIds.push(m.take.id);
    }
    nodes.push({
      id: nodeId,
      parentId: n.parent ? keyToId.get(n.parent)! : null,
      axis: n.axis,
      label: n.label,
      rationale: n.rationale,
      provider: n.provider,
      technique: n.technique,
      prompt,
      negative: n.technique.includes("negative-styles") ? "no hi-hats, no snare, no risers" : null,
      durationS: h.dur,
      loop: h.loop,
      terms: h.terms,
      tempoBpm: h.bpm,
      key: h.key,
      state: n.state,
      takeIds,
      winner: !!n.winner,
      error: n.error ?? null,
    });
  });
  hunts.push({ id: huntId, kind: h.kind, idea: h.idea, createdAt: new Date(created).toISOString(), nodes, draftedBy: h.drafted, lessonId: null });
  huntTakeIds.set(huntId, allTakeIds);
});

/* ── fixture rows: design samples, never ledgered ────────────────────────── */

[
  { id: "au-trk-0000", title: "Future Bass sketch 1", genre: ["future bass", "melodic dubstep"], mood: ["euphoric", "uplifting"], instrument: ["walking bassline", "jazzy sampled keys"], key: "A minor", dur: 153, ref: null as string | null, round: "round2-librosa", verdict: "kept" as const },
  { id: "au-trk-0001", title: "Nu-Disco sketch 2", genre: ["nu-disco", "synthwave"], mood: ["serene", "dreamy"], instrument: ["808 kick", "soft piano"], key: "F minor", dur: 131, ref: "ref-ratatat-breaking-away", round: "round1-fft", verdict: "unjudged" as const },
  { id: "au-trk-0002", title: "Drum And Bass sketch 3", genre: ["drum and bass", "liquid dnb"], mood: ["nostalgic", "warm"], instrument: ["electric piano", "808 kick"], key: "A minor", dur: 94, ref: null, round: "round2-librosa", verdict: "rejected" as const },
  { id: "au-trk-0003", title: "Melodic House sketch 4", genre: ["melodic house"], mood: ["triumphant", "soaring"], instrument: ["orchestral strings"], key: "F minor", dur: 208, ref: "ref-french79-4807", round: "round3-gemini", verdict: "kept" as const },
].forEach((f, i) => {
  const t = assemble(
    { kind: "music", title: f.title, provider: i % 2 ? "elevenlabs" : "suno", op: "manual", origin: "fixture", technique: [], prompt: "", terms: { genre: f.genre, mood: f.mood, instrument: f.instrument, sfxCategory: null }, group: i === 0 ? "electronic" : "hip hop", id: f.id, referenceTrackId: f.ref, promptRound: f.round },
    { createdAt: daysAgo(18 - i), verdict: f.verdict, q: f.verdict === "kept" ? 7.5 : 3.5, stage: f.verdict === "kept" ? "pending" : null, key: f.key, dur: f.dur, noFile: true, partial: false },
  ).take;
  used.add(t.id);
  t.measured = null;
  t.peaks = null;
  t.ratings = f.verdict === "unjudged" ? {} : t.ratings;
});

/* ── order, groups, lessons ──────────────────────────────────────────────── */

// A kept take with a stage but no group would sit in "ungrouped"; give each the
// row its genre or category already implies (they were set above, this checks).
takes.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

const rows: LedgerVerdict[] = takes.map(verdictRow).filter((r): r is LedgerVerdict => !!r);
rows.sort((a, b) => a.judgedAt.localeCompare(b.judgedAt) || a.takeId.localeCompare(b.takeId));

function evidence(pred: (r: LedgerVerdict) => boolean, cap = 8): Lesson["evidence"] {
  const hit = rows.filter(pred);
  const kept = hit.filter((r) => r.verdict === "kept").length;
  const scores = hit.map((r) => r.score).filter((s): s is number => s !== null);
  return {
    n: hit.length,
    keepRate: hit.length ? Math.round((kept / hit.length) * 100) / 100 : null,
    meanScore: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null,
    takeIds: hit.slice(0, cap).map((r) => r.takeId),
  };
}
const has = (t: string) => (r: LedgerVerdict) => r.technique.includes(t);

interface LessonDef {
  kind: SoundKind;
  source: "triage" | "hunt";
  provider: ProviderId | null;
  huntIdx?: number;
  claim: string;
  technique: string[];
  pred: (r: LedgerVerdict) => boolean;
  daysAgo: number;
}
const LESSONS: LessonDef[] = [
  { kind: "music", source: "triage", provider: null, claim: "When a cue has more than one movement, brief it as a section plan, because a single sentence lets the model decide where the drop goes and it lands in the wrong bar.", technique: ["section-plan-as-the-brief"], pred: (r) => r.kind === "music" && has("section-plan-as-the-brief")(r), daysAgo: 12 },
  { kind: "music", source: "triage", provider: null, claim: "When the bed must sit under a locked cut, lock the tempo and the key in the brief, because unlocked beds drift by five or more BPM over a minute.", technique: ["duration-and-tempo-locking"], pred: (r) => r.kind === "music" && has("duration-and-tempo-locking")(r), daysAgo: 10 },
  { kind: "music", source: "triage", provider: "suno", claim: "When Suno is the provider, anchor on a reference track, because the stylistic vocabulary alone gives a pleasant take that is the wrong piece.", technique: ["reference-track-anchoring"], pred: (r) => r.provider === "suno" && has("reference-track-anchoring")(r), daysAgo: 9 },
  { kind: "music", source: "triage", provider: null, claim: "When the brief is one sentence, expect an off-brief take roughly every second render, because nothing in it names a structure to hold the model to.", technique: ["single-sentence"], pred: (r) => r.kind === "music" && has("single-sentence")(r), daysAgo: 8 },
  { kind: "sfx", source: "triage", provider: "elevenlabs", claim: "When an effect has a shape in time, brief the envelope first (attack, body, tail), because a material-first brief gets the right sound with the wrong event.", technique: ["envelope-first-briefing"], pred: (r) => r.kind === "sfx" && has("envelope-first-briefing")(r), daysAgo: 6 },
  { kind: "sfx", source: "triage", provider: "elevenlabs", claim: "When an effect has to loop, say so and accept the seam by ear, because a loop that was not asked for as one clicks at the join.", technique: ["loop-seam-acceptance"], pred: (r) => r.kind === "sfx" && has("loop-seam-acceptance")(r), daysAgo: 5 },
  { kind: "sfx", source: "triage", provider: "elevenlabs", claim: "When the effect is a compound event, assemble it from layers rather than one render, because the model flattens ticks, creak and shatter into a single crash.", technique: ["layered-element-assembly"], pred: (r) => r.kind === "sfx" && has("layered-element-assembly")(r), daysAgo: 4 },
  { kind: "music", source: "hunt", provider: "elevenlabs", huntIdx: 0, claim: "When a bed must hold a full minute without drums, slow it by six BPM and lock the tempo, because the slower figure reads as dread instead of drift.", technique: ["duration-and-tempo-locking"], pred: (r) => r.huntId === hunts[0].id, daysAgo: 7 },
  { kind: "sfx", source: "hunt", provider: "elevenlabs", huntIdx: 2, claim: "When a break has a spreading crack before it, brief the envelope before the material, because the single-sentence branch got the break and lost the crack.", technique: ["envelope-first-briefing"], pred: (r) => r.huntId === hunts[2].id, daysAgo: 3 },
];

const lessons: Lesson[] = [];
for (const d of LESSONS) {
  const ev = evidence(d.pred);
  if (ev.n < 2) continue;
  const l: Lesson = {
    id: mint("ls"),
    kind: d.kind,
    source: d.source,
    provider: d.provider,
    huntId: d.huntIdx === undefined ? null : hunts[d.huntIdx].id,
    claim: d.claim,
    technique: d.technique,
    evidence: ev,
    confirmedAt: iso(-d.daysAgo * DAY),
  };
  lessons.push(l);
  if (d.huntIdx !== undefined) hunts[d.huntIdx].lessonId = l.id;
}

/* ── write ───────────────────────────────────────────────────────────────── */

export function generate(): string {
  for (const t of takes) {
    const buf = wavs.get(t.id);
    if (t.file && buf) writeBytes(outFile("sound", t.file.path), buf);
  }
  writeJson(outFile("sound", "takes.json"), { version: 1, takes });
  writeJson(outFile("sound", "hunts.json"), { version: 1, hunts });
  writeJson(outFile("sound", "groups.json"), { version: 1, groups: GROUPS });
  writeJson(outFile("sound-ledger.json"), { verdicts: rows, lessons });
  const nodes = hunts.reduce((n, h) => n + h.nodes.length, 0);
  return `${takes.length} takes (${takes.filter((t) => t.file).length} with audio), ${hunts.length} hunts (${nodes} nodes), ${rows.length} verdicts, ${lessons.length} lessons`;
}

