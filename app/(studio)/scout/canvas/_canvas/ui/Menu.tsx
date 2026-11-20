"use client";

// THE MENU - right-click, long-press or N on a place: the note for the next scouting comes first (its stance, then
// Pin), then what can be done there: triage, audio → calendar, schedule, pause, a goal, open. Port of the winner's
// chrome.js Menu. The menu's x / y are viewport (client) coordinates, as a pointer event gives them, so the popover
// is fixed to the viewport like the winner's. Esc or a press outside closes it.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import * as acts from "../acts.ts";
import type { CanvasCaps } from "../../_port/contract.ts";
import { locate } from "../render/camera.ts";
import { clamp, cut } from "../scene/geo.ts";
import { anchorOf, blocksUnder, briefLine, notesAt, type Anchor } from "../scene/scopes.ts";
import type { Hit, River, Scope } from "../scene/types.ts";
import type { CanvasStore } from "../store.ts";
import { STANCES, type Stance } from "../tables.ts";
import { useCanvas } from "../useCanvas.ts";
import { TextArea } from "@gt/ui/components/field/Field.tsx";
import { Chip, cx, Gl, Kbd, kit } from "./kit.tsx";
import m from "./menu.module.css";

/** A write whose capability is off answers with the side's own sentence, never silently. */
export function gate(st: CanvasStore, cap: keyof CanvasCaps): boolean {
  if (st.view.caps[cap]) return true;
  st.refuse(st.view.refusals[cap] ?? `${cap} · off`);
  return false;
}

/** A place on the map: any scope but the whole studio. */
export type Place = Exclude<Scope, { type: "all" }>;

/** The place a hit stands for in the menu: a weir's scope, a place, or nothing (a station, a note, the whole studio). */
export function targetOf(h: Hit | null): Place | null {
  if (h === null) return null;
  if (h.type === "block") return h.scope.type === "all" ? null : h.scope;
  if (h.type === "station" || h.type === "note") return null;
  return h;
}

/** The river a target flows in, when it is one a pause can act on. */
const riverOf = (t: Place | null): River | null => (t === null ? null : t.type === "river" ? t.ref : t.type === "town" || t.type === "item" ? t.ref.river : null);

/** WS.menu.open: a note's flag opens its anchor; the Songs port stands for the Songs basin. */
export function openMenuFor(st: CanvasStore, h: Hit | null, x: number, y: number): void {
  if (h !== null && h.type === "note") {
    const n = st.ui.notes.find((nt) => nt.id === h.ref);
    if (n !== undefined) st.openMenu(x, y, null, { kind: n.kind, key: n.key, name: n.name });
    return;
  }
  let target = targetOf(h);
  if (target === null) return st.closeMenu();
  if (target.type === "port" && target.ref.song) {
    const b = st.scene.basins.find((bs) => bs.key === "song");
    if (b !== undefined) target = { type: "basin", ref: b };
  }
  st.openMenu(x, y, target, anchorOf(target));
}

/** The last pointer position over the page (the Menu, while mounted, keeps it). */
const pointer = { x: -1, y: -1 };

/** N: the menu for what is under the pointer, else for the selection at the middle of the screen. False: no place. */
export function openMenuHere(st: CanvasStore): boolean {
  const hov = targetOf(st.ui.hover) !== null || st.ui.hover?.type === "note" ? st.ui.hover : null;
  const h = hov ?? (targetOf(st.ui.sel) !== null ? st.ui.sel : null);
  if (h === null) return false;
  const at = hov !== null && pointer.x >= 0 ? pointer : { x: innerWidth / 2, y: innerHeight / 2 };
  openMenuFor(st, h, at.x, at.y);
  return true;
}

/** Back to the map (the winner's M.cv.focus): the canvas root's first canvas. */
export function focusMap(el: Element | null): void {
  (el?.closest("[data-role='canvas']") ?? document).querySelector("canvas")?.focus({ preventScroll: true });
}

