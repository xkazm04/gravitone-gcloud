// The Board's left rail (prototype index.html `PacketRail`): every packet, grouped by media
// lane (with the Floor's lane mark) and then by desk, the open ones amber with their mode's
// mark (the Floor's own, floor/FloorGlyph.tsx), the decided ones dim
// with a tick or a cross. Each row is a link to its packet's own address, so a middle-click
// opens it full page and a plain click moves the sheet (`onOpen`, the caller's router).
import type { MouseEvent } from "react";

import type { PacketSummary } from "@gt/domain/board";
import type { MediaLane } from "@gt/domain/lane";
import type { PacketMode } from "@gt/domain/source";

import { SrOnly } from "../a11y/SrOnly.tsx";
import { cx } from "../cx.ts";
import { FloorGlyph } from "../floor/FloorGlyph.tsx";
import { Tally } from "../tally/Tally.tsx";
import s from "./Desk.module.css";

/** The Floor's lane order and names (⇧1-4); restated here because @gt/domain's list is zod-side. */
const LANES: readonly { readonly id: MediaLane; readonly name: string }[] = [
  { id: "image", name: "Image" },
  { id: "article", name: "Article" },
  { id: "audio", name: "Audio" },
  { id: "video", name: "Video" },
];

const MODE_WORDS: { readonly [M in PacketMode]: string } = { "matrix-cull": "matrix cull", "blind-pair": "blind pair", "packet-review": "packet review" };

/** Lane, then desk (mode), then oldest first: the order a rail reads in. */
export function railGroups(packets: readonly PacketSummary[]): { readonly lane: (typeof LANES)[number]; readonly open: number; readonly packets: readonly PacketSummary[] }[] {
  const modeRank: { readonly [M in PacketMode]: number } = { "matrix-cull": 0, "blind-pair": 1, "packet-review": 2 };
  return LANES.map((lane) => {
    const ps = packets
      .filter((p) => p.lane === lane.id)
      .sort((a, b) => modeRank[a.mode] - modeRank[b.mode] || a.openedAt.localeCompare(b.openedAt) || a.id.localeCompare(b.id));
    return { lane, open: ps.filter((p) => p.state === "open").length, packets: ps };
  }).filter((g) => g.packets.length > 0);
}

export type PacketRailProps = {
  readonly packets: readonly PacketSummary[];
  readonly current: string;
  readonly hrefOf: (id: string) => string;
  readonly onOpen: (id: string) => void;
};

export function PacketRail({ packets, current, hrefOf, onOpen }: PacketRailProps) {
  const go = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen(id);
  };
  return (
    <nav className={s.rail} aria-label="packets">
      {railGroups(packets).map((g) => (
        <div key={g.lane.id}>
          <div className={s.railLane}>
            <FloorGlyph name={g.lane.id} className={s.laneMark} />
            {g.lane.name} <Tally value={g.open} />
          </div>
          {g.packets.map((p) => {
            const open = p.state === "open";
            return (
              <a key={p.id} className={cx(s.railItem, !open && s.done)} href={hrefOf(p.id)} onClick={go(p.id)} aria-current={p.id === current ? "page" : undefined}>
                <span className={cx(s.railMark, open ? s.awaiting : p.state === "returned" ? s.returned : s.committed)} aria-hidden="true">
                  {open ? <FloorGlyph name={p.mode} className={s.mode} /> : p.state === "returned" ? "↩" : "✓"}
                </span>
                <span className={s.ell}>{p.title ?? p.runId ?? p.id}</span>
                <span className={s.cnt}>{p.items}</span>
                <SrOnly text={`${MODE_WORDS[p.mode]}, ${open ? `${p.items - p.decided} undecided` : p.state}`} />
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
