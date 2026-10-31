"use client";

// The round play mark of one audition: idle (a triangle), waiting for its first render (dashed,
// pulsing - a render is seconds, and a press that looks dead is pressed again), sounding (filled,
// two bars). Its accessible name is the instrument's and the verb's, never a bare "play".
import { cx } from "../cx.ts";
import { PlayMark } from "./AudioPreview.tsx";
import type { EarState } from "./useEar.ts";
import s from "./Ear.module.css";

export function EarButton({ state, name, onPress, big = false }: { readonly state: EarState; readonly name: string; readonly onPress: () => void; readonly big?: boolean }) {
  const verb = state === "idle" ? "play" : "stop";
  return (
    <button type="button" className={cx(s.ear, big && s.earBig)} data-state={state} aria-label={`${verb} ${name}`} aria-busy={state === "loading"} onClick={onPress}>
      <PlayMark on={state === "playing"} className={s.mark} />
    </button>
  );
}
