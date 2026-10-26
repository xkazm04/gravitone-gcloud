"use client";

// THE PLAN, PER RESOURCE (prototype projects.js `PlanRow`, `optLabel`, projects.css `.plan-t`,
// `.model-sel`, `.units-in`, `.dep`, `.pdot`): one row per part - what it is, which resource it
// holds, which model on it, how many units, how long, what it costs and where that figure came
// from, when it starts, what it waits for, and its state. A gate is a row of its own (◆ verdict)
// and holds no model: it is the operator's act, a Board packet (COMMON decision 10).
//
// The prototype re-routed a launched job from this picker and applied it at once. Here the
// picker and the units field are live only while the plan is a DRAFT (`setPart`); a launched
// part changes route in Runs, through a receipt - the one door a launch's spend goes through.
//
// The units field keeps its own text while it is typed (validation-timing: an intermediate
// "1" on the way to "18" is not an error), and hands the caller a clamped whole number only
// when the text is one; the caller coalesces the writes. An unpriced cost is the `Unpriced`
// chip: its kind drawn, its reason its name and its Hint.
import { useState } from "react";

import type { ModelOption, PlanPart, WorkPlanPart } from "@gt/domain/produce";

import { cx } from "../cx.ts";
import { LaneChip, laneLabel } from "../runs/LaneChip.tsx";
import { SourceTag } from "../source/SourceTag.tsx";
import { StatusPill } from "../status/StatusPill.tsx";
import { STATUS } from "../status/status.ts";
import { costWords, fmtDur, isWork, optionLabel, when } from "./produce.ts";
import { Unpriced } from "./Unpriced.tsx";
import s from "./Plan.module.css";

export type ModelPickerProps = {
  readonly options: readonly ModelOption[];
  readonly chosen: string;
  readonly units: number;
  /** The part it picks for (`frames`): the select's accessible name is `model for frames`. */
  readonly part: string;
  readonly onChange: (key: string) => void;
};

/** A select of model options, each `model · lane — time · $` for this part's units. */
export function ModelPicker({ options, chosen, units, part, onChange }: ModelPickerProps) {
  return (
    <select className={s.picker} aria-label={`model for ${part}`} value={chosen} onChange={(e) => onChange(e.currentTarget.value)} data-component="ModelPicker">
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {optionLabel(o, units, laneLabel(o.lane))}
        </option>
      ))}
    </select>
  );
}

function UnitsInput({ p, onUnits }: { readonly p: WorkPlanPart; readonly onUnits: (n: number) => void }) {
  const [text, setText] = useState(String(p.units));
  const [lo, hi] = p.unitsRange ?? [p.units, p.units];
  // A new value from the server (another tab, a clamp) replaces the text when it is not being typed.
  const [seen, setSeen] = useState(p.units);
  if (seen !== p.units) {
    setSeen(p.units);
    setText(String(p.units));
  }
  return (
    <span className={s.units}>
      <input
        className={s.unitsIn}
        type="number"
        min={lo}
        max={hi}
        inputMode="numeric"
        aria-label={`${p.unitNoun}s for ${p.label}`}
        value={text}
        onChange={(e) => {
          const t = e.currentTarget.value;
          setText(t);
          const n = Number(t);
          if (t !== "" && Number.isInteger(n) && n >= lo && n <= hi && n !== p.units) onUnits(n);
        }}
        onBlur={() => setText(String(p.units))}
      />
    </span>
  );
}

export type PlanRowProps = {
  readonly p: PlanPart;
  readonly byId: ReadonlyMap<string, PlanPart>;
  readonly draft: boolean;
  readonly selected: boolean;
  readonly nowMs: number;
  readonly onModel: (id: string, key: string) => void;
  readonly onUnits: (id: string, units: number) => void;
  /** The part's editor, when it has one: its title is drawn as a link there (Tab reaches it, a reader lists it). */
  readonly hrefOf?: (id: string) => string | null;
};

function Model({ p, draft, onModel }: { readonly p: PlanPart; readonly draft: boolean; readonly onModel: (id: string, key: string) => void }) {
  if (!isWork(p)) return <span className={p.kind === "gate" ? s.verdict : s.publish}>{p.kind === "gate" ? "operator · your verdict" : "publish"}</span>;
  const chosen = p.options.find((o) => o.key === p.chosen);
  if (draft && p.options.length > 1) return <ModelPicker options={p.options} chosen={p.chosen} units={p.units} part={p.label} onChange={(k) => onModel(p.id, k)} />;
  return <span className={s.fixed}>{chosen?.label ?? p.chosen}</span>;
}

