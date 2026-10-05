// HUNT — an idea in, a map of variations out; a finished map in, a drafted
// lesson out. Server-only: both drafts are lib/text turns (the "sound-hunt" and
// "sound-lesson" TurnClasses, lib/text/types.ts), and nothing here touches a
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
// elevenlabs/suno is dropped). For a lesson it drafts the CLAIM only: the
// evidence (n, keep rate, mean score, take ids) is counted here from the takes,
// so a fluent sentence cannot carry an n the hunt does not have.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { reason as routerReason } from "@/lib/text/router";
import type { TextRequest, TextResult } from "@/lib/text/types";

import { rubricMean } from "./ledger";
import type { AudioParams } from "./knowledge";
import { patchTakeTx } from "./takes";
import { mintId, readHunts, readLedger, readTakes, safeId, SoundError, withStore } from "./store";
import { DURATION_BOUNDS } from "./generate";
import { TECHNIQUES, type Hunt, type HuntNode, type HuntNodeState, type Lesson, type ProviderId, type SoundKind } from "./types";

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

const fill = (tpl: string, slots: Record<string, string>) =>
  tpl.replace(/\{\{([A-Z_]+)\}\}/g, (all, k: string) => (k in slots ? slots[k] : all));

async function promptFile(name: string): Promise<Record<string, string>> {
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

/** knowledge/audio/params.json, or null when it has not been generated. The
 *  hunt prompt leans on what worked; an absent file is "nothing measured yet",
 *  which the prompt is told to read as permission to explore. */
export async function readAudioParams(): Promise<AudioParams | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "knowledge", "audio", "params.json"), "utf8")) as AudioParams;
  } catch {
    return null;
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

export async function draftHunt(kind: SoundKind, idea: string, reason: ReasonFn = routerReason, now = new Date()): Promise<Hunt> {
  const text = idea.trim();
  if (!text) throw new SoundError("a hunt needs an idea: the problem to solve, in your words", 400);
  if (text.length > 2000) throw new SoundError("an idea is at most 2000 characters", 400);
  const [sections, params, ledger] = await Promise.all([promptFile("SOUND-HUNT-PROMPT.md"), readAudioParams(), readLedger()]);
  const out = await reason({ turn: "sound-hunt", prompt: huntPrompt(sections, kind, text, params, ledger.lessons), schema: HUNT_SCHEMA });
  const hunt: Hunt = {
    id: mintId("hn"),
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

export async function listHunts(kind?: SoundKind | null): Promise<Hunt[]> {
  const { hunts } = await readHunts();
  return hunts.filter((h) => !kind || h.kind === kind).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getHunt(id: string): Promise<Hunt> {
  safeId(id);
  const h = (await readHunts()).hunts.find((x) => x.id === id);
  if (!h) throw new SoundError(`no hunt ${id}`, 404);
  return h;
}

/* ── PATCH: the operator's edits to a map ─────────────────────────────────── */

const STATES: readonly HuntNodeState[] = ["idea", "rendering", "rendered", "awaiting-return", "failed"];

function nodeOf(v: unknown, kind: SoundKind): HuntNode {
  if (!v || typeof v !== "object") throw new SoundError("each node must be an object", 400);
  const n = v as Record<string, unknown>;
  const id = typeof n.id === "string" ? safeId(n.id) : (() => { throw new SoundError("a node needs an id", 400); })();
  const provider = (["elevenlabs", "suno", "local"] as const).find((p) => p === n.provider);
  if (!provider) throw new SoundError(`node ${id}: unknown provider ${JSON.stringify(n.provider)}`, 400);
  const state = STATES.find((x) => x === n.state);
  if (!state) throw new SoundError(`node ${id}: unknown state ${JSON.stringify(n.state)}`, 400);
  const strs = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []);
  const d = typeof n.durationS === "number" && Number.isFinite(n.durationS) ? n.durationS : 0;
  const b = DURATION_BOUNDS[kind];
  return {
    id,
    parentId: typeof n.parentId === "string" && n.parentId ? n.parentId : null,
    axis: s(n.axis, 40),
    label: s(n.label, 120),
    rationale: s(n.rationale, 600),
    provider,
    technique: strs(n.technique).slice(0, 12),
    prompt: s(n.prompt, 4000),
    negative: typeof n.negative === "string" && n.negative.trim() ? n.negative.trim().slice(0, 600) : null,
    // 0 is the root's and a branch's "no length"; a leaf is held to the window.
    durationS: d === 0 ? 0 : Math.min(b.max, Math.max(b.min, d)),
    // The operator's map comes back whole on every PATCH; a node sent without
    // the closeout fields (a tab opened before them) keeps them absent.
    ...askOf(n, kind),
    state,
    takeIds: strs(n.takeIds).filter((x) => /^[A-Za-z0-9_-]{1,80}$/.test(x)),
    winner: n.winner === true,
    error: typeof n.error === "string" && n.error ? n.error.slice(0, 600) : null,
  };
}

/**
 * Replace a hunt's nodes and/or set its lesson.
 *
 * A NEW WINNER IS A KEEP. The brief: "winner -> verdict kept, stage pending, so
 * it appears in Arrangement". A node that becomes a winner here has each of its
 * UNJUDGED takes kept, in the same transaction, through takes.ts's own patch —
 * so the stage, the judgedAt stamp and the ledger row are exactly what a K in
 * Triage would have written. A take the person already rejected is left
 * rejected: winning the hunt does not overrule a verdict somebody gave.
 */
export async function patchHunt(id: string, body: unknown): Promise<Hunt> {
  safeId(id);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SoundError("a hunt patch must be a JSON object", 400);
  const b = body as Record<string, unknown>;
  const extra = Object.keys(b).filter((k) => k !== "nodes" && k !== "lessonId");
  if (extra.length) throw new SoundError(`not patchable: ${extra.join(", ")}`, 400);
  return withStore(async (tx) => {
    const file = await tx.get("hunts");
    const hunt = file.hunts.find((h) => h.id === id);
    if (!hunt) throw new SoundError(`no hunt ${id}`, 404);
    if ("nodes" in b) {
      if (!Array.isArray(b.nodes)) throw new SoundError("nodes must be an array", 400);
      if (b.nodes.length > 200) throw new SoundError("a hunt carries at most 200 nodes", 400);
      const next = b.nodes.map((n) => nodeOf(n, hunt.kind));
      const ids = new Set(next.map((n) => n.id));
      if (ids.size !== next.length) throw new SoundError("node ids must be unique", 400);
      for (const n of next)
        if (n.parentId && !ids.has(n.parentId)) throw new SoundError(`node ${n.id} names a parent that is not in the map`, 400);
      const was = new Map(hunt.nodes.map((n) => [n.id, n] as const));
      const takes = await tx.get("takes");
      for (const n of next) {
        if (!n.winner || was.get(n.id)?.winner) continue;
        for (const tid of n.takeIds) {
          const t = takes.takes.find((x) => x.id === tid);
          if (t && t.verdict === "unjudged") await patchTakeTx(tx, tid, { verdict: "kept" });
        }
      }
      hunt.nodes = next;
    }
    if ("lessonId" in b) {
      if (b.lessonId === null) hunt.lessonId = null;
      else if (typeof b.lessonId === "string") {
        const ledger = await tx.get("ledger");
        if (!ledger.lessons.some((l) => l.id === b.lessonId)) throw new SoundError(`no lesson ${b.lessonId} in the ledger`, 404);
        hunt.lessonId = b.lessonId;
      } else throw new SoundError("lessonId must be a string or null", 400);
    }
    tx.touch("hunts");
    return hunt;
  });
}

/* ── the lesson draft ─────────────────────────────────────────────────────── */

export const LESSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["claim", "technique"],
  properties: {
    claim: { type: "string" },
    technique: { type: "array", items: { type: "string" } },
    provider: { type: "string" },
  },
};

export type LessonDraft = Omit<Lesson, "id" | "confirmedAt">;

export async function draftHuntLesson(id: string, reason: ReasonFn = routerReason): Promise<LessonDraft> {
  const hunt = await getHunt(id);
  const winners = hunt.nodes.filter((n) => n.winner);
  if (!winners.length) throw new SoundError("mark at least one winner before drafting a lesson — a lesson is what the winners did", 409);
  const { takes } = await readTakes();
  const byId = new Map(takes.map((t) => [t.id, t] as const));
  const leaves = hunt.nodes.filter((n) => n.prompt);
  const results: string[] = [];
  const judged: string[] = [];
  let kept = 0;
  let scoreSum = 0;
  let scored = 0;
  for (const n of leaves) {
    for (const tid of n.takeIds) {
      const t = byId.get(tid);
      if (!t) continue;
      const mean = rubricMean(t.kind, t.ratings);
      const call = n.winner
        ? "WINNER"
        : t.verdict === "rejected"
          ? `rejected${t.reasons.length ? ` (${t.reasons.join(", ")})` : ""}`
          : t.verdict;
      results.push(
        `- [${n.axis}] ${n.label} · ${n.provider} · ${n.technique.join("+") || "no technique"} · ${call}` +
          `${mean !== null ? ` · mean ${Math.round(mean * 10) / 10}` : ""}\n  prompt: ${t.prompt || n.prompt}`,
      );
      if (t.verdict !== "unjudged") {
        judged.push(t.id);
        if (t.verdict === "kept") kept++;
        if (mean !== null) {
          scoreSum += mean;
          scored++;
        }
      }
    }
  }
  if (!judged.length) throw new SoundError("no rendered take in this hunt has been judged yet — audition and judge before drafting", 409);
  const sections = await promptFile("SOUND-LESSON-PROMPT.md");
  const prompt = fill(sections.shared, {
    KIND: hunt.kind === "music" ? "music" : "sound effect",
    IDEA: hunt.idea,
    RESULTS: results.join("\n"),
    TECHNIQUES: TECHNIQUES[hunt.kind].join(", "),
  });
  const out = await reason({ turn: "sound-lesson", prompt, schema: LESSON_SCHEMA });
  const j = (out.json ?? {}) as Record<string, unknown>;
  const claim = s(j.claim, 600);
  if (!claim) throw new SoundError("the text engine drafted an empty claim", 502);
  const known = new Set(TECHNIQUES[hunt.kind]);
  const technique = Array.isArray(j.technique)
    ? [...new Set(j.technique.filter((t): t is string => typeof t === "string" && known.has(t.trim())).map((t) => t.trim()))]
    : [];
  const winnerProviders = [...new Set(winners.map((w) => w.provider))];
  const provider =
    (["elevenlabs", "suno", "local"] as const).find((p) => p === j.provider) ?? (winnerProviders.length === 1 ? winnerProviders[0] : null);
  return {
    kind: hunt.kind,
    source: "hunt",
    provider,
    huntId: hunt.id,
    claim,
    technique,
    evidence: {
      n: judged.length,
      keepRate: Math.round((kept / judged.length) * 100) / 100,
      meanScore: scored ? Math.round((scoreSum / scored) * 100) / 100 : null,
      takeIds: judged,
    },
  };
}
