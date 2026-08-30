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
import { altId, canRemoveAlt, isSynthetic, SYNTH_MARK, type AltsColumn, type AltsCtl, type AltsStepData, type SceneAlts } from "./alts";

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
          // `seeded` because this plate was bought in the assembly view, not
          // here — see the field's own note in ./alts. Everything else about it
          // is a normal alternative: selectable, removable, and the incumbent.
          alts: [{ id: altId(f.id), plate: { ...f.plate }, createdAt: Date.now(), seeded: true }],
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

  /** Deleting the active alternative promotes the newest survivor — a cut that
   *  silently keeps using a deleted picture would be lying.
   *
   *  THE ADOPTION HAPPENS OUTSIDE THE UPDATER, the way `select` above already
   *  does it. It used to sit inside the `setByFrame` callback, which made it a
   *  write to ANOTHER hook's state (`onAdopt` is `ctl.setFrames`) performed
   *  during React's update phase. A state updater must be pure: React invokes it
   *  twice under StrictMode, and `useVersions.ts` carries that exact warning
   *  about its own note counter — "a state updater is invoked twice under
   *  StrictMode, and a counter incremented in one would skip". This particular
   *  write happens to be idempotent, so nothing visibly broke, which is the only
   *  reason it survived. */
  const remove = useCallback(
    (frameId: string, id: string) => {
      const scene = byFrame[frameId];
      if (!scene) return;

      // THE LAST ONE IS NOT DISCARDABLE, and the promotion above is exactly why.
      //
      // Deleting the active alternative promotes a survivor and adopts it, so
      // the frame and this view keep agreeing. With one alternative there is no
      // survivor: `activeId` goes null, the `activeId &&` guard below skips the
      // adoption, and `onAdopt` is never called — so useFrames keeps the plate
      // that was just discarded. The column then reads "no alternatives kept"
      // while the assembly ledger, the canvas and the export all still render
      // that exact picture. That is the precise failure this function's own
      // docstring calls lying, reached by the one path that skips the fix.
      //
      // Refused rather than propagated. The other way to make the two agree is
      // to clear the frame's plate — but the seed came from the ASSEMBLY view
      // and was paid for there, so a control labelled "discard this
      // alternative" would be silently emptying a composed frame. Refusing
      // costs the user one click and nothing else.
      //
      // Synthetic columns are exempt: a clone has no frame to disagree with.
      if (!canRemoveAlt(frameId, scene.alts.length)) return;

      const alts = scene.alts.filter((a) => a.id !== id);
      const activeId =
        scene.activeId === id ? (alts.length ? alts[alts.length - 1].id : null) : scene.activeId;

      setByFrame((prev) => {
        // Re-read inside the updater so the write is against the CURRENT store,
        // not the render's snapshot; the promotion above only decides WHICH id.
        const cur = prev[frameId];
        if (!cur) return prev;
        return {
          ...prev,
          [frameId]: {
            activeId,
            alts: cur.alts.filter((a) => a.id !== id),
          },
        };
      });

      if (scene.activeId === id && activeId && !isSynthetic(frameId)) {
        const next = alts.find((a) => a.id === activeId);
        if (next) onAdopt(frameId, { ...next.plate });
      }
    },
    [byFrame, onAdopt],
  );

  /** What the alternatives cost, BEYOND the plates already counted.
   *
   *  The seed is excluded, and it used to be the whole bug: a composed frame's
   *  existing plate is kept as alternative #1 carrying its `costUsd`, so opening
   *  this view on a finished sixteen-frame cut and generating nothing reported
   *  the entire cost of the cut as "$X on alternatives" — money spent in the
   *  assembly view, where `useFrames`'s `plateCost` already reports it. After a
   *  selection it got worse rather than better: `onAdopt` moves the frame's
   *  plate to the chosen alternative, so `plateCost` follows the new picture
   *  while this figure still carried the old one, and the same dollars were in
   *  neither place correctly.
   *
   *  A record written before `seeded` existed keeps counting its seed. See the
   *  field's note for why that is stated rather than heuristically repaired. */
  const altCost = useMemo(
    () =>
      Object.entries(byFrame)
        .filter(([k]) => !isSynthetic(k))
        .reduce(
          (s, [, v]) =>
            s + v.alts.reduce((a, alt) => a + (alt.seeded ? 0 : (alt.plate.costUsd ?? 0)), 0),
          0,
        ),
    [byFrame],
  );

  return { loaded, columns, busy, error, altCost, select, generate, remove, stress, setStress };
}
