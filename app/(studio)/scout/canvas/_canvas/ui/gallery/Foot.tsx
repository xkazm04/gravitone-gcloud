"use client";

// THE GALLERY'S FOOT - the verdict on the candidate under the cursor: keep or reject (lit when it is already so), the
// Board's reasons (1-6, toggles), a note, undo, and commit with what is uncommitted. Prev and next walk the list, or
// the frames in the frame view.

import type { RefObject } from "react";

import { REASONS } from "../../tables.ts";
import s from "../gallery.module.css";
import { cx, Gl, Kbd, kit } from "../kit.tsx";
import { cur, verdictOf, waiting, type G } from "./model.tsx";

const M = "canvas-gallery";

export type FootActs = {
  readonly onStep: (d: number) => void;
  readonly onDecide: (v: "keep" | "reject") => void;
  readonly onReason: (i: number) => void;
  readonly onNote: (text: string) => void;
  readonly onNoteDone: () => void;
  readonly onUndo: () => void;
  readonly onCommit: () => void;
};

export function Foot({ g, un, noteRef, acts }: { readonly g: G; readonly un: number; readonly noteRef: RefObject<HTMLInputElement | null>; readonly acts: FootActs }) {
  const it = cur(g);
  const can = it !== undefined && waiting(it);
  const v = it === undefined ? "" : verdictOf(it);
  return (
    <div className={s.foot} data-role="gallery-foot">
      <button type="button" className={cx(kit.btn, s.fbtn)} aria-label="Previous" onClick={() => acts.onStep(-1)}>
        <Gl name="prev" size={13} />
      </button>
      <button type="button" data-verdict="keep" className={cx(kit.btn, s.fbtn, kit.keep, v === "kept" && kit.on)} aria-pressed={v === "kept"} disabled={!can} onClick={() => acts.onDecide("keep")}>
        <Gl name="check" size={13} />
        Keep
        <Kbd mode={M} verb="keep" />
      </button>
      <button type="button" data-verdict="reject" className={cx(kit.btn, s.fbtn, kit.reject, v === "rejected" && kit.on)} aria-pressed={v === "rejected"} disabled={!can} onClick={() => acts.onDecide("reject")}>
        <Gl name="x" size={13} />
        Reject
        <Kbd mode={M} verb="reject" />
      </button>
      <div className={s.reasons} role="group" aria-label="Reasons">
        {REASONS.map((r, i) => (
          <button key={r} type="button" data-reason={i} className={cx(g.reasons.includes(r) && s.on)} aria-pressed={g.reasons.includes(r)} onClick={() => acts.onReason(i)}>
            <Kbd cap={String(i + 1)} />
            {r}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          acts.onNoteDone();
        }}
      >
        <input ref={noteRef} className={cx(kit.in, s.note)} placeholder="note" aria-label="Note on the verdict" maxLength={120} value={g.note} onChange={(e) => acts.onNote(e.target.value)} />
      </form>
      <span className={s.grow} />
      <button type="button" className={cx(kit.btn, s.fbtn)} disabled={un === 0} onClick={acts.onUndo}>
        <Gl name="undo" size={13} />
        Undo
        <Kbd mode={M} verb="undo" />
      </button>
      <button type="button" className={cx(kit.btn, s.fbtn, kit.primary)} disabled={un === 0} onClick={acts.onCommit}>
        Commit {un > 0 ? un : ""}
        <Kbd mode={M} verb="commit" />
      </button>
      <button type="button" className={cx(kit.btn, s.fbtn)} aria-label="Next" onClick={() => acts.onStep(1)}>
        <Gl name="next" size={13} />
      </button>
    </div>
  );
}
