// SUNO PROPOSE — a lane in, N Suno prompts out; or one prompt in, N riffs out.
// Server-only: one lib/text turn per call, exactly as lib/sound/hunt.ts drafts
// a map (reason() with a JSON schema, the prompt read from a file in pipeline/
// through hunt.ts's own promptFile, its slots filled by hunt.ts's one fill).
//
// THE PROMPT IS A FILE: pipeline/SUNO-PROPOSE-PROMPT.md, sectioned `shared` +
// `propose` | `riff`, read per call. A prompt is code; it lives in pipeline/.
//
// THE TURN CLASS: "suno-propose" for a lane draft, "suno-riff" for variations
// on one proposal (lib/text/types.ts). SUNO_TURN picks between them.
//
// WHAT THE MODEL MAY DECIDE: the words. What it may not: the lengths (Suno's
// form limits are enforced in parseFields), the count (clamped), the lane
// (the caller's), and the origin (set here).

import { reason as routerReason } from "@/lib/text/router";
import type { TextRequest, TextResult, TurnClass } from "@/lib/text/types";
import type { SunoLane, SunoProposal } from "@/lib/suno/types";

import { fill, promptFile } from "../hunt";
import { safeId, SoundError } from "../store";
import { addProposals, INSTRUMENTAL, parseFields, readSuno, STYLE_MAX, TITLE_MAX, type NewProposal } from "./store";

export type ReasonFn = (req: TextRequest) => Promise<TextResult>;

/** propose / riff. See the header. */
export const SUNO_TURN: Record<"propose" | "riff", TurnClass> = { propose: "suno-propose", riff: "suno-riff" };

export const PROPOSE_MAX = 8;
const EXAMPLES_MAX = 8;

export const PROPOSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["proposals"],
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "style", "note"],
        properties: {
          title: { type: "string" },
          style: { type: "string" },
          lyrics: { type: "string" },
          exclude: { type: "string" },
          note: { type: "string" },
        },
      },
    },
  },
};

async function promptSections(): Promise<Record<string, string>> {
  const s = await promptFile("SUNO-PROPOSE-PROMPT.md");
  if (!s.propose || !s.riff) throw new SoundError('SUNO-PROPOSE-PROMPT.md needs "shared", "propose" and "riff" sections', 500);
  return s;
}

const fieldsText = (p: Pick<SunoProposal, "fields">) =>
  [
    p.fields.title ? `title: ${p.fields.title}` : null,
    `style: ${p.fields.style}`,
    p.fields.lyrics ? `lyrics: ${p.fields.lyrics.length > 200 ? `${p.fields.lyrics.slice(0, 200)}…` : p.fields.lyrics}` : null,
    p.fields.exclude ? `exclude: ${p.fields.exclude}` : null,
  ]
    .filter(Boolean)
    .join("\n");

/** The whole prompt. Pure over its inputs, so a probe reads what would be sent. */
export function proposePrompt(
  sections: Record<string, string>,
  lane: SunoLane,
  count: number,
  examples: readonly string[],
  source: Pick<SunoProposal, "fields"> | null,
): string {
  const slots = {
    LANE_AXIS: lane.axis,
    LANE_VALUE: lane.value,
    COUNT: String(count),
    EXAMPLES: examples.length ? examples.map((e) => `- ${e}`).join("\n") : "(none yet)",
    SOURCE: source ? fieldsText(source) : "",
    STYLE_MAX: String(STYLE_MAX),
    TITLE_MAX: String(TITLE_MAX),
  };
  return [fill(sections.shared, slots), fill(source ? sections.riff : sections.propose, slots)].join("\n\n");
}

/** What the model answered, held to the form's limits. A row with no style is
 *  dropped; nothing left is the engine failing the turn (502), not an empty lane. */
