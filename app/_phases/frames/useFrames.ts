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
import { framesFromRender, subjectFor, type Frame, type FrameText } from "./frames";
import { applySceneSpecs, parseSceneSpecs, SceneSpecError, SCENE_SCHEMA } from "./sceneSpec";

const PHASE = "frames";

interface FramesStepData {
  frames: Frame[];
  /** Which script render the frames were derived from. A different render is a
   *  different cut, so the frames are stale rather than merely out of date. */
  renderId: string;
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

  /* ── load ───────────────────────────────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const stored = await loadStep<FramesStepData>(projectId, PHASE);
      if (!alive) return;
      // A stored cut derived from a DIFFERENT render is not this cut. Re-derive
      // rather than showing frames whose beats no longer exist.
      setFrames(
        stored?.frames?.length && stored.renderId === render.id
          ? stored.frames
          : framesFromRender(render),
      );
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
      void saveStep<FramesStepData>(projectId, PHASE, { frames, renderId: render.id });
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [frames, loaded, projectId, render.id]);

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

  const removeElement = useCallback(
    (id: string, elId: string) => patch(id, (f) => ({ ...f, elements: f.elements.filter((e) => e.id !== elId) })),
    [patch],
  );

  const reset = useCallback(() => setFrames(framesFromRender(render)), [render]);

  /* ── authoring ──────────────────────────────────────────────────────────── */

  const [directing, setDirecting] = useState(false);

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

      const specs = parseSceneSpecs(String(json.raw ?? ""), frames, new Set(FACTS.map((f) => f.id)));
      setFrames((fs) => applySceneSpecs(fs, specs));
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

  const totalCost = useMemo(() => frames.reduce((t, f) => t + (f.plate.costUsd ?? 0), 0), [frames]);
  /** Figures asserting something nobody sourced. The number that should be zero
   *  before this step is called done. */
  const unboundFigures = useMemo(
    () => frames.reduce((n, f) => n + f.texts.filter((t) => t.role === "figure" && !t.factId).length, 0),
    [frames],
  );

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
    totalCost,
    unboundFigures,
    setFrames,
    directing,
    direct,
    generatePlate,
    setSubject,
    setText,
    bindFact,
    addText,
    removeText,
    removeElement,
    reset,
  };
}
