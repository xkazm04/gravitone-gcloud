"use client";

// KEYBOARD AUDITION (prototype v1, ask 4): 1-5 plays take n against the section, Space plays or pauses what is loaded,
// S swaps between the section and the take at matched level, Left and Right move 5 s. The rows are a keymap table
// (@gt/ui/keymap/keymap.ts), resolved and drawn from the same rows, so the Keycaps legend cannot disagree with the keys.
//
// PROTOTYPE SEAM: the app's keymap is one table (packages/ui/src/keymap/bindings.ts) behind one window listener
// (dispatch.ts), and both are shared files this variant may not edit. So the table is compiled here and a press is
// resolved by the same `resolve` the dispatcher uses, from a React onKeyDown on the console: the keys answer while
// focus is inside the desk. Consolidating moves AUDITION_ROWS into bindings.ts as mode `audio.cover` and this hook
// onto `useKeys`, which then answers wherever the page has focus.
import type { KeyboardEvent } from "react";

import { chordsOf } from "@gt/ui/keymap/chord";
import { compile, resolve, type Binding } from "@gt/ui/keymap/keymap";
import { targetInfo } from "@gt/ui/keymap/target";

import { COVER_TAKE_COUNT } from "@gt/domain/cover";

import { SECTION_KEY, type AB } from "../useAB.ts";
import type { CoverFlow } from "../useCover.ts";
import { fiveTakes, takeUrl } from "../words.ts";

export const AUDITION_MODE = "audio.cover";
const STEP_S = 5;

const AUDITION_ROWS: readonly Binding[] = [
  { mode: AUDITION_MODE, keys: ["1", "2", "3", "4", "5"], verb: "take", does: "take" },
  { mode: AUDITION_MODE, keys: ["Space"], verb: "play", does: "play" },
  { mode: AUDITION_MODE, keys: ["S"], verb: "swap", does: "section / take", when: "take" },
  { mode: AUDITION_MODE, keys: ["←"], verb: "back", does: "5 s", repeat: true },
  { mode: AUDITION_MODE, keys: ["→"], verb: "on", does: "5 s", repeat: true },
];

export const AUDITION_MAP = compile(AUDITION_ROWS);

/** The facts the table's `when` rows read: `take` while a take (not the section) is loaded. */
export const auditionFacts = (ab: AB): ReadonlySet<string> => new Set(ab.at !== null && ab.at !== SECTION_KEY ? ["take"] : []);

/** The take urls by their key, 1..5; a take not done has none. */
function urls(flow: CoverFlow): readonly (string | undefined)[] {
  return fiveTakes(flow.card.record.takes, COVER_TAKE_COUNT).map((t) => (t.state === "done" ? takeUrl(flow.card, t) : undefined));
}

export function useAudition(flow: CoverFlow, ab: AB): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;
    const el = e.target instanceof Element ? e.target : null;
    const press = { chords: chordsOf(e), repeat: e.repeat, target: targetInfo(el) };
    const hit = resolve(AUDITION_MAP, press, AUDITION_MODE, auditionFacts(ab));
    if (hit === null) return;
    const at = ab.at;
    const url = at === null || at === SECTION_KEY ? null : at;
    let done = true;
    switch (hit.binding.verb) {
      case "take": {
        const u = urls(flow)[hit.index];
        if (u === undefined) done = false;
        else ab.toggle(u, u);
        break;
      }
      case "play":
        if (at === null) done = false;
        else ab.toggle(at, url);
        break;
      case "swap":
        if (url === null) done = false;
        else ab.hear(url, url, ab.side === "a" ? "b" : "a");
        break;
      case "back":
      case "on":
        if (at === null) done = false;
        else ab.seek(at, url, ab.clock + (hit.binding.verb === "on" ? STEP_S : -STEP_S));
        break;
      default:
        done = false;
    }
    if (done) e.preventDefault();
  };
}
