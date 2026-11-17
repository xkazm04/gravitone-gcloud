"use client";

// THE MARGIN (direction "sleeve"): the agent's pending proposals as pencilled notes beside the side they would change -
// the field, the value in a pencil hand, Accept (into print) or Dismiss, and the agent's source on a printed card.
// An accepted note leaves toward the page it was printed into; a dismissed one lifts off. Nothing is written until the
// operator accepts (owner, wave 2: pending per field); the notes are `session.pending`, derived, never held here.
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import type { ReleaseProposal } from "@gt/domain/release.record";

import { fieldLabel } from "../../../../../_release/pending.ts";
import type { ReleaseSessionApi } from "../../../../../_release/session.ts";
import { day } from "../../../../../_release/wizard/fmt.ts";
import { shown } from "../../../../../_release/wizard/Suggest.tsx";
import { PencilMark } from "./Print.tsx";
import { FormRule, PrintedCard } from "./PrintedCard.tsx";
import c from "./card.module.css";
import m from "./margin.module.css";

type Leave = "accept" | "dismiss";

const note: Variants = {
  enter: { opacity: 0, x: 14, rotate: -0.6 },
  rest: { opacity: 1, x: 0, rotate: -0.6 },
  gone: (how: Leave) => (how === "accept" ? { opacity: 0, x: -36, rotate: 0, transition: { duration: 0.32 } } : { opacity: 0, y: -10, transition: { duration: 0.22 } }),
};

/** The value as the pencil writes it: text, or the facts of an object value as chips. */
function Pencilled({ p }: { readonly p: ReleaseProposal }) {
  const v = shown(p.path, p.value);
  if (v.kind === "text") return <span className={m.hand}>{v.text}</span>;
  return (
    <span className={m.facts}>
      {v.facts.map((f) => (
        <Chip key={`${f.k}:${f.v}`} label={f.v} casing="lower" tone="violet" name={`${f.k} ${f.v}`} />
      ))}
    </span>
  );
}

function SourceCard({ p, onClose, onLeave }: { readonly p: ReleaseProposal | null; readonly onClose: () => void; readonly onLeave: (how: Leave, ids: readonly string[]) => void }) {
  const label = p === null ? "" : fieldLabel(p.path);
  return (
    <PrintedCard
      open={p !== null}
      onClose={onClose}
      title={label}
      wide
      mark={p === null ? "" : `pencilled${p.turnId === null ? "" : ` · ${p.turnId}`} · ${day(p.at.slice(0, 10))}`}
      foot={
        p === null ? undefined : (
          <span className={c.acts}>
            <Button label="Dismiss" size="sm" onPress={() => onLeave("dismiss", [p.id])} />
            <Button label="Accept" size="sm" tone="emerald" onPress={() => onLeave("accept", [p.id])} />
          </span>
        )
      }
    >
      {p !== null && (
        <>
          <FormRule title="value">
            <div className={c.cell} data-w="full">
              <Pencilled p={p} />
            </div>
          </FormRule>
          <FormRule title="source">
            <div className={c.cell} data-w="full">
              <blockquote className={c.quote}>{p.source}</blockquote>
            </div>
          </FormRule>
        </>
      )}
    </PrintedCard>
  );
}

/** One side's pencilled notes, with accept-all; nothing drawn when the side has none. */
export function Margin({ notes, session, side }: { readonly notes: readonly ReleaseProposal[]; readonly session: ReleaseSessionApi; readonly side: string }) {
  const reduce = useReducedMotion() === true;
  const [how, setHow] = useState<Leave>("accept");
  const [open, setOpen] = useState<string | null>(null);
  const leave = (h: Leave, ids: readonly string[]) => {
    setHow(h);
    setOpen(null);
    if (h === "accept") session.accept(ids);
    else session.dismiss(ids);
  };
  const opened = notes.find((p) => p.id === open) ?? null;
  return (
    <aside className={m.margin} aria-label={`pencilled on ${side}`} data-empty={notes.length === 0 ? "" : undefined}>
      {notes.length > 0 && (
        <header className={m.head}>
          <PencilMark say={null} />
          <span className={m.headWord}>pencilled</span>
          <Tally value={notes.length} />
          {notes.length > 1 && <Button label="Accept all" size="sm" tone="emerald" tally={{ value: notes.length }} onPress={() => leave("accept", notes.map((p) => p.id))} />}
        </header>
      )}
      <ul className={m.notes}>
        <AnimatePresence initial={false} custom={how}>
          {notes.map((p) => (
            <motion.li
              key={p.id}
              className={m.note}
              layout={!reduce}
              custom={how}
              variants={note}
              initial={reduce ? false : "enter"}
              animate="rest"
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : "gone"}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className={m.field}>{fieldLabel(p.path)}</span>
              <Pencilled p={p} />
              <span className={m.acts}>
                <Button label="Accept" size="sm" tone="emerald" onPress={() => leave("accept", [p.id])} />
                <Button label="Dismiss" size="sm" onPress={() => leave("dismiss", [p.id])} />
                <Chip label="source" casing="lower" tone="violet" ghost onPress={() => setOpen(p.id)} name={`source of the ${fieldLabel(p.path)} note`} />
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <SourceCard p={opened} onClose={() => setOpen(null)} onLeave={leave} />
    </aside>
  );
}
