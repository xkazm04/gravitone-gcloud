"use client";

// THE PIECES THE THREE STREETS SHARE - the props every variant takes, the cast card (the core's portrait and name, the
// swap's door, a drop target for a core dragged from the tray) and the track's facts. A variant is a drawing of the
// same production; none owns a fact the others say differently.

import { useState, type DragEvent } from "react";

import type { CoreRef, Production, ProductionNode } from "@gt/domain/productionGraph";

import { cx, Kbd } from "../ui/kit.tsx";
import k from "../ui/kit.module.css";
import { clock } from "./model.ts";
import v from "./variants.module.css";

export type StreetProps = {
  readonly p: Production;
  readonly focus: string | null;
  /** The ids the last accept made stale, while the ripple plays. */
  readonly rippling: ReadonlySet<string> | null;
  readonly onPick: (n: ProductionNode) => void;
  readonly onSwap: () => void;
  readonly onDropCore: (core: string) => void;
};

/** The drag's payload: a core's id. */
export const CORE_MIME = "application/x-gravitone-core";

export function dragCore(e: DragEvent, core: CoreRef): void {
  e.dataTransfer.setData(CORE_MIME, core.id);
  e.dataTransfer.effectAllowed = "copy";
}

/** Drop-target handlers for a core, and whether one is over it now. */
export function useCoreDrop(onDropCore: (core: string) => void) {
  const [over, setOver] = useState(false);
  const has = (e: DragEvent): boolean => e.dataTransfer.types.includes(CORE_MIME);
  return {
    over,
    on: {
      onDragOver: (e: DragEvent) => {
        if (!has(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        const id = e.dataTransfer.getData(CORE_MIME);
        if (id === "") return;
        e.preventDefault();
        onDropCore(id);
      },
    },
  };
}

/** The cast: her portrait, her name, where the core came from, and the swap. */
export function CastCard({ p, onSwap, onDropCore }: Pick<StreetProps, "p" | "onSwap" | "onDropCore">) {
  const drop = useCoreDrop(onDropCore);
  const node = p.nodes.find((n) => n.station === "cast");
  return (
    <div className={cx(v.castCard, drop.over && v.drop)} {...drop.on} data-role="cast-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.cast.portrait} alt={`${p.cast.name}, portrait`} loading="lazy" />
      <b>{p.cast.name}</b>
      <span className={v.facts}>{p.cast.origin}</span>
      {node !== undefined && node.state !== "made" && <span className={v.amberText}>{node.state}</span>}
      <button type="button" className={k.btn} onClick={onSwap} aria-label={`Swap ${p.cast.name}`}>
        Swap <Kbd verb="cores" />
      </button>
    </div>
  );
}

/** The track: its title, tempo, length and sections as a bar. */
export function TrackFacts({ p }: { readonly p: Production }) {
  const t = p.track;
  return (
    <div className={v.track}>
      <b>{t.title}</b>
      <span className={v.facts}>
        {Math.round(t.bpm)} bpm · {clock(t.seconds)} · {t.sections.length} sections · {t.lyrics.length} lyric lines
      </span>
      <span className={v.secbar} role="img" aria-label={t.sections.map((s) => `${s.name} ${clock(s.start)}`).join(", ")}>
        {t.sections.map((s, i) => (
          <span key={i} style={{ flex: s.end - s.start }} />
        ))}
      </span>
    </div>
  );
}
