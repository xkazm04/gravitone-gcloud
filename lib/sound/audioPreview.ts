// LOCAL PREVIEW LOOKUP - which file on this machine lets a user HEAR a catalog instrument.
// Server-only. The roots are the studio's one sample-library setting, `GRAVITONE_SAMPLE_ROOTS`
// (lib/audio/atlas.ts SAMPLE_ROOTS_ENV, path-delimiter separated: the FL Studio Packs and Ableton
// Core Library folders); nothing about this machine is committed, and no sample bytes ever leave by
// this path - only a file path the user's own player can open. The walk is bounded so a huge library
// cannot hang a tool call. Ported from hackathon audio-steer-1028 entry e4 (spark audio-agent-studio S2).

import fs from "node:fs";
import path from "node:path";

import { sampleRoots as configuredRoots } from "../audio/atlas.ts";

const AUDIO_EXT = new Set([".wav", ".mp3", ".flac", ".ogg", ".aif", ".aiff", ".m4a"]);
const MAX_ENTRIES = 6000;
const MAX_DEPTH = 5;

let cache: { readonly rootsKey: string; readonly files: readonly string[] } | null = null;

/** The configured sample roots that exist on this machine, in configured order. */
export function sampleRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  return configuredRoots(env).filter((r) => fs.existsSync(r));
}

function collect(): readonly string[] {
  const roots = sampleRoots();
  const key = roots.join(path.delimiter);
  if (cache?.rootsKey === key) return cache.files;
  const files: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (files.length >= MAX_ENTRIES || depth > MAX_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= MAX_ENTRIES) return;
      const at = path.join(dir, e.name);
      if (e.isDirectory()) walk(at, depth + 1);
      else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) files.push(at);
    }
  };
  for (const r of roots) walk(r, 0);
  cache = { rootsKey: key, files };
  return files;
}

const tokensOf = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** How well one file answers `keywords` for `role`; below 8 is no answer. */
function scoreOf(f: string, keywords: readonly string[], role: string | undefined): number {
  const lower = f.toLowerCase();
  // Convolution impulse responses and device-preview renders are not instruments to hear.
  if (/[/\\]impulseresponses[/\\]/.test(lower) || /[/\\]previews[/\\]/.test(lower)) return 0;
  const inDrums = /[/\\](drums?|percussion|kicks?|snares?|hihats?|cymbals?)[/\\]/.test(lower);
  if (role !== "pulse" && inDrums) return 0;
  if (role === "pulse" && /[/\\](keyboard|strings|guitar|vocal)[/\\]/.test(lower)) return 0;
  const nameTokens = tokensOf(path.basename(f));
  const pathTokens = tokensOf(f);
  let score = 0;
  for (const kw of keywords) {
    const phrase = kw.toLowerCase().replace(/\s+/g, " ");
    const phraseHit = path.basename(f).toLowerCase().replace(/[_-]+/g, " ").includes(phrase);
    if (phraseHit) score += 12;
    for (const tok of tokensOf(kw)) {
      // A short token alone ("box", "sub") is a weak claim: it must not crown a near miss.
      // A short word that IS the file's name ("PAD_...") is the whole claim, and counts.
      if (nameTokens.includes(tok)) score += tok.length >= 4 || phraseHit ? 8 : 2;
      else if (nameTokens.some((t) => t.startsWith(tok) && tok.length >= 4)) score += 2;
      if (pathTokens.includes(tok)) score += 2;
    }
  }
  if (/[/\\]instruments?[/\\]/.test(lower)) score += 3;
  if (/[/\\]loops[/\\]/.test(lower)) score -= 5;
  if (nameTokens.some((t) => ["noise", "noises", "clacking", "clack", "clicks"].includes(t))) score -= 25;
  else if (nameTokens.includes("fx")) score -= 6;
  return score;
}

/**
 * The best local file to hear for `keywords`, or null when none is configured or found.
 * Token scoring, not substring: "bass" must not crown a snare named "Ambass", and a drum
 * folder must not speak for a guitar. `role` keeps pulse sounds in drum folders and every
 * other role out of them; a file under an Instruments folder outranks a stray name match.
 */
export function previewFor(keywords: readonly string[], role?: string, seen?: ReadonlySet<string>): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const f of collect()) {
    // A file already handed out in this response must not speak for a second instrument:
    // palettes are compared by ear, and one file twice reads as one option, not two.
    if (seen?.has(f)) continue;
    const score = scoreOf(f, keywords, role);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return bestScore >= 8 ? best : null;
}
