"use client";

// The Cut's data, for one project: the three upstream records read honestly,
// the sync bench's offsets persisted under this step's own key, and the takes
// loaded into THIS session. Every variant reads the same object through
// `CutContext`; variants own layout, never data.
//
// None of this changes per frame. The clock (./clock.ts) is separate and is
// handed down beside this, so a context consumer re-renders when the cut
// changes — a nudge, a take loaded, a clip selected — and never when the
// playhead moves.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { getProject } from "@/lib/projects";
import { soundStoreListed } from "@/lib/capabilities";
import { listTakes } from "@/lib/sound/client";

import {
  readStep,
  saveStep,
  type CutStepData,
  type ScoreStepData,
  type StorageTrouble,
} from "../_shared/stepStore";
import { useLoadFor, useStepFor } from "../_shared/useLoadFor";
import type { Frame } from "../frames/frames";
import type { FramesStepData } from "../frames/useFrames";
import type { ScoreSpot } from "../score/spots";

import type { CutClock } from "./clock";
import { deriveTimeline, type DerivedCut, type OwnerStep } from "./deriveTimeline";
import { finishLine, type FinishCheck } from "./finishLine";
import type { Offsets } from "./offsets";

/** This step's own key — unchanged from the timeline this replaces, so a sync
 *  pass saved before the rebuild still loads. */
const PHASE = "cut";

/** How many sync changes Ctrl/⌘+Z can walk back in one session. */
const UNDO_DEPTH = 50;

/** A file dropped into this session. NOT persisted: a `blob:` URL is dead on
 *  the next load. A cue's KEPT take is the Score step's — a sound-store take
 *  the spot points at (ADR 2026-08-29-score-take-persistence, option D) — and
 *  deriveTimeline resolves that pointer; a session drop only overrides it. */
export interface SessionTake {
  url: string;
  name: string;
  /** Normalised magnitudes for the waveform; null when the browser could not
   *  decode the file (it may still play). */
  peaks: number[] | null;
  durationS: number | null;
}

interface Upstream {
  project: { title: string; logline: string; targetS: number } | null;
  frames: Frame[] | null;
  spots: ScoreSpot[] | null;
}

/** Magnitude peaks, `n` buckets, normalised to the loudest. */
export function peaksOf(samples: Float32Array, n: number): number[] {
  if (samples.length === 0 || n <= 0) return [];
  const size = Math.max(1, Math.floor(samples.length / n));
  const out: number[] = [];
  for (let b = 0; b < n; b++) {
    let max = 0;
    const end = Math.min(samples.length, (b + 1) * size);
    for (let i = b * size; i < end; i++) {
      const v = Math.abs(samples[i]);
      if (v > max) max = v;
    }
    out.push(max);
  }
  const top = Math.max(...out);
  return top > 0 ? out.map((v) => v / top) : out;
}

async function decode(file: Blob): Promise<{ peaks: number[]; durationS: number } | null> {
  try {
    // An offline context decodes without asking the autoplay policy for
    // anything — a live AudioContext created outside a gesture starts suspended.
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    return { peaks: peaksOf(audio.getChannelData(0), 240), durationS: audio.duration };
  } catch {
    return null;
  }
}

