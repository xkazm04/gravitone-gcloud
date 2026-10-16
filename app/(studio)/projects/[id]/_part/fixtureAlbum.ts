import "server-only";

import { err, ok, type Result } from "@gt/domain/errors";
import { RENDER_RES, WORDS_LIMITS, albumOpLabel, type EngineView, type PartActView, type PartVerdict, type RenderData, type RenderRes, type WordsData } from "@gt/domain/partView";

import { KEPT_TAKES } from "../../_port/fixtureData.ts";
import type { Ctx } from "./fixture.ts";
import { engineOf } from "./fixtureScoreRecs.ts";
import type { ExportRec } from "./fixtureCut.ts";
import type { KCtx, KindModule } from "./kinds.ts";

// THE ALBUM VIDEO'S WORDS AND RENDER PARTS (L40; STEPS-DESIGN §2 "album parts"). An album video
// is still · words · render: the still is the take grid the still gate picks from (L39), the
// words are the platform's title, description and tags (the mv-metadata turn writes a draft,
// the operator edits it), and the render is the mv job (lib/producers/mv.ts) - its receipt,
// its progress in the view's `running`, its mp4 as a blob.
//
// v1 drew a music video's Script and Score as notices that reported done on mount and its
// export as base64 JSON with elapsed time for progress (MusicVideoExport.tsx). Neither part is
// in the album recipe now, and the render is a job with a receipt.
//
// THE RECORDS GAP: @gt/domain/steps declares no record for words or render (STEP_OWNERS is the
// studio's six), so the real side reads these parts and refuses their ops (`stored: false`)
// until a record is declared - reported, not worked around.

export type WordsRec = {
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  /** What the turn wrote, so an edit since is visible. */
  readonly written: { readonly title: string; readonly description: string; readonly tags: readonly string[] } | null;
  readonly engine?: EngineView;
};

export type RenderRec = { readonly res: RenderRes; readonly exports: readonly ExportRec[] };

const no = (m: string): Result<never> => err("invalid", m);

/** The project's track: the take the album was composed from. */
export function trackOf(ctx: Ctx): { title: string; durationS: number | null } | null {
  const id = ctx.plan.project.takeId;
  if (id === undefined) return null;
  const t = KEPT_TAKES.find((x) => x.id === id);
  return t === undefined ? { title: id, durationS: null } : { title: t.title, durationS: t.durationS };
}

/** A part kind's route key in this project, if the recipe plans one. */
export function keyOfKind(ctx: Ctx, kind: string): string | null {
  const p = ctx.plan.parts.find((x) => x.kind === kind);
  if (p === undefined) return null;
  const id = ctx.project.id;
  return p.id.startsWith(id) ? p.id.slice(id.length + 1) : p.id;
}

/* ── words ────────────────────────────────────────────────────────────────── */

const tagChars = (tags: readonly string[]): number => tags.join(",").length;

function wordsVerdict(_ctx: KCtx, w: WordsRec): PartVerdict {
  const over: string[] = [];
  if (w.title.length > WORDS_LIMITS.title) over.push(`title ${w.title.length}/${WORDS_LIMITS.title}`);
  if (w.description.length > WORDS_LIMITS.description) over.push(`description ${w.description.length}/${WORDS_LIMITS.description}`);
  if (tagChars(w.tags) > WORDS_LIMITS.tags) over.push(`tags ${tagChars(w.tags)}/${WORDS_LIMITS.tags}`);
  if (over.length > 0) return { state: "blocked", codes: over.map((o) => ({ code: "over-limit", text: `over the limit: ${o}` })) };
  const missing = [...(w.title.trim() === "" ? ["title"] : []), ...(w.description.trim() === "" ? ["description"] : [])];
  if (missing.length === 2) return { state: "empty", codes: [{ code: "no-words", text: "no title, no description" }] };
  if (missing.length > 0) return { state: "working", codes: [{ code: "words-missing", text: `no ${missing.join(" · ")}` }] };
  return { state: "ready", codes: [{ code: "words-set", text: `${w.tags.length} tag${w.tags.length === 1 ? "" : "s"} · ${w.description.length} characters` }] };
}

function wordsData(ctx: KCtx, w: WordsRec): WordsData {
  const edited = w.written !== null && (w.written.title !== w.title || w.written.description !== w.description || w.written.tags.join() !== w.tags.join());
  return { face: "words", track: trackOf(ctx), title: w.title, description: w.description, tags: w.tags, tagChars: tagChars(w.tags), edited, ...(w.engine === undefined ? {} : { engine: w.engine }) };
}

const wordsActs = (ctx: KCtx, w: WordsRec): PartActView[] => [{ act: "write-words", label: w.written === null ? "write words" : "write again", needs: trackOf(ctx) === null ? ["a track"] : [] }];

