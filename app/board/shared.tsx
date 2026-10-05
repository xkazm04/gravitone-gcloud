"use client";

// What the three variants share beyond ./parts.tsx: their props, the source
// picker V2 and V3 draw (V1 has the full rail), and the default key bindings
// every variant starts from and overrides where its navigation differs.

import { SOURCE_LABEL } from "@/lib/board/registry";
import { SOURCE_ORDER } from "@/lib/board/source";
import type { BoardSourceId } from "@/lib/board/types";

import { SourceMark } from "./parts";
import type { BoardApi } from "./useBoard";
import type { BoardKeyHandlers } from "./useBoardKeys";

export interface VariantProps {
  api: BoardApi;
  openLoupe: () => void;
  loupeOpen: boolean;
  closeLoupe: () => void;
}

/** A, X, U on the selected item; J/K through the queue; Enter, Esc, Z. */
export function defaultHandlers({ api, openLoupe, closeLoupe }: VariantProps): BoardKeyHandlers {
  const sel = api.selected;
  return {
    approve: () => sel && void api.decide(sel, "approve"),
    reject: () => sel && void api.decide(sel, "reject"),
    clear: () => sel && void api.decide(sel, null),
    next: () => api.move(1),
    prev: () => api.move(-1),
    loupe: () => sel && openLoupe(),
    close: closeLoupe,
    undo: () => void api.undo(),
  };
}

/** A compact row of sources with their state and pending count — V2 and V3's
 *  source picker (V1 has the full rail). */
export function SourceChips({ api }: { api: BoardApi }) {
  const pick = (src: BoardSourceId | null) => api.setQuery({ src, i: null });
  return (
    <div role="group" aria-label="Sources" className="flex flex-wrap items-center gap-1.5">
      <ChipButton on={api.query.src === null} onClick={() => pick(null)} label="All" />
      {SOURCE_ORDER.map((id) => {
        const c = api.countsOf(id);
        return (
          <ChipButton
            key={id}
            on={api.query.src === id}
            onClick={() => pick(id)}
            label={SOURCE_LABEL[id]}
            mark={<SourceMark state={api.states[id]} />}
            count={c?.pending ?? null}
          />
        );
      })}
    </div>
  );
}

function ChipButton({ on, onClick, label, mark, count }: { on: boolean; onClick: () => void; label: string; mark?: React.ReactNode; count?: number | null }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 font-jetbrains text-label transition-colors ${
        on ? "border-[var(--al-gold)] text-[var(--al-white)]" : "border-[var(--al-line)] text-[var(--al-vellum)] hover:text-[var(--al-white)]"
      }`}
    >
      {mark}
      {label}
      {count !== undefined && <span className="k-num">{count === null ? "—" : count}</span>}
    </button>
  );
}
