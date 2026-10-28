// THE INSTRUMENT ATLAS - the instruments a seed can name that this machine can also PLAY, as one
// committed table: the word Suno reads (`term`), the register the audition phrase sits in
// (`role`), two plain words a person without the vocabulary can hear in it (`plain`), the other
// ways people write it (`aka`), and where a sample library files it (`folders`).
//
// Pure, so the composer, the kit and the server's scanner (lib/audio/atlas.ts) read ONE copy.
// `folders` are suffixes of a sample directory's path RELATIVE to a configured root
// (GRAVITONE_SAMPLE_ROOTS) - a library's own taxonomy ("keyboard/rhodes" in FL Studio's packs,
// "multisamples/grand piano" in Ableton's Core Library), never a machine's path. The first
// folder found wins, so the order of `folders` is a preference.
//
// THE AUDITION IS THE INPUT, THE TERM IS THE OUTPUT. People pick a sound from two played options
// long before they can name it (the vocabulary problem is recognition, not recall), so the swap
// offers same-role instruments first, then the neighbours a non-musician confuses them with.

export type Role = "keys" | "bass" | "guitar" | "strings" | "voices" | "brass" | "winds" | "synth" | "mallets" | "drums";

export type AtlasEntry = {
  readonly id: string;
  /** The word the seed carries and Suno reads. */
  readonly term: string;
  readonly role: Role;
  /** Two plain words for what it sounds like. */
  readonly plain: readonly [string, string];
  /** Other spellings of the same instrument, lower-case. */
  readonly aka: readonly string[];
  /** Library directory suffixes, relative to a sample root, lower-case, `/`-separated. */
  readonly folders: readonly string[];
};

export const ATLAS: readonly AtlasEntry[] = [
  { id: "grand-piano", term: "grand piano", role: "keys", plain: ["full", "ringing"], aka: ["piano", "acoustic piano", "concert piano"], folders: ["keyboard/grand", "multisamples/grand piano"] },
  { id: "upright-piano", term: "upright piano", role: "keys", plain: ["homely", "woody"], aka: ["honky tonk piano", "home piano", "old piano"], folders: ["multisamples/upright home piano"] },
  { id: "rhodes", term: "rhodes", role: "keys", plain: ["warm", "bell-soft"], aka: ["rhodes piano", "fender rhodes", "electric rhodes"], folders: ["keyboard/rhodes"] },
  { id: "electric-piano", term: "electric piano", role: "keys", plain: ["glassy", "bright"], aka: ["ep", "wurlitzer", "e-piano"], folders: ["keyboard/electric"] },
  { id: "upright-bass", term: "upright bass", role: "bass", plain: ["woody", "round"], aka: ["double bass", "acoustic bass", "contrabass", "jazz bass"], folders: ["bass/acoustic"] },
  { id: "electric-bass", term: "electric bass", role: "bass", plain: ["solid", "plucked"], aka: ["bass guitar", "bass", "fingered bass"], folders: ["bass/classic 80", "bass/ibanez"] },
  { id: "slap-bass", term: "slap bass", role: "bass", plain: ["snappy", "funky"], aka: ["funk bass"], folders: ["bass/slap"] },
  { id: "synth-bass", term: "synth bass", role: "bass", plain: ["deep", "buzzy"], aka: ["808 bass", "sub bass", "analog bass"], folders: ["synths/mamas bass", "synths/pulse bass"] },
  { id: "nylon-guitar", term: "nylon guitar", role: "guitar", plain: ["soft", "plucked"], aka: ["classical guitar", "acoustic guitar", "spanish guitar", "guitar"], folders: ["guitar/classical acoustic"] },
  { id: "jazz-guitar", term: "jazz guitar", role: "guitar", plain: ["mellow", "round"], aka: ["hollow body guitar", "archtop guitar"], folders: ["guitar/jazz"] },
  { id: "clean-guitar", term: "clean electric guitar", role: "guitar", plain: ["clean", "bright"], aka: ["electric guitar", "clean guitar", "strat"], folders: ["guitar/strat pos a", "guitar/strat pos b"] },
  { id: "muted-guitar", term: "muted guitar", role: "guitar", plain: ["dry", "clipped"], aka: ["palm muted guitar", "funk guitar"], folders: ["guitar/strat mute"] },
  { id: "string-section", term: "string section", role: "strings", plain: ["lush", "bowed"], aka: ["strings", "orchestral strings", "string ensemble", "violins"], folders: ["orchestral/strings section"] },
  { id: "solo-strings", term: "solo violin", role: "strings", plain: ["singing", "lonely"], aka: ["violin", "fiddle", "solo strings", "cello"], folders: ["orchestral/strings solo"] },
  { id: "choir", term: "choir", role: "voices", plain: ["airy", "human"], aka: ["choir ahh", "choral", "voices", "vocal pad"], folders: ["orchestral/choir ahh", "orchestral/choir ooh"] },
  { id: "brass-section", term: "brass section", role: "brass", plain: ["bold", "brassy"], aka: ["brass", "horns", "horn section", "trumpets"], folders: ["orchestral/brass section"] },
  { id: "woodwinds", term: "woodwinds", role: "winds", plain: ["breathy", "soft"], aka: ["woodwind section", "flute", "clarinet", "winds"], folders: ["orchestral/woodwind section"] },
  { id: "synth-pad", term: "synth pad", role: "synth", plain: ["hazy", "wide"], aka: ["pad", "pads", "ambient pad", "warm pads"], folders: ["synths/ambient encounters", "synths/smooth synth"] },
  { id: "analog-synth", term: "analog synth", role: "synth", plain: ["buzzy", "retro"], aka: ["synth", "synthesizer", "vintage synth", "saw synth"], folders: ["synths/ob saw", "synths/saw sh"] },
  { id: "synth-lead", term: "synth lead", role: "synth", plain: ["cutting", "bright"], aka: ["lead synth", "arp synth", "synth arp", "arpeggiator"], folders: ["synths/arp poly lead"] },
  // A kit plays one groove instead of the phrase (pipeline/audio/drums.py); the same groove on every kit.
  { id: "live-drums", term: "live drums", role: "drums", plain: ["punchy", "live"], aka: ["drums", "drum kit", "acoustic drums", "funk drums", "real drums"], folders: ["kits/hq funk kit"] },
  { id: "jazz-drums", term: "jazz drums", role: "drums", plain: ["airy", "loose"], aka: ["jazz kit", "swing drums"], folders: ["kits/hq jazz kit"] },
  { id: "rock-drums", term: "rock drums", role: "drums", plain: ["big", "hard-hitting"], aka: ["rock kit", "heavy drums"], folders: ["kits/hq rock kit"] },
  { id: "drum-machine", term: "drum machine", role: "drums", plain: ["boomy", "electronic"], aka: ["808", "808s", "808 drums", "beat machine", "electronic drums"], folders: ["drum machines/808"] },
  { id: "kalimba", term: "kalimba", role: "mallets", plain: ["plinky", "wooden"], aka: ["thumb piano", "mbira", "likembe"], folders: ["multisamples/ikembe"] },
];

