"use client";

// THE NOTES THE NEXT NIGHT CARRIES - each note pinned on the map, its stance and words, where it is pinned; remove one
// here. With none, the three ways a note is pinned (right-click, the note key, a long press) and what it can sit on.
// Port of the winner's brief.js notes column.

import { unnote } from "../../acts.ts";
import type { CanvasStore } from "../../store.ts";
import { Chip, cx, Gl, Kbd, kit } from "../kit.tsx";
import d from "../desk.module.css";

export function NotesCol({ st }: { readonly st: CanvasStore }) {
  const notes = st.ui.notes;
  const can = st.view.caps.notes;
  return (
    <div className={d.col}>
      <h3>
        Notes carried <span className={d.count}>{notes.length}</span> {!can && <Chip tone="planned">planned</Chip>}
      </h3>
      {notes.length > 0 ? (
        notes.map((n) => (
          <div key={n.id} className={kit.noterow}>
            <Gl name="flag" size={13} />
            <span>
              <span className={kit.t}>{(n.stance !== "" ? n.stance + (n.text !== "" ? " · " : "") : "") + n.text}</span>
              <br />
              <span className={kit.a}>
                {n.kind} · {n.name}
              </span>
            </span>
            <button type="button" aria-label="Remove note" disabled={!can} onClick={() => void unnote(st, n.id)}>
              <Gl name="x" size={12} />
            </button>
          </div>
        ))
      ) : (
        <div className={cx(kit.inline, d.keys)}>
          <Kbd cap="right-click" />
          <Kbd mode="canvas" verb="note" />
          <Kbd cap="long-press" />
          genre · channel · audience · lot
        </div>
      )}
    </div>
  );
}
