// What v1 holds that this packet cannot carry whole, at the gate and before the commit (wave B
// ruling 8; import-normalization: lossy-conversion disclosure). The adapter that opened the
// packet graded each one (lib/decision/v1/types.ts Loss): `approximate` carries a stand-in
// (an instant observed, not recorded), `dropped` is absent from the packet and stays as v1
// holds it. Each line is v1's record speaking - its candidate and the reason - never the
// Board explaining itself.
import type { Loss } from "@gt/ui/board/port";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";

import s from "./board.module.css";

/** Drawn at most this many; the rest is counted (bounded: an extract run can drop dozens of tags). */
const SHOWN = 6;

export function Losses({ losses }: { readonly losses: readonly Loss[] }) {
  if (losses.length === 0) return null;
  const rest = losses.length - SHOWN;
  return (
    <ul className={s.losses} aria-label="v1 holds more than this packet" data-component="Losses">
      {losses.slice(0, SHOWN).map((l, i) => (
        <li key={`${l.candidate ?? ""}:${i}`} className={s.loss}>
          <Chip label={l.grade} tone={l.grade === "dropped" ? "rose" : "amber"} casing="lower" />
          <span>{l.candidate === undefined ? l.reason : `${l.candidate} · ${l.reason}`}</span>
        </li>
      ))}
      {rest > 0 && (
        <li className={s.loss}>
          <Chip label="more" value={rest} casing="lower" />
        </li>
      )}
    </ul>
  );
}
