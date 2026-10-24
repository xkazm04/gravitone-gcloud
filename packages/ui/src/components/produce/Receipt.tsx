// THE RECEIPT - what a launch will do, read before it is done (COMMON decision 3; NEW: the
// prototype launched on the press, projects.js `launch`). Per line: the resource lane, the
// provider and model the router chose, units, time, cost or why it has none, and where each
// figure came from; then the totals, where the first job queues and when the whole lands, an
// optional dollar ceiling, and whether the job runs dry or live. ⏎ confirms; Esc returns (the
// layer router's, LevelSheet draws its cap).
//
// A SHAPE, NOT A SPEECH (CLAUDE.md "the app does not explain itself"): nothing here says what a
// receipt is. A stale confirm comes back as the fresh receipt with every cell that moved marked
// - the mark is the message (hitl-approval/resume-after-decision: what runs on approval is what
// was shown, and when it no longer is, the operator sees the difference before saying yes again).
//
// A ceiling is a stop point, not a gate: a receipt whose worst case crosses it still confirms,
// and carries `may stop at ceiling` beside the field (the job stops before the unit that would
// cross it). Only a ceiling that is not a dollar amount disarms the confirm.
import type { ReactNode } from "react";

import type { Receipt as ReceiptValue, ReceiptLine } from "@gt/domain/produce";

import { SrOnly } from "../a11y/SrOnly.tsx";
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { FIELD_ATTR } from "../../keymap/target.ts";
import { Keycap } from "../keycaps/Keycaps.tsx";
import { LaneChip } from "../runs/LaneChip.tsx";
import { SourceTag } from "../source/SourceTag.tsx";
import { changeCount, costWords, fmtDur, fmtUsd, NO_CHANGES, mayStopAtCeiling, parseCeiling, totalPriced, when, type LineField, type ReceiptChanges, type TotalField } from "./produce.ts";
import { Unpriced } from "./Unpriced.tsx";
import s from "./Receipt.module.css";

/** The ceiling field's keyfield: the receipt's ⏎ row fires inside it too. */
export const CEILING_FIELD = "ceiling";

export type ReceiptProps = {
  readonly receipt: ReceiptValue;
  /** Set when this receipt replaced one the operator had read (a stale confirm). */
  readonly changes?: ReceiptChanges;
  readonly ceiling: string;
  readonly onCeiling: (text: string) => void;
  readonly onConfirm: () => void;
  readonly busy: boolean;
  /** The server refused the confirm (budget, unavailable...), verbatim. */
  readonly error?: string;
  readonly nowMs: number;
};

function Cell({ field, marks, className, children }: { readonly field: LineField; readonly marks: ReadonlySet<LineField> | undefined; readonly className?: string | undefined; readonly children: ReactNode }) {
  const moved = marks?.has(field) === true;
  return (
    <td className={cx(className, moved && s.moved)}>
      {children}
      {moved && <SrOnly text=" (changed)" />}
    </td>
  );
}

function Line({ l, marks, added, nowMs }: { readonly l: ReceiptLine; readonly marks: ReadonlySet<LineField> | undefined; readonly added: boolean; readonly nowMs: number }) {
  return (
    <tr className={cx(added && s.added)} data-line={l.key}>
      <td className={s.label}>
        {l.label}
        {added && <Chip label="new" tone="amber" casing="lower" />}
      </td>
      <Cell field="lane" marks={marks}>
        <LaneChip lane={l.lane} />
      </Cell>
      <Cell field="model" marks={marks} className={s.model}>
        <span className={s.prov}>{l.provider}</span> · {l.model}
      </Cell>
      <Cell field="units" marks={marks} className={s.num}>
        {l.units}
      </Cell>
      <Cell field="seconds" marks={marks} className={s.num}>
        {fmtDur(l.seconds)}
      </Cell>
      <Cell field="cost" marks={marks} className={s.num}>
        {l.usd === null && l.usdRange === undefined ? <Unpriced reason={l.unpricedReason} /> : costWords(l)}
      </Cell>
      <Cell field="src" marks={marks}>
        <SourceTag kind={l.src} />
      </Cell>
      <Cell field="queuePos" marks={marks} className={s.num}>
        #{l.queuePos}
      </Cell>
      <Cell field="start" marks={marks} className={s.when}>
        {when(l.start, nowMs)}
      </Cell>
    </tr>
  );
}

