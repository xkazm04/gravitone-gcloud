"use client";

// THE SOUND STORE, AS THE SCORE STEP SEES IT — one music listing, and the three
// writes the step makes against it: render a cue, revise one section, judge a
// take. Every decision about WHICH take a cue uses is ./takes.ts's and lives
// on the spot; this hook only talks to /api/sound/*.
//
// `enabled` is the posture: the store is this machine's disk (lib/sound/store.ts)
// and section edits need the vendor's stored-song inpainting, both of which
// `capabilities().musicSectionEdit` already answers for. Off, nothing here
// fetches, and the step keeps its session-only takes.
//
// ONE RENDER PER CUE IN FLIGHT. A double click on a money button is two bills;
// the second call joins the first one's promise instead of posting again.

import { useCallback, useEffect, useRef, useState } from "react";

import { useAnnounce } from "@/lib/announcer";
import { generateTake, listTakes, patchTake } from "@/lib/sound/client";
import type { GenerateRequest, SoundTake, Verdict } from "@/lib/sound/types";

export type StoreResult = { ok: true; take: SoundTake } | { ok: false; status: number; error: string };

export function useCueTakes(enabled: boolean) {
  /** `null` = not read (yet, or ever in this posture). Never drawn as empty. */
  const [shelf, setShelf] = useState<SoundTake[] | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const inflight = useRef(new Map<string, Promise<StoreResult>>());
  const announce = useAnnounce();

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void listTakes({ kind: "music" }).then((r) => {
      if (!live) return;
      if (r.ok) {
        setShelf(r.data.takes);
        setTrouble(null);
      } else {
        setTrouble(r.error);
        announce({ key: `sound-store-list:${r.error}`, text: r.error });
      }
    });
    return () => {
      live = false;
    };
  }, [enabled, announce]);

  const upsert = useCallback((t: SoundTake) => {
    setShelf((s) => [t, ...(s ?? []).filter((x) => x.id !== t.id)]);
  }, []);

  /** Render or revise. `key` names what may only be in flight once. */
  const generate = useCallback(
    (key: string, req: GenerateRequest): Promise<StoreResult> => {
      const running = inflight.current.get(key);
      if (running) return running;
      const p = generateTake(req)
        .then((r): StoreResult => {
          if (!r.ok) return { ok: false, status: r.status, error: r.error };
          upsert(r.data.take);
          return { ok: true, take: r.data.take };
        })
        .finally(() => inflight.current.delete(key));
      inflight.current.set(key, p);
      return p;
    },
    [upsert],
  );

  const judge = useCallback(
    async (id: string, verdict: Verdict): Promise<string | null> => {
      const r = await patchTake(id, { verdict });
      if (!r.ok) return r.error;
      upsert(r.data.take);
      return null;
    },
    [upsert],
  );

  return { enabled, shelf, trouble, generate, judge };
}

export type CueTakeStore = ReturnType<typeof useCueTakes>;
