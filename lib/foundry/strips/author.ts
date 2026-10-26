// AUTHOR ONE STRIP - an agent turn in an isolated workspace. Server only.
//
// The agent gets Read/Write/Edit and nothing else (lib/agent/cliSeam.ts): no shell, no
// browser, no web. It cannot render its own work, so it never grades its own work either;
// the orchestrator renders, builds the contact sheet, and hands the sheet back as a fix
// turn's input. That split is the registry's "no gate self-certifies": the agent's look at
// its sheet is a pre-filter, and the operator's triage is the verdict.
//
// Moved from pipeline/strips/author.mts (Phase 4, L33) and cut in three at the one place
// money is spent: `prepareTurn` builds the workspace (free), the strip job's meter runs the
// turn (packages/producers/src/strips/define.ts: the seat live, or `standInTurn` dry), and
// `collectTurn` reads what it left. v1's `authorStrip` did all three in one call, so the
// call could not be declared, metered or stood in for without running the seat.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AgentResult, RunAgentInput } from "../../agent/cliSeam";
import type { GenerateRequest } from "../../imaging/types";
import { MODEL } from "../../model";
import type { Approach, StripLane } from "./types";

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
  /** Minutes the turn may take: the run's `authorTimeoutMin` (./cards.ts DEFAULT_OPTIONS says why 75,
   *  and that a 40-minute cap - this seam's old fallback - killed two cards). Required, so no caller
   *  inherits a second number. */
  timeoutMin: number;
  /** The strips pipeline directory (CONTRACT.md, vendor/); default `<cwd>/pipeline/strips`. */
  stripsDir?: string;
  /** Another job's addendum to the contract (a stats reel's REEL.md): files copied into inputs/ beside
   *  CONTRACT.md under their own names, and the sentence that sends the agent to them, appended to the
   *  prompt. Absent, the turn is the strips turn byte for byte. */
  addendum?: { readonly inputs: readonly string[]; readonly prompt: string };
}

/** One prepared turn: the agent's input, and what a fix turn was shown (to tell whether it changed it). */
export type StripTurn = { readonly agent: RunAgentInput; readonly ws: string; readonly lane: StripLane; readonly fix: boolean; readonly before: string };

export type Collected = { readonly html?: string; readonly style?: string; readonly changed: boolean };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const FIRST_PROMPT = `You are a motion designer who writes code. Read inputs/CONTRACT.md first and follow it exactly, then read inputs/brief.json and inputs/approach.json (and inputs/assets/, inputs/vendor/, inputs/style-reference/ if present). Write out/strip.html and out/style.json. Make it genuinely excellent in the approach's own idiom - this strip competes blind against 19 other approaches and a plain control. Use only the brief's numbers and facts.`;

const FIX_PROMPT = `You are revising a strip you wrote. Read inputs/CONTRACT.md again, then inputs/feedback.md, then LOOK at inputs/sheet.png (a 4x3 contact sheet of frames 0,20,...,220) if it exists. out/strip.html and out/style.json hold the current version. Fix what is wrong - lint errors and failed gates first, then anything on the sheet that is broken, cramped, illegible, empty, or off-direction. If the strip is already right, change nothing and say so. Edit the files in out/ in place.`;

