"use client";

// The splits sheet: who earns what share, with the live sum. A sheet that does not reach 100%
// blocks; an empty sheet is no sheet.
import type { Dispatch } from "react";

import type { Release, Split } from "@gt/domain/release";
import { PROBLEM_TEXT, type ReleaseProblem } from "@gt/domain/release.problems";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";

import type { DraftEvent } from "../../draft.ts";
import { Mini } from "./Cell.tsx";
import { worst } from "./fmt.ts";
import r from "./rail.module.css";

export type SplitsProps = {
  readonly release: Release;
  readonly problems: readonly ReleaseProblem[];
  readonly dispatch: Dispatch<DraftEvent>;
};

const share = (v: string, was: number): number => {
  if (v.trim() === "") return 0;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : was;
};

export function Splits({ release, problems, dispatch }: SplitsProps) {
  const sp = release.splits;
  const sum = Math.round(sp.reduce((n, x) => n + x.share, 0) * 100) / 100;
  const set = (splits: readonly Split[]) => dispatch({ type: "splits", id: release.id, splits });
  const edit = (i: number, f: Partial<Split>) => set(sp.map((x, j) => (j === i ? { ...x, ...f } : x)));
  const mark = worst(problems);
  return (
    <div id="desk-splits" tabIndex={-1} className={r.splits} data-mark={mark} role="group" aria-label="splits">
      <div className={r.splitsHead}>
        <CapsHeading text="splits" tally={{ value: sp.length }} level={4} />
        <Chip label="sum" value={`${sum}%`} tone={sp.length === 0 ? "neutral" : mark === undefined ? "emerald" : "rose"} />
      </div>
      {sp.length > 0 && (
        <ul className={r.splitRows}>
          {sp.map((x, i) => (
            <li key={i} className={r.splitRow}>
              <Field label={`split ${i + 1} name`} value={x.name} onChange={(v) => edit(i, { name: v })} />
              <span className={r.splitShare}>
                <Field label={`split ${i + 1} share, percent`} value={String(x.share)} maxLength={6} onChange={(v) => edit(i, { share: share(v, x.share) })} />
                <span aria-hidden="true">%</span>
              </span>
              <Mini glyph="x" name={`remove split ${x.name || i + 1}`} onPress={() => set(sp.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
      )}
      {problems.map((p) => (
        <span key={p.code} className={r.inlineRow} data-sev={p.severity}>
          {PROBLEM_TEXT[p.code]}
        </span>
      ))}
      <Button label="Add split" size="sm" onPress={() => set([...sp, { name: "", share: sp.length === 0 ? 100 : Math.max(0, 100 - sum) }])} />
    </div>
  );
}
