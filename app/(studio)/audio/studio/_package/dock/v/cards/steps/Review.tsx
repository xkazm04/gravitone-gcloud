"use client";

// THE REVIEW CARD: the release as Schedule would commit it - sleeve, title, figures and the verdict (ready, or what
// blocks it) - the Calendar slots Publish would create, one per picked channel, and Schedule itself, which only a
// release with nothing blocking may press. Every problem and every pending suggestion is already on the card above
// this body (DecisionCard gathers all of them on the review), each a door to the step that fixes it.
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { CHANNEL_NAMES } from "@gt/domain/release";
import { releaseReady } from "@gt/domain/release.problems";

import { plannedSlots } from "../../../../../../_release/draft.ts";
import { day } from "../../../../../../_release/wizard/fmt.ts";
import { CHANNEL_ENTRY, STATUS_ENTRY } from "../../../../../../_release/wizard/status.ts";
import type { StepProps } from "../../../../../../_release/wizard/steps.ts";
import { Door } from "../Door.tsx";
import { Figure } from "../Figure.tsx";
import { summaryOf, titleOf } from "../model.ts";
import { SETTLE } from "../motion.ts";
import s from "./steps.module.css";

export function ReviewBody({ release: r, read, problems, dispatch }: StepProps) {
  const reduce = useReducedMotion() === true;
  const blocks = problems.filter((p) => p.severity === "block").length;
  const warns = problems.filter((p) => p.severity === "warn").length;
  const ready = releaseReady(problems);
  const slots = plannedSlots(r, read.channels);
  const scheduled = r.status === "scheduled" || r.status === "published";
  const genre = [r.genre.primary, r.genre.secondary].filter((g) => g !== null).join(" / ");
  return (
    <div className={s.body}>
      <div className={s.verdict} data-ready={ready ? "" : undefined}>
        {r.sleeve !== null && r.sleeve.href !== null ? <Plate src={r.sleeve.href} alt={`sleeve of ${r.title}`} className={s.verdictArt} width={200} aspect={1} /> : <PlateMissing label="no sleeve" className={s.verdictArt} aspect={1} />}
        <div className={s.verdictText}>
          <span className={s.verdictTitle}>
            {titleOf(r)}
            {r.version !== null && <span className={s.trackVersion}>{r.version}</span>}
          </span>
          <span className={s.sealChips}>
            {summaryOf("tracks", r).map((x) => (
              <Chip key={x} label={x} casing="lower" />
            ))}
            {genre !== "" && <Chip label={genre} casing="lower" />}
            <Chip label="UPC" value={r.upc ?? "none"} casing="lower" />
          </span>
          <motion.span key={`${blocks}:${warns}`} className={s.verdictMarks} initial={reduce ? false : { scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SETTLE}>
            <Figure value={ready ? "ready" : blocks} label={ready ? "nothing blocks" : blocks === 1 ? "block" : "blocks"} tone={ready ? "ok" : "block"} />
            {warns > 0 && <Figure value={warns} label={warns === 1 ? "warning" : "warnings"} tone="warn" />}
            <Figure value={r.releaseDate === null ? "—" : day(r.releaseDate)} label="date" />
          </motion.span>
        </div>
      </div>
      <section className={s.sub} aria-label="calendar slots">
        <span className={s.subHead}>
          <span className={s.k}>calendar slots · {slots.length}</span>
          {slots.some((x) => x.detail !== null) && (
            <Door name="calendar slot detail" title="Calendar slots" word="detail">
              <ul className={s.rules}>
                {slots.map((x) => (
                  <li key={x.channel}>
                    <Chip label={CHANNEL_NAMES[x.channel]} casing="lower" />
                    <EntryPill entry={CHANNEL_ENTRY[x.state]} />
                    {x.detail !== null && <span>{x.detail}</span>}
                  </li>
                ))}
              </ul>
            </Door>
          )}
        </span>
        {slots.length === 0 ? (
          <Chip label="no channel picked" ghost />
        ) : (
          <ul className={s.slots}>
            {slots.map((x) => (
              <li key={x.channel} className={s.slot}>
                <span className={s.slotName}>{CHANNEL_NAMES[x.channel]}</span>
                <span className={s.num}>{x.at === null ? "when processed" : day(x.at)}</span>
                <EntryPill entry={CHANNEL_ENTRY[x.state]} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className={s.commit}>
        <EntryPill entry={STATUS_ENTRY[r.status]} />
        <Button
          label={scheduled ? "Scheduled" : "Schedule"}
          tone="emerald"
          disabled={!ready || scheduled}
          badge={ready ? (warns > 0 ? { label: "warn", value: warns, tone: "amber" } : undefined) : { label: "block", value: blocks, tone: "rose" }}
          onPress={() => dispatch({ type: "schedule", id: r.id })}
        />
      </div>
    </div>
  );
}
