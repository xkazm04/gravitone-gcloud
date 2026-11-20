"use client";

// DISPATCH - dry or live, until when, and the exact `/scout night` line the round is. When the side cannot dispatch
// from here, the line is copied and run by hand, and the side's sentence says why. Port of the winner's brief.js
// dispatch column, without its simulated night (the rain of made-up lots and its log are not ported).

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import type { CanvasStore, Ui } from "../../store.ts";
import { Field } from "@gt/ui/components/field/Field.tsx";

import { copyText } from "../../../../../_shell/clipboard.ts";
import { Chip, cx, Kbd, kit, Seg } from "../kit.tsx";
import d from "../desk.module.css";

/** A desk setting the store holds: set it and redraw (outside render, where the store is the store's to change). */
function setUi<K extends "cadence" | "autoSlot" | "mode" | "until">(st: CanvasStore, k: K, v: Ui[K]): void {
  st.ui[k] = v;
  st.changed("ui");
}

const NL = String.fromCharCode(10);

/** Copies the line; the toast quotes its first line, or the clipboard's refusal. */
export function copyCommand(st: CanvasStore, cmd: string): void {
  void copyText(cmd).then((r) => (r.ok ? st.say(`copied · ${cmd.split(NL)[0] ?? cmd}`) : st.refuse(r.error)));
}

export function DispatchCol({ st, cmd }: { readonly st: CanvasStore; readonly cmd: string }) {
  const can = st.view.caps.dispatch;
  const refusal = st.view.refusals.dispatch;
  return (
    <div className={d.col}>
      <h3>Dispatch {!can && <Chip tone="planned">planned</Chip>}</h3>
      <div className={cx(kit.inline, d.modeRow)}>
        <Seg
          label="Mode"
          value={st.ui.mode}
          options={[{ key: "dry" }, { key: "live" }]}
          onPick={(m) => setUi(st, "mode", m)}
        />
        <label className={cx(kit.inline, d.until)}>
          until
          <Field
            skin={cx(kit.in, d.untilIn)}
            type="time"
            label="Until"
            value={st.ui.until}
            onChange={(v) => setUi(st, "until", v === "" ? "06:00" : v)}
          />
        </label>
      </div>
      <div className={kit.cmd} data-role="night-command">
        {cmd}
      </div>
      <div className={cx(kit.inline, d.cmdRow)}>
        <button type="button" className={kit.btn} aria-label="Copy the /scout night command" onClick={() => copyCommand(st, cmd)}>
          Copy
          <Kbd mode="canvas.desk" verb="run" />
        </button>
        {!can && refusal !== undefined && <ErrorLine message={refusal} />}
      </div>
    </div>
  );
}
