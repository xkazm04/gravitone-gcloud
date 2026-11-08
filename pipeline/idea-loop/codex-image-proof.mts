#!/usr/bin/env -S npx tsx
// CAN CODEX DRAW WITH NOBODY AT THE KEYBOARD? (idea loop, stage 1)
//
// One non-interactive `codex exec` asks the CLI's built-in image tool for one picture, on the operator's
// ChatGPT subscription and never on an API key. The exit code and the model's closing sentence prove nothing:
// a refusal exits 0 and a model can say "saved". THE FILE IS THE EVIDENCE. The built-in tool writes under
// $CODEX_HOME/generated_images/<thread>/, so the proof names the thread from the event stream and looks there,
// then fully decodes the PNG and refuses a blank one.
//
//   npx tsx pipeline/idea-loop/codex-image-proof.mts [--out <dir>] [--timeout-s 480]
//
// Prints one JSON report on stdout and exits 0 only when every requirement held. Each run is one real draw
// against the operator's subscription: the idea-loop brief allows at most three here.

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { resolveEngineBin } from "../../lib/agent/resolveEngineBin.ts";

const PROMPT = [
  "Generate exactly one image with your built-in image generation tool (image_gen). Do not write code, do not run a shell command, and do not use any script or API.",
  "The image: a rough storyboard frame, 16:9, of a lighthouse keeper's lantern reflected in a flooded stairwell at dusk, loose ink and wash.",
  "When the tool has returned, reply with the single word DONE.",
].join("\n");

/** What must never reach the child: every API key, and anything that would redirect it off the subscription. */
const KEY_NAME = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL)|^OPENAI_|^AZURE_OPENAI/i;

function subscriptionEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...base };
  for (const k of Object.keys(out)) if (KEY_NAME.test(k)) delete out[k];
  return out;
}

type PngFacts = { readonly width: number; readonly height: number; readonly bytes: number; readonly distinctColours: number; readonly lumaStdDev: number };

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/** A full decode of an 8-bit non-interlaced PNG, so a truncated stream throws rather than passing a header check. */
function inspectPng(file: string): PngFacts {
  const b = readFileSync(file);
  if (!b.subarray(0, 8).equals(PNG_SIG)) throw new Error(`not a PNG: starts ${b.subarray(0, 8).toString("hex")}`);
  let at = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (at < b.length) {
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
      } else if (filter !== 0) throw new Error(`PNG filter ${filter} at row ${y}`);
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

/** The PNGs the built-in tool wrote for this thread: the only place the claim can be true. */
function imagesOf(codexHome: string, thread: string): string[] {
  const dir = path.join(codexHome, "generated_images", thread);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.png$/i.test(f)).map((f) => path.join(dir, f));
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const work = path.join(os.tmpdir(), `idea-loop-proof-${process.pid}`);
const outDir = path.resolve(flag("out") ?? work);
const timeoutS = Number(flag("timeout-s") ?? 480);
mkdirSync(work, { recursive: true });
mkdirSync(outDir, { recursive: true });

const env = subscriptionEnv(process.env);
const codexHome = env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
const [bin, ...prefix] = resolveEngineBin("codex", env);
if (bin === undefined) throw new Error("no codex binary");
const argv = [...prefix, "exec", "--json", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--enable", "image_generation", "-C", work, "--sandbox", "read-only", "-"];

const started = Date.now();
const child = spawn(bin, argv, { cwd: work, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
let stdout = "";
let stderr = "";
child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
child.stdin.end(PROMPT);
const killer = setTimeout(() => child.kill(), timeoutS * 1000);
const exit = await new Promise<number | null>((resolve, reject) => {
  child.on("error", reject);
  child.on("close", resolve);
});
clearTimeout(killer);
const wallSeconds = Math.round((Date.now() - started) / 100) / 10;

const events = stdout.split(/\r?\n/).flatMap((l): Record<string, unknown>[] => {
  try {
    return [JSON.parse(l) as Record<string, unknown>];
  } catch {
    return [];
  }
});
const thread = events.find((e) => e.type === "thread.started")?.thread_id;
const found = typeof thread === "string" ? imagesOf(codexHome, thread) : [];

const leaked = Object.keys(env).filter((k) => KEY_NAME.test(k));
const failures: string[] = [];
if (exit !== 0) failures.push(`codex exited ${String(exit)}`);
if (leaked.length > 0) failures.push(`key-shaped variables reached the child: ${leaked.join(", ")}`);
if (typeof thread !== "string") failures.push("no thread.started event: nowhere to look for the image");
if (found.length === 0) failures.push("no PNG on disk for this thread");

let image: string | undefined;
let facts: PngFacts | undefined;
if (found[0] !== undefined) {
  image = path.join(outDir, `proof-${String(thread)}.png`);
  copyFileSync(found[0], image);
  try {
    facts = inspectPng(image);
    if (facts.width < 256 || facts.height < 256) failures.push(`too small to be a picture: ${facts.width}x${facts.height}`);
    if (facts.distinctColours < 256 || facts.lumaStdDev < 5) failures.push(`blank: ${facts.distinctColours} colours, luma deviation ${facts.lumaStdDev}`);
  } catch (e) {
    failures.push(`the PNG did not decode: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const items = events.filter((e) => e.type === "item.completed").map((e) => e.item as Record<string, unknown>);
const lastMessage = items.filter((i) => i.type === "agent_message").at(-1)?.text;
const report = {
  ok: failures.length === 0,
  failures,
  exit,
  wallSeconds,
  thread,
  image,
  imagesForThread: found.length,
  png: facts,
  keysInChildEnv: leaked,
  itemTypes: items.map((i) => i.type),
  lastMessage,
  stderrTail: failures.length === 0 ? undefined : stderr.slice(-1500),
  eventTail: failures.length === 0 ? undefined : events.slice(-4),
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.ok ? 0 : 1);
