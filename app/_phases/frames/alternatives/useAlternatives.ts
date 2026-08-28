"use client";

// Alternatives state for one project's cut. One hook, three views — the
// prototype variants compete on layout and navigation, never on plumbing.
//
// SEEDING: the first time a composed frame is seen here, its current plate is
// kept as alternative #1 and marked active. The step never starts empty for a
// cut the user already paid for.
//
// ADOPTION: selecting an alternative calls `onAdopt`, which writes that plate
// back onto the frame in useFrames — the assembly ledger, the exports and the
// alternatives view all agree about which picture the cut uses because there is
// exactly one place the answer lives.
//
// STRESS MODE: multiplies the cut with synthetic clones (~7×16 = 112 columns)
// so the 100-scene claim is judged, not assumed. Clones are fully interactive
// in memory; their "generation" resolves locally after a delay and costs
// nothing; they are never persisted.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { generateImage, imgSrc, ImagingRequestError } from "@/lib/imagingClient";
import { compilePrompt, NEGATIVE_PROMPT } from "@/lib/stylePrompt";
import type { StyleBlock } from "@/lib/themes";

import { loadStep, saveStep } from "../../_shared/stepStore";
import { subjectFor, type Frame, type Plate } from "../frames";
import { altId, isSynthetic, SYNTH_MARK, type AltsColumn, type AltsCtl, type AltsStepData, type SceneAlts } from "./alts";

const PHASE = "frames-alts";
const STRESS_FACTOR = 7;

