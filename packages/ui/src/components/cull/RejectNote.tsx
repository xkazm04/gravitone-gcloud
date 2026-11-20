"use client";

// A REJECT'S NOTE, always at hand (operator, 2026-11-20: "for rejection we should always [have the] option to add [a]
// note in addition to any reason to clarify better"). Drawn under a reject's reasons wherever the source keeps a note
// (`noteMax`), with no key to open it first: typed in place, written on blur or ⏎ through the same verdict write E's
// field makes (useRunDesk `writeNote`, cull.ts `noteAct`); an emptied field clears the note. The reasons stay the
// verdict's vocabulary; the note is the operator's own words beside them, verbatim into the night's record and the
// next night's taste brief.
//
// The field is unnamed to the keymap on purpose: a digit typed into it is text, not a verdict key (keymap/target.ts).
import { useState } from "react";

import { Field } from "../field/Field.tsx";
import s from "./Verdict.module.css";

export type RejectNoteProps = {
  /** What is rejected, for the field's accessible name. */
  readonly label: string;
  /** The note the decision holds now. */
  readonly text: string | undefined;
  readonly max: number;
  readonly onSave: (text: string) => void;
};

export function RejectNote({ label, text, max, onSave }: RejectNoteProps) {
  const held = text ?? "";
  const [draft, setDraft] = useState(held);
  // A note written elsewhere (E's field, an undo) is what the field shows next.
  const [was, setWas] = useState(held);
  if (was !== held) {
    setWas(held);
    setDraft(held);
  }
  const save = () => {
    if (draft.trim() !== held) onSave(draft);
  };
  return (
    <form
      className={s.rejectNote}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label={`note on rejecting ${label}`} value={draft} placeholder="note" maxLength={max} onChange={(v) => setDraft(v.slice(0, max))} onBlur={save} />
    </form>
  );
}
