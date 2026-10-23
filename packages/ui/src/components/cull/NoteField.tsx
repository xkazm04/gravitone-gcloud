"use client";

// A NOTE ON ONE DECISION, typed in place (spark scout-decision-graph: "an optional note to the reason so I
// can pass comment"). E on the cull opens it on the row under the cursor; ⏎ saves the note with the row's
// verdict (the same verdict write, `note` added), Esc leaves it unsaved - both are the keymap's `field:
// "note"` rows, so the field holds no key handler of its own. The form's submit is the same save, for a
// press the keymap does not see. The bound is the source's (`noteMax`): typing past it is cut, not refused.
import { useEffect, useRef } from "react";

import { Field } from "../field/Field.tsx";
import { Keycaps } from "../keycaps/Keycaps.tsx";
import s from "./Verdict.module.css";

export type NoteFieldProps = {
  /** What the note is on, for the field's accessible name. */
  readonly label: string;
  readonly value: string;
  readonly max: number;
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
};

export function NoteField({ label, value, max, onChange, onSave }: NoteFieldProps) {
  const box = useRef<HTMLFormElement | null>(null);
  // Focus lands in the field as it opens: E then typing is one gesture.
  useEffect(() => {
    box.current?.querySelector("input")?.focus();
  }, []);
  return (
    <form
      ref={box}
      className={s.noteField}
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <Field label={`note on ${label}`} value={value} onChange={(v) => onChange(v.slice(0, max))} keyfield="note" />
      <span className={s.noteCount} aria-hidden="true">
        {value.length}/{max}
      </span>
      <Keycaps mode="board.cull" field="note" label="note keys" />
    </form>
  );
}

/** A saved note, under the decision it rides: the operator's words, verbatim. */
export function NoteText({ text }: { readonly text: string }) {
  return <p className={s.ideaNote}>{text}</p>;
}
