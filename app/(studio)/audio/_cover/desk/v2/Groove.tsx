"use client";

// THE GROOVE (prototype v2, Sleeve): the stations a cover's work runs through, as one line across the top - both how far
// the work has come (the line is lit up to the last station reached) and the way between them. A station the work has
// not reached is drawn and named, and refuses to open (Button's aria-disabled). The mark under the open station moves
// with a shared layoutId when another is pressed.
import { motion, useReducedMotion } from "motion/react";

import { Button, type ButtonProps } from "@gt/ui/components/button/Button.tsx";

import { STATIONS, type Station } from "./stations.ts";
import s from "./v2.module.css";

export type StationFacts = Pick<ButtonProps, "badge" | "tally">;

export function Groove({ at, reached, facts, onGo }: { readonly at: Station; readonly reached: Readonly<Record<Station, boolean>>; readonly facts: Readonly<Partial<Record<Station, StationFacts>>>; readonly onGo: (to: Station) => void }) {
  const reduce = useReducedMotion() === true;
  return (
    <nav aria-label="stations">
      <ol className={s.groove}>
        {STATIONS.map((id, i) => (
          <li key={id} className={s.station} data-reached={reached[id] ? "" : undefined} aria-current={id === at ? "step" : undefined}>
            <span className={s.stationN} aria-hidden="true">
              {i + 1}
            </span>
            <Button label={id} size="sm" tone={id === at ? "cyan" : "neutral"} disabled={!reached[id]} onPress={() => onGo(id)} {...facts[id]} />
            {id === at && <motion.span layoutId="v2-station-mark" className={s.stationMark} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }} aria-hidden="true" />}
          </li>
        ))}
      </ol>
    </nav>
  );
}
