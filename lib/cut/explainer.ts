import type { CutClip, CutScene, DerivedCut } from "./deriveTimeline";

// THE EXPLAINER'S CUT, PURE: strips as picture, voice as the vo lane, one card per scene held for
// its line's take (else the line's spoken length). One derivation for both readers - the cut
// editor (app/(studio)/projects/[id]/_part/fixtureExplainer.ts) and the cut gate's verdict
// (lib/parts/verdict.ts) - so the editor cannot read ready where the gate refuses
// (docs/next/architecture-review-2026-10-18.md F1). The input types are lib's own: lib may not
// import app/.

export type ExplainerCard = {
  readonly id: string;
  readonly section: string;
  readonly title: string;
  readonly caption: string;
  readonly state: "drawn" | "pending" | "refused";
  readonly blob?: { readonly sha256: string };
  readonly why?: string;
};

export type ExplainerTake = {
  readonly seconds: number | null;
  readonly blob?: { readonly sha256: string };
  /** The engine view the take was made by; a dry stand-in says `mode: "dry"`. */
  readonly engine?: unknown;
};

export type ExplainerVoice = {
  /** The operator's rewrite of a line; absent = the card's caption. */
  readonly text: Readonly<Record<string, string>>;
  readonly takes: Readonly<Record<string, ExplainerTake>>;
  readonly byLine: Readonly<Record<string, { readonly active: string | null }>>;
};

export type ExplainerInput = {
  readonly cards: readonly ExplainerCard[];
  readonly voice: ExplainerVoice;
  readonly targetS: number | null;
};

export type ExplainerLine = { readonly id: string; readonly text: string; readonly card: string };

export const words = (s: string): number => s.split(/\s+/).filter((x) => x !== "").length;

/** A spoken line's length at the pace v1's research measured for narration (2.5 words a second). */
export const spokenS = (text: string): number => Math.max(1, Math.round((words(text) / 2.5) * 10) / 10);

/** A take is IN HAND when its bytes are (a blob ref) or it is a dry stand-in, which says so. */
export const takeHeld = (t: ExplainerTake | undefined): boolean => {
  if (t === undefined) return false;
  if (t.blob !== undefined) return true;
  const e = t.engine;
  return typeof e === "object" && e !== null && (e as { mode?: unknown }).mode === "dry";
};

export const linesOf = (cards: readonly ExplainerCard[], v: ExplainerVoice): ExplainerLine[] =>
  cards.map((c) => ({ id: `line-${c.id}`, text: v.text[`line-${c.id}`] ?? c.caption, card: c.id }));

export const activeOf = (v: ExplainerVoice, lineId: string): ExplainerTake | undefined => {
  const a = v.byLine[lineId]?.active;
  return a === null || a === undefined ? undefined : v.takes[a];
};

/** The DerivedCut lib/cut's finish line and edit maths read. */
export function explainerCut(input: ExplainerInput): DerivedCut {
  const { cards, voice: v } = input;
  const lines = linesOf(cards, v);
  const scenes: CutScene[] = [];
  const clips: CutClip[] = [];
  let at = 0;
  cards.forEach((c, i) => {
    const line = lines.find((l) => l.card === c.id);
    const take = line === undefined ? undefined : activeOf(v, line.id);
    const durS = take?.seconds ?? spokenS(line?.text ?? c.caption);
    scenes.push({ id: c.id, index: i + 1, label: c.title, mood: c.section, startS: at, durS });
    const drawn = c.state === "drawn";
    clips.push({ id: `pic-${c.id}`, track: "video", label: c.title, startS: at, durS, status: drawn ? "ok" : "missing", ref: c.id, owner: "frames", note: c.caption, ...(c.blob === undefined ? {} : { src: `sha256:${c.blob.sha256}` }), ...(drawn ? {} : { why: c.why ?? "card not drawn" }) });
    if (line !== undefined) {
      const held = takeHeld(take);
      clips.push({ id: `vo-${c.id}`, track: "vo", label: line.text, startS: at, durS, status: held ? "ok" : "missing", ref: line.id, owner: "script", note: line.text, ...(held ? {} : { why: "written, not recorded" }), ...(take?.blob === undefined ? {} : { src: `sha256:${take.blob.sha256}` }) });
    }
    at += durS;
  });
  return { origin: cards.length === 0 ? "empty" : "project", totalS: at, targetS: input.targetS, scenes, clips, unplaced: [], frames: {} };
}

/** The finish line's rows an explainer is judged by: a film's, without the music rows (it plans no score). */
export const EXPLAINER_SKIPS: ReadonlySet<string> = new Set(["coverage", "takes"]);
