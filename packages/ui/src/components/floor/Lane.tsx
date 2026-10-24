// One media lane of the Floor (prototype index.html `Lane()`, floor.css `.lane`, `.lane-rail`,
// `.cell`): the rail - the lane's key, its mark, its name set vertically, the focus control -
// then its three cells, Foundry, Weir and Library/Projects, which the page fills.
//
// A lane is OPEN (all four share the height), FOCUSED (it takes the height, the rail wears the
// cyan edge) or FOLDED (another lane is focused; its cells hold a one-line summary and the rail
// lies down). The page decides which and hands the summaries in: this component draws the row,
// it does not know what a run or a pile is.
//
// The key drawn on the rail is the keymap's own cap for this lane (floor `open-lane`, by
// position), never a typed digit, so a rebinding redraws the rail.

import type { ReactNode } from "react";

import { capsFor } from "../keycaps/caps.ts";
import keycap from "../keycaps/Keycaps.module.css";
import { cx } from "../cx.ts";
import { FloorGlyph } from "./FloorGlyph.tsx";
import type { FloorLane } from "./floor.ts";
import s from "./Lane.module.css";

export type LaneState = "open" | "focused" | "folded";

export type LaneProps = {
  readonly lane: FloorLane;
  readonly state: LaneState;
  /** Focus this lane, or show all lanes again when it is the focused one (⇧1-4 runs the same):
   *  a toggle, named for its lane in both states. */
  readonly onFocus: () => void;
  readonly foundry: ReactNode;
  readonly weir: ReactNode;
  readonly shelf: ReactNode;
  /** The ratified column holds nothing: it folds to its heading row. */
  readonly shelfEmpty?: boolean;
};

export function Lane({ lane, state, onFocus, foundry, weir, shelf, shelfEmpty = false }: LaneProps) {
  const cap = capsFor("floor", "open-lane")[lane.n - 1];
  return (
    <section className={cx(s.lane, state === "focused" && s.focused, state === "folded" && s.folded)} data-component="Lane" data-lane={lane.id} data-state={state} aria-label={`${lane.name} lane`}>
      <div className={s.rail}>
        {cap !== undefined && <kbd className={cx(keycap.cap, s.key)}>{cap}</kbd>}
        <FloorGlyph name={lane.id} className={s.mark} />
        <span className={s.name}>{lane.name}</span>
        {/* One name in both states: aria-pressed says whether it is on, so a reader and a voice
            command meet the same control (a name that rewrote itself read as a second one). */}
        <button type="button" className={s.focus} onClick={onFocus} aria-pressed={state === "focused"} aria-label={`focus ${lane.name} lane`}>
          <FloorGlyph name={state === "focused" ? "collapse" : "expand"} className={s.focusMark} />
        </button>
      </div>
      <div className={cx(s.cell, s.foundry)} data-cell="foundry">
        {foundry}
      </div>
      <div className={cx(s.cell, s.weir)} data-cell="weir">
        {weir}
      </div>
      <div className={cx(s.cell, s.shelf, shelfEmpty && s.shelfEmpty)} data-cell="shelf">
        {shelf}
      </div>
    </section>
  );
}

/** A folded lane's cell: one line of what it holds (prototype `.summary`). */
export function LaneSummary({ children }: { readonly children: ReactNode }) {
  return <div className={s.summary}>{children}</div>;
}
