// HUNT — an idea in, a map of variations out. Server-only: the draft is a
// lib/text turn (the "sound-hunt" TurnClass, lib/text/types.ts; the lesson's
// "sound-lesson" turn is lib/sound/lessons.ts's), and nothing here touches a
// music vendor — the map is drafted for free-ish, and the operator decides
// which leaves are worth rendering (generate.ts, metered there).
//
// THE PROMPTS ARE FILES. pipeline/SOUND-HUNT-PROMPT.md and
// pipeline/SOUND-LESSON-PROMPT.md, read per call, sectioned by kind (music and
// sfx are briefed differently — the registry's two subjects disagree on
// almost everything, starting with whether a sound has a tempo). The repo law:
// a prompt is code, it lives in pipeline/, and the code reads it.
//
// WHAT THE MODEL MAY DECIDE, AND WHAT IT MAY NOT. It drafts axes, labels,
// rationales and prompts. It does not decide what counts as a technique (the
// slugs are filtered to types.ts TECHNIQUES), what a duration may be (clamped to
// the vendor window), or which provider exists (a leaf naming anything but
// elevenlabs/suno is dropped).
//
// The v1 doors that lived here - the whole-map PATCH (`patchHunt`), the lesson
// draft (`draftHuntLesson`), `listHunts` / `getHunt` - had no caller once their
// routes went: a gesture edits one node through lib/sound/huntDesk.ts and the
// lesson is lib/sound/lessons.ts's, which counts its evidence from the map.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { reason as routerReason } from "@/lib/text/router";
import type { TextRequest, TextResult } from "@/lib/text/types";

import type { AudioParams } from "./knowledge";
import { mintId, readLedger, SoundError, withStore } from "./store";
import { DURATION_BOUNDS } from "./generate";
import { TECHNIQUES, type Hunt, type HuntNode, type Lesson, type ProviderId, type SoundKind } from "./types";

/** The text engine, injectable. Production passes nothing and gets the router;
 *  the probe replaces `fetch` under the REAL router instead, which is the
 *  stronger test — this seam exists for a caller that wants a canned engine
 *  without a network stub. */
export type ReasonFn = (req: TextRequest) => Promise<TextResult>;

/* ── the prompt files ─────────────────────────────────────────────────────── */

/** Split a prompt file on `<!-- section: name -->` markers. Text before the
 *  first marker (the file's own header comment) belongs to no section and is
 *  never sent. */
export function sectionsOf(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<!--\s*section:\s*([a-z-]+)\s*-->/g;
  const marks = [...md.matchAll(re)];
  marks.forEach((m, i) => {
    const start = m.index! + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index! : md.length;
    out[m[1]] = md.slice(start, end).trim();
  });
  return out;
}

export const fill = (tpl: string, slots: Record<string, string>) =>
  tpl.replace(/\{\{([A-Z_]+)\}\}/g, (all, k: string) => (k in slots ? slots[k] : all));

export async function promptFile(name: string): Promise<Record<string, string>> {
  const at = path.join(process.cwd(), "pipeline", name);
  let md: string;
  try {
    md = await readFile(at, "utf8");
  } catch {
    throw new SoundError(`the prompt file ${path.relative(process.cwd(), at)} is missing — it is part of the code`, 500);
  }
  const s = sectionsOf(md);
  if (!s.shared) throw new SoundError(`${name} has no "shared" section`, 500);
  return s;
}

/** knowledge/audio/params.json (SOUND_KNOWLEDGE_DIR moves the directory, as `knowledge` in
 *  cli.ts reads it), or null when it has not been generated. The hunt prompt leans on what
 *  worked; an ABSENT file is "nothing measured yet", which the prompt is told to read as
 *  permission to explore. An unreadable or unparseable one is not that: a truncated or
 *  merge-conflicted generated file would steer every hunt to explore with no error anywhere,
 *  so it is a SoundError naming the file and the command that regenerates it. */
