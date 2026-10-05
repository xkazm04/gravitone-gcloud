"use client";

// THE SOUND LAB'S ONE HOOK — the Library's audio shelf, its recipe book and its
// transport, plus the two writes the lab adds: file a render, file a return.
//
// Nothing here is a second store. The takes are app/library/audio/
// useAudioShelf.ts's (lib/assets, kind "audio", bytes in the uploads store);
// the drafts and the team's hand on each term are bookStore.ts's; playback is
// engine.ts's one-at-a-time transport. So a take rendered here is a row the
// Library's ledger lists after a reload, judged with the same rubric, and a
// verdict given in either place is the other's on its next read.
//
// The bench this replaced held renders as blob URLs that died with the tab
// (PlaygroundView.tsx, 2026-09: "renders are session-only"). Every one of them
// was paid for.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { analyzeFile } from "@/app/library/audio/analysis";
import {
  blankSeed,
  newDraft,
  returnMeta,
  seedOf,
  takeFromAsset,
  vocabulary,
  type Draft,
  type RatingKey,
  type Seed,
  type Take,
} from "@/app/library/audio/book";
import { useBook } from "@/app/library/audio/bookStore";
import { copyText } from "@/app/library/audio/clipboard";
import { Engine } from "@/app/library/audio/engine";
import { useAudioShelf } from "@/app/library/audio/useAudioShelf";
import type { AudioMeta, LabEditMode } from "@/lib/assets";
import { capabilities } from "@/lib/capabilities";
import type { MusicQuote } from "@/lib/music/pricing";
import type { DetailedMusicResult, WirePlan } from "@/lib/music/types";
import {
  MusicRequestError,
  composeRaw,
  costLabel,
  draftPlan,
  generateSfx,
  perSecondPrice,
} from "@/lib/musicClient";
import { useAuth } from "@/lib/useAuth";

import { engineRegistry } from "./engines";
import {
  audioBytes,
  buildEditPlan,
  fileName,
  isLabTake,
  labTitle,
  planMs,
  planStyle,
  renderMeta,
  type RenderOrigin,
} from "./labModel";

/** A render on its way: drawn as a pulsing row where its take will land. */
export interface Pending {
  id: number;
  label: string;
  seconds: number;
  /** Which hunt lane it renders, when it renders one (`laneTag`). */
  tag?: string;
}

/** The tag a hunt lane's in-flight render carries. */
export const laneTag = (huntId: string, axis: string, diff: readonly string[]) => `${huntId}:${axis}:${diff.join("|")}`;

/** Where a render sits in a lineage or a hunt. */
export interface RenderContext {
  parent?: Take | null;
  variation?: { axis: string; diff: string[] } | null;
  huntId?: string | null;
}

export function errMsg(e: unknown): string {
  if (e instanceof MusicRequestError) return `${e.code}: ${e.message}`;
  return e instanceof Error ? e.message : "failed";
}

/** What was measured on a file's bytes. Each field absent when the browser
 *  could not decode it — never a guessed 0. */
async function measure(file: File, effect: boolean): Promise<Partial<AudioMeta>> {
  try {
    const a = await analyzeFile(file, () => {});
    const out: Partial<AudioMeta> = {
      peaks: a.peaks.map((p) => Math.round(p * 1000) / 1000),
      duration_s: Math.round(a.duration * 100) / 100,
    };
    // An effect is seconds long; a tempo read off two seconds of impact is a
    // number with no meaning, so it is not taken.
    if (!effect)
      out.measured = { tempo_bpm: a.tempo, key: a.key, energy: a.energy, method: a.method };
    return out;
  } catch {
    return {};
  }
}

export type Flash = { id: number; text: string; tone: "ok" | "info" | "error" };