export function useAlternatives({
  projectId,
  frames,
  block,
  references,
  onAdopt,
}: {
  projectId: string;
  frames: Frame[];
  block: StyleBlock;
  /** The theme's approved proofs, same set the assembly path sends — an
   *  alternative judged against the cut must be conditioned like the cut. */
  references?: { base64: string; mime: string }[];
  onAdopt: (frameId: string, plate: Plate) => void;
}): AltsCtl {
  const [byFrame, setByFrame] = useState<Record<string, SceneAlts>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [stress, setStress] = useState(false);

  /* ── load, then seed from the frames the cut already composed ───────────── */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const stored = await loadStep<AltsStepData>(projectId, PHASE);
      if (!alive) return;
      setByFrame(stored?.byFrame ?? {});
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Seed AFTER load, and only for frames this store has never met. Runs again
  // as plates land in the assembly view — a newly composed frame gains its
  // first alternative without a visit here.
  useEffect(() => {
    if (!loaded) return;
    setByFrame((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const f of frames) {
        if (next[f.id]) continue;
        if (f.plate.state !== "ready") continue;
        next[f.id] = {
          activeId: null,
          alts: [{ id: altId(f.id), plate: { ...f.plate }, createdAt: Date.now() }],
        };
        next[f.id].activeId = next[f.id].alts[0].id;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [loaded, frames]);

  /* ── save, debounced, synthetic entries filtered out ────────────────────── */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const real: Record<string, SceneAlts> = {};
      for (const [k, v] of Object.entries(byFrame)) if (!isSynthetic(k)) real[k] = v;
      void saveStep<AltsStepData>(projectId, PHASE, { byFrame: real, savedAt: Date.now() });
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [byFrame, loaded, projectId]);

  /* ── columns: the real cut, times seven under stress ────────────────────── */
  const columns = useMemo<AltsColumn[]>(() => {
    const base: AltsColumn[] = frames.map((f) => ({
      frame: f,
      alts: byFrame[f.id]?.alts ?? [],
      activeId: byFrame[f.id]?.activeId ?? null,
      synthetic: false,
    }));
    if (!stress) return base;
    const out = [...base];
    for (let n = 1; n < STRESS_FACTOR; n++) {
      for (const f of frames) {
        const id = `${f.id}${SYNTH_MARK}${n}`;
        out.push({
          frame: { ...f, id, title: `${f.title} · copy ${n}` },
          alts: byFrame[id]?.alts ?? [],
          activeId: byFrame[id]?.activeId ?? null,
          synthetic: true,
        });
      }
    }
    return out;
  }, [frames, byFrame, stress]);

  /* ── actions ────────────────────────────────────────────────────────────── */

  const frameOf = useCallback(
    (frameId: string): Frame | undefined => columns.find((c) => c.frame.id === frameId)?.frame,
    [columns],
  );

  const select = useCallback(
    (frameId: string, id: string) => {
      setByFrame((prev) => {
        const scene = prev[frameId];
        if (!scene || !scene.alts.some((a) => a.id === id)) return prev;
        return { ...prev, [frameId]: { ...scene, activeId: id } };
      });
      // Adopt into the frame itself — real frames only; clones have no frame.
      if (!isSynthetic(frameId)) {
        const alt = byFrame[frameId]?.alts.find((a) => a.id === id);
        if (alt) onAdopt(frameId, { ...alt.plate });
      }
    },
    [byFrame, onAdopt],
  );

  const generate = useCallback(
    async (frameId: string) => {
      const frame = frameOf(frameId);
      if (!frame || busy.has(frameId)) return;
      const subject = frame.plate.subject?.trim() || subjectFor(frame);

      setBusy((b) => new Set(b).add(frameId));
      setError(null);
      try {
        let plate: Plate;
        if (isSynthetic(frameId)) {
          // Stress clones exercise the UX, not the vendor. Same latency shape,
          // no src (the canvas draws its gradient), zero dollars.
          await new Promise((r) => setTimeout(r, 500 + Math.random() * 700));
          plate = { state: "ready", subject, model: "synthetic", costUsd: 0 };
        } else {
          const res = await generateImage({
            prompt: compilePrompt(block, subject),
            negativePrompt: NEGATIVE_PROMPT,
            aspect: "16:9",
            count: 1,
            references: references?.length ? references : undefined,
          });
          const img = res.images[0];
          if (!img) throw new ImagingRequestError("The engine returned no image.", "refused", 200);
          plate = { state: "ready", src: imgSrc(img), model: res.provenance.model, costUsd: res.provenance.costUsd, subject };
        }
        const alt = { id: altId(frameId), plate, createdAt: Date.now() };
        setByFrame((prev) => {
          const scene = prev[frameId] ?? { activeId: null, alts: [] };
          return {
            ...prev,
            [frameId]: {
              // A first alternative becomes active — an empty scene has no
              // incumbent to defend. Later ones wait to be chosen.
              activeId: scene.activeId ?? alt.id,
              alts: [...scene.alts, alt],
            },
          };
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "The alternative could not be generated.");
      } finally {
        setBusy((b) => {
          const n = new Set(b);
          n.delete(frameId);
          return n;
        });
      }
    },
    [frameOf, busy, block, references],
  );

  const remove = useCallback(
    (frameId: string, id: string) => {
      setByFrame((prev) => {
        const scene = prev[frameId];
        if (!scene) return prev;
        const alts = scene.alts.filter((a) => a.id !== id);
        // Deleting the active alternative promotes the newest survivor — a cut
        // that silently keeps using a deleted picture would be lying.
        const activeId =
          scene.activeId === id ? (alts.length ? alts[alts.length - 1].id : null) : scene.activeId;
        if (scene.activeId === id && activeId && !isSynthetic(frameId)) {
          const next = alts.find((a) => a.id === activeId);
          if (next) onAdopt(frameId, { ...next.plate });
        }
        return { ...prev, [frameId]: { activeId, alts } };
      });
    },
    [onAdopt],
  );

  const altCost = useMemo(
    () =>
      Object.entries(byFrame)
        .filter(([k]) => !isSynthetic(k))
        .reduce((s, [, v]) => s + v.alts.reduce((a, alt) => a + (alt.plate.costUsd ?? 0), 0), 0),
    [byFrame],
  );

  return { loaded, columns, busy, error, altCost, select, generate, remove, stress, setStress };
}