/** The roles a non-musician confuses a role with, nearest first: the swap's second ring. */
export const NEIGHBOURS: Readonly<Record<Role, readonly Role[]>> = {
  keys: ["mallets", "guitar", "synth"],
  bass: ["synth", "keys"],
  guitar: ["keys", "mallets", "strings"],
  strings: ["voices", "winds", "synth"],
  voices: ["strings", "synth", "winds"],
  brass: ["winds", "strings", "synth"],
  winds: ["strings", "brass", "voices"],
  synth: ["keys", "strings", "voices"],
  mallets: ["keys", "guitar", "synth"],
  drums: [],
};

const norm = (w: string): string => w.trim().toLowerCase().replace(/\s+/g, " ");

export const atlasById = (id: string): AtlasEntry | undefined => ATLAS.find((e) => e.id === id);

/** The atlas entry a seed's instrument word names - its term or one of its spellings; else undefined. */
export function atlasFor(word: string): AtlasEntry | undefined {
  const w = norm(word);
  return ATLAS.find((e) => e.term === w) ?? ATLAS.find((e) => e.aka.includes(w));
}

/**
 * The candidates a swap offers for one instrument: same role first, then the neighbouring roles
 * in their order; never the instrument itself, never one this machine cannot play (`audible`),
 * never one already in the seed (`have`, any spelling). At most `max`.
 */
export function swapsFor(entry: AtlasEntry, audible: ReadonlySet<string>, have: readonly string[] = [], max = 5): AtlasEntry[] {
  return ringOf(entry.role, entry.id, audible, have, max);
}

function ringOf(role: Role, not: string | null, audible: ReadonlySet<string>, have: readonly string[], max: number): AtlasEntry[] {
  const held = new Set(have.map((h) => atlasFor(h)?.id ?? norm(h)));
  const rings: readonly Role[] = [role, ...NEIGHBOURS[role]];
  const out: AtlasEntry[] = [];
  for (const r of rings)
    for (const e of ATLAS) if (e.role === r && e.id !== not && audible.has(e.id) && !held.has(e.id) && !out.includes(e)) out.push(e);
  return out.slice(0, max);
}

