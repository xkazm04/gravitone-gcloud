// PRODUCTION FIXTURE IMPORTER (spark character-cores S1, WP1) - a one-off: the paused music clip "Leave the Door
// Unlatched" (film 5, paused 2026-11-07 at 1:46) becomes the scout canvas's fixture production, as a graph of stations
// (packages/domain/src/productionGraph.ts), plus the character cores it can cast.
//
//   npx tsx pipeline/production-fixture.mts [--src <music-clip-unlatched folder>] [--dry]
//
// Reads the clip folder READ-ONLY (timeline.json, directions.json + PICK.md, character.md + character/S2-P.jpg,
// keyframes-v2.json + keyframes-v2/*.png, film5/plan.json + K00..K05.mp4 + film5-so-far.mp4, film5/bible/), the
// scout nights through keptCharacters, and the Codex round foundry-out/scout-codex/2026-11-20-new (kept-cores.json,
// verdicts.json, t1/sheet-<key>/sheet.png). Writes app/(studio)/scout/canvas/_port/fixtureProduction.json and copies the
// media (ffmpeg) into foundry-out/production-fixture/{unlatched,cores}/ - never experiment/, which the core-to-scene
// experiment owns. Opens no store: the kernel is never imported.
//
// THE GRAPH, AND WHERE IT IS HONEST ABOUT THE FILM. track -> look -> plates (look-level: the v2 room setups and the
// film-5 per-take plates) -> cast -> keyframes -> clips K00..K05 -> cut. Two keyframe families:
//   · the v2 storyboard frames with t <= 106 s, each made from the look, its room plate, and the cast when it
//     attached her refs (an empty room or the map close-up attached none, so a recast does not stale it);
//   · one START frame per take (`kf:K0x`, the take's own first frame), made from the cast, the look and the take's
//     plate - film 5 rendered from plate + pose control + the character bible, not from the v2 stills, and the
//     experiment redraws exactly these, keyed by take id.
// A clip is made from its start frame, the v2 frames that fall in its window, and the take before it (the chain
// starts each take on the last one's frames). The cut is film5-so-far.mp4 (0-106.4 s) over all six takes.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { CoreRef, Production, ProductionNode, TrackMap } from "../packages/domain/src/productionGraph.ts";
import { productionFileUrl, productionFixtureRoot } from "../lib/foundry/production/files.ts";

// No store is opened, but a lib import that reaches the kernel would: keep it off the operator's file regardless.
process.env["GRAVITONE_STORE_PATH"] ??= path.join(os.tmpdir(), `wp1-store-${process.pid}.sqlite`);

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const SRC = path.resolve(flag("--src") ?? path.join(os.homedir(), "Downloads", "music-clip-unlatched"));
const DRY = args.includes("--dry");
const M = path.join(SRC, "music-clip");
const REPO = process.cwd();
const CODEX = path.join(REPO, "foundry-out", "scout-codex", "2026-11-20-new");
const JSON_OUT = path.join(REPO, "app", "(studio)", "scout", "canvas", "_port", "fixtureProduction.json");
const OUT = productionFixtureRoot();
const RUN = "unlatched";

/** The first minute: frames up to 1:46, the track and the takes through K05's end. */
const FRAMES_UNTIL = 106;
const TAKES = ["K00", "K01", "K02", "K03", "K04", "K05"] as const;
const LOOK_ID = "long-way";

const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const digest = (...parts: readonly string[]): string => createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 12);
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function ffmpeg(...a: readonly string[]): void {
  if (DRY) return;
  execFileSync("ffmpeg", ["-v", "error", "-y", ...a], { stdio: "inherit" });
}

/** A still, at most `w` px wide, as JPEG. Returns its browser URL. */
function still(src: string, run: string, rel: string, w = 960): string {
  const dst = path.join(OUT, run, rel);
  mkdirSync(path.dirname(dst), { recursive: true });
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  ffmpeg("-i", src, "-vf", `scale='min(${w},iw)':-2`, "-frames:v", "1", "-q:v", "3", dst);
  return productionFileUrl(run, rel);
}

/* ── the clip folder ─────────────────────────────────────────────────────── */

