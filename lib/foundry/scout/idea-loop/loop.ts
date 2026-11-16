// ONE PASS OF THE IDEA LOOP (stage 2): verdicts -> bar -> ideas -> scores -> the passing ones on disk, briefed.
// One JSON file per idea under IDEA_LOOP_STORE_DIR (else foundry-out/idea-loop); the storyboard door reads it back, so
// an idea only reaches the Board when its record says it cleared the bar.

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { outPath } from "../../../fixtures/roots";
import type { Night } from "../types";
import { ideaPrompt, parseIdeas, type GeneratedIdea, type IdeaSeat } from "./generate";
import { ideaVerdicts, scorerFrom, type IdeaBar } from "./score";

export const LOOP_IDEA_RE = /^il-\d{8}-\d{3}$/;

export type LoopIdea = GeneratedIdea & {
  readonly id: string;
  readonly at: string;
  /** The modelled chance the operator keeps this idea, 0..1. */
  readonly predictedKeep: number;
  readonly passed: boolean;
  readonly bar: IdeaBar;
};

export const loopRoot = (): string => process.env["IDEA_LOOP_STORE_DIR"]?.trim() || outPath("idea-loop");

/** The candidate's origin: `fromIdea` is free text on a storyboard candidate and this one names no kept night cell. */
export const loopRef = (id: string): string => `idea-loop/${id}`;

/** The idea `id`'s record, or null when there is none. */
export async function readLoopIdea(id: string): Promise<LoopIdea | null> {
  if (!LOOP_IDEA_RE.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(loopRoot(), `${id}.json`), "utf8")) as LoopIdea;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

async function nextNumber(root: string, stamp: string): Promise<number> {
  const taken = (await readdir(root)).filter((f) => f.startsWith(`il-${stamp}-`)).map((f) => Number(f.slice(12, 15)));
  return taken.reduce((a, b) => Math.max(a, b), 0) + 1;
}

export type LoopPass = { readonly bar: IdeaBar; readonly dropped: readonly string[]; readonly ideas: readonly LoopIdea[]; readonly passing: readonly LoopIdea[] };

/** One pass: `count` ideas asked of the seat at `panels` panels each, scored, recorded; the `top` best passes returned first. */
export async function runIdeaLoop(o: { readonly nights: readonly Night[]; readonly seat: IdeaSeat; readonly count: number; readonly panels: number; readonly top: number; readonly now: Date }): Promise<LoopPass> {
  const verdicts = ideaVerdicts(o.nights);
  const scorer = scorerFrom(verdicts);
  const { ideas: fresh, dropped } = parseIdeas(await o.seat(ideaPrompt(verdicts, o.count, o.panels)));
  const root = loopRoot();
  await mkdir(root, { recursive: true });
  const stamp = o.now.toISOString().slice(0, 10).replace(/-/g, "");
  let number = await nextNumber(root, stamp);
  const ideas: LoopIdea[] = [];
  for (const idea of fresh) {
    const words = { title: idea.title, text: [idea.paragraph, ...idea.bullets, ...idea.panels].join(" ") };
    const record: LoopIdea = { ...idea, id: `il-${stamp}-${String(number++).padStart(3, "0")}`, at: o.now.toISOString(), predictedKeep: Math.round(scorer.predictedKeep(words) * 1000) / 1000, passed: scorer.passes(words), bar: scorer.bar };
    const file = path.join(root, `${record.id}.json`);
    await writeFile(`${file}.tmp`, JSON.stringify(record, null, 2));
    await rename(`${file}.tmp`, file);
    ideas.push(record);
  }
  const passing = ideas.filter((i) => i.passed).sort((a, b) => b.predictedKeep - a.predictedKeep).slice(0, o.top);
  return { bar: scorer.bar, dropped, ideas, passing };
}

/** The brief `pipeline/scout.mts storyboard --draw codex` takes for a passing idea. */
export const briefOf = (i: LoopIdea): Record<string, unknown> => ({ fromLoop: i.id, title: i.title, paragraph: i.paragraph, bullets: i.bullets, panels: i.panels });
