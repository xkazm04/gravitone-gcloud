"use client";

// Frames state for one project: derive from the script, author the scene
// prompts, generate plates, bind texts to facts — and SURVIVE A RELOAD.
//
// Persistence is not a nicety here. A plate costs real money and a full cut is
// sixteen of them, so an in-memory step throws away several dollars and an
// evening's judgement on a refresh. Frames go to the same per-project step
// store the research and script steps use.
//
// Size note, stated because it will bite eventually: a plate is held as a data:
// URL, so a fully composed sixteen-frame cut is roughly 5MB in IndexedDB. Fine
// for one project on one machine; the moment frames need to be shared, plates
// belong in a blob store with the record holding a pointer, exactly as
// lib/assets.ts already does.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { generateImage, imgSrc, ImagingRequestError } from "@/lib/imagingClient";
import { compilePrompt, NEGATIVE_PROMPT } from "@/lib/stylePrompt";
import { statusOf, type StyleBlock } from "@/lib/themes";
import { useThemes } from "@/lib/useThemes";
import { useAuth } from "@/lib/useAuth";

import { PRESETS } from "@/app/library/presets";
import { loadStep, saveStep } from "../_shared/stepStore";
import { FACTS } from "../_shared/notebook/facts";
import { RENDERS } from "../script/renders";
import {
  authoredClipCount,
  emptyClip,
  framesFromRender,
  subjectFor,
  withClips,
  type DirectionSpend,
  type Frame,
  type FrameElement,
  type FrameText,
} from "./frames";
import { applySceneSpecs, reviewSceneSpecs, SceneSpecError, SCENE_SCHEMA } from "./sceneSpec";

const PHASE = "frames";

interface FramesStepData {
  frames: Frame[];
  /** Which script render the frames were derived from. A different render is a
   *  different cut, so the frames are stale rather than merely out of date. */
  renderId: string;
  /** What the art-direction passes cost. Persisted with the step because the
   *  money was spent on the step, not on the session — a reload that forgets it
   *  turns the header's spend line back into an undercount. */
  direction?: DirectionSpend;
  savedAt?: number;
}