export function parseProposals(json: unknown, count: number): { fields: NewProposal["fields"]; note?: string }[] {
  const rows = (json as { proposals?: unknown } | null)?.proposals;
  if (!Array.isArray(rows)) throw new SoundError("the text engine's answer had no proposals list", 502);
  const out: { fields: NewProposal["fields"]; note?: string }[] = [];
  for (const r of rows) {
    if (out.length >= count) break;
    try {
      const fields = parseFields(r);
      const note = typeof (r as { note?: unknown }).note === "string" ? (r as { note: string }).note.trim().slice(0, 200) : "";
      out.push(note ? { fields, note } : { fields });
    } catch {
      // a row with no style is a drafter's slip, not a prompt
    }
  }
  if (!out.length) throw new SoundError("the text engine wrote no usable Suno prompt", 502);
  return out;
}

const sameLane = (a: SunoLane, b: SunoLane) => a.axis === b.axis && a.value === b.value;

/** The lane's own prompts, newest first, then its job styles (a job outlives a deleted proposal):
 *  what is already written there, so a turn varies from it. One rule for the lane draft and the sentence. */
function laneExamples(f: Awaited<ReturnType<typeof readSuno>>, lane: SunoLane): string[] {
  const proposed = f.proposals.filter((p) => sameLane(p.lane, lane)).reverse().map((p) => p.fields.style);
  const jobStyles = f.jobs.filter((j) => sameLane(j.lane, lane)).map((j) => j.fields.style);
  return [...new Set([...proposed, ...jobStyles])].slice(0, EXAMPLES_MAX);
}

/* ── one prompt from a sentence (L52) ─────────────────────────────────────── */
//
// The Floor's audio composer launches from a SENTENCE ("A bed that holds a full minute…"), and
// until Phase 5 its confirm was refused: a Suno take launched only from a proposal already in
// the queue, and nothing turned a sentence into one. This is that turn: the same file, the same
// schema and the same form limits as `proposeSuno`, its own `sentence` section, ONE prompt. The
// lane it lands in is the caller's (the Floor names none: ungrouped), and so is the decision to
// spend the turn at all - a dry launch never calls this (lib/sound/suno/draft.ts stands in).

//
// A PREPARED SONG (spark scout-vision): a scout music seed comes with its facets - genre and subgenre, mood,
// instruments, tempo, vocals - and they ride beside the sentence as the prompt file's `facets` section, the layered
// style the turn writes from (registry music-prompt-composition: sonic-style-vocabulary, one layer per axis and
// the vocals fenced on both sides; duration-and-tempo-locking, tempo as bpm). No facets: the slot is empty and the
// prompt is the Floor's as it always was.

/** A prepared song beside a sentence. `vocals` is a scout seed's (types.ts SEED_VOCALS); an unknown word reads as a lead voice. */
export type SunoFacets = {
  readonly genre: string;
  readonly subgenre: string;
  readonly mood: string;
  readonly instruments: readonly string[];
  readonly tempo: number;
  readonly vocals: string;
};

/** The vocals, said on both sides: the `style` words, what `lyrics` holds, the `exclude` words. */
export function vocalsOf(vocals: string): { readonly style: string; readonly lyrics: string; readonly exclude: string } {
  if (vocals === "instrumental") return { style: "instrumental", lyrics: `"${INSTRUMENTAL}"`, exclude: "vocals, singing" };
  if (vocals === "female") return { style: "female vocals", lyrics: "short lyrics for a female lead", exclude: "male vocals" };
  if (vocals === "male") return { style: "male vocals", lyrics: "short lyrics for a male lead", exclude: "female vocals" };
  if (vocals === "duet") return { style: "male and female duet vocals", lyrics: "short lyrics for two voices", exclude: "instrumental" };
  if (vocals === "choir") return { style: "choir vocals", lyrics: "short lyrics for a choir", exclude: "instrumental" };
  return { style: `${vocals} vocals`, lyrics: `short lyrics for ${vocals} vocals`, exclude: "instrumental" };
}

