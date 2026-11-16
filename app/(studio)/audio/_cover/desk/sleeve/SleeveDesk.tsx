"use client";

// SLEEVE, the cover desk: a record sleeve and its run-out groove: each cover is a record in a crate (./Crate.tsx, the left sidebar), and the
// work on the one in hand runs along one groove - brief, section, score, takes, winner, remix - a station at a time
// (./Stations.tsx), so nothing scrolls past a part the work is not at; the desk is as tall as one station.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Empty } from "@gt/ui/components/empty/Empty.tsx";

import { SourceDrop } from "../Source.tsx";
import type { Desk } from "../useDesk.ts";
import { Crate } from "./Crate.tsx";
import { Stations } from "./Stations.tsx";
import s from "./sleeve.module.css";

export function SleeveDesk({ desk }: { readonly desk: Desk }) {
  const reduce = useReducedMotion() === true;
  const view = desk.view;
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
