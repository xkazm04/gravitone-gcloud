// ONE STILL FROM A `codex exec` TURN ON THE OPERATOR'S CHATGPT SEAT - the engine that replaced Flux 2 for every still
// this box used to draw locally (operator, 2026-11-08: "Our main image engine for now will be codex with its image
// generation"). The turn calls Codex's built-in `image_gen` and copies the result into a fresh empty workspace.
//
// Ported from the trailer's `codexImage` (pipeline/trailer/codex.mts, which picked the prompt shape and the `-i` flag).
// It takes an aspect, returns the bytes and the measured size, and keeps nothing: the caller writes the frame.
//
// THE PROMPT GOES IN ON STDIN. `-i` takes several files and would swallow an argument; and the prompt reaches this
// file from upstream LLM output, so it never touches the shell command line.
//
// NOT gpu.local. Nothing here occupies the card, so a job drawing only stills waits on seat.text (the operator's CLI
// seats, as agy does) and never on the card's lane. A seat is a quota, not a USD meter: the receipt line is unpriced.
//
// NO SEED AND NO DENOISE WINDOW. Codex takes neither: a request's seed is recorded and handed back unchanged, so a
// retry is another draw, not the same frame; and a reference is an attached image the turn looks at, not a latent.
//
// A timeout, because a seat slot is only as free as the turn holding it: the whole process tree is killed at the cap.

