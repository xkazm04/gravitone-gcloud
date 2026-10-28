import { z } from "zod";

import { COST_SOURCES } from "./event.ts";
import { audioIntentSchema } from "./audio.intent.schema.ts";
import { STUDIO_MAX, STUDIO_ROLES, STUDIO_TURN_VERSION, type StudioActionKind, type StudioNodeKind } from "./audio.studio.kinds.ts";

// THE AUDIO STUDIO'S TURN - the closed contract between the agent that drives the studio from outside
// (Athena or Claude Code through the MCP door; spark audio-agent-studio) and the page that renders it.
// The registry's schema-driven-ui path holds: a turn DESCRIBES what to show and PROPOSES what to do
// next, from a closed vocabulary of node kinds and action kinds; the page realizes each node from
// blessed @gt/ui components and never executes anything by rendering it. The door that reads a turn
// is ./audio.studio.door.ts (salvage + disclosure); this module only names the shapes.
//
// Absent-value convention: an optional field is OMITTED, never null. A node's `source` omitted means
// a real render; "illustrative" marks a shape the engine cannot make yet (stage S1 scripts the v2
// arrangement - 8 stems, per-section entry - over the v1 engine's 4-stem audio).

export * from "./audio.studio.kinds.ts";

const id = z.string().regex(/^[a-z0-9][a-z0-9_.:-]{0,63}$/, "an id is lower-case letters, digits and _ . : - (max 64)");
const label = z.string().trim().min(1).max(80);
const line = z.string().trim().min(1).max(160);

/** Audio the page may play: a path on THIS server only (no scheme, no host) - a turn cannot point the page at the internet. */
export const studioAudioSchema = z.strictObject({
  href: z.string().max(500).regex(/^\/(?!\/)[^\s]*$/, "an audio href is a path on this server, starting with one /"),
  durationS: z.number().positive().max(3600).optional(),
});
export type StudioAudio = z.output<typeof studioAudioSchema>;

const nodeBase = { id, title: label.optional(), source: z.enum(COST_SOURCES).optional() };

export const studioStemSchema = z.strictObject({
  id,
  role: z.enum(STUDIO_ROLES),
  /** What a non-musician hears in it, in plain words ("warm round bass"). */
  label,
  instrument: z.strictObject({ id: z.string().min(1).max(120), name: label }).optional(),
  audio: studioAudioSchema.optional(),
  muted: z.boolean().optional(),
  solo: z.boolean().optional(),
  levelDb: z.number().min(-60).max(12).optional(),
  pan: z.number().min(-1).max(1).optional(),
  /** Per section, by index into the turn's `sections` node: does this stem play there. Omitted = everywhere. */
  enters: z.array(z.boolean()).min(1).max(STUDIO_MAX.sections).optional(),
});
export type StudioStem = z.output<typeof studioStemSchema>;

export const studioSectionSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
  bars: z.number().int().min(1).max(64),
  energy: z.number().min(0).max(1),
  startS: z.number().min(0).optional(),
  endS: z.number().positive().optional(),
});
export type StudioSection = z.output<typeof studioSectionSchema>;

export const studioCandidateSchema = z.strictObject({
  id: z.string().min(1).max(120),
  name: label,
  /** Up to four plain timbre words ("woody", "round"). */
  words: z.array(z.string().trim().min(1).max(30)).max(4),
  alone: studioAudioSchema.optional(),
  inMix: studioAudioSchema.optional(),
  /** One measured fact, in words ("in tune to 2 cents"). */
  measured: line.optional(),
});
export type StudioCandidate = z.output<typeof studioCandidateSchema>;

const sideSchema = z.strictObject({ label, says: line, audio: studioAudioSchema.optional(), settle: line });

export const STUDIO_NODE_SCHEMAS = {
  track: z.strictObject({
    ...nodeBase, kind: z.literal("track"), takeId: z.string().min(1).max(120).optional(), mix: studioAudioSchema,
    bpm: z.number().min(20).max(400).optional(), key: z.string().min(1).max(40).optional(), lengthS: z.number().positive().max(3600).optional(),
  }),
  stems: z.strictObject({ ...nodeBase, kind: z.literal("stems"), takeId: z.string().min(1).max(120).optional(), rows: z.array(studioStemSchema).min(1).max(STUDIO_MAX.stems) }),
  sections: z.strictObject({ ...nodeBase, kind: z.literal("sections"), rows: z.array(studioSectionSchema).min(1).max(STUDIO_MAX.sections) }),
  candidates: z.strictObject({
    ...nodeBase, kind: z.literal("candidates"),
    /** The stem these would replace (a stem id), or a role to add. */
    for: z.union([z.strictObject({ stem: id }), z.strictObject({ role: z.enum(STUDIO_ROLES) })]),
    prompt: line.optional(),
    rows: z.array(studioCandidateSchema).min(1).max(STUDIO_MAX.candidates),
  }),
  heard: z.strictObject({
    ...nodeBase, kind: z.literal("heard"), sentence: z.string().trim().min(1).max(1000),
    links: z.array(z.strictObject({ words: z.string().min(1).max(120), to: label, field: z.enum(["mood", "genre", "instrument", "tempo", "key", "length", "energy", "avoid", "section"]).optional() })).max(STUDIO_MAX.links),
    unheard: z.array(z.string().min(1).max(60)).max(12).optional(),
  }),
  pull: z.strictObject({ ...nodeBase, kind: z.literal("pull"), question: line, sides: z.tuple([sideSchema, sideSchema]) }),
  duel: z.strictObject({
    ...nodeBase, kind: z.literal("duel"), question: line,
    a: z.strictObject({ label, audio: studioAudioSchema, takeId: z.string().min(1).max(120).optional() }),
    b: z.strictObject({ label, audio: studioAudioSchema, takeId: z.string().min(1).max(120).optional() }),
  }),
  measures: z.strictObject({
    ...nodeBase, kind: z.literal("measures"), takeId: z.string().min(1).max(120).optional(),
    rows: z.array(z.strictObject({ label: z.string().trim().min(1).max(40), value: z.string().trim().min(1).max(60), tone: z.enum(["ok", "warn", "bad"]).optional() })).min(1).max(STUDIO_MAX.measures),
  }),
} as const satisfies Record<StudioNodeKind, z.ZodType>;

