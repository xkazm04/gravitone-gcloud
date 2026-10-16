"use client";

// THE FOUR SLOTS - technique, subject, palette, finish: the words a style is written in, plain
// language compiled to model syntax only at generation time (visual-style-locking: "the style
// block is an artifact, not a string"). v1 split them across two panes (SpecEditor kept finish,
// the Playground took technique and subject "next to the button that spends money"); here the
// three text slots sit together above the sheet they are proven on, and the palette - read, never
// typed - is drawn with its roles.
//
// One edit is one op: a slot commits when it is left (blur, or Esc through the keymap), and only
// when its words changed, so a tab through the form writes nothing. A LOCKED style draws its slots
// as prose: the block is frozen (v1 ratchetBlocker: "projects build on it - duplicate it into a
// new draft to change the block"), and the server refuses a set-block on it whatever this draws.
import { useState } from "react";

import type { StyleView } from "@gt/domain/styleView";

import { FIELD_ATTR } from "../../keymap/target.ts";
import s from "./Style.module.css";

type Block = NonNullable<StyleView["block"]>;
type TextSlot = "technique" | "subject" | "finish";
const SLOTS: readonly TextSlot[] = ["technique", "subject", "finish"];

export type StyleSlotsProps = {
  readonly block: Block;
  readonly locked: boolean;
  readonly busy: boolean;
  readonly onCommit: (block: Block) => void;
};

export function StyleSlots({ block, locked, busy, onCommit }: StyleSlotsProps) {
  return (
    <div className={s.slots} data-component="StyleSlots">
      {SLOTS.map((k) => (
        <Slot key={k} name={k} value={block[k]} locked={locked} busy={busy} onCommit={(v) => onCommit({ ...block, [k]: v })} />
      ))}
    </div>
  );
}

function Slot({ name, value, locked, busy, onCommit }: { readonly name: TextSlot; readonly value: string; readonly locked: boolean; readonly busy: boolean; readonly onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // The server's words moved (an op answered, another tab wrote): they replace the draft.
    setSeen(value);
    setDraft(value);
  }
  return (
    <label className={s.slot}>
      <span className={s.slotName}>{name}</span>
      {locked ? (
        <span className={s.prose}>{value === "" ? "—" : value}</span>
      ) : (
        <textarea
          className={s.area}
          value={draft}
          rows={2}
          readOnly={busy}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={() => {
            if (draft.trim() !== value.trim()) onCommit(draft.trim());
          }}
          {...{ [FIELD_ATTR]: "style-slot" }}
        />
      )}
    </label>
  );
}