/** The dry stand-in of the mv-metadata turn: the track's own name and nothing invented beyond it. */
function wordsLand(ctx: KCtx, w: WordsRec): Result<WordsRec> {
  const t = trackOf(ctx);
  if (t === null) return no("write words needs a track");
  const written = { title: t.title, description: `${t.title}\n\n${ctx.project.title}`, tags: t.title.toLowerCase().split(/\s+/).filter((x) => x.length > 2) };
  return ok({ ...w, ...written, written, engine: engineOf(ctx, "words", 0) });
}

export const WORDS_KIND: KindModule<"words"> = {
  ops: ["words-field", "words-tags"],
  seed: () => ({ title: "", description: "", tags: [], written: null }),
  apply: (_ctx, w, op) => {
    if (op.op === "words-field") return w[op.field] === op.value ? no("unchanged") : ok({ ...w, [op.field]: op.value });
    if (op.op === "words-tags") {
      const tags = [...new Set(op.tags.map((t) => t.trim()).filter((t) => t !== ""))];
      return tags.join() === w.tags.join() ? no("unchanged") : ok({ ...w, tags });
    }
    return no(`${op.op} is not a words op`);
  },
  label: (op) => albumOpLabel(op),
  verdict: wordsVerdict,
  acts: wordsActs,
  units: (ctx, w, act) => {
    const a = wordsActs(ctx, w).find((x) => x.act === act);
    return a === undefined ? no(`${act} is not a words act`) : a.needs.length > 0 ? no(`${a.label} needs ${a.needs.join(" · ")}`) : ok(1);
  },
  land: (ctx, w, act) => (act === "write-words" ? wordsLand(ctx, w) : no(`${act} is not a words act`)),
  data: wordsData,
  actLabel: () => "metadata turn",
  fromRecords: () => ({ title: "", description: "", tags: [], written: null }),
  toRecords: () => ({}),
  stored: false,
};

/* ── render ───────────────────────────────────────────────────────────────── */

function stillOf(ctx: KCtx): { label: string } | null {
  const gate = ctx.plan.parts.find((p) => p.id.endsWith("gate:still"));
  return gate?.state === "ratified" ? { label: "kept still" } : null;
}

function renderNeeds(ctx: KCtx): string[] {
  const w = ctx.rec("words");
  return [...(trackOf(ctx) === null ? ["a track"] : []), ...(stillOf(ctx) === null ? ["a kept still"] : []), ...(w.title.trim() === "" ? ["a title"] : [])];
}

function renderData(ctx: KCtx, r: RenderRec): RenderData {
  const w = ctx.rec("words");
  return {
    face: "render",
    track: trackOf(ctx),
    still: stillOf(ctx),
    words: w.title.trim() === "" ? null : { title: w.title },
    res: r.res,
    exports: r.exports.map((e) => ({ id: e.id, at: new Date(e.at).toISOString(), mode: e.mode, label: e.label, ...(e.blob === undefined ? {} : { blob: e.blob.sha256, bytes: e.blob.bytes }) })),
    envelope: [],
  };
}

function renderVerdict(ctx: KCtx, r: RenderRec): PartVerdict {
  if (r.exports.length > 0) return { state: "ready", codes: [{ code: "rendered", text: `${r.exports.length} render${r.exports.length === 1 ? "" : "s"} · last ${r.exports.at(-1)?.label ?? ""}` }] };
  const needs = renderNeeds(ctx);
  return needs.length > 0 ? { state: "empty", codes: [{ code: "render-needs", text: `waits on ${needs.join(" · ")}` }] } : { state: "working", codes: [{ code: "not-rendered", text: "not rendered" }] };
}

const renderActs = (ctx: KCtx, r: RenderRec): PartActView[] => [{ act: "render-video", label: `render ${r.res}`, needs: renderNeeds(ctx) }];

export const RENDER_KIND: KindModule<"render"> = {
  ops: ["render-res"],
  seed: () => ({ res: "1080p", exports: [] }),
  apply: (_ctx, r, op) => (op.op !== "render-res" ? no(`${op.op} is not a render op`) : !RENDER_RES.includes(op.res) ? no(`no resolution ${op.res}`) : op.res === r.res ? no("unchanged") : ok({ ...r, res: op.res })),
  label: (op) => albumOpLabel(op),
  verdict: renderVerdict,
  acts: renderActs,
  units: (ctx, r, act) => {
    const a = renderActs(ctx, r)[0];
    return act !== "render-video" || a === undefined ? no(`${act} is not a render act`) : a.needs.length > 0 ? no(`${a.label} needs ${a.needs.join(" · ")}`) : ok(1);
  },
  land: (ctx, r, act, at) => {
    if (act !== "render-video") return no(`${act} is not a render act`);
    const n = r.exports.length + 1;
    return ok({ ...r, exports: [...r.exports, { id: `render-${n}`, at, mode: engineOf(ctx, "render", 0).mode, label: `${r.res} · ${n}`, hash: "" }] });
  },
  data: renderData,
  actLabel: () => "music-video render",
  fromRecords: () => ({ res: "1080p", exports: [] }),
  toRecords: () => ({}),
  stored: false,
};
