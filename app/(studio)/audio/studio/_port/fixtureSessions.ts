// THE STUDIO'S SCRIPTED SESSIONS (stage S1, spark audio-agent-studio): three conversations an outside
// agent could have had, written as raw turns so they pass through the same door an agent's turn does
// (@gt/domain/audio.studio.door). Audio points at real local renders through {{key}} tokens, resolved
// by the fixture port from pipeline/studio-fixtures.mts's index. Session "game-menu" scripts the v2
// arrangement (8 stems, per-section entry) the engine cannot make yet: those pieces say "illustrative".
// Session "vlog-beat" carries one broken piece and one broken action ON PURPOSE, so every variant has
// to show its dropped-piece disclosure. Session "night-drive" (spark suno-advisor) is the Suno advisor:
// a prompt card with a local sketch, a verdict with an uploaded take, a revised prompt with its lineage,
// and taste proposals; its take's facts and a two-line taste profile are FIXTURE_TAKES / FIXTURE_TASTE.

import type { StudioTakeFacts, StudioTasteLine } from "@gt/domain/audio.suno";

export type FixtureSession = { readonly id: string; readonly title: string; readonly turns: readonly unknown[] };

const at = (m: number): string => `2026-10-28T18:${String(m).padStart(2, "0")}:00Z`;
const take = (key: string, stem?: string) => ({ href: `/api/sound/takes/{{${key}}}/file${stem ? `?stem=${stem}` : ""}` });
const hear = (instrument: string) => ({ href: `/api/sound/takes/audition/file?instrument=${instrument}` });
const user = (id: string, seq: number, text: string, action?: string) => ({ v: 1, id, seq, at: at(seq), from: "user", text, ...(action ? { action } : {}) });
const agent = (id: string, seq: number, text: string, show: unknown[], actions: unknown[]) => ({ v: 1, id, seq, at: at(seq), from: "agent", text, show, actions });

const stems4 = (key: string, names: Readonly<Record<string, string>>) => ({
  id: "stems", kind: "stems", takeId: `{{${key}}}`,
  rows: (["drums", "bass", "chords", "lead"] as const).map((role) => ({ id: role, role, label: names[role] ?? role, audio: take(key, role) })),
});

const calmSections = { id: "sections", kind: "sections", rows: [{ name: "intro", bars: 2, energy: 0.3 }, { name: "lift", bars: 4, energy: 0.82 }, { name: "outro", bars: 2, energy: 0.32 }] };
const calmNames = { drums: "soft brushed drums", bass: "warm finger bass", chords: "felt piano", lead: "breathy flute" };