import { spawn as realSpawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { AppError } from "@gt/domain/errors";

import { killTree } from "../../agent/envelope";

export const CODEX_MODEL = "codex-image-gen";
export const CODEX_ASPECTS = ["16:9", "9:16", "1:1"] as const;
export type CodexAspect = (typeof CODEX_ASPECTS)[number];
/** The largest request seed the stored request shapes carry (a JSON number holds it exactly). Recorded, never drawn with. */
export const STILL_SEED_MAX = 2 ** 48 - 1;
/** The references one still takes: a cast's kept sheets (lib/foundry/scout/cast.ts CAST_MAX). */
export const CODEX_REFS_MAX = 3;
/**
 * The value stored requests carry in their `late` field. It has no effect on Codex, which has no denoise to admit a
 * reference into; the field stays so a request already queued still parses, and a receipt reads the same.
 */
export const REFERENCE_LATE = 0.25;

/** The cap on one turn. Not measured on a production night: an image turn is minutes, and a hang must end. */
export const CODEX_TIMEOUT_MS = 10 * 60_000;

const ASPECT_WORDS: Readonly<Record<CodexAspect, string>> = {
  "16:9": "wide 16:9 landscape (the widest landscape size you have)",
  "9:16": "tall 9:16 portrait (the tallest portrait size you have)",
  "1:1": "square 1:1",
};

const OUT = "still.png";

type Spawned = {
  readonly pid?: number | undefined;
  readonly stdin: { end(s: string): void } | null;
  readonly stderr: { on(ev: "data", f: (c: Buffer | string) => void): void } | null;
  on(ev: "error", f: (e: Error) => void): void;
  on(ev: "close", f: (code: number | null) => void): void;
  kill(): void;
};

export type CodexDeps = {
  /** Spawns `codex`; a test hands a fake that writes the output file (it receives the workspace as `cwd`). */
  readonly spawn?: (cmd: string, args: readonly string[], opts: { readonly cwd: string }) => Spawned;
  readonly timeoutMs?: number;
};

export type CodexRequest = {
  readonly prompt: string;
  readonly aspect?: CodexAspect;
  readonly seed?: number;
  readonly refs?: readonly Uint8Array[];
};

export type CodexStill = {
  readonly png: Uint8Array;
  readonly seed: number;
  readonly model: typeof CODEX_MODEL;
  readonly width: number;
  readonly height: number;
  readonly wallMs: number;
};

const unavailable = (m: string): AppError => new AppError("unavailable", m);

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

/** The pixel size a PNG's IHDR declares, or null for bytes that are not a PNG. */
export function pngSize(b: Uint8Array): { readonly width: number; readonly height: number } | null {
  if (b.length < 24 || PNG_MAGIC.some((v, i) => b[i] !== v)) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const liveSpawn: NonNullable<CodexDeps["spawn"]> = (cmd, args, opts) =>
  // shell: the npm shim is a .cmd on Windows and spawn refuses a .cmd without one. Only the quoted paths below reach
  // the command line; stdout is never read and stays ignored (a pipe nobody reads blocks the child on a long turn).
  realSpawn(cmd, [...args], { cwd: opts.cwd, shell: true, stdio: ["pipe", "ignore", "pipe"], windowsHide: true }) as unknown as Spawned;

export async function drawCodex(req: CodexRequest, deps: CodexDeps = {}): Promise<CodexStill> {
  const prompt = req.prompt.trim();
  if (prompt === "") throw new AppError("invalid", "a Codex still needs a prompt");
  const aspect = req.aspect ?? "16:9";
  if (!CODEX_ASPECTS.includes(aspect)) throw new AppError("invalid", `a Codex still is ${CODEX_ASPECTS.join(", ")}, got ${String(aspect)}`);
  const refs = req.refs ?? [];
  if (refs.length > CODEX_REFS_MAX) throw new AppError("invalid", `a Codex still takes at most ${CODEX_REFS_MAX} reference stills, got ${refs.length}`);

  const started = Date.now();
  const cap = deps.timeoutMs ?? CODEX_TIMEOUT_MS;
  const ws = await mkdtemp(path.join(tmpdir(), "codex-still-"));
  try {
    const refArgs: string[] = [];
    for (const [i, bytes] of refs.entries()) {
      const name = path.join(ws, `ref-${i + 1}.png`);
      await writeFile(name, bytes);
      refArgs.push("-i", `"${name}"`);
    }
    const instruction = `Use your built-in image_gen tool to make exactly ONE image, ${ASPECT_WORDS[aspect]}. ${prompt} After generating, copy the image file into the current working directory as ${OUT} and print its pixel size. Do nothing else.`;
    const args = ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", `"${ws}"`, ...refArgs, "--", "-"];
    await new Promise<void>((resolve, reject) => {
      let child: Spawned;
      try {
        child = (deps.spawn ?? liveSpawn)("codex", args, { cwd: ws });
      } catch (e) {
        reject(unavailable(`the codex CLI could not be started: ${e instanceof Error ? e.message : String(e)}`));
        return;
      }
      let stderr = "";
      let done = false;
      const settle = (f: () => void): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        f();
      };
      const timer = setTimeout(() => {
        killTree(child.pid, () => child.kill());
        settle(() => reject(unavailable(`codex did not finish its image turn within ${Math.round(cap / 60_000)} min`)));
      }, cap);
      child.stderr?.on("data", (c) => {
        stderr = (stderr + String(c)).slice(-600);
      });
      child.on("error", (e) => settle(() => reject(unavailable(`the codex CLI is not installed or not on PATH: ${e.message}`))));
      child.on("close", (code) => {
        settle(() => (code === 0 ? resolve() : reject(unavailable(`codex exited ${code}${stderr.trim() === "" ? "" : `: ${stderr.replace(/\s+/g, " ").trim().slice(-300)}`}`))));
      });
      child.stdin?.end(instruction);
    });

    let png: Uint8Array;
    try {
      png = new Uint8Array(await readFile(path.join(ws, OUT)));
    } catch {
      throw unavailable(`codex finished but wrote no ${OUT}`);
    }
    const size = pngSize(png);
    if (size === null) throw unavailable(`codex wrote a ${OUT} that is not a PNG`);
    return { png, seed: req.seed ?? 0, model: CODEX_MODEL, width: size.width, height: size.height, wallMs: Date.now() - started };
  } finally {
    await rm(ws, { recursive: true, force: true }).catch(() => undefined);
  }
}