type Timeline = {
  readonly track: { readonly file: string; readonly sha1: string; readonly durationS: number };
  readonly tempo: { readonly bpmGlobal: number };
  readonly beats: readonly { readonly t: number }[];
  readonly sections: readonly { readonly id: string; readonly label: string; readonly lyricTag?: string; readonly startS: number; readonly endS: number }[];
  readonly lyrics: readonly { readonly startS: number; readonly text: string }[];
};
type Frame = { readonly id: string; readonly t: number; readonly prompt: string; readonly scene: string; readonly attach: readonly string[] };
type Take = { readonly id: string; readonly startS: number; readonly endS: number; readonly prompt: string };
type Direction = { readonly id: string; readonly name: string; readonly story?: string };

const timeline = readJson<Timeline>(path.join(M, "timeline.json"));
const frames = readJson<{ readonly frames: readonly Frame[] }>(path.join(M, "keyframes-v2.json")).frames.filter((f) => f.t <= FRAMES_UNTIL);
const plan = readJson<readonly Take[]>(path.join(M, "film5", "plan.json")).filter((k) => (TAKES as readonly string[]).includes(k.id));
const direction = readJson<{ readonly directions: readonly Direction[] }>(path.join(M, "directions.json")).directions.find((d) => d.id === LOOK_ID);
if (direction === undefined || plan.length !== TAKES.length) throw new Error("the clip folder lacks the long-way direction or a take of K00-K05");
const lastTake = plan[plan.length - 1] as Take;
const SECONDS = Math.ceil(lastTake.endS);

// The look as film 5 rendered it: the style head every take prompt opens with, verbatim (PICK.md: C3 on long-way).
const lookWords = (plan[0] as Take).prompt.split(". ")[0] ?? "";
const pick = readFileSync(path.join(M, "PICK.md"), "utf8");
if (!pick.includes(LOOK_ID)) throw new Error("PICK.md does not name the long-way look");
const LOOK = `${direction.name}: ${lookWords}.`;

// The lead's identity, verbatim from character.md's "Character phrase".
const phrase = /Character phrase[^\n]*\n"([^"]+)"/.exec(readFileSync(path.join(M, "character.md"), "utf8"))?.[1];
if (phrase === undefined) throw new Error("character.md has no character phrase");

/* ── track ───────────────────────────────────────────────────────────────── */

const trackRel = "track-0-107s.mp3";
mkdirSync(path.join(OUT, RUN), { recursive: true });
ffmpeg("-i", path.join(SRC, timeline.track.file), "-t", String(SECONDS), "-c", "copy", path.join(OUT, RUN, trackRel));
const track: TrackMap = {
  title: "Leave the Door Unlatched",
  seconds: SECONDS,
  bpm: round3(timeline.tempo.bpmGlobal),
  beats: timeline.beats.filter((b) => b.t <= SECONDS).map((b) => b.t),
  sections: timeline.sections.filter((s) => s.startS < SECONDS).map((s) => ({ name: s.lyricTag ?? s.label, start: s.startS, end: Math.min(s.endS, SECONDS) })),
  lyrics: timeline.lyrics.filter((l) => l.startS <= SECONDS).map((l) => ({ t: l.startS, text: l.text })),
  audio: productionFileUrl(RUN, trackRel),
};

/* ── nodes ───────────────────────────────────────────────────────────── */

const nodes: ProductionNode[] = [];
const add = (n: ProductionNode): void => void nodes.push(n);

add({ id: "track", station: "track", label: track.title, state: "made", madeFrom: [], inputsDigest: digest(timeline.track.sha1), media: { kind: "audio", src: track.audio as string }, at: 0, dur: SECONDS });
add({ id: "look", station: "look", label: direction.name, state: "made", madeFrom: [], inputsDigest: digest(LOOK), prompt: LOOK });

