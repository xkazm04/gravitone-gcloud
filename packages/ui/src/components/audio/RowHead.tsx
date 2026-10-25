"use client";

// A ROW'S HEAD AND THE ROWS' FOOT on the Arrange board (v1 Board.tsx RowHeader + GroupBar): the
// row's name with its edits - rename in place, up, down, delete while empty - an orphan's adopt,
// and under the board the new-row field with the rows worth creating, each with the cards it
// would collect. The edits are the island's to send (one store transaction each).
import { useState } from "react";

import { FIELD_ATTR } from "../../keymap/target.ts";
import { Chip } from "../chip/Chip.tsx";
import { rowWord, type Row } from "./arrange.ts";
import type { GroupOp, Suggestion } from "./arrangeGroups.ts";
import s from "./Arrange.module.css";

export const ROW_FIELD = "row-name";

function NameForm({ initial, label, placeholder, onDone }: { readonly initial: string; readonly label: string; readonly placeholder?: string; readonly onDone: (name: string | null) => void }) {
  const [v, setV] = useState(initial);
  return (
    <form
      className={s.nameForm}
      onSubmit={(e) => {
        e.preventDefault();
        onDone(v.trim() === "" ? null : v.trim());
      }}
    >
      <input className={s.nameField} value={v} aria-label={label} placeholder={placeholder} maxLength={80} onChange={(e) => setV(e.currentTarget.value)} {...{ [FIELD_ATTR]: ROW_FIELD }} />
    </form>
  );
}

export type RowHeadProps = {
  readonly row: Row;
  /** Cards in the row: a row that holds any is not deleted. */
  readonly held: number;
  readonly first: boolean;
  readonly last: boolean;
  readonly onEdit: (op: GroupOp) => void;
};

/** A press while a row edit is in flight is the island's to refuse (one edit at a time). */
export function RowHead({ row, held, first, last, onEdit }: RowHeadProps) {
  const [renaming, setRenaming] = useState(false);
  const name = row.name;
  if (name === null) return <span className={s.rowName}>{rowWord(null)}</span>;
  if (renaming)
    return (
      <NameForm
        initial={name}
        label={`rename ${name}`}
        onDone={(to) => {
          setRenaming(false);
          if (to !== null && to !== name) onEdit({ op: "rename", from: name, to });
        }}
      />
    );
  return (
    <div className={s.rowHeadIn}>
      <span className={s.rowName}>{name}</span>
      {row.orphan ? (
        <Chip label="adopt" casing="lower" tone="amber" ghost name={`adopt ${name} as a row`} onPress={() => onEdit({ op: row.into === null ? "add" : "adopt", name })} />
      ) : (
        <span className={s.rowActs}>
          <Chip label="rename" casing="lower" name={`rename ${name}`} onPress={() => setRenaming(true)} />
          {!first && <Chip label="↑" casing="lower" name={`move ${name} up`} onPress={() => onEdit({ op: "move", name, by: -1 })} />}
          {!last && <Chip label="↓" casing="lower" name={`move ${name} down`} onPress={() => onEdit({ op: "move", name, by: 1 })} />}
          {held === 0 && <Chip label="delete" casing="lower" tone="rose" name={`delete ${name}`} onPress={() => onEdit({ op: "delete", name })} />}
        </span>
      )}
    </div>
  );
}

export function RowFoot({ suggestions, busy, onEdit }: { readonly suggestions: readonly Suggestion[]; readonly busy: boolean; readonly onEdit: (op: GroupOp) => void }) {
  const [key, setKey] = useState(0);
  return (
    <div className={s.rowFoot}>
      <NameForm
        key={key}
        initial=""
        label="new row"
        placeholder="+ row"
        onDone={(name) => {
          setKey((k) => k + 1);
          if (name !== null && !busy) onEdit({ op: "add", name });
        }}
      />
      {suggestions.map((g) => (
        <Chip key={g.name} label={`+ ${g.name}`} value={g.n} casing="lower" ghost name={`make ${g.name} a row, filing ${g.n}`} onPress={() => onEdit({ op: "adopt", name: g.name })} />
      ))}
    </div>
  );
}
