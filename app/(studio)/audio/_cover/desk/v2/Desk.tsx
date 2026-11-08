"use client";

// PROTOTYPE VARIANT v2 of the cover desk, SLEEVE (TODO(prototype, 2026-11-08): consolidate the cover desk switcher).
// A record sleeve and its run-out groove: each cover is a record in a crate (./Crate.tsx, the left sidebar), and the
// work on the one in hand runs along one groove - brief, section, score, takes, winner, remix - a station at a time
// (./Stations.tsx), so nothing scrolls past a part the work is not at. Against the baseline's column of steps, the
// desk is as tall as one station. Handed exactly what the baseline is handed.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Empty } from "@gt/ui/components/empty/Empty.tsx";

import type { DeskProps } from "../Layouts.tsx";
import { SourceDrop } from "../Source.tsx";
import { Crate } from "./Crate.tsx";
import { Stations } from "./Stations.tsx";
import s from "./v2.module.css";

export function DeskV2({ desk, view }: DeskProps) {
  const reduce = useReducedMotion() === true;
  if (view === null) return null;
  const current = view.current;
  return (
    <div className={view.covers.length > 0 ? s.desk : s.alone}>
      {view.covers.length > 0 && <Crate desk={desk} view={view} />}
      <div className={s.main}>
        {current === undefined ? (
          <>
            {view.covers.length === 0 && <Empty label="no covers yet" />}
            <SourceDrop desk={desk} />
          </>
        ) : (
          // A sleeve pulled from the crate: the cover in hand fades out and the next in.
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={current.record.id} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? { opacity: 1, transition: { duration: 0 } } : { opacity: 0 }} transition={{ duration: reduce ? 0 : 0.18 }}>
              <Stations card={current} desk={desk} />
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