const studyBed: FixtureSession = {
  id: "study-bed",
  title: "Something calm to study to",
  turns: [
    user("s1-u1", 1, "something calm to study to, a bit hopeful, about a minute"),
    agent("s1-a1", 2, "I made a quiet bed at 92 bpm in C major: brushed drums, a warm bass, felt piano and a soft flute. 'Calm' and 'hopeful' pull in two directions - pick one and I will lean that way.", [
      { id: "heard", kind: "heard", sentence: "something calm to study to, a bit hopeful, about a minute", links: [
        { words: "calm", to: "slow and soft", field: "mood" }, { words: "study", to: "no vocals, steady", field: "energy" },
        { words: "hopeful", to: "major key", field: "key" }, { words: "about a minute", to: "60 s", field: "length" }] },
      { id: "track", kind: "track", title: "Quiet Horizon Bed", takeId: "{{calm}}", mix: take("calm"), bpm: 92, key: "C major", lengthS: 22 },
      calmSections,
      stems4("calm", calmNames),
      { id: "mood", kind: "pull", question: "calm or hopeful?", sides: [
        { label: "calm", says: "keeps the lift low and the piano soft", audio: take("calm", "chords"), settle: "keep it calm, no big lift" },
        { label: "hopeful", says: "a brighter lift in the middle", audio: take("calm"), settle: "lean hopeful, let the middle lift" }] },
    ], [
      { id: "s1-p1", kind: "play", label: "play the bed", node: "track" },
      { id: "s1-p2", kind: "settle_pull", label: "lean hopeful", node: "mood", side: 1, why: "you said hopeful last" },
      { id: "s1-p3", kind: "say", label: "softer bass", text: "the bass is a bit too much, make it softer" },
    ]),
    user("s1-u2", 3, "the bass is a bit too much, make it softer", "s1-p3"),
    agent("s1-a2", 4, "Two softer basses to try. Hear each alone or inside the bed, then keep one. The duel plays the whole bed with each.", [
      { id: "bass-options", kind: "candidates", for: { stem: "bass" }, prompt: "a softer low end", rows: [
        { id: "sample-mamas-bass", name: "Picked Finger Bass", words: ["warm", "plucked"], alone: hear("sample-mamas-bass"), inMix: take("calm"), measured: "the one playing now" },
        { id: "vital-sub-bass", name: "Smooth Synth Bass", words: ["deep", "smooth"], alone: hear("vital-sub-bass"), inMix: take("calm-vital-bass") }] },
      { id: "bass-duel", kind: "duel", question: "which bed feels calmer?", a: { label: "finger bass", audio: take("calm"), takeId: "{{calm}}" }, b: { label: "smooth synth bass", audio: take("calm-vital-bass"), takeId: "{{calm-vital-bass}}" } },
      { id: "measures", kind: "measures", takeId: "{{calm}}", rows: [{ label: "loudness", value: "-14 LUFS", tone: "ok" }, { label: "length", value: "22 s of 60 asked", tone: "warn" }, { label: "same every render", value: "yes", tone: "ok" }] },
    ], [
      { id: "s1-p4", kind: "hear", label: "smooth bass alone", node: "bass-options", candidate: "vital-sub-bass", mode: "alone" },
      { id: "s1-p5", kind: "hear", label: "smooth bass in the bed", node: "bass-options", candidate: "vital-sub-bass", mode: "in_mix" },
      { id: "s1-p6", kind: "use_candidate", label: "keep the smooth bass", node: "bass-options", candidate: "vital-sub-bass" },
      { id: "s1-p7", kind: "pick", label: "B feels calmer", node: "bass-duel", side: "b" },
    ]),
    user("s1-u3", 5, "keep the smooth bass", "s1-p6"),
    agent("s1-a3", 6, "Done: the smooth synth bass sits under the piano now, and the other three parts are bit-for-bit the same. The bed is 22 seconds; say the word and I will stretch it to a minute.", [
      { id: "track", kind: "track", title: "Quiet Horizon Bed (smooth synth bass)", takeId: "{{calm-vital-bass}}", mix: take("calm-vital-bass"), bpm: 92, key: "C major", lengthS: 22 },
      calmSections,
      stems4("calm-vital-bass", { ...calmNames, bass: "smooth synth bass" }),
    ], [
      { id: "s1-p8", kind: "play", label: "play it", node: "track" },
      { id: "s1-p9", kind: "solo", label: "hear the bass alone", stem: "bass", on: true },
      { id: "s1-p10", kind: "say", label: "make it a minute", text: "make it a full minute" },
    ]),
  ],
};

const hiphopNames = { drums: "dusty boom-bap drums", bass: "round sub bass", chords: "lo-fi electric keys", lead: "kalimba bell" };

