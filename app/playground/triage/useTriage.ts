"use client";

// TRIAGE'S DATA — every non-fixture take of one kind, read once from the store
// (lib/sound/client.ts#listTakes), judged optimistically, written back in order.
//
// ORDER IS THE WHOLE TRICK. A judge scores three dimensions in under a second
// ("8", "9", "7"), and each press is a PATCH carrying the take's FULL ratings
// record. Sent in parallel, the store can apply them out of order and the last
// one to land wins with two scores missing — the defect fixed in the Library on
// 2026-10-05 (344cdbc, "three rubric keys pressed fast keep all three scores").
// So writes are chained PER TAKE: the next PATCH for a take leaves only after
// the previous one answered, and each is computed from the newest local state
// (a ref beside the state, written only in handlers), never from a render's
// closure.

import { useCallback, useRef, useState } from "react";

import { useLoadFor } from "@/app/_phases/_shared/useLoadFor";
import { listTakes, patchTake } from "@/lib/sound/client";
import type { SoundKind, SoundTake, TakePatch } from "@/lib/sound/types";

import { useSoundLab } from "../shared/shell";

export interface TriageData {
  takes: SoundTake[];
  ready: boolean;
  error: string | null;
  /** Apply a patch locally now and write it behind any earlier write to the same take. */
  patch: (id: string, fn: (t: SoundTake) => TakePatch) => void;
  /** Replace or add takes (a measured take, a freshly generated one). */
  upsert: (ts: SoundTake[], opts?: { keepLocal?: boolean }) => void;
  reload: () => void;
}

export function useTriage(kind: SoundKind): TriageData {
  const lab = useSoundLab();
  const [takes, setTakesState] = useState<SoundTake[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const ref = useRef<SoundTake[]>([]);
  const chains = useRef(new Map<string, Promise<void>>());

  const setTakes = useCallback((next: SoundTake[]) => {
    ref.current = next;
    setTakesState(next);
  }, []);

  const ready = useLoadFor(
    `${kind}:${nonce}`,
    () => listTakes({ kind }),
    (r) => {
      if (!r.ok) {
        setError(r.error);
        return false;
      }
      setError(null);
      setTakes(r.data.takes.filter((t) => t.origin !== "fixture"));
    },
  );

  const upsert = useCallback(
    (ts: SoundTake[], opts: { keepLocal?: boolean } = {}) => {
      const by = new Map(ref.current.map((t) => [t.id, t]));
      for (const t of ts) {
        const mine = by.get(t.id);
        // A measurement that lands after the judge already scored must not
        // roll the scores back: take the server's measurements, keep ours.
        by.set(
          t.id,
          mine && opts.keepLocal
            ? { ...mine, peaks: t.peaks, measured: t.measured, file: t.file }
            : t,
        );
      }
      const order = [...ts.filter((t) => !ref.current.some((x) => x.id === t.id)), ...ref.current];
      setTakes(order.map((t) => by.get(t.id)!));
    },
    [setTakes],
  );

  const patch = useCallback(
    (id: string, fn: (t: SoundTake) => TakePatch) => {
      const cur = ref.current.find((t) => t.id === id);
      if (!cur) return;
      const body = fn(cur);
      const before = cur;
      const now = new Date().toISOString();
      const next: SoundTake = {
        ...cur,
        ...body,
        ...(body.verdict && body.verdict !== "unjudged" ? { judgedAt: now } : {}),
        ...(body.verdict === "unjudged" ? { judgedAt: null } : {}),
        ...(body.verdict === "kept" && cur.stage == null ? { stage: "pending" as const } : {}),
      };
      setTakes(ref.current.map((t) => (t.id === id ? next : t)));
      const prev = chains.current.get(id) ?? Promise.resolve();
      const run = prev.then(async () => {
        const r = await patchTake(id, body);
        if (r.ok) {
          // The store's answer is authoritative for the fields it owns; local
          // edits made while this write was in flight are layered back on by
          // the next write in the chain, which carries them.
          const latest = ref.current.find((t) => t.id === id);
          setTakes(ref.current.map((t) => (t.id === id ? { ...r.data.take, ratings: latest?.ratings ?? r.data.take.ratings } : t)));
          if (body.verdict !== undefined) lab.refresh();
        } else {
          setTakes(ref.current.map((t) => (t.id === id ? before : t)));
          lab.say(r.error, "error");
        }
      });
      chains.current.set(id, run);
    },
    [lab, setTakes],
  );

  return {
    takes,
    ready,
    error,
    patch,
    upsert,
    reload: () => setNonce((n) => n + 1),
  };
}
