// THE SCENE-DIRECTION PROMPT, ASSEMBLED — a script and a notebook in,
// `{ prompt, manifest }` out. SERVER ONLY. (AIO-B: extracted from
// app/api/frames/route.ts.)
//
// The route used to build this inline, so a creator first learned the size of a
// run from a 413 after clicking. Pulled out as a pure function of the request
// body and the system prompt, so the route and a free preview
// (app/api/turns/preview) build the same bytes, and
// tests/golden-path/turn-assemble-parity.probe.spec.ts pins them to what the
// route built before the extraction.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { compileFormatBrief } from "@/lib/formatBrief";

import { joinBlocks, type Refusal, type TurnManifest } from "./manifest";

/** The request body /api/frames (and the preview's `input`) accepts.
 *
 *  `template` and `targetS` are the project record's own two format fields, and
 *  they are `unknown` here like everything else that arrives as JSON: the seam
 *  that decides whether they can be trusted is lib/formatBrief.ts, which refuses
 *  to invent either. A run that omits them is not an error — it is a run whose
 *  format block says it was not told. */
export interface FramesInput {
  beats?: unknown;
  facts?: unknown;
  style?: unknown;
  schema?: unknown;
  title?: unknown;
  template?: unknown;
  targetS?: unknown;
}

/** Cached per absolute path, for the reason lib/turns/assemble/recalibrate.ts
 *  gives. A missing file still throws the raw read error, exactly as the route's
 *  inline read always did — this extraction changes no failure. */
const cache = new Map<string, string>();

export async function framesSystemPrompt(): Promise<string> {
  const at = path.join(process.cwd(), "pipeline", "FRAMES-SCENE-PROMPT.md");
  const hit = cache.get(at);
  if (hit !== undefined) return hit;
  const text = await readFile(at, "utf8");
  cache.set(at, text);
  return text;
}

/**
 * WHAT THIS RUN IS ALLOWED TO COST, IN INPUT.
 *
 * Everything in the body is caller-supplied and goes down stdin into a reasoning
 * run on the operator's subscription or a metered key. Until these bounds
 * existed the route checked that `beats` was a non-empty array and `style` was
 * truthy, and nothing else: a caller could send fifty megabytes of beats and buy
 * a proportionally enormous run, once per rate-limit slot.
 *
 * The ceiling that actually matters is the ASSEMBLED prompt, because that is
 * what is paid for; the per-array counts are there to fail early and to name
 * which part was oversized, which a single byte count cannot.
 */
export const MAX_BEATS = 400;
export const MAX_FACTS = 600;
/** Roughly a quarter of a million tokens of input - far past any real script,
 *  and far short of a bill nobody authorised. */
export const MAX_PROMPT_CHARS = 1_000_000;

/** Serialised size of one caller-supplied field, or 0 when it is absent. */
function jsonSize(v: unknown): number {
  if (v === undefined || v === null) return 0;
  try {
    return JSON.stringify(v)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY; // circular or unserialisable: refuse it
  }
}

/**
 * Why this run is too large, or `null` when it is not.
 *
 * A pure predicate rather than inline returns, because the NEGATIVE case is
 * otherwise unprobeable: asking the route "is a forty-beat script refused" means
 * getting past the bounds and dispatching a real run, and a probe that spends
 * the operator's subscription to prove a limit is not a probe.
 */
export function tooLarge(body: { beats?: unknown; facts?: unknown; style?: unknown; schema?: unknown }): string | null {
  const beats = Array.isArray(body.beats) ? body.beats : [];
  if (beats.length > MAX_BEATS)
    return `${beats.length} beats were sent; this route composes at most ${MAX_BEATS}. Nothing was dispatched.`;
  if (Array.isArray(body.facts) && body.facts.length > MAX_FACTS)
    return `${body.facts.length} facts were sent; this route carries at most ${MAX_FACTS}. Nothing was dispatched.`;
  const declared = jsonSize(body.beats) + jsonSize(body.facts) + jsonSize(body.style) + jsonSize(body.schema);
  if (declared > MAX_PROMPT_CHARS)
    return `The run's material is ${Math.round(declared / 1000)}k characters; the ceiling is ${MAX_PROMPT_CHARS / 1000}k. Nothing was dispatched.`;
  return null;
}

/** What the route answers before assembling anything, in the route's order:
 *  no beats, no style, then the size. `null` when the run may be assembled.
 *  COUNTS BEFORE ASSEMBLY, so an oversized run is refused before a megabyte of
 *  it is serialised into a prompt. */
export function framesRefusal(body: FramesInput): Refusal | null {
  if (!Array.isArray(body.beats) || body.beats.length === 0)
    return { status: 400, detail: "No beats were sent, so there is nothing to art-direct." };
  if (!body.style) return { status: 400, detail: "No visual style was sent. A scene cannot be composed without one." };
  const oversized = tooLarge(body);
  if (oversized) return { status: 413, detail: oversized, code: "too-large" };
  return null;
}

/** The ASSEMBLED size is the one that is billed, and it carries the system
 *  prompt and the format brief on top of what the caller sent — so it is
 *  checked after assembly as well, because the sum is what leaves the machine. */
export function assembledRefusal(manifest: TurnManifest): Refusal | null {
  if (manifest.totalChars <= MAX_PROMPT_CHARS) return null;
  return {
    status: 413,
    detail: `The assembled run is ${Math.round(manifest.totalChars / 1000)}k characters; the ceiling is ${MAX_PROMPT_CHARS / 1000}k. Nothing was dispatched.`,
    code: "too-large",
  };
}

/** Build the prompt and its manifest. Pure: the system prompt is an argument,
 *  and nothing is read, spawned or logged. Call `framesRefusal` first. */
export function assembleFrames(body: FramesInput, system: string): { prompt: string; manifest: TurnManifest } {
  // Everything down stdin: the script and notebook together are far past any
  // platform's argv limit, and on Windows that limit truncates silently.
  const { prompt, blocks } = joinBlocks([
    { name: "system", lines: [system, "", "---", ""] },
    {
      name: "run",
      lines: [
        "# THE RUN",
        "",
        "Return ONE JSON object and nothing else — no prose before or after, no code fence.",
        "It must satisfy this schema:",
        "",
        JSON.stringify(body.schema ?? {}, null, 2),
        "",
      ],
    },
    // FIRST of the run's four blocks, ahead of the script. What kind of piece
    // this is changes how every beat after it should be read, and a brief that
    // arrives after the material it governs is a brief the model has already
    // started without.
    { name: "format", lines: [compileFormatBrief(body.template, body.targetS), ""] },
    {
      name: "script",
      lines: [
        `## THE SCRIPT — ${String(body.title ?? "untitled")}`,
        "Beats in order. `at` is the timestamp you must echo as `beatAt`.",
        JSON.stringify(body.beats, null, 2),
        "",
      ],
    },
    {
      name: "notebook",
      lines: [
        "## THE NOTEBOOK — every fact you may cite",
        "A figure on screen MUST carry one of these ids. If no row supports a number, do not show one.",
        JSON.stringify(body.facts, null, 2),
        "",
      ],
    },
    {
      name: "style",
      lines: ["## THE LOCKED VISUAL STYLE — compose within it, not against it", JSON.stringify(body.style, null, 2)],
    },
  ]);
  return { prompt, manifest: { blocks, totalChars: prompt.length, ceilingChars: MAX_PROMPT_CHARS } };
}