/**
 * The register of an instrument word this machine has no samples for - the words the lexicon and
 * people use that the atlas cannot play - so its chip can still offer the nearest sounds that CAN
 * play. Named words first, then the word's last noun ("brushed drums" -> drums, "felt piano" ->
 * keys). Unknown: no offer, rather than a guess.
 */
const NEAR: Readonly<Record<string, Role>> = {
  saxophone: "winds", sax: "winds", harmonica: "winds", whistle: "winds", "tin whistle": "winds",
  "muted trumpet": "brass", trumpet: "brass", trombone: "brass", tuba: "brass",
  harp: "strings", pizzicato: "strings", "pizzicato strings": "strings",
  sitar: "guitar", ukulele: "guitar", banjo: "guitar", lute: "guitar", oud: "guitar", "distorted guitar": "guitar", mandolin: "guitar",
  organ: "keys", accordion: "keys", harpsichord: "keys", "felt piano": "keys",
  marimba: "mallets", xylophone: "mallets", vibraphone: "mallets", celesta: "mallets", glockenspiel: "mallets", "steel drums": "mallets", "sleigh bells": "mallets", "singing bowls": "mallets", bell: "mallets", bells: "mallets",
  "taiko drums": "drums", tabla: "drums", congas: "drums", "hand percussion": "drums", claps: "drums", shaker: "drums", timpani: "drums",
  "square lead": "synth", drones: "synth", arpeggio: "synth",
  vocals: "voices", "vocal chops": "voices",
};
const LAST_NOUN: Readonly<Record<string, Role>> = { drums: "drums", drum: "drums", guitar: "guitar", piano: "keys", keys: "keys", bass: "bass", synth: "synth", pad: "synth", pads: "synth", lead: "synth", strings: "strings", violin: "strings", choir: "voices", horns: "brass", brass: "brass" };

export function roleOfWord(word: string): Role | undefined {
  const w = norm(word);
  return atlasFor(w)?.role ?? NEAR[w] ?? LAST_NOUN[w.split(" ").at(-1) ?? ""];
}

/** The playable sounds nearest a word this machine cannot play: its register first, then neighbours. */
export function nearFor(word: string, audible: ReadonlySet<string>, have: readonly string[] = [], max = 5): AtlasEntry[] {
  const role = roleOfWord(word);
  return role === undefined ? [] : ringOf(role, null, audible, have, max);
}

/** The most instruments a sketch carries (lib/audio/atlas.ts refuses more). */
export const SKETCH_VOICES = 5;

/**
 * The atlas ids a seed's instruments name that this machine can play, once each, in seed order,
 * at most SKETCH_VOICES - the ONE spelling of "the seed's playable instruments" the shape's sketch,
 * a variation's sketch, a swap heard in the mix and the agent door all use. `must` is kept in.
 */
export function playableIds(instruments: readonly string[], audible: ReadonlySet<string>, must?: string): string[] {
  const ids = [...new Set(instruments.map((t) => atlasFor(t)?.id).filter((id): id is string => id !== undefined && audible.has(id)))];
  if (must === undefined) return ids.slice(0, SKETCH_VOICES);
  return [must, ...ids.filter((id) => id !== must)].slice(0, SKETCH_VOICES);
}

/** The tempo an audition plays at: the seed's when the renderer can play it (40-220), else the default. */
export const playableBpm = (bpm: number | null): number => (bpm !== null && Number.isFinite(bpm) && Math.round(bpm) >= 40 && Math.round(bpm) <= 220 ? Math.round(bpm) : AUDITION_BPM);

/** The audition phrase's address: one instrument, one tempo, one key - the cache key too. */
export function auditionHref(id: string, bpm: number | null, key: string | null): string {
  const q = new URLSearchParams({ id, bpm: String(playableBpm(bpm)) });
  if (key !== null && key.trim() !== "") q.set("key", key.trim());
  return `/audio/audition?${q.toString()}`;
}

/** The phrase's tempo when the seed names none, and its key. */
export const AUDITION_BPM = 90;
export const AUDITION_KEY = "C major";

/** The sketch's address: the instruments together over the shape's levels (one digit per four bars). */
export function sketchHref(ids: readonly string[], levels: readonly number[], bpm: number | null, key: string | null): string {
  const q = new URLSearchParams({ ids: [...new Set(ids)].join(","), levels: levels.join(""), bpm: String(playableBpm(bpm)) });
  if (key !== null && key.trim() !== "") q.set("key", key.trim());
  return `/audio/sketch?${q.toString()}`;
}
