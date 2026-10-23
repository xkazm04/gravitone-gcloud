// THE BLENDER RUNNER (spark game-3d-assets WP2) - one ported script (pipeline/mesh/blender/*.py)
// run headless, bounded, and read back from the JSON file it writes. Blender's print does not reach
// a caller's stdout reliably (lynx-bench's finding), so a script's answer is its result FILE; its
// stderr is kept only to say, verbatim, why it failed.
//
//   <blender> -b --factory-startup --python-exit-code 1 -P <script> -- <args...>
//
// `--python-exit-code 1` is what makes a Python exception an exit code at all: without it Blender
// prints the traceback and exits 0. BLENDER names the binary (default: the box's native ARM64
// 5.2.2 build, ASSET-PIPELINE.md); a test hands a command prefix instead ([node, fake.mjs]).
// Spawned with no shell and windowsHide, killed at the step's timeout, as the profile job's
// command is (lib/producers/profile.ts `spawnExit`).

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const BLENDER_DEFAULT = path.join(os.homedir(), "ai", "tools", "blender-5.2.2-windows-arm64", "blender.exe");
export const blenderCommand = (env: NodeJS.ProcessEnv = process.env): readonly string[] => [env["BLENDER"]?.trim() || BLENDER_DEFAULT];
export const SCRIPTS = path.join("pipeline", "mesh", "blender");

const TAIL = 1_500;

export type BlenderAsk = {
  /** The command prefix: [blender.exe], or [node, fake.mjs] under test. */
  readonly command: readonly string[];
  /** The script's absolute path. */
  readonly script: string;
  readonly args: readonly string[];
  /** The JSON file the script writes; its absence after exit 0 is a failure. */
  readonly result: string;
  readonly timeoutMs: number;
  readonly env?: Readonly<Record<string, string>>;
};

export type BlenderRun = { readonly ok: true; readonly result: unknown; readonly seconds: number } | { readonly ok: false; readonly message: string };

/** The exit, the last of stderr (stdout when stderr said nothing), and whether the clock killed it. */
export function spawnBounded(command: readonly string[], args: readonly string[], o: { readonly timeoutMs: number; readonly env?: Readonly<Record<string, string>> }): Promise<{ readonly code: number | null; readonly tail: string; readonly timedOut: boolean; readonly error?: string }> {
  const [cmd, ...pre] = command;
  if (cmd === undefined) return Promise.resolve({ code: null, tail: "", timedOut: false, error: "no command" });
  return new Promise((resolve) => {
    let err = "";
    let out = "";
    let timedOut = false;
    const child = spawn(cmd, [...pre, ...args], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...(o.env ?? {}) } });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, o.timeoutMs);
    child.stdout.on("data", (b: Buffer) => {
      out = (out + b.toString("utf8")).slice(-TAIL);
    });
    child.stderr.on("data", (b: Buffer) => {
      err = (err + b.toString("utf8")).slice(-TAIL);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: null, tail: "", timedOut, error: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, tail: (err.trim() !== "" ? err : out).trim(), timedOut });
    });
  });
}

/** Run one script and read its result file. Every failure is a sentence carrying Blender's own words. */
export async function runBlender(ask: BlenderAsk): Promise<BlenderRun> {
  const t0 = Date.now();
  const name = path.basename(ask.script);
  const args = ["-b", "--factory-startup", "--python-exit-code", "1", "-P", ask.script, "--", ...ask.args];
  const r = await spawnBounded(ask.command, args, { timeoutMs: ask.timeoutMs, ...(ask.env === undefined ? {} : { env: ask.env }) });
  if (r.error !== undefined) return { ok: false, message: `blender could not start for ${name}: ${r.error}` };
  if (r.timedOut) return { ok: false, message: `${name} did not finish in ${Math.round(ask.timeoutMs / 1000)} s and was stopped${r.tail === "" ? "" : `: ${r.tail}`}` };
  if (r.code !== 0) return { ok: false, message: `${name} exited ${String(r.code)}${r.tail === "" ? "" : `: ${r.tail}`}` };
  let text: string;
  try {
    text = await readFile(ask.result, "utf8");
  } catch {
    return { ok: false, message: `${name} exited 0 but wrote no result file ${path.basename(ask.result)}${r.tail === "" ? "" : `: ${r.tail}`}` };
  }
  try {
    return { ok: true, result: JSON.parse(text) as unknown, seconds: Math.round((Date.now() - t0) / 100) / 10 };
  } catch (e) {
    return { ok: false, message: `${name} wrote an unreadable result file ${path.basename(ask.result)}: ${e instanceof Error ? e.message : String(e)}` };
  }
}
