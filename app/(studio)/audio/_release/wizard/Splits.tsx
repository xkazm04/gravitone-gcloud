"use client";

// The splits sheet: who earns what share, summed live. An empty sheet is no sheet (nothing to add
// up); a sheet that is not 100% blocks.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import type { Release, Split } from "@gt/domain/release";
import type { ReleaseProblem } from "@gt/domain/release.problems";

import type { DraftEvent } from "../draft.ts";
import { Problems } from "./Problems.tsx";
import { problemsOf } from "./steps.ts";
import s from "./extras.module.css";

const shareOf = (v: string): number => {
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
};

/** Equal shares to two decimals, the rounding left on the last row so the sheet sums to exactly 100. */
function even(splits: readonly Split[]): Split[] {
  const n = splits.length;
  if (n === 0) return [];
  const each = Math.floor((100 / n) * 100) / 100;
  return splits.map((x, i) => ({ ...x, share: i === n - 1 ? Math.round((100 - each * (n - 1)) * 100) / 100 : each }));
}

export function Splits({ release: r, problems, dispatch }: { readonly release: Release; readonly problems: readonly ReleaseProblem[]; readonly dispatch: (e: DraftEvent) => void }) {
  const set = (splits: readonly Split[]) => dispatch({ type: "splits", id: r.id, splits });
  const sum = Math.round(r.splits.reduce((a, x) => a + x.share, 0) * 100) / 100;
  const writers = [...new Set(r.tracks.flatMap((t) => t.songwriters.map((w) => w.trim()).filter((w) => w !== "")))];
  return (
    <section className={s.splits} aria-label="splits sheet">
      <CapsHeading text="Splits" variant="section" />
      {r.splits.length > 0 && (
        <ul className={s.splitRows}>
          {r.splits.map((x, i) => (
            <li key={i} className={s.splitRow}>
              <Field label={`split ${i + 1} name`} value={x.name} onChange={(v) => set(r.splits.map((y, j) => (j === i ? { ...y, name: v } : y)))} />
              <span className={s.share}>
                <Field label={`split ${i + 1} share percent`} value={String(x.share)} maxLength={6} onChange={(v) => set(r.splits.map((y, j) => (j === i ? { ...y, share: shareOf(v) } : y)))} />
                <span className={s.pct} aria-hidden="true">
                  %
                </span>
              </span>
              <span className={s.bar} aria-hidden="true">
                <span style={{ width: `${Math.min(100, x.share)}%` }} />
              </span>
              <button type="button" className={s.iconBtn} aria-label={`remove split ${x.name.trim() === "" ? i + 1 : x.name}`} onClick={() => set(r.splits.filter((_, j) => j !== i))}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={s.sumRow}>
        <span className={s.sum} data-ok={r.splits.length === 0 || Math.abs(sum - 100) < 0.001 ? "" : undefined} aria-live="polite">
          sum <b>{sum}%</b>
        </span>
        <Button label="Add row" size="sm" onPress={() => set([...r.splits, { name: "", share: 0 }])} />
        {r.splits.length > 1 && <Button label="Even split" size="sm" onPress={() => set(even(r.splits))} />}
        {r.splits.length === 0 && writers.length > 0 && <Button label="From songwriters" size="sm" tally={{ value: writers.length }} onPress={() => set(even(writers.map((name) => ({ name, share: 0 }))))} />}
      </div>
      <Problems problems={problemsOf(problems, "extras")} label="splits problems" />
    </section>
  );
}
