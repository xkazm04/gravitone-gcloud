// THE CANVAS'S TABLES - every state, level, blocking kind, verdict, audio step, decideAudio choice and note stance the
// scout canvas draws or acts on, declared ONCE (port of the round-2 winner's core.js, contest scout-canvas-v2-r2 A/1,
// "Watershed · Weirs"). The renderer, the sheet, the desk and the gallery read these; none re-types a state's colour,
// word or order. Colours are token NAMES (tokens.ts resolves them), never literals.
//
// The map is one continent: seed highlands in the west, the publishing coast in the east, the release calendar as
// the sea lane beyond each port. A WEIR is a point that waits on the operator; clicking one opens what clears it.

/** A signal or ground token by name, as `--<name>` in @gt/ui/tokens.css. */
export type Tone = "ink" | "ink-1" | "ink-2" | "ink-3" | "ink-4" | "ink-bright" | "text" | "muted" | "faint" | "cyan" | "amber" | "emerald" | "rose" | "violet" | "wall" | "wall-hi" | "illustrative-text" | "reading" | "note-text" | "hair" | "hair-2" | "hair-3";

export const STAGES = ["seed", "derived", "idea", "board", "run", "output"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_NAME: Readonly<Record<Stage, string>> = { seed: "Seed", derived: "Derived seed", idea: "Idea", board: "Storyboard", run: "Run", output: "Output" };

/** An item's state: a node's verdict (scoutGraph GraphState), an episode's (channel EpisodeState), or the steer's pause. */
export const ITEM_STATES = ["kept", "pending", "open", "made", "outline-kept", "in-production", "failed", "rejected", "thrown", "paused"] as const;
export type ItemState = (typeof ITEM_STATES)[number];

export type StateRow = {
  /** Its signal colour. */
  readonly tone: Tone;
  /** Its word on the screen. */
  readonly word: string;
  /** Sort order inside a night's street. */
  readonly ord: number;
  /** Counts as live water (open, pending, kept work). */
  readonly live: boolean;
  /** The operator's move is next (a verdict). */
  readonly waits: boolean;
  /** Drawn as a ring, not a filled lot. */
  readonly hollow: boolean;
};

const row = (tone: Tone, word: string, ord: number, o: { live?: boolean; waits?: boolean; hollow?: boolean } = {}): StateRow => ({ tone, word, ord, live: o.live === true, waits: o.waits === true, hollow: o.hollow === true });

/** A state is a verdict, never inferred. */
export const STATE: Readonly<Record<ItemState, StateRow>> = {
  kept: row("emerald", "kept", 0, { live: true }),
  pending: row("cyan", "rendering", 1, { live: true }),
  made: row("amber", "made", 1, { live: true, waits: true }),
  open: row("amber", "undecided", 2, { live: true, waits: true }),
  "outline-kept": row("violet", "outlined", 2, { live: true }),
  // An episode a night has taken but not finished (channel EpisodeState); the prototype's data held none.
  "in-production": row("cyan", "in production", 1, { live: true }),
  failed: row("rose", "failed", 3),
  rejected: row("rose", "rejected", 4, { hollow: true }),
  thrown: row("rose", "thrown", 4, { hollow: true }),
  paused: row("faint", "paused", 5),
};

export const isItemState = (s: string): s is ItemState => (ITEM_STATES as readonly string[]).includes(s);

/** Zoom levels: four vocabularies. `from` is the zoom where the level begins, `z` where a jump lands. */
export const LEVELS = [
  { key: "continent", name: "Continent", from: 0, z: null },
  { key: "basin", name: "Basin", from: 0.45, z: 0.62 },
  { key: "town", name: "Town", from: 1.5, z: 2.2 },
  { key: "street", name: "Street", from: 4, z: 5.2 },
] as const;
export type LevelIx = 0 | 1 | 2 | 3;
export const MAX_ZOOM = 10;
export function levelOf(z: number): LevelIx {
  let at: LevelIx = 0;
  LEVELS.forEach((l, i) => {
    if (z >= l.from) at = i as LevelIx;
  });
  return at;
}

/** A glyph by name (glyphs.ts holds the path data). */
export type GlyphName = "eye" | "seed" | "mute" | "cal" | "flag" | "x" | "loc" | "moon" | "pause" | "play" | "undo" | "check" | "keys" | "next" | "prev";

/** What waits on the operator. `tool` is the surface that clears it. */
export const BLOCK_KINDS = ["verdict", "seeds", "audio", "slot"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const BLOCK: Readonly<Record<BlockKind, { readonly name: string; readonly one: string; readonly glyph: GlyphName; readonly tool: "gallery" | "audio" }>> = {
  verdict: { name: "Verdicts", one: "verdict", glyph: "eye", tool: "gallery" },
  seeds: { name: "Seeds", one: "seed", glyph: "seed", tool: "gallery" },
  audio: { name: "Silent", one: "silent reel", glyph: "mute", tool: "audio" },
  slot: { name: "To schedule", one: "cut to slot", glyph: "cal", tool: "audio" },
};
export type BlockCounts = Record<BlockKind, number> & { n: number };
export const zeroBlocks = (): BlockCounts => ({ verdict: 0, seeds: 0, audio: 0, slot: 0, n: 0 });

/** A verdict (the Board's keep / reject). `to` is the node's state after it, `ep` an episode's. */
export const VERDICTS = ["keep", "reject"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const VERDICT: Readonly<Record<Verdict, { readonly name: string; readonly to: ItemState; readonly ep: ItemState; readonly tone: Tone }>> = {
  keep: { name: "Keep", to: "kept", ep: "kept", tone: "emerald" },
  reject: { name: "Reject", to: "rejected", ep: "thrown", tone: "rose" },
};

/** The Board's reasons, at most 11 of at most 64 characters each (board/_port/verdict.ts). */
export const REASONS = ["off-brief", "weak hook", "unreadable numbers", "wrong look for the channel", "face drift", "keep for the channel"] as const;

/** Who acts at a step: the actor colours (tokens actor-*). */
export type Actor = "agent" | "operator" | "machine";

/**
 * A kept reel's road to the calendar. `step` on a reel counts how many of these are done. `planned`: the backend step
 * does not exist yet (docs/scout-canvas-port.md, Phase 4). `ms`: how long the screen plays a step out (motion only).
 */
export const CHAIN = [
  { key: "brief", name: "Brief", who: "agent", vendor: "LLM audio brief", cost: "seat · $0", ms: 450, planned: true },
  { key: "decide", name: "Decide", who: "operator", vendor: "decideAudio", cost: "$0", ms: 0, planned: false },
  { key: "generate", name: "Generate", who: "machine", vendor: "ElevenLabs · Suno", cost: "ElevenLabs credits", ms: 2600, planned: false },
  { key: "cut", name: "Cut", who: "machine", vendor: "production cut · ffmpeg lay", cost: "$0 · CPU", ms: 1500, planned: true },
  { key: "slot", name: "Slot", who: "operator", vendor: "calendar.schedule → publish tick", cost: "$0", ms: 500, planned: true },
] as const satisfies readonly { key: string; name: string; who: Actor; vendor: string; cost: string; ms: number; planned: boolean }[];
export type ChainKey = (typeof CHAIN)[number]["key"];
export const CHAIN_DONE = CHAIN.length;
export const chainIx = (k: ChainKey): number => CHAIN.findIndex((s) => s.key === k);

/** decideAudio(voice, music, sound): the real choices (lib/producers/productionAudio.ts) and the producer each calls. */
export type DecideKey = "voice" | "music" | "sound";
export type DecideOpt = { readonly key: string; readonly vendor?: string; readonly cost?: string; readonly paused?: true };
export const DECIDE: Readonly<Record<DecideKey, { readonly name: string; readonly opts: readonly DecideOpt[] }>> = {
  voice: { name: "Voice", opts: [{ key: "dub", vendor: "ElevenLabs speak", cost: "ElevenLabs credits" }, { key: "ref-audio", vendor: "ElevenLabs speak", cost: "ElevenLabs credits" }, { key: "none" }] },
  music: { name: "Music", opts: [{ key: "score", vendor: "ElevenLabs music", cost: "ElevenLabs credits" }, { key: "track", vendor: "Suno v6 · by hand", cost: "Suno credits", paused: true }, { key: "none" }] },
  sound: { name: "Sound", opts: [{ key: "sfx", vendor: "ElevenLabs generateSfx", cost: "ElevenLabs credits" }, { key: "none" }] },
};
export type Decision = Readonly<Record<DecideKey, string>>;

/** A scouting note's stance: how to approach ideas there next time. */
export const STANCES = [
  { key: "more", name: "more", glyph: "▲" },
  { key: "turn", name: "new angle", glyph: "↻" },
  { key: "less", name: "fewer", glyph: "▼" },
  { key: "stop", name: "stop", glyph: "■" },
] as const;
export type Stance = (typeof STANCES)[number]["key"] | "";

/** Where a note is pinned on the map. */
export const ANCHOR_KINDS = ["basin", "audience", "channels", "channel", "genre", "nights", "stage", "node"] as const;
export type AnchorKind = (typeof ANCHOR_KINDS)[number];

/** The release calendar: slots land from tomorrow, at the channel's hour, every `cadence` days. */
export const CALENDAR = { days: 21, time: "17:00", cadences: [1, 2, 3, 7] } as const;

/** The map's lenses: a legend row isolates what it names. */
export type Lens = ItemState | "night" | "waits" | "dead" | null;