// Plates are look-level: the v2 room setups the stills attached, and film 5's plate per take.
const plateId = (file: string): string => `plate:${path.basename(file, path.extname(file))}`;
const roomPlates = [...new Set(frames.flatMap((f) => f.attach.filter((a) => a.startsWith("room/"))))].sort();
for (const rel of roomPlates) {
  const id = plateId(rel);
  add({ id, station: "look", label: path.basename(rel, path.extname(rel)), state: "made", madeFrom: ["look"], inputsDigest: digest("look", rel), media: { kind: "image", src: still(path.join(M, rel), RUN, `plates/${path.basename(rel, path.extname(rel))}.jpg`) } });
}
for (const k of TAKES) {
  const rel = `film5/bible/src/P-${k}.png`;
  add({ id: `plate:P-${k}`, station: "look", label: `P-${k}`, state: "made", madeFrom: ["look"], inputsDigest: digest("look", rel), media: { kind: "image", src: still(path.join(M, rel), RUN, `plates/P-${k}.jpg`) } });
}

const LEAD: CoreRef = {
  id: "chr:unlatched-lead",
  name: "Unlatched lead (S2)",
  identity: phrase,
  portrait: still(path.join(M, "character", "S2-P.jpg"), "cores", "unlatched-lead/portrait.jpg"),
  sheet: still(path.join(M, "film5", "bible", "CH1.png"), "cores", "unlatched-lead/sheet.jpg", 1280),
  origin: "the clip's own lead (character.md S2, film-5 bible CH1)",
};
add({ id: "cast", station: "cast", label: LEAD.name, state: "made", madeFrom: [], inputsDigest: digest(LEAD.id, LEAD.identity), media: { kind: "image", src: LEAD.portrait } });

// The v2 storyboard frames.
const castsHer = (f: Frame): boolean => f.attach.some((a) => a.startsWith("character/"));
for (const f of frames) {
  const plates = f.attach.filter((a) => a.startsWith("room/")).map(plateId);
  const madeFrom = [...(castsHer(f) ? ["cast"] : []), "look", ...plates];
  add({ id: `kf:${f.id}`, station: "keyframe", label: f.id, state: "made", madeFrom, inputsDigest: digest(...madeFrom, f.prompt), media: { kind: "image", src: still(path.join(M, "keyframes-v2", `${f.id}.png`), RUN, `keyframes/${f.id}.jpg`) }, at: f.t, prompt: f.prompt });
}

// The takes' start frames, then the takes.
for (const k of plan) {
  const rel = `keyframes/${k.id}-start.jpg`;
  const dst = path.join(OUT, RUN, rel);
  mkdirSync(path.dirname(dst), { recursive: true });
  ffmpeg("-i", path.join(M, "film5", `${k.id}.mp4`), "-frames:v", "1", "-vf", "scale='min(960,iw)':-2", "-q:v", "3", dst);
  const madeFrom = ["cast", "look", `plate:P-${k.id}`];
  add({ id: `kf:${k.id}`, station: "keyframe", label: `${k.id} start`, state: "made", madeFrom, inputsDigest: digest(...madeFrom, k.prompt), media: { kind: "image", src: productionFileUrl(RUN, rel) }, at: k.startS });
}
plan.forEach((k, i) => {
  const next = plan[i + 1];
  const until = next === undefined ? k.endS : next.startS;
  const inWindow = frames.filter((f) => f.t >= k.startS && f.t < until).map((f) => `kf:${f.id}`);
  const prev = plan[i - 1];
  const madeFrom = [`kf:${k.id}`, ...inWindow, ...(prev === undefined ? [] : [`clip:${prev.id}`])];
  const rel = `takes/${k.id}.mp4`;
  const dst = path.join(OUT, RUN, rel);
  mkdirSync(path.dirname(dst), { recursive: true });
  // 1280x704 h264 already: under 720p, copied as made.
  ffmpeg("-i", path.join(M, "film5", `${k.id}.mp4`), "-c", "copy", "-movflags", "+faststart", dst);
  add({ id: `clip:${k.id}`, station: "clip", label: k.id, state: "made", madeFrom, inputsDigest: digest(...madeFrom, k.prompt), media: { kind: "video", src: productionFileUrl(RUN, rel) }, at: round3(k.startS), dur: round3(k.endS - k.startS), prompt: k.prompt });
});