export function Menu() {
  const st = useCanvas();
  const menu = st.ui.menu;
  useEffect(() => {
    const move = (e: PointerEvent): void => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);
  if (menu === null || menu.anchor === null) return null;
  return <MenuCard key={`${menu.anchor.kind}:${menu.anchor.key}:${menu.x}:${menu.y}`} st={st} anchor={menu.anchor} target={targetOf(menu.target)} x={menu.x} y={menu.y} />;
}

function MenuCard({ st, anchor, target, x, y }: { readonly st: CanvasStore; readonly anchor: Anchor; readonly target: Place | null; readonly x: number; readonly y: number }) {
  const el = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(st.ui.menu?.text ?? "");
  const [stance, setStance] = useState<Stance>(st.ui.menu?.stance ?? "");
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x + 6, top: y + 6 });

  const close = (): void => {
    focusMap(el.current);
    st.closeMenu();
  };

  useLayoutEffect(() => {
    const e = el.current;
    if (e === null) return;
    setPos({ left: clamp(x + 6, 8, innerWidth - e.offsetWidth - 8), top: clamp(y + 6, 8, innerHeight - e.offsetHeight - 8) });
  }, [x, y]);
  useEffect(() => field.current?.focus(), []);
  useEffect(() => {
    const down = (e: PointerEvent): void => {
      const t = e.target;
      if (el.current !== null && t instanceof Node && !el.current.contains(t)) st.closeMenu();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [st]);

  const mine = notesAt(st.ui.notes, anchor);
  const bl = target === null ? null : blocksUnder(st.scene, target);
  const nTri = bl === null ? 0 : bl.verdict.length + bl.seeds.length;
  const rv = riverOf(target);
  const ch = target === null ? null : target.type === "port" || target.type === "ship" ? target.ref.chan : rv?.chan ?? null;

  const pin = (): void => {
    if (!gate(st, "notes")) return;
    const t = text.trim();
    void acts.note(st, anchor, t, stance).then((ok) => {
      if (!ok) return field.current?.focus();
      st.say(briefLine({ kind: anchor.kind, name: anchor.name, stance, text: t }));
      close();
    });
  };
  const onField = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      pin();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
    e.stopPropagation();
  };
  const onCard = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    close();
  };
  const go = (d: "triage" | "audio" | "pause" | "target" | "open"): void => {
    close();
    if (target === null) return;
    if (d === "triage") st.openSurface({ kind: "gallery", scope: target, block: null, focus: null });
    else if (d === "audio") st.openSurface({ kind: "audio", scope: target });
    else if (d === "pause" && rv !== null) {
      if (!gate(st, "steer")) return;
      void acts.pause(st, rv);
      st.say(`${rv.paused ? "paused · " : "resumed · "}${rv.name}`);
    } else if (d === "target" && ch !== null) {
      if (!gate(st, "steer")) return;
      const g = st.ui.goal;
      const had = g.targets.find((t) => t.channel === ch.id);
      const targets = had === undefined ? [...g.targets, { channel: ch.id, n: 1 }] : g.targets.map((t) => (t === had ? { channel: t.channel, n: Math.min(20, t.n + 1) } : t));
      void acts.setGoal(st, { text: g.text, targets });
      st.say(`goal · one more for ${ch.id}`);
    } else if (d === "open") {
      locate(st, target);
      st.openSheet(target.type === "bundle" ? { type: "prov", ref: target.ref.prov } : target);
    }
  };

  return (
    <div ref={el} data-role="menu" className={m.menu} role="dialog" aria-label={anchor.name} style={{ left: pos.left, top: pos.top }} onKeyDown={onCard}>
      <div className={m.hd}>
        <b>{anchor.name}</b>
        <span>{anchor.kind}</span>
      </div>
      {mine.map((n) => (
        <div key={n.id} className={kit.noterow}>
          <Gl name="flag" size={13} />
          <span className={kit.t}>{(n.stance !== "" ? n.stance + (n.text !== "" ? " · " : "") : "") + n.text}</span>
          <button type="button" aria-label="Remove note" onClick={() => {
            if (gate(st, "notes")) void acts.unnote(st, n.id);
          }}>
            <Gl name="x" size={12} />
          </button>
        </div>
      ))}
      <TextArea areaRef={field} role="note-field" skin={kit.in} placeholder="Next time here…" label="Note for the next scouting: how to approach ideas here" value={text} onChange={setText} onKeyDown={onField} />
      <div className={m.stance} role="group" aria-label="Stance">
        {STANCES.map((s) => (
          <button key={s.key} type="button" data-role="stance" className={cx(stance === s.key && m.on)} aria-pressed={stance === s.key} onClick={() => setStance(stance === s.key ? "" : s.key)}>
            {`${s.glyph} ${s.name}`}
          </button>
        ))}
      </div>
      <div className={m.go}>
        <Chip tone="planned">into the next brief</Chip>
        <button type="button" className={cx(kit.btn, kit.violetBtn)} onClick={pin}>
          <Gl name="flag" size={13} />
          Pin
          <Kbd cap="↵" />
        </button>
      </div>
      {target !== null && (
        <div className={m.list}>
          {nTri > 0 && (
            <button type="button" className={m.amber} onClick={() => go("triage")}>
              <Gl name="eye" />
              Triage<span className={m.n}>{nTri}</span>
              <Kbd verb="triage" />
            </button>
          )}
          {bl !== null && bl.audio.length > 0 && (
            <button type="button" className={m.amber} onClick={() => go("audio")}>
              <Gl name="mute" />
              Audio → calendar<span className={m.n}>{bl.audio.length}</span>
              <Kbd verb="audio" />
            </button>
          )}
          {bl !== null && bl.slot.length > 0 && (
            <button type="button" className={m.amber} onClick={() => go("audio")}>
              <Gl name="cal" />
              Schedule<span className={m.n}>{bl.slot.length}</span>
            </button>
          )}
          {rv !== null && !rv.synthetic && rv.group !== null && (
            <button type="button" onClick={() => go("pause")}>
              <Gl name={rv.paused ? "play" : "pause"} />
              {`${rv.paused ? "Resume" : "Pause"} ${cut(rv.chan !== null ? rv.chan.id : rv.name, 22)}`}
              <Kbd verb="pause" />
            </button>
          )}
          {ch !== null && (
            <button type="button" onClick={() => go("target")}>
              <Gl name="moon" />
              {`Goal: one more for ${ch.id}`}
            </button>
          )}
          <button type="button" onClick={() => go("open")}>
            <Gl name="loc" />
            Open
            <Kbd cap="↵" />
          </button>
        </div>
      )}
    </div>
  );
}
