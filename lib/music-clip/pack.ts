// THE BAKE-OFF PACK - the sealed input every stack renders from. Three stacks
// are compared on the same clip only if they were handed the same bytes, so the
// pack is copied (never linked: a stack that "fixes" an input in place would
// change the other stacks' input under them) and hashed, and `packSha1` is the
// one number a result can cite to say which input it was made from.
//
// packSha1 is the sha1 of the sorted `name<TAB>sha1` lines: a changed byte in
// any file, a renamed file, an added or a dropped file all move it, and the
// same inputs always give the same hash whatever order the copy ran in.

import fs from "node:fs";
import path from "node:path";

import type { StoryV1 } from "./boards";
import { readDirections } from "./boards";
import { clipPath, ensureDir, readFolder, readJsonFile, readTimeline, requireState, sha1File, sha1Of, writeClipJson, writeState } from "./folder";
import { advanceTo, atLeast, ClipError } from "./state";

export interface PackV1 {
  v: 1;
  files: Record<string, string>;
  packSha1: string;
}

export function packHash(files: Record<string, string>): string {
  return sha1Of(Object.keys(files).sort().map((k) => `${k}\t${files[k]}`).join("\n"));
}

export interface PackResult {
  dir: string;
  pack: PackV1;
  warnings: string[];
  stage: string;
}

export function runPack(dir: string, audio?: string, now = () => new Date().toISOString()): PackResult {
  const state = requireState(dir);
  if (!atLeast(state, "picked-b") || state.picks.b === undefined) throw new ClipError(`pack needs an approved story: pick <dir> b:<direction-id> (stage ${state.stage})`, "stage");
  const folder = readFolder(dir, audio);
  const timeline = readTimeline(dir);
  const direction = readDirections(dir).directions.find((d) => d.id === state.picks.a);
  if (!direction) throw new ClipError(`picked direction "${state.picks.a ?? ""}" is not in directions.json`, "stage");
  const story = readJsonFile(clipPath(dir, "story.json"), "story.json") as StoryV1;
  const warnings: string[] = [];

  const out = clipPath(dir, "bakeoff", "pack");
  // A stale file from an earlier pack would be sealed into this one's hash, so the pack starts empty.
  fs.rmSync(out, { recursive: true, force: true });
  ensureDir(out);
  const copy = (from: string, as: string) => fs.copyFileSync(from, path.join(out, as));
  copy(clipPath(dir, "timeline.json"), "timeline.json");
  copy(folder.lyricsPath, path.basename(folder.lyricsPath));
  copy(folder.stylePath, path.basename(folder.stylePath));
  copy(folder.audioPath, path.basename(folder.audioPath));
  fs.writeFileSync(path.join(out, "direction.json"), `${JSON.stringify(direction, null, 2)}\n`);
  fs.writeFileSync(path.join(out, "story.json"), `${JSON.stringify(story, null, 2)}\n`);
  const hero = clipPath(dir, "board-b", "hero.html");
  if (fs.existsSync(hero)) copy(hero, "hero.html");
  else warnings.push("no board-b/hero.html to pack");

  const audioSha = sha1File(folder.audioPath);
  if (audioSha !== timeline.track.sha1) warnings.push(`the mp3's sha1 ${audioSha.slice(0, 12)} is not timeline.track.sha1 ${timeline.track.sha1.slice(0, 12)}; re-run analyze if the track changed`);

  const files: Record<string, string> = {};
  for (const name of fs.readdirSync(out).sort()) files[name] = sha1File(path.join(out, name));
  const pack: PackV1 = { v: 1, files, packSha1: packHash(files) };
  writeClipJson(dir, path.join("bakeoff", "pack", "pack.json"), pack);
  const next = advanceTo(state, "bakeoff", now());
  if (next !== state) writeState(dir, next);
  return { dir: out, pack, warnings, stage: next.stage };
}