/** Build the workspace and the agent input. Nothing is spent here. */
export async function prepareTurn(input: AuthorInput): Promise<StripTurn> {
  const { ws, approach } = input;
  const strips = input.stripsDir ?? path.join(process.cwd(), "pipeline", "strips");
  await rm(ws, { recursive: true, force: true });
  const inputs = path.join(ws, "inputs");
  const out = path.join(ws, "out");
  await mkdir(inputs, { recursive: true });
  await mkdir(out, { recursive: true });

  await copyFile(path.join(strips, "CONTRACT.md"), path.join(inputs, "CONTRACT.md"));
  for (const f of input.addendum?.inputs ?? []) await copyFile(f, path.join(inputs, path.basename(f)));
  await writeFile(path.join(inputs, "brief.json"), JSON.stringify(input.brief, null, 2));
  const card = { ...approach, lane: input.lane, size: input.lane === "edu" ? "1920x1080" : "1080x1920" };
  await writeFile(path.join(inputs, "approach.json"), JSON.stringify(card, null, 2));
  for (const key of approach.vendored ?? []) {
    await mkdir(path.join(inputs, "vendor"), { recursive: true });
    for (const f of VENDOR[key] ?? []) await copyFile(path.join(strips, "vendor", f), path.join(inputs, "vendor", f));
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

  const prompt = input.feedback ? FIX_PROMPT : FIRST_PROMPT;
  const agent: RunAgentInput = {
    cwd: ws,
    prompt: input.addendum === undefined ? prompt : `${prompt} ${input.addendum.prompt}`,
    model: MODEL,
    effort: input.effort,
    tools: ["Read", "Write", "Edit"],
    timeoutMin: input.timeoutMin,
    turn: "strip-author",
  };
  return { agent, ws, lane: input.lane, fix: input.feedback !== undefined, before };
}

/** What the turn left in out/: the page, its module, and whether a fix changed the page it was shown. */
export async function collectTurn(t: StripTurn): Promise<Collected> {
  const htmlPath = path.join(t.ws, "out", "strip.html");
  const stylePath = path.join(t.ws, "out", "style.json");
  const html = existsSync(htmlPath) ? htmlPath : undefined;
  const after = html ? sha(await readFile(htmlPath, "utf8")) : "";
  return { ...(html === undefined ? {} : { html }), ...(existsSync(stylePath) ? { style: stylePath } : {}), changed: !t.fix || t.before !== after };
}

/**
 * THE DRY STAND-IN for a turn: what a dry strip job's turns are answered by. An author turn
 * leaves a placeholder page that keeps the strip contract (CONTRACT.md: `window.STRIP`,
 * `window.renderFrameAt`, `window.STRIP_READY`, the `strip-frame` listener) and passes the
 * lint, so the dry job walks the whole card loop; a fix or review turn changes nothing, as
 * a seat shown a passing strip may. The seat is never entered, whatever the environment.
 */
export async function standInTurn(t: StripTurn): Promise<AgentResult> {
  const out = path.join(t.ws, "out");
  await mkdir(out, { recursive: true });
  if (!t.fix) {
    await writeFile(path.join(out, "strip.html"), standInPage(t.lane));
    await writeFile(path.join(out, "style.json"), JSON.stringify({ name: "dry stand-in", palette: [], type: [], motion: { easing: "linear", cues: [], tempo: "none" }, primitives: [], textures: [], notes: "a dry job's placeholder: no seat was called" }, null, 2));
  }
  return { outcome: "completed", final: "dry stand-in: no seat was called", turns: 0, durationMs: 0, exitCode: 0, errors: [] };
}

/**
 * The stand-in page. With `data` (a stats reel's dry turn) it also holds the numbers in the one
 * `<script id="strip-data">` block and reads it, so the reel's data rule (./lint.ts stripDataRule)
 * passes on a dry job as it must on a real one; without, it is the strips page byte for byte. With `frames`
 * other than the contract's 240 (a full reel's cut, spark scout-vision S5) it declares that count.
 */
export function standInPage(lane: StripLane, data?: unknown, frames?: number): string {
  const [w, h] = lane === "edu" ? [1920, 1080] : [1080, 1920];
  const block = data === undefined ? "" : `<script id="strip-data" type="application/json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
  const read = data === undefined ? "" : `window.STRIP_DATA = JSON.parse(document.getElementById("strip-data").textContent);\n`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#f4f1ea}#t{font:600 64px sans-serif;position:absolute;left:10%;top:40%;transition:none}</style></head><body><div id="t">dry stand-in</div>${block}<script>
${read}window.STRIP = { width: ${w}, height: ${h}${frames === undefined || frames === 240 ? "" : `, frames: ${frames}`} };
window.renderFrameAt = function (i) { document.getElementById("t").style.opacity = String(0.3 + 0.7 * (i % 60) / 60); };
window.STRIP_READY = true;
addEventListener("message", function (e) { if (e.data && e.data.type === "strip-frame") window.renderFrameAt(e.data.i); });
</script></body></html>`;
}

/** The supporting image's request: no text, logos or people - the card says so and the prompt repeats it. */
export function assetRequest(approach: Approach, lane: StripLane): GenerateRequest {
  // agy takes one prose prompt and has no negative channel, so the exclusions ride in the
  // prompt too; providers with a native channel also get them there.
  return {
    prompt: `${approach.leonardoPrompt ?? ""}. Strictly no text, letters, numbers, logos, watermarks, people, faces or hands.`,
    negativePrompt: "text, letters, words, numbers, watermark, logo, signature, people, faces, hands",
    aspect: approach.leonardo === "texture" ? "1:1" : lane === "edu" ? "16:9" : "9:16",
    count: 1,
    prefer: "agy",
  };
}

/** One supporting image through the imaging router, so the plan decides the engine (agy leads since 2026-10-12). */
export async function makeAsset(approach: Approach, lane: StripLane, fileBase: string): Promise<{ file: string; provider: string; costUsd?: number }> {
  const { generate } = await import("../../imaging/router");
  const res = await generate(assetRequest(approach, lane));
  const img = res.images[0];
  if (!img) throw new Error(`${res.provenance.provider} returned no image`);
  const file = `${fileBase}.${img.mime === "image/jpeg" ? "jpg" : img.mime === "image/webp" ? "webp" : "png"}`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(img.base64, "base64"));
  return { file, provider: `${res.provenance.provider}/${res.provenance.model}`, ...(res.provenance.costUsd === undefined ? {} : { costUsd: res.provenance.costUsd }) };
}