export function PlanRow({ p, byId, draft, selected, nowMs, onModel, onUnits, hrefOf }: PlanRowProps) {
  const work = isWork(p);
  const href = hrefOf?.(p.id) ?? null;
  const title = p.kind === "gate" ? `◆ ${(p.judges === undefined ? undefined : byId.get(p.judges)?.label) ?? p.label}` : p.label;
  const lane = work ? (p.options.find((o) => o.key === p.chosen)?.lane ?? null) : null;
  return (
    <tr className={cx(s.row, p.kind === "gate" && s.gate, p.kind === "slot" && s.slot, selected && s.sel)} data-part={p.id} data-selected={selected ? "" : undefined}>
      <td className={s.part}>
        <span className={cx(s.dot, s[STATUS.part[p.state].look])} aria-hidden="true" />
        {/* A gate is named by what it judges: its model cell already says "your verdict". */}
        {href === null ? title : <a className={s.partLink} href={href}>{title}</a>}
      </td>
      <td>{lane !== null ? <LaneChip lane={lane} /> : <LaneChip lane={p.kind === "gate" ? "weir" : "calendar"} />}</td>
      <td className={s.model}>
        <Model p={p} draft={draft} onModel={onModel} />
      </td>
      <td className={s.unitsCell}>
        {work &&
          (draft && p.unitsRange !== undefined ? (
            <UnitsInput p={p} onUnits={(n) => onUnits(p.id, n)} />
          ) : (
            <span>
              <span className={s.n}>{p.units}</span> <span className={s.unit}>{p.units === 1 ? p.unitNoun : `${p.unitNoun}s`}</span>
            </span>
          ))}
      </td>
      <td className={s.num}>{work ? fmtDur(p.estimate.seconds) : "—"}</td>
      <td className={cx(s.num, s.costCell)}>
        {work ? (
          <span className={s.cost}>
            {p.estimate.usd === null && p.estimate.usdRange === undefined ? <Unpriced reason={p.estimate.unpricedReason} hint={false} /> : costWords(p.estimate)}
            <SourceTag kind={p.estimate.src} />
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className={s.start}>{p.schedule === undefined ? "—" : when(p.schedule.start, nowMs)}</td>
      <td>
        <span className={s.deps}>
          {p.after.map((id) => {
            const d = byId.get(id);
            return (
              <span key={id} className={cx(s.dep, d !== undefined && s[STATUS.part[d.state].look])}>
                {d === undefined ? id : d.kind === "gate" ? `◆${(d.judges === undefined ? undefined : byId.get(d.judges)?.label) ?? ""}` : d.label}
              </span>
            );
          })}
        </span>
      </td>
      <td>
        <StatusPill machine="part" state={p.state} />
      </td>
    </tr>
  );
}

export type PlanTableProps = Omit<PlanRowProps, "p" | "byId" | "selected"> & {
  readonly parts: readonly PlanPart[];
  readonly selectedId: string | null;
};

export function PlanTable({ parts, selectedId, ...row }: PlanTableProps) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  return (
    <table className={s.table} aria-label="plan per resource" data-component="PlanTable">
      {/* Fixed shares, so all nine columns stay in view in the plan's column (803px at 1440, where
          the prototype's own table ran to 1075px and hid its last four under the summary); a
          narrower screen scrolls the table inside its region instead. */}
      <colgroup>
        <col className={s.cPart} />
        <col className={s.cRes} />
        <col className={s.cModel} />
        <col className={s.cUnits} />
        <col className={s.cTime} />
        <col className={s.cCost} />
        <col className={s.cStart} />
        <col className={s.cAfter} />
        <col className={s.cState} />
      </colgroup>
      <thead>
        <tr>
          <th>part</th>
          <th>resource</th>
          <th>model</th>
          <th>units</th>
          <th className={s.num}>time</th>
          <th className={s.num}>cost</th>
          <th>start</th>
          <th>after</th>
          <th>state</th>
        </tr>
      </thead>
      <tbody>
        {parts.map((p) => (
          <PlanRow key={p.id} p={p} byId={byId} selected={selectedId === p.id} {...row} />
        ))}
      </tbody>
    </table>
  );
}
