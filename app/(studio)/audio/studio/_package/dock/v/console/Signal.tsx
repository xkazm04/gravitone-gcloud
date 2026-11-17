"use client";

// THE INCOMING SIGNAL ON A FIELD (prototype dock-package, "console"): every pending proposal for one path, drawn at the
// field it would set - the value as the field would show it (the wizard's own reading, Suggest.tsx `shown`), the
// agent's source in its own words, Accept and Dismiss. An answered signal leaves with a fade; nothing is written
// until Accept (owner, wave 2: pending per field).
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import type { ProposalPath, ReleaseProposal } from "@gt/domain/release.record";

import { fieldLabel } from "../../../../../_release/pending.ts";
import type { ReleaseSessionApi } from "../../../../../_release/session.ts";
import { shown } from "../../../../../_release/wizard/Suggest.tsx";
import { Lamp } from "./Instruments.tsx";
import s from "./editor.module.css";

function Card({ p, session, reduce }: { readonly p: ReleaseProposal; readonly session: ReleaseSessionApi; readonly reduce: boolean }) {
  const v = shown(p.path, p.value);
  const label = fieldLabel(p.path);
  return (
    <motion.div
      layout={!reduce}
      className={s.signal}
      role="group"
      aria-label={`suggested ${label}`}
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}
      transition={{ duration: reduce ? 0 : 0.24 }}
    >
      <span className={s.sigHead}>
        <Lamp tone="violet" on />
        <span className={s.sigField}>{label}</span>
      </span>
      {v.kind === "text" ? (
        <span className={s.sigValue}>{v.text}</span>
      ) : (
        <span className={s.sigFacts}>
          {v.facts.map((f) => (
            <Chip key={`${f.k}:${f.v}`} label={`${f.k} · ${f.v}`} casing="lower" tone="violet" />
          ))}
        </span>
      )}
      <span className={s.sigSource}>{p.source}</span>
      <span className={s.sigActs}>
        <Button label="Accept" size="sm" tone="emerald" onPress={() => session.accept([p.id])} />
        <Button label="Dismiss" size="sm" onPress={() => session.dismiss([p.id])} />
      </span>
    </motion.div>
  );
}

/** The signals on one field (or several paths, for a section that answers more than one). */
export function Signals({ paths, session, reduce }: { readonly paths: readonly ProposalPath[]; readonly session: ReleaseSessionApi; readonly reduce: boolean }) {
  const mine = session.pending.filter((p) => paths.includes(p.path));
  return (
    <AnimatePresence initial={false}>
      {mine.map((p) => (
        <Card key={p.id} p={p} session={session} reduce={reduce} />
      ))}
    </AnimatePresence>
  );
}

/** Whether a field has a signal waiting: its cell takes the violet edge. */
export const signalled = (session: ReleaseSessionApi, path: ProposalPath): boolean => session.pending.some((p) => p.path === path);