const vlogBeat: FixtureSession = {
  id: "vlog-beat",
  title: "A relaxed beat for a vlog",
  turns: [
    user("s2-u1", 1, "chill beat for my coffee vlog, nothing too busy, maybe piano"),
    agent("s2-a1", 2, "Here is a head-nod beat at 84 bpm in A minor with lo-fi keys. You asked for piano - I can swap the keys for a felt piano, have a listen.", [
      { id: "heard", kind: "heard", sentence: "chill beat for my coffee vlog, nothing too busy, maybe piano", links: [
        { words: "chill beat", to: "lo-fi hip hop, 84 bpm", field: "genre" }, { words: "nothing too busy", to: "lower density", field: "energy" },
        { words: "piano", to: "a piano for the chords", field: "instrument" }], unheard: ["coffee"] },
      { id: "track", kind: "track", title: "Midnight Study Loop", takeId: "{{hiphop}}", mix: take("hiphop"), bpm: 84, key: "A minor" },
      stems4("hiphop", hiphopNames),
      { id: "keys-options", kind: "candidates", for: { stem: "chords" }, prompt: "a piano instead of the keys", rows: [
        { id: "sample-felt-piano", name: "Upright Felt Piano", words: ["soft", "intimate"], alone: hear("sample-felt-piano"), inMix: take("hiphop-felt-piano"), measured: "in tune to 2 cents" },
        { id: "sample-grand-piano", name: "Concert Grand Piano", words: ["bright", "clear"], alone: hear("sample-grand-piano") },
        { id: "sample-lofi-keys", name: "Lo-Fi Electric Keys", words: ["warm", "wobbly"], alone: hear("sample-lofi-keys"), inMix: take("hiphop"), measured: "the one playing now" }] },
      { id: "spectrum", kind: "waterfall3d", note: "an unknown kind, dropped on purpose" },
      { id: "measures", kind: "measures", takeId: "{{hiphop}}", rows: [{ label: "loudness", value: "-14 LUFS", tone: "ok" }, { label: "flags", value: "none", tone: "ok" }] },
    ], [
      { id: "s2-p1", kind: "play", label: "play the beat", node: "track" },
      { id: "s2-p2", kind: "hear", label: "felt piano in the beat", node: "keys-options", candidate: "sample-felt-piano", mode: "in_mix" },
      { id: "s2-p3", kind: "use_candidate", label: "use the felt piano", node: "keys-options", candidate: "sample-felt-piano" },
      { id: "s2-p4", kind: "mute", label: "drop the bell", stem: "lead", on: true, why: "fewer parts, less busy" },
      { id: "s2-p5", kind: "pick", label: "broken on purpose", node: "no-such-duel", side: "a" },
    ]),
    user("s2-u2", 3, "use the felt piano", "s2-p3"),
    agent("s2-a2", 4, "Swapped: the felt piano plays the chords and drums, bass and bell are untouched.", [
      { id: "track", kind: "track", title: "Midnight Study Loop (felt piano)", takeId: "{{hiphop-felt-piano}}", mix: take("hiphop-felt-piano"), bpm: 84, key: "A minor" },
      stems4("hiphop-felt-piano", { ...hiphopNames, chords: "felt piano" }),
    ], [
      { id: "s2-p6", kind: "play", label: "play it", node: "track" },
      { id: "s2-p7", kind: "level", label: "piano a little louder", stem: "chords", db: 2 },
      { id: "s2-p8", kind: "render", label: "render again", why: "a fresh take with the same parts" },
    ]),
  ],
};

const menuSections = { id: "sections", kind: "sections", source: "illustrative", rows: [{ name: "intro", bars: 2, energy: 0.35 }, { name: "loop A", bars: 4, energy: 0.7 }, { name: "loop B", bars: 4, energy: 0.9 }, { name: "tail", bars: 2, energy: 0.4 }] };

const gameMenu: FixtureSession = {
  id: "game-menu",
  title: "A looping menu theme for a game",
  turns: [
    user("s3-u1", 1, "retro game menu music that loops forever, building up but never annoying"),
    agent("s3-a1", 2, "A synthwave loop at 112 bpm in D minor. I planned eight parts that come in one by one - the four you can hear now are real, the other four are how the full arrangement will look once the engine can render them.", [
      { id: "track", kind: "track", title: "Neon Grid Runner", takeId: "{{synth}}", mix: take("synth"), bpm: 112, key: "D minor" },
      menuSections,
      { id: "stems", kind: "stems", takeId: "{{synth}}", source: "illustrative", rows: [
        { id: "drums", role: "drums", label: "punchy electronic drums", audio: take("synth", "drums"), enters: [false, true, true, false] },
        { id: "perc", role: "percussion", label: "ticking shaker", enters: [true, true, true, true] },
        { id: "bass", role: "bass", label: "pulsing synth bass", audio: take("synth", "bass"), enters: [false, true, true, true] },
        { id: "chords", role: "chords", label: "wide warm pad", audio: take("synth", "chords"), enters: [true, true, true, true] },
        { id: "pad", role: "pad", label: "slow airy swell", enters: [false, false, true, true] },
        { id: "lead", role: "lead", label: "bright pluck tune", audio: take("synth", "lead"), enters: [false, true, true, false], levelDb: -2 },
        { id: "lead2", role: "lead", label: "answering echo tune", enters: [false, false, true, false], pan: 0.4 },
        { id: "fx", role: "texture", label: "arcade sparkle", enters: [true, false, false, true], levelDb: -8 },
      ] },
      { id: "measures", kind: "measures", takeId: "{{synth}}", rows: [{ label: "loop seam", value: "clean", tone: "ok" }, { label: "parts heard", value: "4 of 8", tone: "warn" }] },
    ], [
      { id: "s3-p1", kind: "play", label: "play the loop", node: "track" },
      { id: "s3-p2", kind: "solo", label: "just the bass", stem: "bass", on: true },
      { id: "s3-p3", kind: "pan", label: "echo tune to the right", stem: "lead2", pan: 0.6 },
      { id: "s3-p4", kind: "say", label: "less busy in loop B", text: "loop B is a bit much, take something out" },
    ]),
  ],
};

