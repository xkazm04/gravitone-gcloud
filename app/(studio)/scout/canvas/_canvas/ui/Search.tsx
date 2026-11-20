"use client";

// FIND - basins, rivers, channels' ports, moored episodes and every lot with a node, matched token by token, the
// nearer kinds first (the winner's chrome.js Search). Enter or a click flies there and opens its sheet. `/` (the
// keymap's `find`, dispatched elsewhere) calls openFind(st), which focuses the mounted field.

import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { locate } from "../render/camera.ts";
import { clamp } from "../scene/geo.ts";
import type { Hit, Scene } from "../scene/types.ts";
import type { CanvasStore } from "../store.ts";
import { STAGE_NAME, STAGES, STATE, type ItemState } from "../tables.ts";
import { useCanvasStore } from "../useCanvas.ts";
import { cx, Kbd, kit } from "./kit.tsx";
import t from "./toolbar.module.css";

type Entry = { readonly t: string; readonly m: () => string; readonly hit: Exclude<Hit, { type: "block" | "station" | "note" }>; readonly s: string; readonly col: () => string; readonly w: number };

const stW = (s: ItemState): string => STATE[s].word;
const stC = (s: ItemState): string => `var(--${STATE[s].tone})`;
const stageName = (si: number): string => {
  const s = STAGES[si];
  return s === undefined ? "" : STAGE_NAME[s];
};

function indexOf(sc: Scene): Entry[] {
  const out: Entry[] = [];
  for (const b of sc.basins) out.push({ t: b.name, m: () => `basin · ${b.live} live`, hit: { type: "basin", ref: b }, s: b.name.toLowerCase(), col: () => "var(--text)", w: 0 });
  for (const r of sc.rivers) {
    const p = r.province;
    const where = p === null ? "" : `${p.basin.name} › ${p.name}`.toLowerCase();
    out.push({ t: r.name, m: () => `${where} · ${r.synthetic ? "pipeline" : `${r.live} live`}`, hit: { type: "river", ref: r }, s: `${r.name} ${r.aud ?? ""} ${p?.basin.name ?? ""}`.toLowerCase(), col: () => (r.reach < 0 ? "var(--rose)" : "var(--muted)"), w: 1 });
  }
  for (const c of sc.channels) {
    const port = c.port;
    if (port === null) continue;
    out.push({ t: `${c.id} · ${c.name}`, m: () => `port · ${c.group} · ${c.episodes.length} episodes`, hit: { type: "port", ref: port }, s: `${c.id} ${c.name} ${c.group}`.toLowerCase(), col: () => "var(--emerald)", w: 0 });
  }
  for (const c of sc.channels)
    for (const sh of c.port?.ships ?? [])
      out.push({ t: sh.ep.title, m: () => `${c.id} · ${stW(sh.ep.state)}`, hit: { type: "ship", ref: sh }, s: `${sh.ep.id} ${sh.ep.title} ${sh.ep.logline}`.toLowerCase(), col: () => stC(sh.ep.state), w: 2 });
  for (const it of sc.items) {
    const n = it.node;
    if (n === null) continue;
    out.push({ t: it.label, m: () => [stageName(it.si), stW(it.state), it.at, it.river.name].join(" · "), hit: { type: "item", ref: it }, s: `${it.label} ${n.kind} ${it.at} ${n.subgenre ?? ""} ${n.packet}`.toLowerCase(), col: () => stC(it.state), w: 3 });
  }
  return out;
}

/** The mounted field, for `/`. */
let field: HTMLInputElement | null = null;

export function openFind(_st: CanvasStore): void {
  field?.focus();
  field?.select();
}

export function Search() {
  const st = useCanvasStore();
  const index = useMemo(() => indexOf(st.scene), [st.scene]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (qq === "") return [];
    const toks = qq.split(/\s+/);
    return index.filter((x) => toks.every((tk) => x.s.includes(tk))).sort((a, b) => a.w - b.w).slice(0, 14);
  }, [q, index]);

  const goTo = (x: Entry): void => {
    setOpen(false);
    field?.blur();
    locate(st, x.hit);
    st.openSheet(x.hit);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const i = clamp(sel + (e.key === "ArrowDown" ? 1 : -1), 0, Math.max(0, hits.length - 1));
      setSel(i);
      list.current?.querySelectorAll("button")[i]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      const x = hits[sel];
      if (x !== undefined) goTo(x);
    }
  };

  return (
    <div className={t.search}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      <input
        ref={(el) => {
          field = el;
        }}
        type="search"
        placeholder="Seed, idea, genre, channel, night"
        aria-label="Find on the map"
        autoComplete="off"
        role="combobox"
        aria-expanded={open && q.trim() !== ""}
        aria-controls="scout-find-results"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
          setOpen(e.target.value.trim() !== "");
        }}
        onKeyDown={onKey}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
      />
      <Kbd verb="find" />
      <div ref={list} id="scout-find-results" className={cx(t.results, open && q.trim() !== "" && t.on)} role="listbox" aria-label="Matches">
        {hits.length > 0 ? (
          hits.map((x, i) => (
            <button
              key={`${x.hit.type}:${i}`}
              type="button"
              role="option"
              aria-selected={i === sel}
              className={cx(i === sel && t.hi)}
              onPointerDown={(e) => {
                e.preventDefault();
                goTo(x);
              }}
            >
              <span className={kit.dot} style={{ background: x.col() }} />
              <span>
                <span className={t.t}>{x.t}</span>
                <span className={t.m}>{x.m()}</span>
              </span>
            </button>
          ))
        ) : (
          <button type="button" disabled>
            <span />
            <span className={t.m}>0 matches</span>
          </button>
        )}
      </div>
    </div>
  );
}