export function Receipt({ receipt: r, changes = NO_CHANGES, ceiling, onCeiling, onConfirm, busy, error, nowMs }: ReceiptProps) {
  const parsed = parseCeiling(ceiling);
  const over = parsed.ok && mayStopAtCeiling(r, parsed.value);
  const blocked = !parsed.ok;
  const worst = r.totals.usdRange?.[1] ?? r.totals.usd;
  const moved = changeCount(changes);
  const t = r.totals;
  const mark = (f: TotalField): string | undefined => (changes.totals.has(f) ? s.moved : undefined);
  // The totals' marks speak to every reader, as the lines' cells do (Cell): the ring is for the eye.
  const said = (f: TotalField): ReactNode => changes.totals.has(f) && <SrOnly text=" (changed)" />;
  return (
    <section className={s.receipt} data-component="Receipt" data-mode={r.mode} aria-label={`receipt, ${r.lines.length} lines, ${r.mode}`}>
      <div className={s.head}>
        <span className={mark("mode")}>
          <Chip label={r.mode} tone={r.mode === "live" ? "rose" : "cyan"} dot name={`mode ${r.mode}`} />
          {said("mode")}
        </span>
        {moved > 0 && <Chip label="changed" value={moved} tone="amber" name={`${moved} changes since you read it`} />}
        <span className={s.totals}>
          <span className={mark("seconds")}>
            <Chip label="work" value={fmtDur(t.seconds)} />
            {said("seconds")}
          </span>
          {/* One mark over the priced total and the unpriced count: `cost` moves when either does. */}
          <span className={cx(s.group, mark("cost"))}>
            {totalPriced(r) && <Chip label="cost" value={t.usdRange !== undefined ? costWords(t) : fmtUsd(t.usd)} />}
            {t.unpriced > 0 && <Chip label="unpriced" value={t.unpriced} tone="violet" />}
            {said("cost")}
          </span>
          <span className={mark("src")}>
            <SourceTag kind={t.src} />
            {said("src")}
          </span>
        </span>
      </div>
      <div className={s.scroll}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>part</th>
              <th>resource</th>
              <th>model</th>
              <th className={s.num}>units</th>
              <th className={s.num}>time</th>
              <th className={s.num}>cost</th>
              <th>src</th>
              <th className={s.num}>queue</th>
              <th>start</th>
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l) => (
              <Line key={l.key} l={l} marks={changes.lines.get(l.key)} added={changes.added.includes(l.key)} nowMs={nowMs} />
            ))}
          </tbody>
        </table>
        {changes.removed.length > 0 && (
          <div className={s.removed}>
            {changes.removed.map((k) => (
              <Chip key={k} label={`− ${k}`} tone="rose" casing="lower" />
            ))}
          </div>
        )}
      </div>
      <div className={s.foot}>
        <dl className={s.facts}>
          <dt>queue</dt>
          <dd className={mark("queuePos")}>
            #{r.queuePos}
            {said("queuePos")}
          </dd>
          <dt>eta</dt>
          <dd className={mark("etaAt")}>
            {when(r.etaAt, nowMs)}
            {said("etaAt")}
          </dd>
        </dl>
        <label className={s.ceiling}>
          <span>ceiling $</span>
          <input
            className={cx(s.field, !parsed.ok && s.bad)}
            inputMode="decimal"
            aria-label="ceiling in dollars"
            aria-invalid={parsed.ok ? undefined : true}
            value={ceiling}
            placeholder="none"
            onChange={(e) => onCeiling(e.currentTarget.value)}
            {...{ [FIELD_ATTR]: CEILING_FIELD }}
          />
        </label>
        {!parsed.ok && <ErrorLine message={parsed.error} />}
        {over && <Chip label="may stop at ceiling" tone="amber" name={`worst case ${fmtUsd(worst)} over the ceiling ${parsed.ok && parsed.value !== undefined ? fmtUsd(parsed.value) : ""}`} />}
        <button
          type="button"
          className={cx(s.confirm, busy && s.busy)}
          aria-disabled={busy || blocked ? true : undefined}
          aria-busy={busy ? true : undefined}
          onClick={busy || blocked ? undefined : onConfirm}
        >
          Confirm
          <Keycap mode="receipt" verb="confirm" />
        </button>
      </div>
      {error !== undefined && (
        <div className={s.error}>
          <ErrorLine message={error} live />
        </div>
      )}
    </section>
  );
}