export function useLab() {
  const { user } = useAuth();
  const uid = user?.uid;
  const shelf = useAudioShelf(uid);
  const { book, error: bookError, update: updateBook } = useBook(uid);
  const [engine] = useState(() => new Engine());
  useEffect(() => () => engine.dispose(), [engine]);

  // Build-time constants in the bundle; read once per mount.
  const [reg] = useState(() => engineRegistry(capabilities()));

  const takes = useMemo(() => (shelf.assets ?? []).map(takeFromAsset), [shelf.assets]);
  const byId = useMemo(() => new Map(takes.map((t) => [t.id, t] as const)), [takes]);
  const voc = useMemo(() => vocabulary(takes, book.hands), [takes, book.hands]);
  const labTakes = useMemo(
    () => takes.filter(isLabTake).sort((a, b) => b.created_at - a.created_at),
    [takes],
  );

  // ── the price, before the click (lib/musicClient.ts#costLabel) ──
  const [price, setPrice] = useState<MusicQuote | "unknown" | null>(null);
  useEffect(() => {
    let live = true;
    perSecondPrice().then(
      (q) => live && setPrice(q),
      () => live && setPrice("unknown"),
    );
    return () => {
      live = false;
    };
  }, []);
  const cost = useCallback((seconds: number) => costLabel(price, Math.round(seconds)), [price]);

  // ── a transient line at the foot of the page ──
  const [flash, setFlash] = useState<Flash | null>(null);
  const flashN = useRef(0);
  const say = useCallback((text: string, tone: Flash["tone"] = "ok") => {
    const id = ++flashN.current;
    setFlash({ id, text, tone });
    setTimeout(() => setFlash((f) => (f && f.id === id ? null : f)), 3600);
  }, []);

  const urlFor = useCallback(
    (t: Take) => (t.upload_id ? (shelf.urls.get(t.upload_id) ?? null) : null),
    [shelf.urls],
  );

  // ── judging: exactly the Library's writes (AudioWorkbench.tsx#keep/#reject/#rate) ──
  const { patch } = shelf;
  const keep = useCallback((id: string) => patch(id, { verdict: "kept", reject_reason: undefined }), [patch]);
  const reject = useCallback(
    (id: string, reason: string) => patch(id, { verdict: "rejected", reject_reason: reason }),
    [patch],
  );
  const clear = useCallback((id: string) => patch(id, { verdict: "unjudged", reject_reason: undefined }), [patch]);
  /**
   * THE LAST RATINGS WRITTEN, per take, until the shelf re-renders with them.
   *
   * The Library's `rate` (AudioWorkbench.tsx#rate) merges onto the take as the
   * last render saw it, which holds at a person's pace and loses at a keyboard's:
   * "8 9 7" pressed faster than a render wrote MEL, then CHO over a ratings bag
   * with no MEL in it, then QUA over one with no CHO — measured on this page,
   * 2026-10-05, a take scored three times that kept one score. A ref holds what
   * was just written so the next key merges onto it, and is emptied each time
   * the shelf hands back fresh rows (which then carry the same values).
   */
  const lastRatings = useRef(new Map<string, NonNullable<Take["ratings"]>>());
  useEffect(() => {
    lastRatings.current.clear();
  }, [shelf.assets]);
  const rate = useCallback(
    (id: string, key: RatingKey, v: number) => {
      const t = byId.get(id);
      if (!t) return;
      const next = {
        melody: null,
        instrument_choice: null,
        instrument_quality: null,
        ...(lastRatings.current.get(id) ?? t.ratings ?? {}),
        [key]: v,
      };
      lastRatings.current.set(id, next);
      patch(id, { ratings: next });
    },
    [byId, patch],
  );

  /** The last number a title was given. A render's title is numbered off the
   *  count of lab takes, and a fan-out files seven in a row from one closure
   *  that saw one count — so all seven were "take 9" (measured 2026-10-05).
   *  The ref only ever moves forward, so each title in a session is new. */
  const lastN = useRef(0);

  /**
   * FILE A RENDER. The returned bytes become a File, are measured (peaks for
   * the waveform; tempo and key for a track), and go into the shelf as one
   * transaction over row and bytes. Resolves to the take, or null when the
   * write failed — the shelf's own error sentence then says why.
   */
  const fileRender = useCallback(
    async (r: Pick<DetailedMusicResult, "audio" | "songId" | "plan">, o: RenderOrigin): Promise<Take | null> => {
      const n = Math.max(lastN.current, labTakes.length) + 1;
      lastN.current = n;
      const title = labTitle(o.seed, o.op, n, o.sfx?.category);
      const file = new File([audioBytes(r.audio)], fileName(title, r.audio.mime), { type: r.audio.mime });
      const meta = { ...renderMeta(r, o), ...(await measure(file, o.op === "sfx")) };
      const row = await shelf.attachReturn(file, meta);
      return row ? takeFromAsset(row) : null;
    },
    [labTakes.length, shelf],
  );

  /** File a file a person brought back from Suno against the draft that asked
   *  for it — the Library's attach (./book.ts#returnMeta), plus a measurement. */
  const fileReturn = useCallback(
    async (file: File, draftId: string | null): Promise<Take | null> => {
      const d = draftId ? book.drafts.find((x) => x.id === draftId) : undefined;
      const parent = d?.parent_id ? byId.get(d.parent_id) : undefined;
      const meta = { ...returnMeta(d, parent), ...(await measure(file, false)) };
      const row = await shelf.attachReturn(file, meta);
      return row ? takeFromAsset(row) : null;
    },
    [book.drafts, byId, shelf],
  );

  /** Record a Suno draft in the book, so a return can be attached to it here or
   *  in the Library. Returns its id. */
  const recordDraft = useCallback(
    (seed: Seed, text: string, parent: string | null, extra?: Pick<Draft, "hunt_id" | "variation">) => {
      const d = { ...newDraft(seed, "suno", text, parent, null), ...extra };
      updateBook((b) => ({ ...b, drafts: [d, ...b.drafts] }));
      return d.id;
    },
    [updateBook],
  );

  /** Copy one field to the clipboard and stamp the draft as copied. */
  const copyField = useCallback(
    async (draftId: string, text: string) => {
      const ok = await copyText(text);
      if (ok) {
        const at = Date.now();
        updateBook((b) => ({
          ...b,
          drafts: b.drafts.map((d) => (d.id === draftId && !d.copied_at ? { ...d, copied_at: at } : d)),
        }));
      }
      return ok;
    },
    [updateBook],
  );

  // ── renders: every one through lib/musicClient.ts, every result filed ──
  const [pending, setPending] = useState<Pending[]>([]);
  const pendingN = useRef(0);
  const run = useCallback(
    async <T,>(label: string, seconds: number, fn: () => Promise<T>, tag?: string): Promise<T | null> => {
      const id = ++pendingN.current;
      setPending((p) => [...p, { id, label, seconds, tag }]);
      try {
        return await fn();
      } catch (e) {
        say(errMsg(e), "error");
        return null;
      } finally {
        setPending((p) => p.filter((x) => x.id !== id));
      }
    },
    [say],
  );

  const quick = useCallback(
    (seed: Seed, lengthS: number, prompt: string, ctx: RenderContext = {}) =>
      run(
        `rendering ${ctx.variation ? ctx.variation.diff.join(" ") : "a quick take"}…`,
        lengthS,
        async () => {
          const out = await composeRaw({ prompt, lengthMs: Math.round(lengthS * 1000) });
          return fileRender(out, { op: "compose", seed, prompt, ...ctx });
        },
        ctx.huntId ? laneTag(ctx.huntId, ctx.variation?.axis ?? "control", ctx.variation?.diff ?? []) : undefined,
      ),
    [run, fileRender],
  );

  /** Draft a plan. FREE (lib/music/pricing.ts declares the plan endpoint at
   *  zero) and it files nothing: a plan is not audio. */
  const draft = useCallback(
    (seed: Seed, lengthS: number, prompt: string) =>
      run("drafting a plan…", 0, async () => {
        const out = await draftPlan({ prompt, lengthMs: Math.round(lengthS * 1000), ...planStyle(seed) });
        return out.plan;
      }),
    [run],
  );

  const renderPlan = useCallback(
    (plan: WirePlan, seed: Seed, prompt: string, ctx: RenderContext = {}) => {
      const s = planMs(plan) / 1000;
      return run("rendering the plan…", s, async () => {
        const out = await composeRaw({ plan });
        return fileRender(out, { op: "plan", seed, prompt, ...ctx });
      });
    },
    [run, fileRender],
  );

  /** A section edit of a stored take: kept sections by reference, the rest
   *  regenerated. The edit's parent is its source, so the Library's lineage
   *  reads the version chain. */
  const edit = useCallback(
    (source: Take, modes: LabEditMode[], texts: string[], seconds: number) => {
      if (!source.song_id || !source.plan) return Promise.resolve(null);
      const plan = buildEditPlan(source.plan, source.song_id, modes, texts);
      return run(`rendering an edit of ${source.title}…`, seconds, async () => {
        const out = await composeRaw({ plan });
        return fileRender(out, {
          op: "section-edit",
          seed: seedOf(source),
          prompt: source.prompt_text ?? "",
          parent: source,
          editModes: modes,
          huntId: source.hunt_id,
        });
      });
    },
    [run, fileRender],
  );

  const sfx = useCallback(
    (p: { text: string; seconds: number; influence: number; loop: boolean; category: string }) =>
      run(`rendering ${p.category}…`, p.seconds, async () => {
        const out = await generateSfx({ text: p.text, durationSeconds: p.seconds, promptInfluence: p.influence, loop: p.loop });
        return fileRender(
          { audio: out.audio, songId: null, plan: null },
          { op: "sfx", seed: blankSeed(), prompt: p.text, sfx: { category: p.category, loop: p.loop } },
        );
      }),
    [run, fileRender],
  );

  /** Suno drafts still waiting on a file, newest first. */
  const awaiting = useMemo(
    () => book.drafts.filter((d) => d.target === "suno" && !takes.some((t) => t.draft_id === d.id)),
    [book.drafts, takes],
  );

  return {
    uid,
    ready: shelf.assets !== null,
    error: shelf.error ?? bookError,
    takes,
    labTakes,
    byId,
    voc,
    book,
    reg,
    engine,
    urlFor,
    cost,
    flash,
    say,
    keep,
    reject,
    clear,
    rate,
    fileRender,
    fileReturn,
    recordDraft,
    copyField,
    awaiting,
    pending,
    quick,
    draft,
    renderPlan,
    edit,
    sfx,
  };
}

export type Lab = ReturnType<typeof useLab>;
