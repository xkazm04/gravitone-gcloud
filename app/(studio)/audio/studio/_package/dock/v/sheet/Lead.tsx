"use client";

// THE LEAD (variant "sheet"): the one place on a step that carries state. A slim bar above the sheet - one small mark in
// the state's hue, the state in a word or two, the first item's subject, the counts as numbers, and one button that
// opens the dialog with exactly those items. The list (`LeadList`) is the dialog's body: each problem in the store's
// own words (PROBLEM_TEXT, verbatim) with a door to the section's editor, each proposal with accept / dismiss.
// Kit candidates: LeadBar { tone, word, focus, counts, action }, ItemList.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import type { Release } from "@gt/domain/release";
import { PROBLEM_TEXT, type ReleaseProblem } from "@gt/domain/release.problems";

import type { ReleaseSessionApi } from "../../../../../_release/session.ts";
import { STEP_LABEL, trackIndexOf } from "../../../../../_release/wizard/steps.ts";
import { SECTION_LABEL, SECTION_STEP, sectionOfProblem, type Lead, type SectionId, type Tone } from "./model.ts";
import { ProposalRow } from "./Proposal.tsx";
import d from "./dialog.module.css";
import s from "./lead.module.css";

const WORD: Readonly<Record<Tone, string>> = { block: "To fix", warn: "To check", agent: "Suggested", clear: "Clear" };
const ACTION: Readonly<Record<Tone, string>> = { block: "Fix", warn: "Check", agent: "Review", clear: "" };

export function counts(lead: Lead): string {
  return [lead.blocks.length > 0 ? `${lead.blocks.length} to fix` : "", lead.warns.length > 0 ? `${lead.warns.length} to check` : "", lead.suggested.length > 0 ? `${lead.suggested.length} suggested` : ""]
    .filter((x) => x !== "")
    .join(" · ");
}

export function LeadBar({ lead, clearWord, onOpen }: { readonly lead: Lead; readonly clearWord?: string; readonly onOpen: () => void }) {
  const reduce = useReducedMotion();
  const word = lead.tone === "clear" ? (clearWord ?? WORD.clear) : WORD[lead.tone];
  return (
    <div className={s.lead} data-tone={lead.tone} role="status" aria-label="this step">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${lead.tone}:${lead.focus ?? ""}`}
          className={s.leadIn}
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4 }}
          transition={{ duration: reduce ? 0 : 0.16 }}
        >
          <span className={s.mark} aria-hidden="true" />
          <span className={s.word}>{word}</span>
          {lead.focus !== null && <span className={s.focus}>{lead.focus}</span>}
          <span className={s.counts}>{counts(lead)}</span>
        </motion.div>
      </AnimatePresence>
      {lead.tone !== "clear" && (
        <span className={s.act}>
          <Button label={ACTION[lead.tone]} size="sm" tone="cyan" tally={{ value: lead.total }} onPress={onOpen} />
        </span>
      )}
    </div>
  );
}

function ProblemRow({ p, release, review, onEdit }: { readonly p: ReleaseProblem; readonly release: Release; readonly review: boolean; readonly onEdit: (section: SectionId, track: number | null) => void }) {
  const section = sectionOfProblem(p);
  const ti = trackIndexOf(p);
  const where = [review ? STEP_LABEL[SECTION_STEP[section]] : "", ti === null || release.tracks.length < 2 ? "" : `track ${ti + 1} · ${release.tracks[ti]?.title ?? ""}`].filter((x) => x !== "").join(" · ");
  return (
    <div className={d.item} data-tone={p.severity}>
      <span className={d.dot} aria-hidden="true" />
      <div className={d.itemBody}>
        <span className={d.rule}>{PROBLEM_TEXT[p.code]}</span>
        {where !== "" && <span className={d.source}>{where}</span>}
      </div>
      <span className={d.itemActs}>
        <Button label={SECTION_LABEL[section]} size="sm" glyphAfter="chevR" onPress={() => onEdit(section, ti)} />
      </span>
    </div>
  );
}

function Group({ title, n, children }: { readonly title: string; readonly n: number; readonly children: ReactNode }) {
  if (n === 0) return null;
  return (
    <section className={d.group} aria-label={title}>
      <h3 className={d.groupHead}>
        {title} <span className={d.groupN}>{n}</span>
      </h3>
      <ul className={d.items}>{children}</ul>
    </section>
  );
}

export function LeadList({ lead, release, session, review, onEdit }: {
  readonly lead: Lead;
  readonly release: Release;
  readonly session: ReleaseSessionApi;
  readonly review: boolean;
  readonly onEdit: (section: SectionId, track: number | null) => void;
}) {
  const reduce = useReducedMotion();
  const leave = reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0, transition: { duration: 0.18 } };
  return (
    <div className={d.list}>
      <Group title="To fix" n={lead.blocks.length}>
        {lead.blocks.map((p, i) => (
          <li key={`${p.code}:${p.at}:${i}`}>
            <ProblemRow p={p} release={release} review={review} onEdit={onEdit} />
          </li>
        ))}
      </Group>
      <Group title="To check" n={lead.warns.length}>
        {lead.warns.map((p, i) => (
          <li key={`${p.code}:${p.at}:${i}`}>
            <ProblemRow p={p} release={release} review={review} onEdit={onEdit} />
          </li>
        ))}
      </Group>
      <Group title="Suggested" n={lead.suggested.length}>
        <AnimatePresence initial={false}>
          {lead.suggested.map((p) => (
            <motion.li key={p.id} exit={leave} className={d.clip}>
              <ProposalRow p={p} session={session} />
            </motion.li>
          ))}
        </AnimatePresence>
      </Group>
    </div>
  );
}
