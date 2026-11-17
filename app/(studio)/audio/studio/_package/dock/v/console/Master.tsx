"use client";

// THE MASTER SECTION (prototype dock-package, "console"): the review, at the end of the desk where a console keeps its
// master fader. A bus lamp per input strip, the release's totals on counters, the readiness meter, the Calendar slots
// Schedule would create (one per armed channel, plannedSlots), and Schedule itself - pressable only when nothing
// blocks (registry wizard-flows/commit-boundary: the commit reads the same model every strip reads).
import { motion } from "motion/react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { CHANNEL_NAMES, type ChannelRow, type Release } from "@gt/domain/release";
import { releaseReady, type ReleaseProblem } from "@gt/domain/release.problems";
import type { ReleaseProposal } from "@gt/domain/release.record";

import { plannedSlots } from "../../../../../_release/draft.ts";
import { day } from "../../../../../_release/wizard/fmt.ts";
import { CHANNEL_ENTRY, STATUS_ENTRY } from "../../../../../_release/wizard/status.ts";
import { STEP_LABEL, severityOf } from "../../../../../_release/wizard/steps.ts";
import { Face, spokenFace } from "./Face.tsx";
import { Lamp, LEVEL_TONE, LedMeter, TickCounter } from "./Instruments.tsx";
import { levelOf, type StripModel } from "./strips.ts";
import s from "./master.module.css";
import st from "./strip.module.css";

const BUS: Readonly<Record<string, string>> = { tracks: "trk", details: "det", rights: "rts", sleeve: "slv", channels: "chn", extras: "ext" };

export interface MasterProps {
  readonly release: Release;
  readonly problems: readonly ReleaseProblem[];
  readonly pending: readonly ReleaseProposal[];
  readonly strips: readonly StripModel[];
  readonly channels: readonly ChannelRow[];
  readonly lifted: boolean;
  readonly selected: boolean;
  readonly reduce: boolean;
  readonly onOpen: () => void;
  readonly onSchedule: () => void;
}

/** Schedule, and the status it moves: pressable only when nothing blocks; warnings ride along on its badge. */
export function Commit({ release: r, problems, onSchedule }: { readonly release: Release; readonly problems: readonly ReleaseProblem[]; readonly onSchedule: () => void }) {
  const sev = severityOf(problems);
  const ready = releaseReady(problems);
  const scheduled = r.status === "scheduled" || r.status === "published";
  return (
    <div className={s.commit}>
      <EntryPill entry={STATUS_ENTRY[r.status]} />
      <Button
        label={scheduled ? "Scheduled" : "Schedule"}
        tone="emerald"
        disabled={!ready || scheduled}
        badge={ready ? (sev.warn > 0 ? { label: "warn", value: sev.warn, tone: "amber" } : undefined) : { label: "block", value: sev.block, tone: "rose" }}
        onPress={onSchedule}
      />
    </div>
  );
}

export function Master({ release: r, problems, pending, strips, channels, lifted, selected, reduce, onOpen, onSchedule }: MasterProps) {
  const sev = severityOf(problems);
  const ready = releaseReady(problems);
  const clearStrips = strips.filter((x) => x.sev.block === 0).length;
  const slots = plannedSlots(r, channels);
  const state = { step: "review" as const, sev, level: levelOf(sev), incoming: pending.length };
  return (
    <motion.section
      className={`${st.strip} ${s.master}`}
      data-level={state.level}
      data-ready={ready}
      data-selected={selected}
      aria-label="master"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.32, delay: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {selected && (reduce ? <span className={st.selectEdge} aria-hidden="true" /> : <motion.span layoutId="console-select" className={st.selectEdge} aria-hidden="true" transition={{ type: "spring", stiffness: 500, damping: 40 }} />)}
      <button type="button" className={st.faceBtn} onClick={onOpen} aria-label={`${spokenFace(state)}, open`} aria-haspopup="dialog">
        {lifted ? <Face state={state} morph={false} place="socket" /> : <Face state={state} morph={!reduce} place="strip" />}
      </button>
      <div className={s.desk}>
        <LedMeter value={clearStrips / Math.max(1, strips.length)} level={ready ? (sev.warn > 0 ? "warn" : "clear") : "block"} label="readiness" text={`${clearStrips} of ${strips.length} steps clear`} segments={16} />
        <div className={s.col}>
          <div className={s.bus} aria-label="steps" role="list">
            {strips.map((x) => (
              <span key={x.step} role="listitem" aria-label={`${STEP_LABEL[x.step]} ${x.level}`}>
                <Lamp tone={LEVEL_TONE[x.level]} on label={BUS[x.step] ?? x.step} />
              </span>
            ))}
          </div>
          <dl className={s.totals}>
            <div className={s.total} data-tone="rose" data-on={sev.block > 0}>
              <dt>block</dt>
              <dd>
                <TickCounter value={sev.block} />
              </dd>
            </div>
            <div className={s.total} data-tone="amber" data-on={sev.warn > 0}>
              <dt>warn</dt>
              <dd>
                <TickCounter value={sev.warn} />
              </dd>
            </div>
            <div className={s.total} data-tone="violet" data-on={pending.length > 0}>
              <dt>signal</dt>
              <dd>
                <TickCounter value={pending.length} />
              </dd>
            </div>
          </dl>
          <section className={s.slots} aria-label="calendar slots">
            <span className={s.k}>slots · {slots.length}</span>
            {slots.length === 0 ? (
              <span className={s.none}>no channel armed</span>
            ) : (
              <ul className={s.slotList}>
                {slots.map((sl) => (
                  <li key={sl.channel} className={s.slot}>
                    <span className={s.slotName}>{CHANNEL_NAMES[sl.channel]}</span>
                    <span className={s.slotAt}>{sl.at === null ? "on process" : day(sl.at)}</span>
                    <EntryPill entry={CHANNEL_ENTRY[sl.state]} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      <div className={s.commitRow}>
        <Commit release={r} problems={problems} onSchedule={onSchedule} />
      </div>
    </motion.section>
  );
}
