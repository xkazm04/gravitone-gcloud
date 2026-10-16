"use client";

// A FIELD THAT COMMITS ON BLUR (or the part frame's ⏎ `commit-field`): one op per edit, never one
// per keystroke (v1's SpotList debounced its title and note by 400 ms). The value the server
// answers replaces the local copy (a conflict redraws it).
import { useState } from "react";

import { FIELD_ATTR } from "@gt/ui/keymap/target";

import s from "./Cut.module.css";

export function ScoreField({
  label,
  value,
  commit,
  area = false,
  narrow = false,
  type = "text",
}: {
  readonly label: string;
  readonly value: string;
  readonly commit: (v: string) => void;
  readonly area?: boolean;
  readonly narrow?: boolean;
  readonly type?: "text" | "number";
}) {
  const [v, setV] = useState(value);
  const [base, setBase] = useState(value);
  if (base !== value) {
    setBase(value);
    setV(value);
  }
  const done = (): void => {
    if (v !== value) commit(v);
  };
  return (
    <label className={s.field}>
      {label}
      {area ? (
        <textarea className={s.area} value={v} onChange={(e) => setV(e.currentTarget.value)} onBlur={done} {...{ [FIELD_ATTR]: "part-text" }} />
      ) : (
        <input className={narrow ? `${s.input} ${s.narrow}` : s.input} type={type} value={v} onChange={(e) => setV(e.currentTarget.value)} onBlur={done} {...{ [FIELD_ATTR]: "part-field" }} />
      )}
    </label>
  );
}