/** The uploaded take of night-drive's first prompt (FIXTURE_TAKES holds what was measured and heard). */
export const NIGHT_DRIVE_TAKE = "suno-nd-p1-a";

const ndLyrics = (chorus: string): string =>
  ["[Intro]", "", "[Verse]", "Streetlights count the miles for me", "Windows down, the city breathes", "Radio hums a borrowed tune", "Chasing down the highway moon", "", "[Pre-Chorus]", "Hold the wheel, hold the line", "", "[Chorus]", chorus, "Neon in the rain", "Nowhere we are going", "Feels the same", "", "[Outro]"].join("\n");
const ndBecause = "A is close, but it rushes and the voice is too breathy and buried.";
const verdictUser = (id: string, seq: number, text: string, verdict: unknown, takeId?: string) => ({ ...user(id, seq, text), verdict, ...(takeId ? { takeId } : {}) });

const nightDrive: FixtureSession = {
  id: "night-drive",
  title: "A synthwave song for a night drive",
  turns: [
    user("nd-u1", 1, "a song for driving at night, 80s synths, a woman singing, a bit wistful"),
    agent("nd-a1", 2, "Here is a Suno prompt for a late-night drive, and a free local sketch of the same idea so you can hear the direction first. Paste it into Suno, generate, and tell me which take works and what is off.", [
      { id: "p1", kind: "suno_prompt", promptId: "p1", name: "Neon Overpass", instrumental: false, model: "v6",
        style: "synthwave, 1980s retro, nocturnal and wistful, steady driving pulse, analog bass arpeggio, gated reverb drums, shimmering poly pads, airy female vocal, tape-saturated mix, 112 bpm, D minor",
        lyrics: ndLyrics("Overpass, we're glowing"), exclude: "trap hi-hats, EDM drop",
        settings: { weirdness: 35, styleInfluence: 70, variety: 0 } },
      { id: "sketch", kind: "track", title: "Neon Overpass (local sketch)", takeId: "{{synth}}", mix: take("synth"), answers: { promptId: "p1", as: "sketch" } },
      { id: "taste", kind: "taste", rows: [{ id: "t1", line: "night-drive synthwave", lean: "like" }, { id: "t2", line: "big festival drops", lean: "dislike" }] },
    ], [
      { id: "nd-p1", kind: "play", label: "play the sketch", node: "sketch" },
    ]),
    verdictUser("nd-u2", 3, ndBecause, { promptId: "p1", clip: "a", keep: false, off: ["tempo", "vocals"] }, NIGHT_DRIVE_TAKE),
    agent("nd-a2", 4, "Take a came out faster than the prompt asked, and the voice sat back behind the pads. This version pins the tempo and brings the voice forward; same model and sliders.", [
      { id: "take-a", kind: "track", title: "Neon Overpass, take a", takeId: NIGHT_DRIVE_TAKE, mix: take("synth"), source: "illustrative", answers: { promptId: "p1", as: "suno", clip: "a" } },
      { id: "measures", kind: "measures", takeId: NIGHT_DRIVE_TAKE, rows: [{ label: "tempo", value: "faster than asked", tone: "warn" }, { label: "key", value: "as asked", tone: "ok" }, { label: "loudness", value: "streaming-loud", tone: "ok" }] },
      { id: "p2", kind: "suno_prompt", promptId: "p2", parent: "p1", name: "Neon Overpass", instrumental: false, model: "v6",
        style: "synthwave, 1980s retro, nocturnal and wistful, 112 bpm steady half-time feel, analog bass arpeggio, gated reverb drums, shimmering poly pads, clear upfront female vocal, close-mic, tape-saturated mix, D minor",
        lyrics: ndLyrics("Overpass, we're glowing (glowing)"), exclude: "trap hi-hats, EDM drop, breathy whisper vocal",
        settings: { weirdness: 35, styleInfluence: 70, variety: 0 },
        changes: [
          { field: "style", was: "steady driving pulse", now: "112 bpm steady half-time feel", why: "take a rushed past the tempo asked" },
          { field: "style", was: "airy female vocal", now: "clear upfront female vocal, close-mic", why: "the voice was breathy and buried" },
          { field: "exclude", now: "breathy whisper vocal", why: "fence the breathy read out" },
        ],
        because: ndBecause },
    ], [
      { id: "nd-p2", kind: "play", label: "play take a", node: "take-a" },
    ]),
    verdictUser("nd-u3", 5, "Both takes of this one work. Keeping it.", { promptId: "p2", clip: "both", keep: true }),
    agent("nd-a3", 6, "Kept. Three things you seem to like and dislike; keep the ones that should carry into the next song.", [
      { id: "taste", kind: "taste", rows: [{ id: "t3", line: "clear upfront female vocal", lean: "like" }, { id: "t4", line: "half-time synthwave drums", lean: "like" }, { id: "t5", line: "breathy whisper vocals", lean: "dislike" }] },
    ], []),
  ],
};