export function useCut(projectId: string) {
  const router = useRouter();

  /* ── upstream: project, frames, score ───────────────────────────────────── */
  const [up, setUp] = useState<Upstream | null>(null);
  const [trouble, setTrouble] = useState<StorageTrouble | null>(null);
  const read = useLoadFor(
    projectId,
    async (id) => ({
      project: await getProject(id).catch(() => undefined),
      frames: await readStep<FramesStepData>(id, "frames"),
      score: await readStep<ScoreStepData>(id, "score"),
    }),
    ({ project, frames, score }) => {
      // A frames record that will not open is NOT "no frames": deriving over it
      // would draw an empty cut — or the fixture — over work still on disk.
      // The Score step refuses the same read on the same grounds.
      const bad = !frames.ok ? frames.trouble : !score.ok ? score.trouble : null;
      if (bad) {
        setTrouble(bad);
        setUp(null);
        return false;
      }
      setTrouble(null);
      setUp({
        project: project
          ? { title: project.title, logline: project.logline, targetS: project.targetS }
          : null,
        frames: frames.ok ? (frames.data?.frames ?? null) : null,
        spots: score.ok ? (score.data?.spots ?? null) : null,
      });
    },
  );

  /* ── the sync bench's offsets — persisted, as before, and now undoable ────
     The offsets and the states they replaced live in ONE state object, so an
     updater stays a pure function of the previous value: the batching probe
     (cut-nudge-batching) holds that two nudges in one batch compose, and a
     history kept in a ref beside the state would be written from inside an
     updater React may run twice. Undo replaces the confirm a sync pass never
     had: a nudge is cheap to make and now cheap to take back. The history is
     this session's only — it is a keystroke's memory, not a record. */
  const [sync, setSync] = useState<{ now: Offsets; past: Offsets[] }>({ now: {}, past: [] });
  const offsets = sync.now;
  const hydrated = useStepFor<CutStepData>(projectId, PHASE, (saved) =>
    setSync({ now: saved?.offsets ?? {}, past: [] }),
  );
  const setOffsets = useCallback((next: Offsets | ((o: Offsets) => Offsets)) => {
    setSync((s) => {
      const now = typeof next === "function" ? next(s.now) : next;
      return now === s.now ? s : { now, past: [...s.past.slice(1 - UNDO_DEPTH), s.now] };
    });
  }, []);
  const undoOffsets = useCallback(() => {
    setSync((s) => (s.past.length ? { now: s.past[s.past.length - 1], past: s.past.slice(0, -1) } : s));
  }, []);
  useEffect(() => {
    // Never before hydration: the empty initial state is not an empty cut, and
    // saving it would erase the creator's sync pass with a blank one.
    if (!hydrated) return;
    void saveStep<CutStepData>(projectId, PHASE, { offsets });
  }, [projectId, offsets, hydrated]);

  /* ── session takes ──────────────────────────────────────────────────────── */
  const [takes, setTakes] = useState<Record<string, SessionTake>>({});
  // The urls this hook minted, for release on unmount. A ref, because the
  // cleanup must see the LAST set, not the set at mount.
  const minted = useRef<Record<string, string>>({});
  useEffect(() => {
    // The bag is mutated in place and never reassigned, so the object captured
    // here IS the one the cleanup must empty.
    const bag = minted.current;
    return () => {
      for (const url of Object.values(bag)) URL.revokeObjectURL(url);
    };
  }, []);

  const attachTake = useCallback(async (cueId: string, file: File) => {
    const url = URL.createObjectURL(file);
    const prev = minted.current[cueId];
    if (prev) URL.revokeObjectURL(prev);
    minted.current[cueId] = url;
    setTakes((t) => ({ ...t, [cueId]: { url, name: file.name, peaks: null, durationS: null } }));
    const decoded = await decode(file);
    if (!decoded) return;
    setTakes((t) => (t[cueId]?.url === url ? { ...t, [cueId]: { ...t[cueId], ...decoded } } : t));
  }, []);

  const detachTake = useCallback((cueId: string) => {
    const prev = minted.current[cueId];
    if (prev) URL.revokeObjectURL(prev);
    delete minted.current[cueId];
    setTakes((t) => {
      const next = { ...t };
      delete next[cueId];
      return next;
    });
  }, []);

  /* ── the sound store's takes — what a spot's `activeTakeId` resolves against.
     Read once per project where the store exists (the posture the Score step
     renders into it under); `null` otherwise, which deriveTimeline draws as
     "not read", never as held. */
  const [storeTakeIds, setStoreTakeIds] = useState<ReadonlySet<string> | null>(null);
  // Reading the store needs no vendor key: the flag alone decides
  // (lib/capabilities.ts soundStoreListed), so a keyless box still resolves
  // takes it already holds.
  const storeBacked = soundStoreListed();
  useEffect(() => {
    if (!storeBacked) return;
    let live = true;
    void listTakes({ kind: "music" }).then((r) => {
      if (live) setStoreTakeIds(r.ok ? new Set(r.data.takes.map((t) => t.id)) : null);
    });
    return () => {
      live = false;
    };
  }, [projectId, storeBacked]);

  /* ── the cut ────────────────────────────────────────────────────────────── */
  const takeUrls = useMemo(
    () => Object.fromEntries(Object.entries(takes).map(([k, v]) => [k, v.url])),
    [takes],
  );
  const cut: DerivedCut | null = useMemo(
    () => (up ? deriveTimeline({ projectId, ...up, takes: takeUrls, storeTakeIds }) : null),
    [projectId, up, takeUrls, storeTakeIds],
  );
  const checks: FinishCheck[] = useMemo(() => (cut ? finishLine(cut, offsets) : []), [cut, offsets]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = cut?.clips.find((c) => c.id === selectedId) ?? null;

  const openStep = useCallback(
    (step: OwnerStep) => {
      // The other params ride along except the variant, which is the Cut's
      // own bake-off and means something else on the step it lands on.
      const p = new URLSearchParams(window.location.search);
      p.set("step", step);
      p.delete("v");
      router.push(`/studio/${projectId}?${p.toString()}`, { scroll: false });
    },
    [router, projectId],
  );

  return {
    projectId,
    loaded: read && cut !== null,
    trouble,
    cut,
    checks,
    offsets,
    setOffsets,
    undoOffsets,
    canUndo: sync.past.length > 0,
    takes,
    attachTake,
    detachTake,
    selected,
    select: setSelectedId,
    openStep,
  };
}

export type CutModel = ReturnType<typeof useCut>;

/** The data, plus the clock beside it. The clock object is stable for the life
 *  of the surface, so including it here costs no renders. */
export interface CutCtx extends CutModel {
  cut: DerivedCut;
  clock: CutClock;
  /** Every edit point on the lanes, drawn positions (../edits.ts) — what the
   *  ↑/↓ jumps and a Shift-scrub snap to. */
  edits: readonly number[];
  /** Set when a browser refused to play a take — reported, not swallowed. */
  refused: string | null;
  setRefused: (m: string | null) => void;
  muted: boolean;
  setMuted: (m: boolean) => void;
}

export const CutContext = createContext<CutCtx | null>(null);

export function useCutCtx(): CutCtx {
  const c = useContext(CutContext);
  if (!c) throw new Error("useCutCtx outside <CutContext>");
  return c;
}