/** The `facets` section filled, as the {{FACETS}} slot carries it (a blank line first); "" with no facets. */
export function facetsBlock(sections: Record<string, string>, facets: SunoFacets | undefined): string {
  if (facets === undefined) return "";
  if (!sections.facets) throw new SoundError('SUNO-PROPOSE-PROMPT.md needs a "facets" section for a sentence with a prepared song', 500);
  const v = vocalsOf(facets.vocals);
  const slots = {
    GENRE: `${facets.genre}, ${facets.subgenre}`,
    MOOD: facets.mood,
    INSTRUMENTS: facets.instruments.join(", "),
    TEMPO: String(facets.tempo),
    VOCALS_STYLE: v.style,
    VOCALS_LYRICS: v.lyrics,
    VOCALS_EXCLUDE: v.exclude,
  };
  return ["", "", fill(sections.facets, slots)].join("\n");
}

/** The prompt a sentence sends (with a prepared song's facets, when it has them). Pure over its inputs, so a probe reads what would be sent. */
export function sentencePrompt(sections: Record<string, string>, sentence: string, lane: SunoLane, examples: readonly string[], facets?: SunoFacets): string {
  if (!sections.sentence) throw new SoundError('SUNO-PROPOSE-PROMPT.md needs a "sentence" section for a Floor launch', 500);
  const slots = {
    LANE_AXIS: lane.axis,
    LANE_VALUE: lane.value,
    COUNT: "1",
    EXAMPLES: examples.length ? examples.map((e) => `- ${e}`).join("\n") : "(none yet)",
    SENTENCE: sentence.trim(),
    FACETS: facetsBlock(sections, facets),
    STYLE_MAX: String(STYLE_MAX),
    TITLE_MAX: String(TITLE_MAX),
  };
  return [fill(sections.shared, slots), fill(sections.sentence, slots)].join("\n\n");
}

/** One Suno prompt drafted from a sentence (and a prepared song's facets): a text turn (`suno-propose`), held to the form. */
export async function proposeFromSentence(sentence: string, lane: SunoLane, reason: ReasonFn = routerReason, facets?: SunoFacets): Promise<{ fields: NewProposal["fields"]; note?: string }> {
  if (!sentence.trim()) throw new SoundError("a Suno prompt needs a first sentence", 400);
  const f = await readSuno();
  const examples = laneExamples(f, lane);
  const out = await reason({ turn: SUNO_TURN.propose, prompt: sentencePrompt(await promptSections(), sentence, lane, examples, facets), schema: PROPOSE_SCHEMA });
  const [first] = parseProposals(out.json, 1);
  if (first === undefined) throw new SoundError("the text engine wrote no usable Suno prompt", 502);
  return first;
}

export async function proposeSuno(
  input: { lane: SunoLane; count: number; riffOf?: string },
  reason: ReasonFn = routerReason,
): Promise<SunoProposal[]> {
  const count = Math.max(1, Math.min(PROPOSE_MAX, Math.round(Number.isFinite(input.count) ? input.count : 0) || 0));
  const f = await readSuno();
  let source: SunoProposal | null = null;
  if (input.riffOf) {
    safeId(input.riffOf);
    source = f.proposals.find((p) => p.id === input.riffOf) ?? null;
    if (!source) throw new SoundError(`no Suno proposal ${input.riffOf}`, 404);
  }
  const lane = source ? source.lane : input.lane;
  // Examples: the lane's own prompts, newest first - what is already written
  // there, so the model varies from it instead of repeating it.
  const examples = laneExamples(f, lane);
  const sections = await promptSections();
  const out = await reason({ turn: SUNO_TURN[source ? "riff" : "propose"], prompt: proposePrompt(sections, lane, count, examples, source), schema: PROPOSE_SCHEMA });
  const rows = parseProposals(out.json, count);
  return addProposals(
    rows.map((r) => ({
      fields: r.fields,
      lane,
      origin: source ? "riff" : "llm",
      ...(source ? { sourceId: source.id } : {}),
      ...(r.note ? { note: r.note } : {}),
    })),
  );
}