export type StudioNodeOf<K extends StudioNodeKind> = z.output<(typeof STUDIO_NODE_SCHEMAS)[K]>;
export type StudioNode = { [K in StudioNodeKind]: StudioNodeOf<K> }[StudioNodeKind];

const actionBase = { id, label: z.string().trim().min(1).max(60), why: line.optional() };
const stem = id;

export const STUDIO_ACTION_SCHEMAS = {
  play: z.strictObject({ ...actionBase, kind: z.literal("play"), node: id, stem: stem.optional() }),
  hear: z.strictObject({ ...actionBase, kind: z.literal("hear"), node: id, candidate: z.string().min(1).max(120), mode: z.enum(["alone", "in_mix"]) }),
  use_candidate: z.strictObject({ ...actionBase, kind: z.literal("use_candidate"), node: id, candidate: z.string().min(1).max(120) }),
  swap_stem: z.strictObject({ ...actionBase, kind: z.literal("swap_stem"), stem, instrumentId: z.string().min(1).max(120) }),
  mute: z.strictObject({ ...actionBase, kind: z.literal("mute"), stem, on: z.boolean() }),
  solo: z.strictObject({ ...actionBase, kind: z.literal("solo"), stem, on: z.boolean() }),
  level: z.strictObject({ ...actionBase, kind: z.literal("level"), stem, db: z.number().min(-60).max(12) }),
  pan: z.strictObject({ ...actionBase, kind: z.literal("pan"), stem, pan: z.number().min(-1).max(1) }),
  settle_pull: z.strictObject({ ...actionBase, kind: z.literal("settle_pull"), node: id, side: z.union([z.literal(0), z.literal(1)]) }),
  pick: z.strictObject({ ...actionBase, kind: z.literal("pick"), node: id, side: z.enum(["a", "b"]) }),
  render: z.strictObject({ ...actionBase, kind: z.literal("render") }),
  say: z.strictObject({ ...actionBase, kind: z.literal("say"), text: z.string().trim().min(1).max(400) }),
} as const satisfies Record<StudioActionKind, z.ZodType>;

export type StudioActionOf<K extends StudioActionKind> = z.output<(typeof STUDIO_ACTION_SCHEMAS)[K]>;
export type StudioAction = { [K in StudioActionKind]: StudioActionOf<K> }[StudioActionKind];

/** The turn's envelope. `show` and `actions` arrive as raw arrays: the door validates each item on its
 *  own so one bad node never costs the others (./audio.studio.door.ts). */
export const studioTurnEnvelopeSchema = z.strictObject({
  v: z.literal(STUDIO_TURN_VERSION),
  id,
  seq: z.number().int().min(0),
  at: z.string().min(10).max(40),
  from: z.enum(["user", "agent"]),
  /** The agent's reply in words (the dock shows the last one), or what the user typed. */
  text: z.string().trim().min(1).max(2000),
  /** The user turn a proposal produced: the action id pressed. */
  action: id.optional(),
  /** The track document's vague layer (e4's intent), when this turn changed it. */
  intent: audioIntentSchema.optional(),
  show: z.array(z.unknown()).max(STUDIO_MAX.nodes * 2).optional(),
  actions: z.array(z.unknown()).max(STUDIO_MAX.actions * 2).optional(),
});

export type StudioTurn = Omit<z.output<typeof studioTurnEnvelopeSchema>, "show" | "actions"> & {
  readonly show: readonly StudioNode[];
  readonly actions: readonly StudioAction[];
};

/** One item the door could not render, said in words: where it was, what it claimed to be, why it went. */
export type StudioDropped = { readonly at: string; readonly kind: string; readonly reason: string };

/** A scripted or recorded conversation: the fixture side of the studio's turn port. */
export type StudioSession = { readonly id: string; readonly title: string; readonly turns: readonly StudioTurn[] };