export const FIXTURE_SESSIONS: readonly FixtureSession[] = [studyBed, vlogBeat, gameMenu, nightDrive];

/** What this server would know of night-drive's uploaded take: measured, and one listen (a plausible
 *  read, written to disagree with the measurement on tempo and key, as listeners do). The href is a
 *  {{key}} token the fixture port resolves like any turn's. */
export const FIXTURE_TAKES: Readonly<Record<string, StudioTakeFacts>> = {
  [NIGHT_DRIVE_TAKE]: {
    takeId: NIGHT_DRIVE_TAKE, name: "Neon Overpass (a).mp3", durationS: 167.4, href: "/api/sound/takes/{{synth}}/file", promptId: "p1", clip: "a",
    measured: { bpm: 124, bpmAlt: [62, 248], key: "D minor", keyStrength: 0.71, lufs: -9.6, truePeakDb: -0.8, lra: 5.4 },
    listened: {
      model: "gemini-3.8-flash", at: "2026-10-28T18:03:40Z", genre: ["synthwave", "retro pop"], mood: ["nocturnal", "wistful", "driving"], bpm: 62, key: "F major",
      vocals: { heard: true, character: "breathy female lead, set back behind the pads" },
      instruments: [
        { name: "analog bass arpeggio", role: "bass", prominence: "lead" },
        { name: "gated reverb drums", role: "drums", prominence: "supporting" },
        { name: "poly synth pads", role: "chords", prominence: "supporting" },
        { name: "tape hiss", role: "texture", prominence: "background" },
      ],
      sections: [
        { name: "intro", startS: 0, endS: 14, says: "pads and arpeggio alone" },
        { name: "verse", startS: 14, endS: 52, says: "the vocal enters low in the mix" },
        { name: "chorus", startS: 52, endS: 84, says: "drums open up, the vocal stays back" },
        { name: "verse", startS: 84, endS: 118, says: "thinner, arpeggio forward" },
        { name: "chorus", startS: 118, endS: 152, says: "a lead synth doubles the tune" },
        { name: "outro", startS: 152, endS: 167, says: "pads fade on a held chord" },
      ],
    },
    listenUsd: 0.0062,
  },
};

/** A confirmed profile of two lines: one dislike, so the prompt card's exclude-from-taste has a chip. */
export const FIXTURE_TASTE: readonly StudioTasteLine[] = [
  { line: "heavy autotune", lean: "dislike", since: "2026-10-21T20:14:00Z" },
  { line: "analog synth bass", lean: "like", since: "2026-10-22T19:02:00Z" },
];
