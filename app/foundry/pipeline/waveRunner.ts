// RUNG 3 — WHEN A FRAMING LEGITIMATELY SHOWS MANY CARDS, THEY ARRIVE IN WAVES.
//
// A fit, a big zoom or the first view can want five hundred cards that are not in
// the DOM yet. Mounting all of them in one commit is one long frame and a visible
// stall; mounting a FIXED number per frame is either too slow on a fast machine
// or still too slow on a slow one. So each slice is sized by HOW LONG THE LAST
// ONE TOOK, measured frame to frame by the rAF timestamps themselves — the slice
// just committed is on screen by the next callback, so the gap between two
// callbacks is exactly what that slice cost.
//
// NEAREST THE MIDDLE FIRST, which is ./useBoardCull.ts's half of the deal: this
// file says how many may mount, that one says which. Together they mean the card
// the operator is looking at arrives in the first slice.
//
// A PLAIN FUNCTION, NOT A HOOK, and not a closure either. It takes its refs at
// CALL time because it is called from `syncView`, which runs on an animation
// frame rather than during render — and `react-hooks/refs` is right that handing
// refs to a factory during render is how a stale one gets captured.
//
// `wavingRef` is the re-entry guard, and it belongs to the caller: a wave in
// flight must not start a second one, and the view keeps changing while it runs.

import type { Live } from "./canvasTypes";
import { WAVE_BUDGET_MS, WAVE_FIRST, WAVE_MAX, WAVE_MIN } from "./tunables";
import type { WaveState } from "./useCullRect";

/** Mount what is wanted but absent, keeping `keep` (what is already on screen)
 *  in place — dropping it to re-mount it a frame later is the flicker a naive
 *  limit would cause. */
export function beginWaves(
  keep: ReadonlySet<string>,
  {
    setWave,
    liveRef,
    freshRef,
    deadRef,
    wavingRef,
  }: {
    setWave: React.Dispatch<React.SetStateAction<WaveState | null>>;
    liveRef: React.RefObject<Live | null>;
    freshRef: React.RefObject<number>;
    deadRef: React.RefObject<boolean>;
    wavingRef: React.RefObject<boolean>;
  },
) {
  wavingRef.current = true;
  let slice = WAVE_FIRST;
  let shown = WAVE_FIRST;
  setWave({ keep, from: 0, to: shown });
  const next = (t0: number) => {
    requestAnimationFrame((now) => {
      if (deadRef.current) return;
      const ms = now - t0;
      const total = freshRef.current;
      liveRef.current?.onWave?.({ slice, shown: Math.min(shown, total), of: total, ms });
      if (shown >= total) {
        wavingRef.current = false;
        setWave(null);
        return;
      }
      slice = Math.max(WAVE_MIN, Math.min(WAVE_MAX, Math.round(slice * Math.min(2, WAVE_BUDGET_MS / Math.max(ms, 1)))));
      const from = shown;
      shown += slice;
      setWave({ keep, from, to: shown });
      next(now);
    });
  };
  requestAnimationFrame((t) => next(t));
}