export function useFrames(projectId: string) {
  const { user } = useAuth();
  const { themes } = useThemes(user?.uid ?? null);

  const locked = (themes ?? []).find((t) => statusOf(t) === "locked");
  const block: StyleBlock = locked?.block ?? PRESETS[0].block;
  const styleName = locked?.name ?? `${PRESETS[0].name} (no locked style yet)`;

  const render = RENDERS[0];
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  /** What the art-direction passes have cost this cut. Null until one has run —
   *  which is absence, and reads as absence, rather than $0.00. */
  const [direction, setDirection] = useState<DirectionSpend | null>(null);

  /* ── load ───────────────────────────────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const stored = await loadStep<FramesStepData>(projectId, PHASE);
      if (!alive) return;
      // A stored cut derived from a DIFFERENT render is not this cut. Re-derive
      // rather than showing frames whose beats no longer exist.
      const sameCut = Boolean(stored?.frames?.length && stored.renderId === render.id);
      setFrames(
        sameCut && stored
          ? // A cut stored before Frames inherited the clip has no clip on it.
            withClips(stored.frames)
          : framesFromRender(render),
      );
      // The spend belongs to the cut it directed. A different render throws the
      // frames away, and carrying its bill onto the new ones would be the same
      // lie as omitting it — a figure that describes work not on screen.
      setDirection(sameCut ? (stored?.direction ?? null) : null);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [projectId, render]);

  /* ── save ───────────────────────────────────────────────────────────────── */
  // Debounced, and never before the first load has landed — writing an empty
  // array over a stored cut is the one bug persistence layers reliably ship.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saveStep<FramesStepData>(projectId, PHASE, {
        frames,
        renderId: render.id,
        ...(direction ? { direction } : {}),
      });
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [frames, direction, loaded, projectId, render.id]);

  const patch = useCallback((id: string, fn: (f: Frame) => Frame) => {
    setFrames((fs) => fs.map((f) => (f.id === id ? fn(f) : f)));
  }, []);

  /* ── plates ─────────────────────────────────────────────────────────────── */

  const generatePlate = useCallback(
    async (id: string) => {
      const frame = frames.find((f) => f.id === id);
      if (!frame) return;
      const subject = frame.plate.subject?.trim() || subjectFor(frame);

      setBusy((b) => new Set(b).add(id));
      setError(null);
      patch(id, (f) => ({ ...f, plate: { ...f.plate, state: "generating", subject } }));

      try {
        const res = await generateImage({
          prompt: compilePrompt(block, subject),
          negativePrompt: NEGATIVE_PROMPT,
          aspect: "16:9",
          count: 1,
        });
        const img = res.images[0];
        patch(id, (f) => ({
          ...f,
          plate: {
            state: img ? "ready" : "refused",
            src: img ? imgSrc(img) : undefined,
            model: res.provenance.model,
            costUsd: res.provenance.costUsd,
            subject,
          },
        }));
      } catch (e) {
        const refused = e instanceof ImagingRequestError && e.code === "refused";
        patch(id, (f) => ({
          ...f,
          plate: { ...f.plate, state: refused ? "refused" : "empty", subject, note: e instanceof Error ? e.message : undefined },
        }));
        setError(e instanceof Error ? e.message : "The plate could not be generated.");
      } finally {
        setBusy((b) => {
          const n = new Set(b);
          n.delete(id);
          return n;
        });
      }
    },
    [frames, block, patch],
  );

  /* ── layers ─────────────────────────────────────────────────────────────── */

  const setSubject = useCallback(
    (id: string, subject: string) => patch(id, (f) => ({ ...f, plate: { ...f.plate, subject } })),
    [patch],
  );

  /** Author what the plate DOES. Only ever authoring — nothing in this app can
   *  render a clip, so there is no generate counterpart to this and the surface
   *  says as much rather than offering a button that cannot fire. */
  const setMotion = useCallback(
    (id: string, motion: string) => patch(id, (f) => ({ ...f, clip: { ...(f.clip ?? emptyClip()), motion } })),
    [patch],
  );

  const setText = useCallback(
    (id: string, textId: string, value: string) =>
      patch(id, (f) => ({ ...f, texts: f.texts.map((t) => (t.id === textId ? { ...t, value } : t)) })),
    [patch],
  );

  /** Bind a text layer to the notebook fact it asserts — or unbind it.
   *
   *  This is the integrity gate the whole step exists to hold. A figure on a
   *  frame is a CLAIM being made to a viewer; if it is not traceable to a
   *  sourced, dated fact then nobody checked it, and the canvas marks it. */
  const bindFact = useCallback(
    (id: string, textId: string, factId: string | undefined) =>
      patch(id, (f) => ({ ...f, texts: f.texts.map((t) => (t.id === textId ? { ...t, factId } : t)) })),
    [patch],
  );

  const addText = useCallback(
    (id: string, role: FrameText["role"]) =>
      patch(id, (f) => ({
        ...f,
        texts: [
          ...f.texts,
          { id: `t-${f.id}-${Date.now().toString(36)}`, role, value: role === "figure" ? "0" : "new line", x: 6, y: 44 },
        ],
      })),
    [patch],
  );

  const removeText = useCallback(
    (id: string, textId: string) => patch(id, (f) => ({ ...f, texts: f.texts.filter((t) => t.id !== textId) })),
    [patch],
  );

  /* ── layout ─────────────────────────────────────────────────────────────── */

  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  /** Move a layer to an absolute position, in percent of the frame.
   *
   *  Absolute rather than a delta: a drag emits many moves, and accumulating
   *  deltas drifts against the pointer as rounding compounds. The canvas knows
   *  where the pointer is; it should say so. */
  const moveLayer = useCallback(
    (id: string, ref: { type: "element" | "text"; id: string }, x: number, y: number) =>
      patch(id, (f) =>
        ref.type === "element"
          ? { ...f, elements: f.elements.map((e) => (e.id === ref.id ? { ...e, x: clamp(x), y: clamp(y) } : e)) }
          : { ...f, texts: f.texts.map((t) => (t.id === ref.id ? { ...t, x: clamp(x), y: clamp(y) } : t)) },
      ),
    [patch],
  );

  /** Resize an element. Texts have no box — they are set in type and size with
   *  their role, so a resize handle on one would be a lie. */
  const resizeElement = useCallback(
    (id: string, elId: string, w: number, h: number) =>
      patch(id, (f) => ({
        ...f,
        elements: f.elements.map((e) =>
          e.id === elId ? { ...e, w: Math.max(2, clamp(w)), h: Math.max(2, clamp(h)) } : e,
        ),
      })),
    [patch],
  );

  /** Reorder within a layer group. Array order IS paint order, so this is the
   *  z-control — and it stays WITHIN elements or WITHIN texts on purpose:
   *  texts always paint above elements, because a caption behind an arrow is
   *  not a look, it is a bug. */
  const reorderLayer = useCallback(
    (id: string, ref: { type: "element" | "text"; id: string }, dir: -1 | 1) =>
      patch(id, (f) => {
        const key = ref.type === "element" ? "elements" : "texts";
        const list = [...(f[key] as (FrameElement | FrameText)[])];
        const i = list.findIndex((l) => l.id === ref.id);
        const j = i + dir;
        if (i === -1 || j < 0 || j >= list.length) return f;
        [list[i], list[j]] = [list[j], list[i]];
        return { ...f, [key]: list } as Frame;
      }),
    [patch],
  );

  const toggleHidden = useCallback(
    (id: string, ref: { type: "element" | "text"; id: string }) =>
      patch(id, (f) =>
        ref.type === "element"
          ? { ...f, elements: f.elements.map((e) => (e.id === ref.id ? { ...e, hidden: !e.hidden } : e)) }
          : { ...f, texts: f.texts.map((t) => (t.id === ref.id ? { ...t, hidden: !t.hidden } : t)) },
      ),
    [patch],
  );

  const removeElement = useCallback(
    (id: string, elId: string) => patch(id, (f) => ({ ...f, elements: f.elements.filter((e) => e.id !== elId) })),
    [patch],
  );

  const reset = useCallback(() => setFrames(framesFromRender(render)), [render]);

  /* ── authoring ──────────────────────────────────────────────────────────── */

  const [directing, setDirecting] = useState(false);

  /** What the last pass refused, keyed by the beat it refused, so the ledger can
   *  say it ON that beat's row. A rejection printed as one error line is a
   *  sentence about sixteen frames; printed on a row it is a fix. */
  const [rejections, setRejections] = useState<Record<string, string>>({});
  /** The pass's own summary — partial success, which is neither an error nor
   *  silence and deserves its own voice. */
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Art-direct the whole cut in one pass.
   *
   * One pass over EVERY beat rather than sixteen independent calls, and that is
   * the point rather than an optimisation: the engine can only vary a frame
   * from its neighbours, or carry a motif from the hook into the turn, if it
   * can see them. Per-beat calls would reinvent the lookup table this replaces,
   * just more expensively.
   */
  const direct = useCallback(async () => {
    setDirecting(true);
    setError(null);
    setNotice(null);
    setRejections({});
    try {
      const res = await fetch("/api/frames", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: render.title,
          schema: SCENE_SCHEMA,
          style: block,
          facts: FACTS.map((f) => ({ id: f.id, claim: f.claim, confidence: f.confidence, loadBearing: f.loadBearing })),
          beats: frames.map((f) => ({ at: f.at, kind: f.kind, label: f.title, text: f.line, device: f.device })),
        }),
      });
      const json = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) throw new Error(typeof json.detail === "string" ? json.detail : "The scene direction failed.");

      // The bill, before the parse. `/api/frames` has always returned what this
      // pass cost and how long it took; the client used to destructure `raw`
      // and `detail` and drop `engine` on the floor, which made the header's
      // dollar figure an undercount of the single most expensive call here.
      //
      // Read it before parsing on purpose: a response this app cannot USE was
      // still a response the user PAID for, and a rejected pass that costs
      // nothing on screen is the same lie in a different direction.
      const engine = (json.engine ?? {}) as { costUsd?: unknown; durationMs?: unknown };
      const costUsd = typeof engine.costUsd === "number" && Number.isFinite(engine.costUsd) ? engine.costUsd : undefined;
      const durationMs =
        typeof engine.durationMs === "number" && Number.isFinite(engine.durationMs) ? engine.durationMs : undefined;
      setDirection((d) => ({
        runs: (d?.runs ?? 0) + 1,
        costUsd: (d?.costUsd ?? 0) + (costUsd ?? 0),
        // A pass the engine did not price is COUNTED, not assumed free. It is
        // what turns the total into a floor, and the header says so.
        unpriced: (d?.unpriced ?? 0) + (costUsd === undefined ? 1 : 0),
        lastMs: durationMs,
        lastAt: Date.now(),
      }));

      const report = reviewSceneSpecs(String(json.raw ?? ""), frames, new Set(FACTS.map((f) => f.id)));
      // Apply what survived. Rejected and unmentioned beats keep exactly what
      // they had — applySceneSpecs only touches frames it has a spec for.
      setFrames((fs) => applySceneSpecs(fs, report.specs));

      // Findings go to the rows they belong to. A rejection for a timestamp
      // that is not in this script has no row, so it goes to the summary.
      const inScript = new Set(frames.map((f) => f.at));
      const notes: Record<string, string> = {};
      for (const r of report.rejected) if (inScript.has(r.beatAt)) notes[r.beatAt] = r.reason;
      for (const at of report.missing) notes[at] = "The pass returned no scene for this beat.";
      setRejections(notes);

      const orphans = report.rejected.filter((r) => !inScript.has(r.beatAt));
      if (report.rejected.length || report.missing.length) {
        const parts = [`${report.specs.length} of ${frames.length} beats directed`];
        if (report.rejected.length) parts.push(`${report.rejected.length} rejected`);
        if (report.missing.length) parts.push(`${report.missing.length} with no scene returned`);
        setNotice(
          `${parts.join(" · ")}. ${
            report.specs.length ? "The reasons are on those rows; every other beat was applied." : "Nothing was applied."
          }${orphans.length ? ` The engine also invented ${orphans.map((o) => `"${o.beatAt}"`).join(", ")}.` : ""}`,
        );
      }
    } catch (e) {
      setError(
        e instanceof SceneSpecError
          ? `The engine returned direction this app cannot use: ${e.message} Nothing was changed.`
          : e instanceof Error
            ? e.message
            : "The scene direction failed.",
      );
    } finally {
      setDirecting(false);
    }
  }, [frames, block, render.title]);

  /** What the plates cost. Kept apart from the direction pass rather than
   *  merged: one is many small charges the user makes one at a time, the other
   *  is one large charge they make rarely, and a single opaque figure lets
   *  neither be reasoned about. */
  const plateCost = useMemo(() => frames.reduce((t, f) => t + (f.plate.costUsd ?? 0), 0), [frames]);
  /** Everything this step has spent, as far as anyone knows. A floor whenever
   *  `direction.unpriced` is above nought. */
  const totalCost = plateCost + (direction?.costUsd ?? 0);
  /** Figures asserting something nobody sourced. The number that should be zero
   *  before this step is called done. */
  const unboundFigures = useMemo(
    () => frames.reduce((n, f) => n + f.texts.filter((t) => t.role === "figure" && !t.factId).length, 0),
    [frames],
  );
  /** How much of the cut knows what it does. Authored, not rendered — nothing
   *  here can render a clip, and the surfaces reading this say so. */
  const clipsAuthored = useMemo(() => authoredClipCount(frames), [frames]);

  return {
    render,
    facts: FACTS,
    frames,
    loaded,
    busy,
    error,
    block,
    styleName,
    hasLockedStyle: Boolean(locked),
    plateCost,
    totalCost,
    direction,
    unboundFigures,
    clipsAuthored,
    setFrames,
    directing,
    direct,
    rejections,
    notice,
    generatePlate,
    setSubject,
    setMotion,
    setText,
    bindFact,
    moveLayer,
    resizeElement,
    reorderLayer,
    toggleHidden,
    addText,
    removeText,
    removeElement,
    reset,
  };
}
