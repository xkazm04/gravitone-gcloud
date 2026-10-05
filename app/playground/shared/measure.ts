"use client";

// MEASURE A TAKE ON FIRST OPEN — peaks, tempo, key, read off the bytes in the
// browser and written back to the store, so the next reader (any module, the
// Library, an agent listing over the CLI) gets a real waveform and a measured
// tempo/key without measuring again.
//
// The analysis is the Library's, verbatim (app/library/audio/analysis.ts:
// onset-envelope autocorrelation for tempo, Goertzel chroma against the
// Krumhansl profiles for key — offline, no vendor). Tempo and key are written
// for MUSIC only: the analyser will name a key for a door slam, and a key on an
// effect is a number with no property behind it. An effect gets its peaks.
//
// What MeasuredSound cannot hold is kept in session: the file's measured
// LENGTH (MeasuredSound has no duration field — a contract request in the
// triage report). It is read again for free off <audio> metadata, so nothing
// is lost but a round trip.

import { useEffect, useRef, useState } from "react";

import { analyzeFile } from "@/app/library/audio/analysis";
import { accessHeader } from "@/lib/imagingClient";
import { patchTake, takeFileUrl } from "@/lib/sound/client";
import type { MeasuredSound, SoundTake } from "@/lib/sound/types";

export interface Measurement {
  peaks: number[];
  measured: MeasuredSound;
  /** Seconds, decoded. */
  lengthS: number;
}

const lengths = new Map<string, number>();
const inFlight = new Map<string, Promise<{ take: SoundTake | null; error: string | null }>>();

/** The decoded length of a take measured this session, if any. */
export const measuredLength = (id: string): number | null => lengths.get(id) ?? null;

/** Read the bytes and analyse them. Resolves to an error string, never throws. */
export async function measureBytes(take: Pick<SoundTake, "id" | "title" | "kind">): Promise<Measurement | { error: string }> {
  let blob: Blob;
  try {
    const res = await fetch(takeFileUrl(take.id), { headers: accessHeader(), cache: "no-store" });
    if (!res.ok) return { error: `the file answered HTTP ${res.status}` };
    blob = await res.blob();
  } catch {
    return { error: "the file could not be fetched" };
  }
  try {
    const a = await analyzeFile(new File([blob], take.title || take.id, { type: blob.type }), () => {});
    lengths.set(take.id, a.duration);
    return {
      peaks: a.peaks.map((p) => Math.round(p * 1000) / 1000),
      measured: {
        tempoBpm: take.kind === "music" ? Math.round(a.tempo * 10) / 10 : null,
        key: take.kind === "music" ? a.key : null,
        // The analyser reports energy as a band ("high" / "medium" / "low"),
        // not a figure; MeasuredSound.energy is a number, and a band turned
        // into a number is one nobody measured.
        energy: null,
        lufs: null,
        truePeakDb: null,
      },
      lengthS: a.duration,
    };
  } catch {
    return { error: "the browser could not decode this file" };
  }
}

/** Measure a take and PATCH peaks + measured back. Deduplicated per id: two
 *  modules opening the same take measure it once. */
export function measureAndStore(take: SoundTake): Promise<{ take: SoundTake | null; error: string | null }> {
  const running = inFlight.get(take.id);
  if (running) return running;
  const p = (async () => {
    const m = await measureBytes(take);
    if ("error" in m) return { take: null, error: m.error };
    const r = await patchTake(take.id, { peaks: m.peaks, measured: m.measured });
    if (!r.ok) return { take: { ...take, peaks: m.peaks, measured: m.measured }, error: r.error };
    return { take: r.data.take, error: null };
  })().finally(() => inFlight.delete(take.id));
  inFlight.set(take.id, p);
  return p;
}

/** A take wants measuring when it has bytes and no peaks yet. */
export const needsMeasure = (t: Pick<SoundTake, "file" | "peaks">) => !!t.file && (!t.peaks || t.peaks.length === 0);

/**
 * Measure `take` the first time it is opened, then hand the stored take to
 * `onStored`. Returns the state for the surface to draw: measuring, or the
 * reason it could not.
 *
 * No mount guard, on purpose: the outcome is recorded BY ID, so a result that
 * lands after the surface moved on is filed under the take it belongs to and
 * read by nobody until that take is opened again — and the PATCH it carries is
 * wanted whichever take is on screen by then.
 */
export function useMeasureOnOpen(
  take: SoundTake | null,
  onStored: (t: SoundTake) => void,
): { measuring: boolean; error: string | null } {
  const id = take && needsMeasure(take) ? take.id : null;
  const [done, setDone] = useState<Record<string, string | null>>({});
  const latest = useRef({ take, onStored });
  useEffect(() => {
    latest.current = { take, onStored };
  });
  useEffect(() => {
    const t = latest.current.take;
    if (!id || !t || t.id !== id) return;
    void measureAndStore(t).then((r) => {
      setDone((d) => ({ ...d, [id]: r.error }));
      if (r.take) latest.current.onStored(r.take);
    });
  }, [id]);
  const tid = take?.id ?? "";
  return { measuring: !!id && !(id in done), error: done[tid] ?? null };
}
