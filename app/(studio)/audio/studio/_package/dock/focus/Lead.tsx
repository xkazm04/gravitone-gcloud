"use client";

// THE LEAD (variant "focus"): the one thing a step needs now, large and alone at the top of its body, with one primary
// act and at most one secondary. It is the only saturated region on the screen: its kind sets a thin edge, a dot and a
// faint wash (rose block, amber warn, violet agent, emerald ready). When it is answered the next one takes its slot
// (AnimatePresence, keyed by the lead's identity); when nothing is left it shrinks to a quiet `clear` mark and the
// read below rises into its place. Everything beyond the lead - the rule's sentence, the agent's source, the other
// problems and suggestions - is one press away, behind `details`. Kit candidate `NextAction`.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import type { Release } from "@gt/domain/release";
import type { ProblemCode, ReleaseProblem } from "@gt/domain/release.problems";

import { stepOfPath } from "../../../../_release/pending.ts";
import { shown } from "../../../../_release/wizard/Suggest.tsx";
import { day } from "../../../../_release/wizard/fmt.ts";
import { STEP_LABEL, stepOf, type StepId } from "../../../../_release/wizard/steps.ts";
import { fieldOf, PROBLEM_SHORT, whereOf, type Lead as LeadModel } from "./lead.ts";
import s from "./focus.module.css";

export interface LeadActs {
  readonly accept: (proposalId: string) => void;
  readonly dismiss: (proposalId: string) => void;
  /** Open the editor that fixes a problem (on the review: go to its step). */
  readonly fix: (p: ReleaseProblem) => void;
  readonly details: () => void;
  readonly schedule: () => void;
}

/** The fix's verb where "Fix" says less than the act: the editor it opens makes, adds or picks. */
const FIX_LABEL: Partial<Record<ProblemCode, string>> = { "sleeve-missing": "Make sleeve", "no-tracks": "Add tracks", "no-channel": "Pick channels", "splits-not-100": "Edit splits" };
const KIND_WORD = { block: "block", warn: "warn", agent: "agent", ready: "ready", clear: "clear" } as const;
const cap = (x: string): string => (x === "" ? x : `${x[0]?.toUpperCase() ?? ""}${x.slice(1)}`);

/** The one fact of a whole-record value that answers the problem: `artist is an AI persona`, `plan tier Pro`. */
const FACT_FOR: Partial<Record<ProblemCode, string>> = { "persona-unstated": "artist is", "rights-unknown-tier": "plan tier", "rights-unknown-vendor": "generator", "rights-unknown-licence": "licence", "rights-nc-licence": "licence" };

function valueText(path: Parameters<typeof shown>[0], value: unknown, code: ProblemCode | null): string {
  const v = shown(path, value);
  if (v.kind === "text") return v.text;
  const k = code === null ? undefined : FACT_FOR[code];
  const hit = k === undefined ? undefined : v.facts.find((f) => f.k === k);
  return hit !== undefined ? `${hit.k} ${hit.v}` : v.facts.map((f) => f.v).join(" · ");
}

function Body({ lead, step, release, slots, acts }: { readonly lead: LeadModel; readonly step: StepId; readonly release: Release; readonly slots: number; readonly acts: LeadActs }) {
  const review = step === "review";
  const p = lead.problem;
  const q = lead.proposal;
  const title = p !== null ? PROBLEM_SHORT[p.code] : q !== null ? cap(fieldOf(q.path).name) : release.releaseDate === null ? "When processed" : day(release.releaseDate);
  const where = p !== null ? whereOf(p, release, review) : q !== null ? `${review ? `${STEP_LABEL[stepOfPath(q.path)]} · ` : ""}${fieldOf(q.path).at}` : `${slots} ${slots === 1 ? "slot" : "slots"}`;
  return (
    <>
      <div className={s.leadTop}>
        <span className={s.leadMark}>
          <span className={s.leadDot} aria-hidden="true" />
          {KIND_WORD[lead.kind]}
        </span>
        <span className={s.leadAt}>{where}</span>
      </div>
      <h3 className={s.leadTitle}>{title}</h3>
      {lead.kind === "ready" && lead.rest > 0 && (
        <p className={s.leadValue} data-agent="">
          <span className={s.leadWarn}>{`${lead.rest} warn`}</span>
        </p>
      )}
      {q !== null && (
        <p className={s.leadValue} data-agent={p !== null ? "" : undefined}>
          {p !== null && <span className={s.agentDot} aria-label="the agent's value" role="img" />}
          <span className={s.leadValueText}>{valueText(q.path, q.value, p?.code ?? null)}</span>
        </p>
      )}
      <div className={s.leadActs}>
        {q !== null && <Button label="Accept" tone="emerald" size="lg" solid onPress={() => acts.accept(q.id)} />}
        {q !== null && p === null && <Button label="Dismiss" size="lg" onPress={() => acts.dismiss(q.id)} />}
        {p !== null && <Button label={review ? `Open ${STEP_LABEL[stepOf(p)]}` : q !== null ? "Edit" : (FIX_LABEL[p.code] ?? "Fix")} tone={q !== null ? "neutral" : "cyan"} size="lg" solid={q === null} onPress={() => acts.fix(p)} />}
        {lead.kind === "ready" && <Button label="Schedule" tone="emerald" size="lg" solid onPress={acts.schedule} />}
        <button type="button" className={s.leadMore} onClick={acts.details} aria-label={lead.rest > 0 ? `details, ${lead.rest} more` : "details"}>
          details
          {lead.rest > 0 && (
            <b className={s.leadCount} aria-hidden="true">
              {lead.rest}
            </b>
          )}
        </button>
      </div>
    </>
  );
}

export function Lead(props: { readonly lead: LeadModel; readonly step: StepId; readonly release: Release; readonly slots: number; readonly acts: LeadActs }) {
  const reduce = useReducedMotion();
  const { lead } = props;
  const t = reduce ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0, 0, 1] as const };
  const from = reduce ? { opacity: 1 } : { opacity: 0, y: 10 };
  const away = reduce ? { opacity: 0 } : { opacity: 0, y: -10 };
  return (
    <div className={s.leadSlot}>
      <AnimatePresence mode="wait" initial={false}>
        {lead.kind === "clear" ? (
          <motion.p key="clear" className={s.clear} initial={from} animate={{ opacity: 1, y: 0 }} exit={away} transition={t}>
            <span className={s.clearDot} aria-hidden="true" />
            {props.step === "review" ? props.release.status : "clear"}
          </motion.p>
        ) : (
          <motion.section key={lead.key} className={s.lead} data-kind={lead.kind} aria-label="next" initial={from} animate={{ opacity: 1, y: 0 }} exit={away} transition={t}>
            <Body {...props} />
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
