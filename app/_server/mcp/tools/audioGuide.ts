import { z } from "zod";

import {
  INSTRUMENT_CATALOG,
  instrumentFitsRole,
  SCORE_KEYS,
  SCORE_MAX_TRACKS,
  SCORE_ROLE_COMPAT,
  SCORE_ROLES,
  scoreSpecSchema,
  STYLE_TEMPLATES,
} from "@gt/domain/audio.score";
import { FULL_BAND_SPEC, WORKED_SCORE_SPECS } from "@gt/domain/audio.score.templates";
import {
  STUDIO_ACTION_GOES,
  STUDIO_ACTION_KINDS,
  STUDIO_ACTION_SCHEMAS,
  STUDIO_MAX,
  STUDIO_NODE_KINDS,
  STUDIO_NODE_SCHEMAS,
  STUDIO_ROLES,
  STUDIO_TURN_VERSION,
  studioTurnEnvelopeSchema,
} from "@gt/domain/audio.studio";

import type { Obj } from "../op.ts";

// THE VOCABULARY AN OUTSIDE AGENT MAY EMIT, DERIVED (spark audio-agent-studio S2, `audio_guide`).
// Emitter-registry sync: every kind, role, cap and schema here is READ from the registry that holds a
// turn to its door (@gt/domain/audio.studio + audio.studio.door) and a score to its engine
// (@gt/domain/audio.score), never written beside it - so a node kind added to the registry is in the
// guide the moment it is in the door, and a guide cannot teach a shape the door refuses. The few
// sentences below are the door's cross-checks (what a schema cannot say), each naming the rule it states.

const schemaOf = (s: z.ZodType): Obj => {
  const { $schema: _drop, ...rest } = z.toJSONSchema(s, { io: "input", unrepresentable: "any" }) as Obj;
  return rest;
};

const mapOf = <K extends string, V>(keys: readonly K[], f: (k: K) => V): Record<K, V> => Object.fromEntries(keys.map((k) => [k, f(k)])) as Record<K, V>;

/** Pattern words the worked scores use, per role (an unknown word plays the role's default part). */
function patternsByRole(): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  for (const spec of [...WORKED_SCORE_SPECS, FULL_BAND_SPEC])
    for (const t of spec.tracks) if (t.pattern !== undefined) (out[t.role] ??= new Set()).add(t.pattern);
  return Object.fromEntries(Object.entries(out).map(([r, s]) => [r, [...s].sort()]));
}

/** What the door checks across pieces, which no one schema can say (audio.studio.door nodeFault / actionFault). */
const TURN_RULES = [
  `A turn is {v: ${STUDIO_TURN_VERSION}, id, seq, at, from: "agent", text, show?, actions?}; audio_turn fills v, from, at, seq and id when you leave them out.`,
  "Each piece in show is checked on its own: a broken one is dropped and named in the answer's dropped list, the rest still show.",
  `At most ${STUDIO_MAX.nodes} pieces and ${STUDIO_MAX.actions} actions; piece ids and action ids are unique within the turn.`,
  "An action that names a piece (play, hear, use_candidate, settle_pull, pick) must name one this turn shows; hear and use_candidate must name a candidate that piece offers.",
  "An action that names a stem (swap_stem, mute, solo, level, pan, play with stem) must name a stem row this turn shows.",
  "A stems row's enters has one flag per row of this turn's sections piece.",
  "Every audio href is a path on this server, starting with one / - copy them from the verbs' answers, never build one.",
  "Stems are pre-fader: give each stems row the levelDb and pan the verb answered for that stem, so the page plays what the mix holds.",
  "Actions whose goes is local change only what the page plays; goes agent sends the press back to you as the person's next message (its action field is the action id).",
  // The Suno advisor's rules (spark suno-advisor): what the person pastes into suno.com by hand, how a
  // revision names its lineage, and what may and may not be said about a take.
  "Show a suno_prompt when the person wants something to generate on suno.com, or a revision of one; they paste it by hand, and the studio never drives Suno.",
  "Every revision of a prompt names its parent promptId, lists its changes (field, was, now, why), and says because: the verdict it answers.",
  "Keep settings.variety at 0 unless the person asks for variety: above 0 lets Suno rewrite the style you wrote.",
  'To let the person hear a new direction before they spend Suno credits, sketch it with audio_render and show that track with answers {promptId, as: "sketch"}.',
  "Propose a taste row only from a preference the person's verdicts repeated; a line persists only when the person keeps it.",
  "A take's listened read is unconfirmed: never state it as fact, and where it disagrees with the measured tempo or key, the measured value stands.",
  "Never say you heard a take: speak about a take only from its facts in state.takes, and with no facts, ask how it sounded.",
];

const SCORE_RULES = [
  `1..${SCORE_MAX_TRACKS} tracks; a role may repeat only when every track of that role has an id (1..24 lower-case letters, digits, dashes). A track's id (else its role) is its stem id.`,
  "instrument must be a ready catalog instrument whose role fits the track's role (catalog[].fits).",
  "enters (optional) has one flag per section and at least one true; leave it out for a track that plays everywhere.",
  "gainDb -24..12 and pan -1..1 are mix-time: changing them re-renders no stem. notes, pattern and enters change that one stem only.",
  "Total bars across sections 2..64. Written notes stay inside the instrument's pitch range and, except on drums, inside the key's scale.",
];

/** The guide: built once, it never changes while the server runs. */
let built: Obj | null = null;
export function studioGuide(): Obj {
  if (built !== null) return built;
  built = {
    turn: { version: STUDIO_TURN_VERSION, envelope: schemaOf(studioTurnEnvelopeSchema), rules: TURN_RULES },
    nodes: { kinds: STUDIO_NODE_KINDS, schemas: mapOf(STUDIO_NODE_KINDS, (k) => schemaOf(STUDIO_NODE_SCHEMAS[k])) },
    actions: { kinds: STUDIO_ACTION_KINDS, goes: STUDIO_ACTION_GOES, schemas: mapOf(STUDIO_ACTION_KINDS, (k) => schemaOf(STUDIO_ACTION_SCHEMAS[k])) },
    roles: STUDIO_ROLES,
    max: STUDIO_MAX,
    score: {
      schema: schemaOf(scoreSpecSchema),
      rules: SCORE_RULES,
      maxTracks: SCORE_MAX_TRACKS,
      keys: SCORE_KEYS,
      styles: STYLE_TEMPLATES,
      roleTakes: SCORE_ROLE_COMPAT,
      patterns: patternsByRole(),
      patternNote: "pattern is a short word; an unknown one plays the role's default part",
      example: FULL_BAND_SPEC,
    },
    catalog: INSTRUMENT_CATALOG.map((i) => {
      const ready = i.audition.status === "ready" && i.audition.noteOnWorks && i.licence.trim() !== "";
      return {
        id: i.id,
        name: i.name,
        role: i.role,
        plain: i.plainLabel,
        character: i.character,
        pitchRange: i.pitchRange,
        ready,
        fits: SCORE_ROLES.filter((r) => instrumentFitsRole(i.role, r)),
        ...(ready ? {} : { refused: i.audition.refusalReason ?? "its audition failed" }),
      };
    }),
  };
  return built;
}
