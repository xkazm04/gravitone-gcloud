// SUNO PROPOSE — a lane in, N Suno prompts out; or one prompt in, N riffs out.
// Server-only: one lib/text turn per call, exactly as lib/sound/hunt.ts drafts
// a map (reason() with a JSON schema, the prompt read from a file in pipeline/).
//
// THE PROMPT IS A FILE: pipeline/SUNO-PROPOSE-PROMPT.md, sectioned `shared` +
// `propose` | `riff`, read per call. A prompt is code; it lives in pipeline/.
//
// THE TURN CLASS. The brief names two turns, "suno-propose" and "suno-riff".
// lib/text/types.ts TurnClass is a CLOSED union and adding a member touches the
// router's two plans, its ceiling table, the Google model table, the
// text-ladder probe and .ai/use-cases.json - none of them this package's files.
// Until those land, both calls run as "sound-hunt": the same plan, the same
// 300 s ceiling and the same size of answer (a few schema-shaped prompts), so
// the spend lands on the sound line it belongs to. SUNO_TURN is the one place
// to change when the classes exist.
//
// WHAT THE MODEL MAY DECIDE: the words. What it may not: the lengths (Suno's
// form limits are enforced in parseFields), the count (clamped), the lane
// (the caller's), and the origin (set here).

import { readFile } from "node:fs/promises";
import path from "node:path";

import { reason as routerReason } from "@/lib/text/router";
import type { TextRequest, TextResult, TurnClass } from "@/lib/text/types";
import type { SunoLane, SunoProposal } from "@/lib/suno/types";

import { sectionsOf } from "../hunt";
import { safeId, SoundError } from "../store";
import { addProposals, parseFields, readSuno, STYLE_MAX, TITLE_MAX, type NewProposal } from "./store";

export type ReasonFn = (req: TextRequest) => Promise<TextResult>;

/** propose / riff. See the header: "suno-propose" / "suno-riff" once TurnClass has them. */
export const SUNO_TURN: Record<"propose" | "riff", TurnClass> = { propose: "sound-hunt", riff: "sound-hunt" };

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
  const at = path.join(process.cwd(), "pipeline", "SUNO-PROPOSE-PROMPT.md");
  let md: string;
  try {
    md = await readFile(at, "utf8");
  } catch {
    throw new SoundError(`the prompt file ${path.relative(process.cwd(), at)} is missing — it is part of the code`, 500);
  }
  const s = sectionsOf(md);
  if (!s.shared || !s.propose || !s.riff) throw new SoundError('SUNO-PROPOSE-PROMPT.md needs "shared", "propose" and "riff" sections', 500);
  return s;
}

const fill = (tpl: string, slots: Record<string, string>) => tpl.replace(/\{\{([A-Z_]+)\}\}/g, (all, k: string) => (k in slots ? slots[k] : all));

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
  const jobStyles = f.jobs.filter((j) => sameLane(j.lane, lane)).map((j) => j.fields.style);
  const examples = [...new Set([...f.proposals.filter((p) => sameLane(p.lane, lane)).reverse().map((p) => p.fields.style), ...jobStyles])].slice(0, EXAMPLES_MAX);
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
