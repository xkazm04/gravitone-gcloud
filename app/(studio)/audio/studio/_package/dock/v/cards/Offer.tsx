"use client";

// THE AGENT'S SUGGESTION AS THE CARD'S PRIMARY CHOICE (kit candidate `SuggestionOffer`): the field it would set, its
// value large, Accept as the big button and Dismiss beside it; the agent's source - its own words, the turn, the time -
// behind the agent door. Nothing is written until Accept. On accept the offer leaves and its value travels into the
// card (a shared `layoutId` the receiving tile wears once nothing is pending on its path).
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import type { ProposalPath, ReleaseProposal } from "@gt/domain/release.record";

import { fieldLabel } from "../../../../../_release/pending.ts";
import type { ReleaseSessionApi } from "../../../../../_release/session.ts";
import { shown } from "../../../../../_release/wizard/Suggest.tsx";
import { Door } from "./Door.tsx";
import { FOLD, INSTANT, SETTLE } from "./motion.ts";
import s from "./parts.module.css";

/** The id an offered value and the card value it lands in share. */
export const valueId = (path: ProposalPath): string => `cards-value:${path}`;

function Value({ p }: { readonly p: ReleaseProposal }) {
  const reduce = useReducedMotion() === true;
  const v = shown(p.path, p.value);
  if (v.kind === "facts") {
    return (
      <span className={s.offerFacts}>
        {v.facts.map((f) => (
          <Chip key={`${f.k}:${f.v}`} label={f.v} casing="lower" tone="violet" name={`${f.k} ${f.v}`} />
        ))}
      </span>
    );
  }
  return (
    <motion.span className={s.offerValue} data-long={v.text.length > 48 ? "" : undefined} {...(reduce ? {} : { layoutId: valueId(p.path), transition: SETTLE })}>
      {v.text}
    </motion.span>
  );
}

function Source({ p, label, session }: { readonly p: ReleaseProposal; readonly label: string; readonly session: ReleaseSessionApi }) {
  return (
    <Door name={`source of the suggested ${label}`} title={`Source · ${label}`} glyph="agent" tone="agent">
      <div className={s.rule}>
        <span className={s.ruleMarks}>
          <Chip label="agent" tone="violet" dot />
          {p.turnId !== null && <Chip label={p.turnId} casing="lower" name={`turn ${p.turnId}`} />}
          <Chip label={p.at.slice(0, 16).replace("T", " ")} casing="lower" name={`at ${p.at}`} />
        </span>
        <blockquote className={s.ruleText}>{p.source}</blockquote>
        <span className={s.ruleAct}>
          <Button label="Dismiss" size="sm" onPress={() => session.dismiss([p.id])} />
          <Button label="Accept" tone="emerald" onPress={() => session.accept([p.id])} />
        </span>
      </div>
    </Door>
  );
}

export function SuggestionOffer({ p, session, compact = false }: { readonly p: ReleaseProposal; readonly session: ReleaseSessionApi; readonly compact?: boolean }) {
  const label = fieldLabel(p.path);
  return (
    <div className={s.offer} data-compact={compact ? "" : undefined} role="group" aria-label={`suggested ${label}`}>
      <span className={s.offerField}>{label}</span>
      <span className={s.offerBody}>
        <Value p={p} />
      </span>
      <span className={s.offerActs}>
        <Source p={p} label={label} session={session} />
        <Button label="Dismiss" size="sm" onPress={() => session.dismiss([p.id])} />
        <Button label="Accept" tone="emerald" onPress={() => session.accept([p.id])} />
      </span>
    </div>
  );
}

/** A card's pending suggestions, each leaving with a spring when answered; `compact` (the review, which gathers every
 *  step's) sets each on one line. */
export function Offers({ pending, session, compact = false }: { readonly pending: readonly ReleaseProposal[]; readonly session: ReleaseSessionApi; readonly compact?: boolean }) {
  const reduce = useReducedMotion() === true;
  return (
    <ul className={s.offers} aria-label="suggested">
      <AnimatePresence initial={false}>
        {pending.map((p) => (
          <motion.li
            key={p.id}
            layout={reduce ? false : "position"}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0, transition: INSTANT } : { opacity: 0, scale: 0.97, transition: { duration: 0.16 } }}
            transition={reduce ? INSTANT : FOLD}
          >
            <SuggestionOffer p={p} session={session} compact={compact} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
