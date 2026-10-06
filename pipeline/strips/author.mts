// AUTHOR ONE STRIP — an agent turn in an isolated workspace.
//
// The agent gets Read/Write/Edit and nothing else (lib/agent/cliSeam.ts): no
// shell, no browser, no web. It cannot render its own work, so it never
// grades its own work either; the orchestrator renders, builds the contact
// sheet, and hands the sheet back as a fix turn's input. That split is the
// registry's "no gate self-certifies": the agent's look at its sheet is a
// pre-filter, and the operator's triage is the verdict.

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { runAgent, type AgentResult } from "../../lib/agent/cliSeam";
import { MODEL } from "../../lib/model";
import type { Approach, StripLane } from "../../lib/foundry/strips/types";

const ROOT = process.cwd();
const STRIPS = path.join(ROOT, "pipeline", "strips");

/** Card key -> files copied into inputs/vendor/. */
const VENDOR: Record<string, string[]> = {
  three: ["three.min.js"],
  "d3-geo": ["d3-array.min.js", "d3-geo.min.js", "topojson-client.min.js", "countries-110m.json"],
};

export interface AuthorInput {
  /** The workspace directory: will hold exactly inputs/ and out/. */
  ws: string;
  lane: StripLane;
  brief: unknown;
  approach: Approach;
  effort: string;
  /** A supporting image already generated for this approach. */
  asset?: string;
  /** Fix turn: what the last render showed. */
  feedback?: { text: string; sheet?: string; current: string; style?: string };
  /** Round 2: a kept strip and its module from another case. */
  styleRef?: { html: string; style: string };
  timeoutMin?: number;
}

export interface AuthorOutput {
  result: AgentResult;
  html?: string;
  style?: string;
  /** Whether a fix turn changed strip.html. */
  changed: boolean;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const FIRST_PROMPT = `You are a motion designer who writes code. Read inputs/CONTRACT.md first and follow it exactly, then read inputs/brief.json and inputs/approach.json (and inputs/assets/, inputs/vendor/, inputs/style-reference/ if present). Write out/strip.html and out/style.json. Make it genuinely excellent in the approach's own idiom - this strip competes blind against 19 other approaches and a plain control. Use only the brief's numbers and facts.`;

const FIX_PROMPT = `You are revising a strip you wrote. Read inputs/CONTRACT.md again, then inputs/feedback.md, then LOOK at inputs/sheet.png (a 4x3 contact sheet of frames 0,20,...,220) if it exists. out/strip.html and out/style.json hold the current version. Fix what is wrong - lint errors and failed gates first, then anything on the sheet that is broken, cramped, illegible, empty, or off-direction. If the strip is already right, change nothing and say so. Edit the files in out/ in place.`;

export async function authorStrip(input: AuthorInput): Promise<AuthorOutput> {
  const { ws, approach } = input;
  await rm(ws, { recursive: true, force: true });
  const inputs = path.join(ws, "inputs");
  const out = path.join(ws, "out");
  await mkdir(inputs, { recursive: true });
  await mkdir(out, { recursive: true });

  await copyFile(path.join(STRIPS, "CONTRACT.md"), path.join(inputs, "CONTRACT.md"));
  await writeFile(path.join(inputs, "brief.json"), JSON.stringify(input.brief, null, 2));
  const card = { ...approach, lane: input.lane, size: input.lane === "edu" ? "1920x1080" : "1080x1920" };
  await writeFile(path.join(inputs, "approach.json"), JSON.stringify(card, null, 2));
  for (const key of approach.vendored ?? []) {
    await mkdir(path.join(inputs, "vendor"), { recursive: true });
    for (const f of VENDOR[key] ?? []) await copyFile(path.join(STRIPS, "vendor", f), path.join(inputs, "vendor", f));
  }
  if (input.asset && existsSync(input.asset)) {
    await mkdir(path.join(inputs, "assets"), { recursive: true });
    await copyFile(input.asset, path.join(inputs, "assets", `${approach.leonardo}${path.extname(input.asset)}`));
  }
  if (input.styleRef) {
    await mkdir(path.join(inputs, "style-reference"), { recursive: true });
    await copyFile(input.styleRef.html, path.join(inputs, "style-reference", "strip.html"));
    await copyFile(input.styleRef.style, path.join(inputs, "style-reference", "style.json"));
  }

  let before = "";
  if (input.feedback) {
    await writeFile(path.join(inputs, "feedback.md"), input.feedback.text);
    if (input.feedback.sheet && existsSync(input.feedback.sheet)) await copyFile(input.feedback.sheet, path.join(inputs, "sheet.png"));
    await copyFile(input.feedback.current, path.join(out, "strip.html"));
    if (input.feedback.style && existsSync(input.feedback.style)) await copyFile(input.feedback.style, path.join(out, "style.json"));
    before = sha(await readFile(path.join(out, "strip.html"), "utf8"));
  }

  const result = await runAgent({
    cwd: ws,
    prompt: input.feedback ? FIX_PROMPT : FIRST_PROMPT,
    model: MODEL,
    effort: input.effort,
    tools: ["Read", "Write", "Edit"],
    timeoutMin: input.timeoutMin ?? 40,
    turn: "strip-author",
  });

  const htmlPath = path.join(out, "strip.html");
  const stylePath = path.join(out, "style.json");
  const html = existsSync(htmlPath) ? htmlPath : undefined;
  const after = html ? sha(await readFile(htmlPath, "utf8")) : "";
  return {
    result,
    html,
    style: existsSync(stylePath) ? stylePath : undefined,
    changed: !input.feedback || before !== after,
  };
}

/** One supporting image from Leonardo. No text, no logos, no people — the
 *  card's prompt says so and the negative prompt repeats it. */
export async function makeAsset(approach: Approach, lane: StripLane, fileBase: string): Promise<{ file: string; provider: string; costUsd?: number }> {
  const { leonardoProvider } = await import("../../lib/imaging/providers/leonardo");
  const aspect = approach.leonardo === "texture" ? "1:1" : lane === "edu" ? "16:9" : "9:16";
  const res = await leonardoProvider().generate!({
    prompt: approach.leonardoPrompt ?? "",
    negativePrompt: "text, letters, words, numbers, watermark, logo, signature, people, faces, hands",
    aspect,
    count: 1,
  });
  const img = res.images[0];
  if (!img) throw new Error("Leonardo returned no image");
  const file = `${fileBase}.${img.mime === "image/jpeg" ? "jpg" : img.mime === "image/webp" ? "webp" : "png"}`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(img.base64, "base64"));
  return { file, provider: res.provenance.provider, costUsd: res.provenance.costUsd };
}
