// A day's queue of storyboards and character sets drawn on the operator's ChatGPT seat through `codex exec` image_gen.
//
//   npx tsx pipeline/scout-codex.mts --queue <queue.json> --out <dir> [--workers 3] [--hours 24] [--pause-min 20]
//
// BESIDE THE NIGHT, NOT IN IT. Nothing here opens the store, a night.json or a channel card: a frame drawn here is not a
// candidate, moves no episode and carries no verdict. The Flux doors and the packet stay the only way into the Board.
//
// RESUMABLE. A frame whose png exists is skipped, so a killed run is continued by starting it again with the same --out.
//
// THE PLAN'S LIMIT IS A WAIT, NOT A FAILURE. The seat answers with a usage limit when a window runs out; every worker
// then sleeps --pause-min and tries again, until the deadline. Ordinary failures are retried once and passed over, and
// eight in a row end the run, since that is a broken login or CLI rather than a refused frame.
//
// A STORYBOARD IS ONE LOOK. Frames marked `chain` attach the item's first frame, so five panels read as one film.
import fs from "node:fs";
import path from "node:path";
import { codexImage } from "./trailer/codex.mts";

type Frame = { readonly name: string; readonly prompt: string; readonly refs?: readonly string[]; readonly chain?: boolean };
type Item = { readonly id: string; readonly tier: number; readonly title: string; readonly paragraph?: string; readonly bullets?: readonly string[]; readonly frames: readonly Frame[] };

const arg = (name: string, fallback?: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  const value = at === -1 ? fallback : process.argv[at + 1];
  if (value === undefined) throw new Error(`--${name} is required`);
  return value;
};

const out = path.resolve(arg("out"));
const queue = (JSON.parse(fs.readFileSync(arg("queue"), "utf8")) as Item[]).slice().sort((a, b) => a.tier - b.tier);
const workers = Number(arg("workers", "3"));
const deadline = Date.now() + Number(arg("hours", "24")) * 3_600_000;
const pauseMs = Number(arg("pause-min", "20")) * 60_000;
const FRAME_TIMEOUT_MS = 12 * 60_000;
const MAX_FAILS_IN_A_ROW = 8;
// Only read after a failed turn. A bare 429 would also match a token count such as "14,429".
const LIMIT = /usage limit|rate.?limit|quota|too many requests|hit your|(status|http)\s*429/i;
const CHAIN = "Image 1 is the opening frame of this same film. Hold its medium, palette, light logic, lens character, world and any character exactly; do not repeat its composition. This frame: ";

const slug = (id: string): string => id.replace(/[^A-Za-z0-9-]+/g, "_");
const dirOf = (item: Item): string => path.join(out, `t${item.tier}`, slug(item.id));
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let next = 0;
let pausedUntil = 0;
let failsInARow = 0;
let stopped: string | undefined;
const tally = { drawn: 0, skipped: 0, failed: 0, limitWaits: 0 };

function report(): void {
  const total = queue.reduce((n, i) => n + i.frames.length, 0);
  const status = { ...tally, total, items: queue.length, itemsStarted: next, pausedUntil: pausedUntil > Date.now() ? new Date(pausedUntil).toISOString() : null, stopped: stopped ?? null, deadline: new Date(deadline).toISOString(), at: new Date().toISOString() };
  fs.writeFileSync(path.join(out, "status.json"), JSON.stringify(status, null, 1));
}

function gallery(): void {
  const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const rows = queue.map((item) => {
    const dir = dirOf(item);
    const imgs = item.frames.filter((f) => fs.existsSync(path.join(dir, `${f.name}.png`))).map((f) => `<a href="t${item.tier}/${slug(item.id)}/${f.name}.png"><img loading="lazy" src="t${item.tier}/${slug(item.id)}/${f.name}.png" alt="${esc(f.name)}"></a>`).join("");
    return imgs === "" ? "" : `<section><h2>T${item.tier} · ${esc(item.id)} · ${esc(item.title)}</h2><div>${imgs}</div></section>`;
  }).join("\n");
  fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><meta charset="utf-8"><title>Scout Codex</title><style>body{background:#111;color:#ddd;font:14px system-ui;margin:16px}h2{font-size:14px;font-weight:500}section div{display:flex;gap:6px;overflow-x:auto}img{height:190px;display:block}</style>\n${rows}\n`);
}

async function draw(item: Item, frame: Frame, dir: string): Promise<void> {
  const first = path.join(dir, `${item.frames[0].name}.png`);
  const chained = frame.chain === true && fs.existsSync(first);
  const prompt = chained ? CHAIN + frame.prompt : frame.prompt;
  const refs = [...(chained ? [first] : []), ...(frame.refs ?? [])];
  let retried = false;
  while (stopped === undefined) {
    while (Date.now() < pausedUntil && Date.now() < deadline) await wait(15_000);
    if (Date.now() >= deadline) { stopped = "deadline"; return; }
    if (await codexImage(dir, frame.name, prompt, refs, FRAME_TIMEOUT_MS)) {
      tally.drawn += 1;
      failsInARow = 0;
      return;
    }
    const log = path.join(dir, `${frame.name}.log`);
    if (fs.existsSync(log) && LIMIT.test(fs.readFileSync(log, "utf8"))) {
      pausedUntil = Date.now() + pauseMs;
      tally.limitWaits += 1;
      report();
      continue;
    }
    if (!retried) { retried = true; continue; }
    tally.failed += 1;
    failsInARow += 1;
    if (failsInARow >= MAX_FAILS_IN_A_ROW) stopped = `${MAX_FAILS_IN_A_ROW} failures in a row`;
    return;
  }
}

async function worker(): Promise<void> {
  while (stopped === undefined && next < queue.length) {
    const item = queue[next];
    next += 1;
    const dir = dirOf(item);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "brief.json"), JSON.stringify(item, null, 1));
    for (const frame of item.frames) {
      if (stopped !== undefined) break;
      if (fs.existsSync(path.join(dir, `${frame.name}.png`))) { tally.skipped += 1; continue; }
      await draw(item, frame, dir);
      report();
    }
    gallery();
  }
}

fs.mkdirSync(out, { recursive: true });
report();
await Promise.all(Array.from({ length: workers }, () => worker()));
stopped ??= "queue done";
report();
gallery();
console.log(JSON.stringify({ stopped, ...tally }));
