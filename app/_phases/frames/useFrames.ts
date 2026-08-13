"use client";

// Frames state for one project: derive from the script, generate plates, edit
// layers. Shared by all three variants so they differ in LAYOUT only — a
// variant that owned its own state would be comparing two things at once.

import { useCallback, useMemo, useState } from "react";

import { generateImage, imgSrc, ImagingRequestError } from "@/lib/imagingClient";
import { compilePrompt, NEGATIVE_PROMPT } from "@/lib/stylePrompt";
import { statusOf, type StyleBlock } from "@/lib/themes";
import { useThemes } from "@/lib/useThemes";
import { useAuth } from "@/lib/useAuth";

import { PRESETS } from "@/app/library/presets";
import { RENDERS } from "../script/renders";
import { framesFromRender, subjectFor, type Frame, type FrameText } from "./frames";

export function useFrames() {
  const { user } = useAuth();
  const { themes } = useThemes(user?.uid ?? null);

  // The project's visual identity. Falls back to the first preset so the step
  // is explorable before a style is locked — but the UI says which it is using,
  // because "these plates are in your locked style" must not be assumed.
  const locked = (themes ?? []).find((t) => statusOf(t) === "locked");
  const block: StyleBlock = locked?.block ?? PRESETS[0].block;
  const styleName = locked?.name ?? `${PRESETS[0].name} (no locked style yet)`;

  const render = RENDERS[0];
  const [frames, setFrames] = useState<Frame[]>(() => framesFromRender(render));
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const patch = useCallback((id: string, fn: (f: Frame) => Frame) => {
    setFrames((fs) => fs.map((f) => (f.id === id ? fn(f) : f)));
  }, []);

  /** Render one frame's plate. The style block is restated in full every time —
   *  see lib/stylePrompt: attaching a reference alone lets the look drift. */
  const generatePlate = useCallback(
    async (id: string) => {
      const frame = frames.find((f) => f.id === id);
      if (!frame) return;
      const subject = frame.plate.subject ?? subjectFor(frame);

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
          plate: { ...f.plate, state: refused ? "refused" : "empty", note: e instanceof Error ? e.message : undefined },
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

  const setSubject = useCallback(
    (id: string, subject: string) => patch(id, (f) => ({ ...f, plate: { ...f.plate, subject } })),
    [patch],
  );

  const setText = useCallback(
    (id: string, textId: string, value: string) =>
      patch(id, (f) => ({ ...f, texts: f.texts.map((t) => (t.id === textId ? { ...t, value } : t)) })),
    [patch],
  );

  const addText = useCallback(
    (id: string, role: FrameText["role"]) =>
      patch(id, (f) => ({
        ...f,
        texts: [...f.texts, { id: `t-${f.id}-${f.texts.length}`, role, value: role === "figure" ? "0" : "new line", x: 6, y: 44 }],
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

  const totalCost = useMemo(
    () => frames.reduce((t, f) => t + (f.plate.costUsd ?? 0), 0),
    [frames],
  );

  return {
    render,
    frames,
    busy,
    error,
    block,
    styleName,
    hasLockedStyle: Boolean(locked),
    totalCost,
    generatePlate,
    setSubject,
    setText,
    addText,
    removeText,
    removeElement,
  };
}
