"use client";

// THE LIBRARY LABEL, ASKED FOR AT THE DOOR (v1 app/playground/arrange/LabelPrompt.tsx). A
// finalized take is what agents select by label (`pipeline/sound.mts finalized`) and the store
// refuses a finalize without one, so the board asks BEFORE it writes, prefilled from the row's
// group and the take's strongest terms (./arrange.ts `suggestLabel`). Enter finalizes; Escape
// is the keymap's `leave-field`, which the island answers by closing this.
//
// An empty label is not sent: the refusal is the store's sentence, drawn here, where the
// operator is typing (drag-drop: rejection appears where the user is looking).
import { useEffect, useId, useRef, useState } from "react";

import { FIELD_ATTR } from "../../keymap/target.ts";
import { Button } from "../button/Button.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { REFUSAL_WORDS } from "./arrange.ts";
import s from "./Arrange.module.css";

export const LABEL_FIELD = "label";

export type LabelPromptProps = {
  /** What is being finalized: `Glass Harbor → finalized`. */
  readonly title: string;
  readonly initial: string;
  readonly busy: boolean;
  readonly onConfirm: (label: string) => void;
  readonly onCancel: () => void;
};

export function LabelPrompt({ title, initial, busy, onConfirm, onCancel }: LabelPromptProps) {
  const [v, setV] = useState(initial);
  const [refused, setRefused] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const id = useId();
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <form
      className={s.label}
      aria-labelledby={id}
      data-nodrag
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        if (v.trim() === "") setRefused(true);
        else onConfirm(v.trim());
      }}
    >
      <span id={id} className={s.labelHead}>
        label · {title}
      </span>
      <input
        ref={input}
        className={s.labelField}
        value={v}
        maxLength={120}
        aria-label="library label"
        onChange={(e) => {
          setV(e.currentTarget.value);
          setRefused(false);
        }}
        {...{ [FIELD_ATTR]: LABEL_FIELD }}
      />
      {refused && <ErrorLine message={REFUSAL_WORDS["needs-label"]} live />}
      <div className={s.labelActs}>
        <Button label="Cancel" size="sm" onPress={onCancel} />
        <Button label="Finalize" size="sm" tone="emerald" submit disabled={busy} />
      </div>
    </form>
  );
}
