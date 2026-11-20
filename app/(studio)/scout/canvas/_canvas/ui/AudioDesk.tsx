"use client";

// AUDIO → CALENDAR, ON THE DESK - every kept reel is silent, so every kept reel under the scope waits here. Opening the
// desk drafts the briefs; one press generates and lays the picked reels (and slots them when "then the calendar" is on);
// the calendar strip beside them shows where the cuts land. Port of the winner's audio.js `open()` / `render()`.
// The chain is the side's: when it cannot run it (caps.audio), the reels and the whole road still show, the controls
// that would write are disabled, and the side's sentence stands in the foot.

import { useEffect, useRef, useState } from "react";

import { useKeys } from "@gt/ui/keymap/dispatch";

import { brief } from "../acts.ts";
import { chanFor, itemsUnder, scopeName } from "../scene/scopes.ts";
import type { Item, Scope } from "../scene/types.ts";
import type { CanvasStore } from "../store.ts";
import { useCanvas } from "../useCanvas.ts";
import { CHAIN_DONE } from "../tables.ts";
import { CalStrip } from "./audio/CalStrip.tsx";
import { primary, PrimaryBar, runPrimary } from "./audio/PrimaryBar.tsx";
import { ReelRow } from "./audio/ReelRow.tsx";
import { Chip, cx, Gl } from "./kit.tsx";
import d from "./desk.module.css";

const chanOf = (st: CanvasStore, it: Item): string | null => it.audio?.channel ?? chanFor(st.scene, it);

const rowsOf = (st: CanvasStore, sc: Scope): Item[] =>
  itemsUnder(st.scene, sc).filter((it) => it.audio !== null && it.state === "kept" && (it.block === "audio" || it.block === "slot" || it.audio.step >= CHAIN_DONE));

/** The opening's rows: the scope's kept reels, else the studio's; by channel, then how far along, then oldest first. */
function open(st: CanvasStore, scope: Scope): { readonly scope: Scope; readonly rows: readonly Item[] } {
  let sc = scope;
  let rows = rowsOf(st, sc);
  if (rows.length === 0) {
    sc = { type: "all" };
    rows = rowsOf(st, sc);
  }
  const step = (it: Item): number => it.audio?.step ?? 0;
  rows.sort((a, b) => (chanOf(st, a) ?? "z").localeCompare(chanOf(st, b) ?? "z") || step(a) - step(b) || (a.at < b.at ? -1 : 1));
  return { scope: sc, rows };
}

export function AudioDesk({ scope }: { readonly scope: Scope }) {
  const st = useCanvas();
  const [{ scope: sc, rows }] = useState(() => open(st, scope));
  const [on, setOn] = useState<ReadonlySet<string>>(() => new Set(rows.filter((it) => it.block !== null).map((it) => it.id)));
  const [sel, setSel] = useState<string | null>(null);
  const briefed = useRef(false);
  const can = st.view.caps.audio;

  // Nothing kept to give sound to: the desk does not stay open on an empty list.
  useEffect(() => {
    if (rows.length > 0) return;
    st.say("0 kept reels");
    st.closeSurface();
  }, [st, rows]);

  // The LLM brief (planned) is drafted once per opening, from each episode's own beats.
  useEffect(() => {
    if (briefed.current || rows.length === 0 || !st.view.caps.audio) return;
    briefed.current = true;
    void brief(st, rows);
  }, [st, rows]);

  const pr = primary(st, rows, on);
  useKeys("canvas.desk", { run: () => void runPrimary(st, pr), close: () => st.closeSurface() }, { enabled: rows.length > 0 });

  const sil = rows.filter((it) => it.block === "audio").length;
  const laid = rows.filter((it) => it.block === "slot").length;
  const slotted = rows.filter((it) => it.audio !== null && it.audio.step >= CHAIN_DONE).length;
  const channels = [...new Set(rows.map((it) => chanOf(st, it)).filter((c): c is string => c !== null))].sort();
  const pick = (id: string, yes: boolean): void =>
    setOn((prev) => {
      const next = new Set(prev);
      if (yes) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <>
      <div className={d.bar}>
        <h2>Audio → calendar</h2>
        <Chip>{scopeName(sc)}</Chip>
        {sil > 0 && <Chip tone="amber">{`${sil} silent`}</Chip>}
        {laid > 0 && <Chip tone="amber">{`${laid} laid`}</Chip>}
        {slotted > 0 && <Chip tone="violet">{`${slotted} slotted`}</Chip>}
        <span className={d.grow} />
        <button type="button" className={d.iconbtn} aria-label="Close" onClick={() => st.closeSurface()}>
          <Gl name="x" size={14} />
        </button>
      </div>
      <div className={d.body}>
        <div className={cx(d.col, d.reels)}>
          {rows.map((it) => (
            <ReelRow key={it.id} st={st} it={it} chan={chanOf(st, it)} on={on.has(it.id)} onPick={(yes) => pick(it.id, yes)} can={can} />
          ))}
        </div>
        <CalStrip st={st} channels={channels} sel={sel} onSel={setSel} can={can} />
      </div>
      <PrimaryBar st={st} pr={pr} />
    </>
  );
}
