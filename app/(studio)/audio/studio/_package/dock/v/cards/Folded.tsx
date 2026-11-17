"use client";

// THE STACK'S FOLDED STEPS (kit candidates `FoldedRow`, `WaitingEdge`): a step before the current one folds to one
// line - its check or its counts, its name, the values it settled as chips; a step after it waits below as a thin
// edge with its number, name and counts. Both are doors back to their step.
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";
import type { Release } from "@gt/domain/release";

import { STEP_LABEL } from "../../../../../_release/wizard/steps.ts";
import { summaryOf, type StepMark } from "./model.ts";
import s from "./stack.module.css";

function Counts({ m }: { readonly m: StepMark }) {
  return (
    <span className={s.marks} aria-hidden="true">
      {m.block > 0 && <b data-tone="block">{m.block}</b>}
      {m.warn > 0 && <b data-tone="warn">{m.warn}</b>}
      {m.suggested > 0 && <b data-tone="agent">{m.suggested}</b>}
    </span>
  );
}

const spokenCounts = (m: StepMark): string =>
  [m.block > 0 ? `${m.block} block` : "", m.warn > 0 ? `${m.warn} warn` : "", m.suggested > 0 ? `${m.suggested} suggested` : ""].filter((x) => x !== "").join(", ") || "clean";

export function FoldedRow({ m, n, release, onOpen }: { readonly m: StepMark; readonly n: number; readonly release: Release; readonly onOpen: () => void }) {
  const summary = summaryOf(m.step, release);
  const clean = m.block + m.warn === 0;
  return (
    <button type="button" className={s.row} onClick={onOpen} aria-label={`${n} ${STEP_LABEL[m.step]}, ${spokenCounts(m)}: ${summary.join(", ")}. Open`}>
      <span className={s.rowMark} data-mark={m.mark} aria-hidden="true">
        {clean ? "✓" : m.block > 0 ? m.block : m.warn}
      </span>
      <span className={s.rowName} aria-hidden="true">
        {STEP_LABEL[m.step]}
      </span>
      <span className={s.rowSummary} aria-hidden="true">
        {summary.map((x, i) => (
          <Chip key={`${x}:${i}`} label={x} casing="lower" />
        ))}
      </span>
      {m.suggested > 0 && <Counts m={{ ...m, block: 0, warn: 0 }} />}
      <Glyph name="up" className={s.rowGo} />
    </button>
  );
}

export function WaitingEdge({ m, n, onOpen }: { readonly m: StepMark; readonly n: number; readonly onOpen: () => void }) {
  return (
    <button type="button" className={s.edge} onClick={onOpen} aria-label={`${n} ${STEP_LABEL[m.step]}, ${spokenCounts(m)}. Open`}>
      <span className={s.edgeNo} aria-hidden="true">
        {n}
      </span>
      <span className={s.edgeName} aria-hidden="true">
        {STEP_LABEL[m.step]}
      </span>
      <Counts m={m} />
    </button>
  );
}
