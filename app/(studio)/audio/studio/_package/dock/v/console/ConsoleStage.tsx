"use client";

// DESIGN VARIANT "console" of the package stage (prototype dock-package, 2026-11-17): packaging a release is running a
// mixing console before a broadcast. Every step is a channel strip, all seven visible at once - its state as lamps and
// an LED meter, its key values as mono readouts, the agent's suggestion as an incoming-signal light on the strip it
// touches - and the review is the master section at the end of the desk. A press on a strip (or a readout on it)
// morphs the strip's face into the editor's dialog. The ground is an instrument surface: graph paper over deep ink
// under one soft overhead light.
//
// This file picks between the patchbay (no release open) and the desk (one open), and keeps the desk's walk across a
// page-made release taking the store's id (../../../../../_release/swap.ts): the same release keeps its desk.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { isSwap } from "../../../../../_release/swap.ts";
import type { StageProps } from "../props.ts";
import { Desk } from "./Desk.tsx";
import { Patchbay } from "./Patchbay.tsx";
import s from "./ground.module.css";

interface Mount {
  readonly id: string | null;
  /** The id the desk was mounted for: its key, so a swap to the store's id keeps the desk's position. */
  readonly key: string | null;
}

export function ConsoleStage({ read, session, newId, startStep }: StageProps) {
  const reduce = useReducedMotion() === true;
  const { state, dispatch } = session;
  const release = state.releases.find((r) => r.id === state.openId) ?? null;
  const [mount, setMount] = useState<Mount>({ id: release?.id ?? null, key: release?.id ?? null });
  const now = release?.id ?? null;
  if (now !== mount.id) {
    const swap = now !== null && isSwap(mount.id, now, state.releases.map((r) => r.id));
    setMount({ id: now, key: swap ? mount.key : now });
  }
  const waitingOf = (id: string) => session.records.find((x) => x.release.id === id)?.pending.length ?? 0;
  return (
    <div className={s.ground} data-variant-body="console">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={release === null ? "patchbay" : `desk:${mount.key ?? ""}`}
          className={s.stage}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? { opacity: 1, transition: { duration: 0 } } : { opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
        >
          {release === null ? (
            <Patchbay
              read={read}
              releases={state.releases}
              waitingOf={waitingOf}
              reduce={reduce}
              onOpen={(id) => dispatch({ type: "open", id })}
              onCreate={(takes) => dispatch({ type: "create", id: newId(), artist: read.artist, takes })}
            />
          ) : (
            <Desk read={read} session={session} release={release} startStep={startStep} reduce={reduce} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
