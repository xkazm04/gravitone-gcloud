"use client";

// THE CHECKLIST (prototype dock-package, round 2, variant "checklist"): a step's items as rows - name, one preview,
// one mark at the end - sorted so what needs the person comes first. The first row that asks something is the LEAD:
// raised, its one action visible; every other row stays quiet until hovered, and the whole row opens its detail.
// When a row's state changes (an accept, a fix) it moves to its new place and the lead plate slides to the next
// lead (`layout`, `layoutId`) - click-gated motion only, none under reduced motion.
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@gt/ui/components/button/Button.tsx";

import { leadOf, MARK_WORD, sorted, type Item, type Mark } from "./model.ts";
import c from "./checklist.module.css";

/** A state as one small shape (kit candidate `StateMark`): the colour is never the only signal. */
export function StateMark({ mark }: { readonly mark: Mark }) {
  return <span className={c.mark} data-mark={mark} aria-hidden="true" />;
}

const short = (v: string, n = 26): string => (v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v);

/** The lead's one action, in words. */
export function actLabel(it: Item): string {
  if (it.act === "accept") return it.suggested === null ? it.verb : `Accept · ${short(it.suggested)}`;
  return it.verb;
}

function Row({ it, lead, onOpen, onAct }: { readonly it: Item; readonly lead: boolean; readonly onOpen: (it: Item) => void; readonly onAct: (it: Item) => void }) {
  const reduce = useReducedMotion();
  const spoken = `${it.label}: ${it.value === "—" ? "not set" : it.value}, ${MARK_WORD[it.mark]}`;
  return (
    <motion.li
      layout={reduce ? false : "position"}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42 }}
      className={c.row}
      data-mark={it.mark}
      data-lead={lead ? "" : undefined}
    >
      {lead && <motion.span layoutId="checklist-lead" className={c.leadPlate} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }} aria-hidden="true" />}
      <button type="button" className={c.open} onClick={() => onOpen(it)} aria-haspopup="dialog" aria-label={spoken}>
        <span className={c.label}>{it.label}</span>
        <span className={c.value}>{it.value}</span>
      </button>
      {lead && (
        <span className={c.act}>
          <Button label={actLabel(it)} tone="cyan" {...(it.act === "open" || it.act === "go" ? { glyphAfter: "chevR" as const } : {})} onPress={() => onAct(it)} />
        </span>
      )}
      <span className={c.chev} aria-hidden="true">
        ›
      </span>
      <StateMark mark={it.mark} />
    </motion.li>
  );
}

export function ItemList({ items, label, onOpen, onAct }: { readonly items: readonly Item[]; readonly label: string; readonly onOpen: (it: Item) => void; readonly onAct: (it: Item) => void }) {
  const rows = sorted(items);
  const lead = leadOf(rows);
  return (
    <ul className={c.list} aria-label={label}>
      {rows.map((it) => (
        <Row key={it.id} it={it} lead={it === lead} onOpen={onOpen} onAct={onAct} />
      ))}
    </ul>
  );
}
