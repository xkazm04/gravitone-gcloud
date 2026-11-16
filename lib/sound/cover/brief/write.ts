import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { COVER_SECTION_MAX_S, COVER_SECTION_MIN_S, COVER_STYLE_MAX } from "@gt/domain/cover";
import { err, ok, type Result } from "@gt/domain/errors";

import type { AgentResult, RunAgentInput } from "../../../agent/cliSeam.ts";
import { MODEL } from "../../../model.ts";
import { stripComments } from "../../suno/listenPrompt.ts";

// THE BRIEF'S WRITER (cover brief WP-A): one Claude Code turn on the seat, in an isolated workspace that holds only
// inputs/ (the measurements and the three reads, copied) and out/ (where it writes brief.json). Read and Write only:
// no web, no shell. The prompt is pipeline/cover-brief-PROMPT.md with four slots; its answer is judged by
// @gt/producers/cover-brief/define parseBriefAnswer, never here.

export const COVER_BRIEF_PROMPT = path.join("pipeline", "cover-brief-PROMPT.md");
export const BRIEF_OUT = "brief.json";
/** The writer's effort: a judgement over a few kilobytes of facts, not a long build. */
export const WRITE_EFFORT = "high";
export const WRITE_TIMEOUT_MIN = 15;

export type WriteInputs = {
  readonly durationS: number;
  /** analyze.py's report as it wrote it. */
  readonly measure: string;
  /** The three reads, each as the cover keeps it. */
  readonly reads: readonly string[];
};

export type WriteTurn = { readonly ws: string; readonly agent: RunAgentInput };

export async function briefPromptText(durationS: number, at: string = path.join(process.cwd(), COVER_BRIEF_PROMPT)): Promise<Result<string>> {
  let text: string;
  try {
    text = await readFile(at, "utf8");
  } catch {
    return err("unavailable", `the prompt file ${COVER_BRIEF_PROMPT} is missing - it is part of the code`);
  }
  const slots: Record<string, string> = {
    "{{DURATION_S}}": String(Math.round(durationS * 10) / 10),
    "{{STYLE_MAX}}": String(COVER_STYLE_MAX),
    "{{SECTION_MAX_S}}": String(COVER_SECTION_MAX_S),
    "{{SECTION_MIN_S}}": String(COVER_SECTION_MIN_S),
  };
  let out = stripComments(text);
  for (const [k, v] of Object.entries(slots)) out = out.replaceAll(k, v);
  return ok(out);
}

/** A fresh workspace with the inputs copied in, and the turn that reads them. */
export async function prepareWrite(i: WriteInputs, prompt: string): Promise<WriteTurn> {
  const ws = await mkdtemp(path.join(os.tmpdir(), "gt-cover-brief-"));
  const inputs = path.join(ws, "inputs");
  await mkdir(inputs, { recursive: true });
  await mkdir(path.join(ws, "out"), { recursive: true });
  await writeFile(path.join(inputs, "measure.json"), i.measure);
  for (const [k, r] of i.reads.entries()) await writeFile(path.join(inputs, `listen-${k + 1}.json`), r);
  const agent: RunAgentInput = { cwd: ws, prompt, model: MODEL, effort: WRITE_EFFORT, tools: ["Read", "Write"], timeoutMin: WRITE_TIMEOUT_MIN, turn: "cover-brief" };
  return { ws, agent };
}

/** What the turn left in out/brief.json, as text; undefined when it left nothing. */
export async function collectWrite(t: WriteTurn): Promise<string | undefined> {
  const p = path.join(t.ws, "out", BRIEF_OUT);
  return existsSync(p) ? readFile(p, "utf8") : undefined;
}

export const dropWrite = (t: WriteTurn): Promise<void> => rm(t.ws, { recursive: true, force: true });

/** The DRY answer: a brief that says what it is, so a dry job walks the door and settles without a seat. */
export async function standInWrite(t: WriteTurn, durationS: number): Promise<AgentResult> {
  const brief = {
    style: "stand-in: no model heard this song",
    sourceStyle: "stand-in: no model heard this song",
    section: { startS: 0, endS: Math.min(durationS, COVER_SECTION_MAX_S) },
    lyrics: "",
    why: "stand-in: a dry job called no listener and no seat",
    agreed: 0,
  };
  await writeFile(path.join(t.ws, "out", BRIEF_OUT), JSON.stringify(brief, null, 2));
  return { outcome: "completed", final: "", turns: 0, durationMs: 0, exitCode: 0, errors: [] };
}
