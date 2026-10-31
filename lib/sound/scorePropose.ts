import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  INSTRUMENT_CATALOG,
  SCORE_KEYS,
  SCORE_MAX_TRACKS,
  SCORE_ROLES,
  SCORE_SPEC_VERSION,
  STYLE_TEMPLATES,
  TRACK_ID_RE,
  parseScoreSpec,
  type ScoreKey,
  type ScoreRole,
  type ScoreSpec,
  type StyleTemplateId,
} from "@gt/domain/audio.score";
import { templateById } from "@gt/domain/audio.score.templates";
import { err, ok, type Result } from "@gt/domain/errors";

import { reason as routerReason } from "@/lib/text/router";
import type { TextProvenance, TextRequest, TextResult, TurnClass } from "@/lib/text/types";

// SCORE PROPOSE (A1 + A2 + C6) — the operator's plain-language brief in, ONE closed ScoreSpec out.
// Follows lib/sound/voiceFx/propose.ts: the prompt is read per call from pipeline/SCORE-PROMPT.md,
// the answer passes ONE door (`parseScoreSpec` at "score spec"), and any out-of-key note,
// silent/refused plugin, or out-of-range control is refused with its exact path - never clamped.
// Also provides `draftScoreFromBrief` for $0 deterministic local brief compilation under DRY_ONLY.

export type ReasonFn = (req: TextRequest) => Promise<TextResult>;

export const SCORE_PROPOSE_TURN: TurnClass = "sound-hunt";
export const PROMPT_FILE = path.join("pipeline", "SCORE-PROMPT.md");
export const SCORE_DOOR = "score spec";
export const BRIEF_MAX = 400;

export const READY_INSTRUMENT_IDS: readonly string[] = INSTRUMENT_CATALOG.filter((i) => i.audition.status === "ready").map((i) => i.id);

export const SCORE_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["v", "title", "seed", "tempoBpm", "key", "controls", "sections", "tracks"],
  properties: {
    v: { type: "integer", enum: [SCORE_SPEC_VERSION] },
    title: { type: "string" },
    style: { type: "string", enum: [...STYLE_TEMPLATES] },
    seed: { type: "integer" },
    tempoBpm: { type: "number" },
    key: { type: "string", enum: [...SCORE_KEYS] },
    loop: { type: "boolean" },
    controls: {
      type: "object",
      required: ["density", "brightness", "lift", "swing", "humanise"],
      properties: {
        density: { type: "number" },
        brightness: { type: "number" },
        lift: { type: "number" },
        swing: { type: "number" },
        humanise: { type: "number" },
      },
    },
    sections: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        required: ["name", "bars", "energy"],
        properties: {
          name: { type: "string" },
          bars: { type: "integer" },
          energy: { type: "number" },
          progression: { type: "array", items: { type: "integer" } },
        },
      },
    },
    tracks: {
      type: "array",
      minItems: 1,
      maxItems: SCORE_MAX_TRACKS,
      items: {
        type: "object",
        required: ["role", "instrument"],
        properties: {
          role: { type: "string", enum: [...SCORE_ROLES] },
          // Required on every track of a role that repeats (two leads); unique across the tracks.
          id: { type: "string", pattern: TRACK_ID_RE.source },
          instrument: { type: "string", enum: [...READY_INSTRUMENT_IDS] },
          // One flag per section; omit to play everywhere.
          enters: { type: "array", items: { type: "boolean" } },
          gainDb: { type: "number" },
          pan: { type: "number" },
          pattern: { type: "string" },
        },
      },
    },
  },
};

export const stripComments = (md: string): string => md.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "").trim();

export async function promptText(at: string = path.join(process.cwd(), PROMPT_FILE)): Promise<Result<string>> {
  try {
    return ok(stripComments(await readFile(at, "utf8")));
  } catch {
    return err("unavailable", `the prompt file ${path.relative(process.cwd(), at)} is missing - it is part of the code`);
  }
}

export function scorePrompt(template: string, describe: string): string {
  return template.replace("{{IDEA}}", describe.trim());
}

export async function buildScorePrompt(idea: string): Promise<string> {
  const t = await promptText();
  return t.ok ? scorePrompt(t.value, idea) : idea.trim();
}

