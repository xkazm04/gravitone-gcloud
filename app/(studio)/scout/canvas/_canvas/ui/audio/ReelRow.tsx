"use client";

// ONE KEPT REEL ON THE AUDIO DESK - its pick, its silent picture (the film plays on hover), its episode title, channel,
// cut kind and road, the brief's quoted line and hits, and decideAudio's three choices; once slotted, its slot. Port of
// the winner's audio.js `reelRow()`.

import { decide } from "../../acts.ts";
import { epFor } from "../../scene/scopes.ts";
import { cut } from "../../scene/geo.ts";
import type { Item } from "../../scene/types.ts";
import type { CanvasStore } from "../../store.ts";
import { CHAIN_DONE, DECIDE, type DecideKey } from "../../tables.ts";
import { ChainPips } from "../ChainPips.tsx";
import { Chip, cx, Gl, Seg } from "../kit.tsx";
import d from "../desk.module.css";
import { dayLabel, dayName } from "./CalStrip.tsx";

const DECIDE_KEYS: readonly DecideKey[] = ["voice", "music", "sound"];

function Pic({ it }: { readonly it: Item }) {
  const files = it.media?.files ?? [];
  const im = files.find((f) => f.type === "image");
  const vid = files.find((f) => f.type === "video");
  const a = it.audio;
  return (
    <div
      className={d.pic}
      onMouseEnter={(e) => void e.currentTarget.querySelector("video")?.play().catch(() => undefined)}
      onMouseLeave={(e) => e.currentTarget.querySelector("video")?.pause()}
    >
      {vid !== undefined ? <video src={vid.src} poster={im?.src} muted loop playsInline preload="none" /> : im !== undefined ? <img src={im.src} alt="" loading="lazy" /> : null}
      {a !== null && a.step < 4 && (
        <span className={d.mute} title="no audio stream" role="img" aria-label="no audio stream">
          <Gl name="mute" size={12} />
        </span>
      )}
    </div>
  );
}

function Brief({ it }: { readonly it: Item }) {
  const a = it.audio;
  if (a === null) return null;
  const b = a.brief;
  if (b === null || b === undefined) return <span className={d.writing}>{a.run?.key === "brief" ? "writing the brief…" : ""}</span>;
  return (
    <>
      <q>{cut(b.vo[0] ?? "", 90)}</q>
      <div className={d.m}>
        {b.dur} s · {b.hits.length} hits {b.hits.join(" ")}
      </div>
    </>
  );
}

function Decision({ st, it, can }: { readonly st: CanvasStore; readonly it: Item; readonly can: boolean }) {
  const a = it.audio;
  if (a === null) return null;
  if (a.slot !== null) {
    return (
      <div className={d.slotted}>
        <Gl name="cal" size={14} />
        {dayName(st.view.today, a.slot.day)} {dayLabel(st.view.today, a.slot.day)} · {a.slot.time} · {a.slot.channel}
      </div>
    );
  }
  const dec = a.decision;
  if (dec === null) return null;
  return (
    <>
      {DECIDE_KEYS.map((k) => (
        <DecideSeg key={k} k={k} value={dec[k]} disabled={!can || a.step >= 2} label={`${DECIDE[k].name} · ${it.label}`} onPick={(v) => void decide(st, it, { ...dec, [k]: v })} />
      ))}
    </>
  );
}

function DecideSeg({ k, value, disabled, label, onPick }: { readonly k: DecideKey; readonly value: string | null; readonly disabled: boolean; readonly label: string; readonly onPick: (v: string) => void }) {
  const D = DECIDE[k];
  return (
    <>
      <span>{D.name.toLowerCase()}</span>
      <Seg label={label} value={value} disabled={disabled} onPick={onPick} options={D.opts.map((o) => ({ key: o.key, title: o.vendor !== undefined ? `${o.vendor} · ${o.cost ?? ""}` : undefined }))} />
    </>
  );
}

export function ReelRow({ st, it, chan, on, onPick, can }: { readonly st: CanvasStore; readonly it: Item; readonly chan: string | null; readonly on: boolean; readonly onPick: (on: boolean) => void; readonly can: boolean }) {
  const a = it.audio;
  if (a === null) return null;
  const e = epFor(st.scene, it);
  return (
    <div className={cx(d.reel, !on && d.off)} data-role="desk-row" data-row={it.id}>
      <input type="checkbox" checked={on} disabled={a.step >= CHAIN_DONE} aria-label={`Include ${it.label}`} onChange={(ev) => onPick(ev.currentTarget.checked)} />
      <Pic it={it} />
      <div className={d.ti}>
        <b>{e !== null ? e.title : cut(it.label, 60)}</b>
        <div className={d.m}>
          {chan !== null && <Chip tone="emerald">{chan}</Chip>}
          <Chip>{it.node?.kind === "reel-cut" ? "full cut" : "8 s strip"}</Chip>
          <ChainPips it={it} />
        </div>
      </div>
      <div className={d.br}>
        <Brief it={it} />
      </div>
      <div className={d.dec}>
        <Decision st={st} it={it} can={can} />
      </div>
    </div>
  );
}
