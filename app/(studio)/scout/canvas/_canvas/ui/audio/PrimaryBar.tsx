"use client";

// THE AUDIO DESK'S FOOT - "then the calendar", the cadence, the slot hour, and the one primary act: generate + lay the
// picked reels (with the vendors it calls), else push the laid cuts to the calendar, else what is running or slotted.
// Port of the winner's audio.js `primary()` and its foot. When the side cannot run the chain, its own sentence shows.

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { canRun, run, schedule } from "../../acts.ts";
import type { Item } from "../../scene/types.ts";
import type { CanvasStore, Ui } from "../../store.ts";
import { CALENDAR, CHAIN_DONE, DECIDE, type DecideKey } from "../../tables.ts";
import { cx, Kbd, kit, Seg } from "../kit.tsx";
import d from "../desk.module.css";

const DECIDE_KEYS: readonly DecideKey[] = ["voice", "music", "sound"];

/** A desk setting the store holds: set it and redraw (outside render, where the store is the store's to change). */
function setUi<K extends "cadence" | "autoSlot" | "mode" | "until">(st: CanvasStore, k: K, v: Ui[K]): void {
  st.ui[k] = v;
  st.changed("ui");
}

export type Primary = { readonly n: number; readonly label: string; readonly cost: string; readonly go: (() => Promise<number>) | null };

export function primary(st: CanvasStore, rows: readonly Item[], on: ReadonlySet<string>): Primary {
  const picked = rows.filter((it) => on.has(it.id));
  const can = picked.filter(canRun);
  const laid = picked.filter((it) => it.audio !== null && it.audio.step === CHAIN_DONE - 1 && it.audio.run === null);
  const running = rows.filter((it) => it.audio !== null && it.audio.run !== null && it.audio.run.key !== "brief").length;
  const slotted = rows.filter((it) => it.audio !== null && it.audio.step >= CHAIN_DONE).length;
  if (can.length > 0) {
    const fallback = rows[0]?.audio?.decision ?? null;
    const vendors = [
      ...new Set(
        can.flatMap((it) => {
          const dec = it.audio?.decision ?? fallback;
          return DECIDE_KEYS.map((k) => DECIDE[k].opts.find((o) => dec !== null && o.key === dec[k])?.vendor).filter((v): v is string => v !== undefined);
        }),
      ),
    ];
    return { n: can.length, label: `Generate + lay ${can.length}${st.ui.autoSlot ? " → calendar" : ""}`, cost: vendors.join(" · "), go: () => run(st, can, st.ui.autoSlot) };
  }
  if (laid.length > 0) return { n: laid.length, label: `Push ${laid.length} to the calendar`, cost: "calendar.schedule", go: () => schedule(st, laid) };
  if (running > 0) return { n: 0, label: `${running} running`, cost: "", go: null };
  return { n: 0, label: `${slotted} slotted`, cost: "", go: null };
}

/** Runs the primary act; the toast names what ran and what it called. */
export async function runPrimary(st: CanvasStore, pr: Primary): Promise<void> {
  if (pr.go === null || pr.n === 0 || !st.view.caps.audio) return;
  const n = await pr.go();
  if (n > 0) st.say(pr.cost === "" ? pr.label : `${pr.label} · ${pr.cost}`);
}

export function PrimaryBar({ st, pr }: { readonly st: CanvasStore; readonly pr: Primary }) {
  const can = st.view.caps.audio;
  const refusal = st.view.refusals.audio;
  return (
    <div className={d.foot}>
      <label>
        <input
          type="checkbox"
          checked={st.ui.autoSlot}
          onChange={(e) => setUi(st, "autoSlot", e.currentTarget.checked)}
        />
        then the calendar
      </label>
      <label>
        every
        <Seg
          label="Cadence in days"
          value={String(st.ui.cadence)}
          options={CALENDAR.cadences.map((c) => ({ key: String(c), name: `${c} d` }))}
          onPick={(v) => setUi(st, "cadence", Number(v))}
        />
        {CALENDAR.time}
      </label>
      {!can && refusal !== undefined && <ErrorLine message={refusal} />}
      <span className={d.grow} />
      <span className={d.cost}>{pr.cost}</span>
      <button type="button" className={cx(kit.btn, pr.n > 0 && kit.amberBtn, d.commit)} disabled={pr.n === 0 || !can} onClick={() => void runPrimary(st, pr)}>
        {pr.label}
        {pr.n > 0 && <Kbd mode="canvas.desk" verb="run" />}
      </button>
    </div>
  );
}
