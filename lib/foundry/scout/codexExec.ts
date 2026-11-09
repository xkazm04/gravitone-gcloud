// CODEX ON THE OPERATOR'S SUBSCRIPTION, NON-INTERACTIVE (idea loop).
//
// `codex exec` with no TTY and no prompt. Every key-shaped variable is removed from the child, so the CLI can only
// authenticate from its own ChatGPT login; `reviewerEnv`'s pattern is not enough here, since it lets a name like
// ANTHROPIC_KEY_LANE_X through. `--ignore-user-config` also leaves out any provider redirect in the operator's config.
//
// The caller decides what proves success: an exit code of 0 covers a refusal too.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { killTree } from "../../agent/envelope.ts";
import { resolveEngineBin } from "../../agent/resolveEngineBin.ts";

const KEY_NAME = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL)|^OPENAI_|^AZURE_OPENAI/i;

/** A copy of `base` the CLI can only reach the subscription from. */
export function subscriptionEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...base };
  for (const k of Object.keys(out)) if (KEY_NAME.test(k)) delete out[k];
  return out;
}

export const keysIn = (env: NodeJS.ProcessEnv): string[] => Object.keys(env).filter((k) => KEY_NAME.test(k));

export type CodexRun = {
  readonly exit: number | null;
  readonly wallSeconds: number;
  readonly thread: string | undefined;
  readonly lastMessage: string | undefined;
  readonly itemTypes: readonly unknown[];
  readonly stderr: string;
  readonly events: readonly Record<string, unknown>[];
  readonly env: NodeJS.ProcessEnv;
};

/** One `codex exec` on stdin; `base` is the environment before the strip (a test names a fake binary and CODEX_HOME there). */
export async function runCodex(prompt: string, o: { readonly timeoutS?: number; readonly base?: NodeJS.ProcessEnv } = {}): Promise<CodexRun> {
  const env = subscriptionEnv(o.base ?? process.env);
  const [bin, ...prefix] = resolveEngineBin("codex", env);
  if (bin === undefined) throw new Error("no codex binary");
  const work = mkdtempSync(path.join(os.tmpdir(), "idea-loop-codex-"));
  const argv = [...prefix, "exec", "--json", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--enable", "image_generation", "-C", work, "--sandbox", "read-only", "-"];
  const started = Date.now();
  try {
    // POSIX: its own process group, so killTree reaches the grandchild, which would otherwise hold the stdout pipe and 'close'
    // with it until its own end (measured 25.9 s on Linux for a 1 s timeout). The cost is that a Ctrl-C at this process no longer
    // reaches the seat; the seat then runs to its own end, because the timer dies with this process.
    const child = spawn(bin, argv, { cwd: work, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.stdin.end(prompt);
    // The whole tree: on Windows the child is the `node codex.js` wrapper, and `child.kill()` ends it alone (lib/claudeCli.ts
    // measured the grandchild alive after that call on this spawn shape), keeping the seat busy past its timeout.
    const killer = setTimeout(() => killTree(child.pid, () => child.kill()), (o.timeoutS ?? 480) * 1000);
    const exit = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    }).finally(() => clearTimeout(killer));
    const events = stdout.split(/\r?\n/).flatMap((l): Record<string, unknown>[] => {
      try {
        const e: unknown = JSON.parse(l);
        return typeof e === "object" && e !== null ? [e as Record<string, unknown>] : [];
      } catch {
        return [];
      }
    });
    const started_ = events.find((e) => e.type === "thread.started")?.thread_id;
    const items = events.filter((e) => e.type === "item.completed").map((e) => (e.item ?? {}) as Record<string, unknown>);
    const said = items.filter((i) => i.type === "agent_message").at(-1)?.text;
    return { exit, wallSeconds: Math.round((Date.now() - started) / 100) / 10, thread: typeof started_ === "string" ? started_ : undefined, lastMessage: typeof said === "string" ? said : undefined, itemTypes: items.map((i) => i.type), stderr, events, env };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** The PNGs the built-in image tool wrote for a thread: the only place a claimed image can be. */
export function imagesOf(env: NodeJS.ProcessEnv, thread: string): string[] {
  const dir = path.join(env.CODEX_HOME ?? path.join(os.homedir(), ".codex"), "generated_images", thread);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.png$/i.test(f)).map((f) => path.join(dir, f));
}

export type PngFacts = { readonly width: number; readonly height: number; readonly bytes: number; readonly distinctColours: number; readonly lumaStdDev: number };

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/** A full decode of an 8-bit non-interlaced PNG, so a truncated stream throws where a header check would pass. */
export function inspectPng(b: Buffer): PngFacts {
  if (!b.subarray(0, 8).equals(PNG_SIG)) throw new Error(`not a PNG: starts ${b.subarray(0, 8).toString("hex")}`);
  let at = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (at + 8 <= b.length) {
    const len = b.readUInt32BE(at);
    const type = b.toString("latin1", at + 4, at + 8);
    const body = b.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8] ?? 0;
      colour = body[9] ?? 0;
      interlace = body[12] ?? 0;
    } else if (type === "IDAT") idat.push(body);
    at += 12 + len;
  }
  const channels = CHANNELS[colour];
  if (channels === undefined || depth !== 8 || interlace !== 0) throw new Error(`PNG shape not decoded here: colour ${colour}, depth ${depth}, interlace ${interlace}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length !== (stride + 1) * height) throw new Error(`PNG truncated: ${raw.length} bytes of pixels for ${width}x${height}`);
  const prev = new Uint8Array(stride);
  const row = new Uint8Array(stride);
  const colours = new Set<number>();
  let sum = 0;
  let sq = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start] ?? 0;
    if (filter > 4) throw new Error(`PNG filter ${filter} at row ${y}`);
    for (let x = 0; x < stride; x++) {
      const v = raw[start + 1 + x] ?? 0;
      const a = x >= channels ? (row[x - channels] ?? 0) : 0;
      const up = prev[x] ?? 0;
      const c = x >= channels ? (prev[x - channels] ?? 0) : 0;
      let p = 0;
      if (filter === 1) p = a;
      else if (filter === 2) p = up;
      else if (filter === 3) p = (a + up) >> 1;
      else if (filter === 4) {
        const e = a + up - c;
        const pa = Math.abs(e - a);
        const pb = Math.abs(e - up);
        const pc = Math.abs(e - c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      row[x] = (v + p) & 255;
    }
    for (let x = 0; x < width; x += 4) {
      const i = x * channels;
      const r = row[i] ?? 0;
      const g = channels >= 3 ? (row[i + 1] ?? 0) : r;
      const bl = channels >= 3 ? (row[i + 2] ?? 0) : r;
      colours.add((r << 16) | (g << 8) | bl);
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      sum += l;
      sq += l * l;
      count++;
    }
    prev.set(row);
  }
  const mean = sum / Math.max(1, count);
  return { width, height, bytes: b.length, distinctColours: colours.size, lumaStdDev: Math.round(Math.sqrt(Math.max(0, sq / Math.max(1, count) - mean * mean)) * 100) / 100 };
}

/** Why these facts are not a picture, or undefined. */
export function notAPicture(f: PngFacts): string | undefined {
  if (f.width < 256 || f.height < 256) return `too small to be a picture: ${f.width}x${f.height}`;
  if (f.distinctColours < 256 || f.lumaStdDev < 5) return `blank: ${f.distinctColours} colours, luma deviation ${f.lumaStdDev}`;
  return undefined;
}
