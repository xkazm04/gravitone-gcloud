// THE IDEA GENERATOR (idea loop, stage 2): a seat writes video ideas against what the operator has kept and thrown.
// The seat is injected; this file is the brief it is given and the door its answer comes back through.

import { z } from "zod";

import { namesIn } from "../scene";
import { IDEA_PROMPT_MAX, IDEA_TITLE_MAX, STORYBOARD_BULLETS_MAX, STORYBOARD_BULLETS_MIN, STORYBOARD_BULLET_MAX, STORYBOARD_PANELS_MAX, STORYBOARD_PARAGRAPH_MAX } from "../types";
import type { IdeaVerdict } from "./score";

export type IdeaSeat = (prompt: string) => Promise<string>;

const line = (max: number) => z.string().trim().min(1).max(max).refine((s) => !/[\r\n]/.test(s));

const ideaSchema = z
  .object({
    title: line(IDEA_TITLE_MAX),
    paragraph: z.string().trim().min(1).max(STORYBOARD_PARAGRAPH_MAX),
    bullets: z.array(line(STORYBOARD_BULLET_MAX)).min(STORYBOARD_BULLETS_MIN).max(STORYBOARD_BULLETS_MAX),
    panels: z.array(z.string().trim().min(1).max(IDEA_PROMPT_MAX)).min(1).max(STORYBOARD_PANELS_MAX),
  })
  .strict();

export type GeneratedIdea = z.output<typeof ideaSchema>;

const MEMORY = 20;

const listed = (vs: readonly IdeaVerdict[], max: number): string =>
  vs.length === 0 ? "(none yet)" : vs.slice(-max).map((v) => `- ${v.title}${v.reasons.length === 0 ? "" : ` [${v.reasons.join(", ")}]`}`).join("\n");

export function ideaPrompt(verdicts: readonly IdeaVerdict[], count: number, panels: number): string {
  return [
    `Write ${count} original short-video ideas. The test of an idea is whether this operator will keep it when triaging storyboards; nothing else counts.`,
    "",
    "Ideas the operator kept:",
    listed(verdicts.filter((v) => v.verdict === "keep"), MEMORY),
    "",
    "Ideas the operator threw (with reasons):",
    listed(verdicts.filter((v) => v.verdict === "reject"), MEMORY),
    "",
    "Rules:",
    "- Every idea is original: no existing film, game, show, character, person, studio or franchise.",
    `- Each idea has exactly ${panels} panels, one image prompt each, drawn in order as a rough storyboard.`,
    "- Panel prompts are visual description in plain lower-case sentences. No proper names and no capital letters mid-sentence.",
    `- title at most ${IDEA_TITLE_MAX} characters; paragraph at most ${STORYBOARD_PARAGRAPH_MAX}; ${STORYBOARD_BULLETS_MIN}-${STORYBOARD_BULLETS_MAX} bullets (beats, length, audience, look, hook), each one line of at most ${STORYBOARD_BULLET_MAX}.`,
    "",
    "Do not use any tool. Reply with only a JSON array of objects {title, paragraph, bullets, panels}.",
  ].join("\n");
}

/** The ideas in a seat's answer that pass the door, and why each other one did not. */
export function parseIdeas(answer: string): { readonly ideas: GeneratedIdea[]; readonly dropped: string[] } {
  const start = answer.indexOf("[");
  const end = answer.lastIndexOf("]");
  let raw: unknown;
  try {
    raw = start >= 0 && end > start ? JSON.parse(answer.slice(start, end + 1)) : undefined;
  } catch {
    raw = undefined;
  }
  if (!Array.isArray(raw)) return { ideas: [], dropped: [`the answer held no JSON array: ${answer.slice(0, 160)}`] };
  const ideas: GeneratedIdea[] = [];
  const dropped: string[] = [];
  raw.forEach((item: unknown, i) => {
    const r = ideaSchema.safeParse(item);
    if (!r.success) {
      dropped.push(`idea ${i + 1}: ${r.error.issues[0]?.path.join(".") ?? ""} ${r.error.issues[0]?.message ?? ""}`.trim());
      return;
    }
    const names = namesIn(r.data.panels, [], []);
    if (names.length > 0) dropped.push(`idea ${i + 1}: the panels name ${names.join(", ")}`);
    else ideas.push(r.data);
  });
  return { ideas, dropped };
}