export async function readAudioParams(): Promise<AudioParams | null> {
  const envDir = process.env["SOUND_KNOWLEDGE_DIR"]?.trim();
  const at = path.join(envDir ? path.resolve(envDir) : path.join(process.cwd(), "knowledge", "audio"), "params.json");
  let text: string;
  try {
    text = await readFile(at, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new SoundError(`${path.basename(at)} cannot be read (${(e as Error).message}) - regenerate it: npx tsx pipeline/sound.mts knowledge`, 500);
  }
  try {
    return JSON.parse(text) as AudioParams;
  } catch {
    throw new SoundError(`${path.basename(at)} is not valid JSON - regenerate it: npx tsx pipeline/sound.mts knowledge`, 500);
  }
}

function strengthsText(params: AudioParams | null, kind: SoundKind): string {
  const rows = params?.kinds?.[kind]?.strengths ?? [];
  if (!rows.length) return "(none yet — no provider × term cell has reached the evidence floor)";
  return rows
    .slice(0, 24)
    .map(
      (s) =>
        `- ${s.provider} · ${s.facet} "${s.value}": kept ${s.kept}/${s.n} (${Math.round(s.keepRate * 100)}%)` +
        `${s.meanScore !== null ? `, mean score ${s.meanScore}` : ""}${s.topDefect ? `, top defect ${s.topDefect}` : ""} [MEASURED n=${s.n}]`,
    )
    .join("\n");
}

function lessonsText(lessons: readonly Lesson[], kind: SoundKind): string {
  const mine = lessons.filter((l) => l.kind === kind).slice(-12);
  if (!mine.length) return "(none confirmed yet)";
  return mine.map((l) => `- "${l.claim}" (n=${l.evidence.n}${l.provider ? `, ${l.provider}` : ""})`).join("\n");
}

/** The whole hunt prompt for one idea. Pure over its inputs (the file's
 *  sections are passed in), so a probe can read exactly what would be sent. */
export function huntPrompt(
  sections: Record<string, string>,
  kind: SoundKind,
  idea: string,
  params: AudioParams | null,
  lessons: readonly Lesson[],
): string {
  const b = DURATION_BOUNDS[kind];
  const slots = {
    IDEA: idea,
    KIND: kind === "music" ? "music" : "sound effect",
    TECHNIQUES: TECHNIQUES[kind].join(", "),
    DURATION_MIN: String(b.min),
    DURATION_MAX: String(b.max),
    STRENGTHS: strengthsText(params, kind),
    LESSONS: lessonsText(lessons, kind),
  };
  return [fill(sections.shared, slots), sections[kind] ? fill(sections[kind], slots) : ""].filter(Boolean).join("\n\n");
}

/* ── the map: schema, and the validation the router's shallow check cannot do ── */

export const HUNT_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["branches"],
  properties: {
    branches: {
      type: "array",
      items: {
        type: "object",
        required: ["axis", "label", "rationale", "leaves"],
        properties: {
          axis: { type: "string" },
          label: { type: "string" },
          rationale: { type: "string" },
          leaves: {
            type: "array",
            items: {
              type: "object",
              required: ["label", "rationale", "provider", "technique", "prompt", "durationS"],
              properties: {
                label: { type: "string" },
                rationale: { type: "string" },
                provider: { type: "string" },
                technique: { type: "array", items: { type: "string" } },
                prompt: { type: "string" },
                negative: { type: "string" },
                durationS: { type: "number" },
                // Closeout r4: what the leaf asks for, as fields, so a render
                // never re-reads its own prompt text. Optional in the schema
                // (an older drafter's answer still parses) and defaulted to
                // absent in parseHuntMap; the prompt file asks for all four.
                loop: { type: "boolean" },
                terms: {
                  type: "object",
                  properties: {
                    genre: { type: "array", items: { type: "string" } },
                    mood: { type: "array", items: { type: "string" } },
                    instrument: { type: "array", items: { type: "string" } },
                    sfxCategory: { type: "string" },
                  },
                },
                tempoBpm: { type: "number" },
                key: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

const MAX_BRANCHES = 8;
const MAX_LEAVES = 6;
const RENDERABLE: readonly ProviderId[] = ["elevenlabs", "suno"];

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The non-leaf nodes' (root, branch) "asks for nothing". */
const noAsk = (): Pick<HuntNode, "loop" | "terms" | "tempoBpm" | "key"> => ({
  loop: null,
  terms: { genre: [], mood: [], instrument: [], sfxCategory: null },
  tempoBpm: null,
  key: null,
});

const words = (v: unknown, cap = 8): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 60)).filter(Boolean))].slice(0, cap)
    : [];

/** "none" / "null" / "n/a" / "" are a drafter saying "no value", not a value. */
const valueWord = (v: unknown, max: number): string | null => {
  const t = s(v, max);
  return t && !/^(none|null|n\/a|-|—)$/i.test(t) ? t : null;
};

/**
 * What a leaf ASKS FOR, held to its kind. Music has terms, a tempo and a key,
 * and no loop; an effect has a loop flag and a category, and NEVER a tempo or
 * a key — the registry's "the tell is that the brief wants a key"
 * (pipeline/SOUND-HUNT-PROMPT.md, sfx section), so a drafted one is dropped,
 * not passed on. A tempo outside 30..260 BPM is no tempo.
 */
export function askOf(raw: Record<string, unknown>, kind: SoundKind): Pick<HuntNode, "loop" | "terms" | "tempoBpm" | "key"> {
  const t = (raw.terms && typeof raw.terms === "object" && !Array.isArray(raw.terms) ? raw.terms : {}) as Record<string, unknown>;
  if (kind === "sfx")
    return {
      loop: typeof raw.loop === "boolean" ? raw.loop : null,
      terms: { genre: [], mood: words(t.mood), instrument: [], sfxCategory: valueWord(t.sfxCategory, 80) },
      tempoBpm: null,
      key: null,
    };
  const bpm = typeof raw.tempoBpm === "number" && Number.isFinite(raw.tempoBpm) ? Math.round(raw.tempoBpm * 10) / 10 : null;
  return {
    loop: null,
    terms: { genre: words(t.genre), mood: words(t.mood), instrument: words(t.instrument), sfxCategory: null },
    tempoBpm: bpm !== null && bpm >= 30 && bpm <= 260 ? bpm : null,
    key: valueWord(raw.key, 40),
  };
}

/**
 * The model's map as HuntNodes: one root (the idea), one node per branch, one
 * per leaf. A leaf is a node with a prompt; root and branches carry none.
 *
 * DROPS, NEVER REPAIRS, WHAT IT CANNOT USE: a leaf with no prompt, or naming a
 * provider this studio cannot render, is left out; a branch left with no leaf
 * goes with it. Out-of-window durations are clamped to the vendor's bounds
 * (the operator sees the number on the leaf before anything renders). A map
 * with nothing left is the engine failing the turn — a 502, not an empty board.
 */
export function parseHuntMap(json: unknown, kind: SoundKind, idea: string, mint: () => string = () => mintId("nd")): HuntNode[] {
  const branches = json && typeof json === "object" ? (json as { branches?: unknown }).branches : null;
  if (!Array.isArray(branches)) throw new SoundError("the text engine's map has no branches", 502);
  const b = DURATION_BOUNDS[kind];
  const known = new Set(TECHNIQUES[kind]);
  const rootId = mint();
  const nodes: HuntNode[] = [
    {
      id: rootId,
      parentId: null,
      axis: "idea",
      label: idea.length > 80 ? `${idea.slice(0, 79)}…` : idea,
      rationale: "",
      provider: "elevenlabs",
      technique: [],
      prompt: "",
      negative: null,
      durationS: 0,
      ...noAsk(),
      state: "idea",
      takeIds: [],
      winner: false,
      error: null,
    },
  ];
  for (const raw of branches.slice(0, MAX_BRANCHES)) {
    if (!raw || typeof raw !== "object") continue;
    const br = raw as Record<string, unknown>;
    const axis = s(br.axis, 40);
    if (!axis || !Array.isArray(br.leaves)) continue;
    const leaves: HuntNode[] = [];
    const branchId = mint();
    for (const lr of br.leaves.slice(0, MAX_LEAVES)) {
      if (!lr || typeof lr !== "object") continue;
      const l = lr as Record<string, unknown>;
      const prompt = s(l.prompt, 4000);
      const provider = RENDERABLE.find((p) => p === (typeof l.provider === "string" ? l.provider.trim().toLowerCase() : "elevenlabs"));
      if (!prompt || !provider) continue;
      const d = typeof l.durationS === "number" && Number.isFinite(l.durationS) ? l.durationS : kind === "music" ? 30 : 3;
      const technique = Array.isArray(l.technique)
        ? [...new Set(l.technique.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter((t) => known.has(t)))]
        : [];
      const negative = s(l.negative, 600);
      leaves.push({
        id: mint(),
        parentId: branchId,
        axis,
        label: s(l.label, 80) || prompt.slice(0, 48),
        rationale: s(l.rationale, 400),
        provider,
        technique,
        prompt,
        negative: negative && negative.toLowerCase() !== "null" ? negative : null,
        durationS: Math.round(Math.min(b.max, Math.max(b.min, d)) * 10) / 10,
        ...askOf(l, kind),
        state: provider === "suno" ? "awaiting-return" : "idea",
        takeIds: [],
        winner: false,
        error: null,
      });
    }
    if (!leaves.length) continue;
    nodes.push({
      id: branchId,
      parentId: rootId,
      axis,
      label: s(br.label, 80) || axis,
      rationale: s(br.rationale, 400),
      provider: "elevenlabs",
      technique: [],
      prompt: "",
      negative: null,
      durationS: 0,
      ...noAsk(),
      state: "idea",
      takeIds: [],
      winner: false,
      error: null,
    });
    nodes.push(...leaves);
  }
  if (nodes.length < 3) throw new SoundError("the text engine's map had no leaf this studio can render", 502);
  return nodes;
}

/** "<provider> · <model>, <rung>" — the receipt a drafted map carries, so a
 *  board shows which engine drew it (lib/text/types.ts TextProvenance). */
const draftedBy = (r: TextResult) => `${r.provenance.provider} · ${r.provenance.model} · ${r.provenance.rung}`;

/** `id`: the caller's own (the desk derives it from its op id, so a retried draft finds the hunt
 *  it made instead of drafting a second); absent, one is minted. */
export async function draftHunt(kind: SoundKind, idea: string, reason: ReasonFn = routerReason, now = new Date(), id: string = mintId("hn")): Promise<Hunt> {
  const text = idea.trim();
  if (!text) throw new SoundError("a hunt needs an idea: the problem to solve, in your words", 400);
  if (text.length > 2000) throw new SoundError("an idea is at most 2000 characters", 400);
  const [sections, params, ledger] = await Promise.all([promptFile("SOUND-HUNT-PROMPT.md"), readAudioParams(), readLedger()]);
  const out = await reason({ turn: "sound-hunt", prompt: huntPrompt(sections, kind, text, params, ledger.lessons), schema: HUNT_SCHEMA });
  const hunt: Hunt = {
    id,
    kind,
    idea: text,
    createdAt: now.toISOString(),
    nodes: parseHuntMap(out.json, kind, text),
    draftedBy: draftedBy(out),
    lessonId: null,
  };
  await withStore(async (tx) => {
    const file = await tx.get("hunts");
    file.hunts.push(hunt);
    tx.touch("hunts");
  });
  return hunt;
}

/* ── the lesson draft's schema (lib/sound/lessons.ts draftLesson asks with it) ── */

export const LESSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["claim", "technique"],
  properties: {
    claim: { type: "string" },
    technique: { type: "array", items: { type: "string" } },
    provider: { type: "string" },
  },
};