export function scoreOf(answer: unknown): Result<ScoreSpec> {
  return parseScoreSpec(answer);
}

export type ProposedScore = { readonly spec: ScoreSpec; readonly provenance: TextProvenance };

export async function proposeScoreSpec(describe: string, reason: ReasonFn = routerReason): Promise<Result<ProposedScore>> {
  const words = describe.trim();
  if (words === "") return err("invalid", "a score spec needs a brief description");
  if (words.length > BRIEF_MAX) return err("invalid", `a score brief is at most ${BRIEF_MAX} characters (this one is ${words.length})`);
  const template = await promptText();
  if (!template.ok) return template;
  const out = await reason({ turn: SCORE_PROPOSE_TURN, prompt: scorePrompt(template.value, words), schema: SCORE_SCHEMA });
  const spec = scoreOf(out.json);
  return spec.ok ? ok({ spec: spec.value, provenance: out.provenance }) : spec;
}

const KEY_ALIASES: readonly (readonly [RegExp, ScoreKey])[] = [
  [/\bf#\s*min(?:or)?\b/i, "F# minor"],
  [/\ba\s*min(?:or)?\b/i, "A minor"],
  [/\be\s*min(?:or)?\b/i, "E minor"],
  [/\bd\s*min(?:or)?\b/i, "D minor"],
  [/\bc\s*min(?:or)?\b/i, "C minor"],
  [/\bg\s*min(?:or)?\b/i, "G minor"],
  [/\bbb\s*maj(?:or)?\b/i, "Bb major"],
  [/\beb\s*maj(?:or)?\b/i, "Eb major"],
  [/\bc\s*maj(?:or)?\b/i, "C major"],
  [/\bg\s*maj(?:or)?\b/i, "G major"],
  [/\bd\s*maj(?:or)?\b/i, "D major"],
  [/\bf\s*maj(?:or)?\b/i, "F major"],
];

const ROLE_KEYWORDS: readonly (readonly [RegExp, ScoreRole, string])[] = [
  [/\b(?:909|electronic\s+kit|tight\s+kit|four\s+on\s+the\s+floor)\b/i, "drums", "kit-909-pulse"],
  [/\b(?:brush|acoustic\s+kit|soft\s+drums|rimshot)\b/i, "drums", "kit-acoustic-brush"],
  [/\b(?:808|boom[\s-]?bap|hip[\s-]?hop\s+kit)\b/i, "drums", "kit-808-warm"],
  [/\b(?:pulse\s+bass|analog\s+bass|synth\s+bass)\b/i, "bass", "vital-pulse-bass"],
  [/\b(?:finger\s+bass|picked\s+bass|acoustic\s+bass|warm\s+bass)\b/i, "bass", "sample-mamas-bass"],
  [/\b(?:sub\s+bass|deep\s+bass|808\s+bass)\b/i, "bass", "vital-sub-bass"],
  [/\b(?:felt\s+piano|upright\s+piano|intimate\s+piano|piano)\b/i, "chords", "sample-felt-piano"],
  [/\b(?:grand\s+piano|concert\s+piano|bright\s+piano)\b/i, "chords", "sample-grand-piano"],
  [/\b(?:warm\s+keys|electric\s+keys|lofi\s+keys|lo-fi\s+keys|rhodes|epiano)\b/i, "chords", "sample-lofi-keys"],
  [/\b(?:pad|warm\s+pad|synth\s+pad)\b/i, "chords", "vital-warm-pad"],
  [/\b(?:bell|kalimba|thumb\s+piano|ikembe)\b/i, "lead", "sample-ikembe-bell"],
  [/\b(?:guitar|mallet\s+guitar|acoustic\s+guitar|plucked\s+guitar)\b/i, "lead", "sample-mallet-guitar"],
  [/\b(?:flute|airy|glass\s+lead|breathy)\b/i, "lead", "vital-glass-lead"],
  [/\b(?:pluck|synth\s+pluck|arp\s+lead)\b/i, "lead", "vital-pluck-lead"],
];

/** Deterministic $0 local brief-to-ScoreSpec compiler (no LLM call). */
export function draftScoreFromBrief(describe: string): Result<{ readonly spec: ScoreSpec; readonly summary: string }> {
  const words = describe.trim();
  if (words === "") return err("invalid", "a score brief cannot be empty");
  const lower = words.toLowerCase();
  const style: StyleTemplateId =
    /\b(?:synth|pulse|cyber|electronic|909|drive)\b/.test(lower)
      ? "synthwave-pulse"
      : /\b(?:calm|bed|narrative|quiet|voiceover|ambient|gentle)\b/.test(lower)
        ? "calm-bed"
        : /\b(?:acoustic|folk|workshop|sunlight|guitar)\b/.test(lower)
          ? "warm-acoustic"
          : "chill-hiphop";
  const base = templateById(style).spec;
  const bpmMatch = /\b(\d{2,3})\s*bpm\b/i.exec(words);
  const tempoBpm = bpmMatch ? Math.max(40, Math.min(220, Number(bpmMatch[1]))) : base.tempoBpm;
  const key = KEY_ALIASES.find(([re]) => re.test(words))?.[1] ?? base.key;
  const isLoop = /\b(?:loop|seamless|repeating)\b/i.test(words);

  const secMatch = /\b(\d{1,3})\s*(?:s|sec|seconds)\b/i.exec(words);
  const barMatch = /\b(\d{1,2})\s*bars?\b/i.exec(words);
  const barS = 240 / tempoBpm;
  const targetBars = barMatch
    ? Math.max(2, Math.min(64, Number(barMatch[1])))
    : secMatch
      ? Math.max(2, Math.min(64, Math.round(Math.max(4, Number(secMatch[1]) - (isLoop ? 0 : 0.45)) / barS)))
      : base.sections.reduce((a, s) => a + s.bars, 0);

  const hasMiddleLift = /\b(?:lift|build|middle|swell|chorus)\b/i.test(words);
  const sections = isLoop
    ? [{ name: "loop", bars: Math.max(2, Math.min(32, targetBars)), energy: 0.82, progression: [0, 5, 3, 4] }]
    : targetBars >= 6
      ? [
          { name: "intro", bars: Math.max(1, Math.floor(targetBars * 0.25)), energy: 0.34, progression: [0, 4, 5, 3] },
          { name: "lift", bars: Math.max(2, targetBars - 2 * Math.max(1, Math.floor(targetBars * 0.25))), energy: hasMiddleLift ? 0.88 : 0.82, progression: [3, 0, 4, 5] },
          { name: "outro", bars: Math.max(1, Math.floor(targetBars * 0.25)), energy: 0.35, progression: [0, 3, 0, 0] },
        ]
      : base.sections;

  const roleOverrides = new Map<ScoreRole, string>();
  for (const [re, role, instId] of ROLE_KEYWORDS) {
    if (!roleOverrides.has(role) && re.test(words)) roleOverrides.set(role, instId);
  }
  const tracks = base.tracks.map((tr) => ({
    ...tr,
    instrument: roleOverrides.get(tr.role) ?? tr.instrument,
  }));
  const controls = {
    ...base.controls,
    ...(hasMiddleLift ? { lift: Math.max(base.controls.lift, 0.8) } : {}),
    ...(/\b(?:soft|quiet|calm|gentle)\b/i.test(words) ? { density: 0.4, brightness: 0.38 } : {}),
    ...(/\b(?:bright|crisp|punchy)\b/i.test(words) ? { brightness: 0.72, density: 0.68 } : {}),
  };
  let hash = 2166136261;
  for (let i = 0; i < words.length; i++) hash = Math.imul(hash ^ words.charCodeAt(i), 16777619);
  const seed = Math.abs(hash) % 1_000_000;
  const candidate: ScoreSpec = {
    ...base,
    title: words.slice(0, 72),
    style,
    seed,
    tempoBpm,
    key,
    loop: isLoop,
    controls,
    sections,
    tracks,
  };
  const checked = parseScoreSpec(candidate);
  if (!checked.ok) return checked;
  const instList = tracks.map((t) => `${t.role}:${t.instrument}`).join(", ");
  const totalB = sections.reduce((a, s) => a + s.bars, 0);
  return ok({
    spec: checked.value,
    summary: `sketched ${style} in ${key} at ${tempoBpm} bpm (${totalB} bars${isLoop ? " loop" : ""}) · ${instList}`,
  });
}