const cutRel = "cut/film5-so-far-720p.mp4";
mkdirSync(path.join(OUT, RUN, "cut"), { recursive: true });
ffmpeg("-i", path.join(M, "film5", "film5-so-far.mp4"), "-vf", "scale=-2:720", "-c:v", "libx264", "-crf", "22", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", path.join(OUT, RUN, cutRel));
const cutDur = DRY ? 106.375 : Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(OUT, RUN, cutRel)], { encoding: "utf8" }).trim());
const clipIds = plan.map((k) => `clip:${k.id}`);
add({ id: "cut", station: "cut", label: "film 5 so far", state: "made", madeFrom: clipIds, inputsDigest: digest(...clipIds), media: { kind: "video", src: productionFileUrl(RUN, cutRel) }, at: 0, dur: round3(cutDur) });

const production: Production = { id: RUN, title: track.title, track, look: LOOK, cast: LEAD, nodes };

/* ── cores ───────────────────────────────────────────────────────────── */

const { keptCharacters, identityBlock } = await import("../lib/foundry/scout/characters.ts");
const { readRootedNights, nightDir } = await import("../lib/foundry/scout/store.ts");

type KeptCore = { readonly id: string; readonly name: string; readonly age: number; readonly look: string; readonly plays: string; readonly portrait: string; readonly sheet?: string };
const keptCores = readJson<readonly KeptCore[]>(path.join(CODEX, "kept-cores.json"));
const verdicts = readJson<{ readonly items: Readonly<Record<string, { readonly verdict: string }>> }>(path.join(CODEX, "verdicts.json")).items;
const keptHere = (id: string): boolean => verdicts[id]?.verdict === "keep";
const folder = (key: string): string => key.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();

const cores: CoreRef[] = [LEAD];
for (const c of keptCores) {
  if (!keptHere(c.id)) continue;
  const key = folder(c.id.replace(/^new-/, ""));
  cores.push({
    id: `chr:${key}`,
    name: c.name,
    identity: identityBlock({ name: c.name, age: c.age, look: c.look, personality: c.plays }),
    portrait: still(c.portrait, "cores", `${key}/portrait.jpg`),
    ...(c.sheet === undefined ? {} : { sheet: still(c.sheet, "cores", `${key}/sheet.jpg`, 1280) }),
    origin: "Codex round 2026-11-20-new (kept)",
  });
}
for (const k of keptCharacters(await readRootedNights())) {
  const key = folder(k.key);
  const portrait = k.portrait.root === "archive" ? path.join(REPO, "foundry-out", "scout-muse", k.portrait.night, k.portrait.file) : path.join(nightDir(k.portrait.night), k.portrait.file);
  const t1 = path.join(CODEX, "t1", `sheet-${k.key}`, "sheet.png");
  const sheet = keptHere(`sheet-${k.key}`) && existsSync(t1) ? { src: t1, from: "Codex round 2026-11-20-new" } : k.sheet === undefined ? undefined : { src: path.join(nightDir(k.sheet.night), k.sheet.file), from: `scout night ${k.sheet.night}` };
  cores.push({
    id: `chr:${key}`,
    name: k.card.name,
    identity: identityBlock(k.card),
    portrait: still(portrait, "cores", `${key}/portrait.jpg`),
    ...(sheet === undefined ? {} : { sheet: still(sheet.src, "cores", `${key}/sheet.jpg`, 1280) }),
    origin: `scout keep (${k.keptOn.join(", ")})${sheet === undefined ? "" : `; sheet from ${sheet.from}`}`,
  });
}
const ids = new Set<string>();
for (const c of cores) {
  if (ids.has(c.id)) throw new Error(`two cores share ${c.id}`);
  ids.add(c.id);
}

const count = (st: string): number => nodes.filter((n) => n.station === st).length;
console.log(`nodes ${nodes.length}: ${["track", "look", "cast", "keyframe", "clip", "cut"].map((s) => `${s} ${count(s)}`).join(", ")}; cores ${cores.length}`);
if (!DRY) {
  writeFileSync(JSON_OUT, `${JSON.stringify({ production, cores }, null, 1)}\n`);
  console.log(`wrote ${path.relative(REPO, JSON_OUT)}; media under ${path.relative(REPO, OUT)}`);
}
