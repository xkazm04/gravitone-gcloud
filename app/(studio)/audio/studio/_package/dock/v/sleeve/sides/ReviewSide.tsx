"use client";

// The run-out, the review: the back cover as it would print - tracklist with lengths, who wrote it, the ℗ line, where it
// is available, the catalogue line - from the same model Schedule commits (registry wizard-flows/commit-boundary);
// beside it the errata slip (every rule in the store's words, each a door to the side that fixes it), the Calendar
// slots Publish would create, and Schedule, which only a release with nothing blocking may press.
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { CHANNEL_NAMES } from "@gt/domain/release";
import { releaseReady } from "@gt/domain/release.problems";

import { plannedSlots } from "../../../../../../_release/draft.ts";
import { clock, day } from "../../../../../../_release/wizard/fmt.ts";
import { CHANNEL_ENTRY, STATUS_ENTRY } from "../../../../../../_release/wizard/status.ts";
import { catalogueOf, lengthOf, phonogramOf, type SideProps } from "../liner.ts";
import { Errata, PAPER_STOCK, Printed, WriteIn } from "../Print.tsx";
import s from "./side.module.css";

export function ReviewSide({ release: r, read, problems, dispatch, go, fresh }: SideProps) {
  const reduce = useReducedMotion() === true;
  const blocks = problems.filter((p) => p.severity === "block");
  const warns = problems.filter((p) => p.severity === "warn");
  const ready = releaseReady(problems);
  const slots = plannedSlots(r, read.channels);
  const writers = [...new Set(r.tracks.flatMap((t) => t.songwriters.map((w) => w.trim()).filter((w) => w !== "")))];
  const scheduled = r.status === "scheduled" || r.status === "published";
  return (
    <div className={s.review}>
      <section className={`${s.back} ${PAPER_STOCK}`} aria-label="back cover">
        <ol className={s.backList} aria-label="tracklist">
          {r.tracks.map((t, i) => (
            <motion.li key={t.takeId} className={s.backTrack} initial={fresh && !reduce ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(i, 10) * 0.04 }}>
              <span className={s.no}>{i + 1}</span>
              <Printed text={t.title.trim() === "" ? `track ${i + 1}` : t.title} />
              <span className={s.leader} aria-hidden="true" />
              <span className={s.dur}>{clock(t.durationS)}</span>
            </motion.li>
          ))}
          {r.tracks.length === 0 && <Chip label="no tracks" ghost />}
        </ol>
        <span className={s.backTotal}>
          <span className={s.totalTerm}>total</span>
          <span className={s.dur}>{lengthOf(r)}</span>
        </span>
        <dl className={s.backCredits}>
          <dt>written by</dt>
          <dd>{writers.length === 0 ? <WriteIn what="songwriters" /> : <Printed text={writers.join(", ")} face="sans" />}</dd>
          <dt>genre</dt>
          <dd>{r.genre.primary === null ? <WriteIn what="genre" /> : <Printed text={[r.genre.primary, r.genre.secondary].filter((g) => g !== null).join(" / ")} face="sans" />}</dd>
          <dt>available on</dt>
          <dd>{r.channels.length === 0 ? <WriteIn what="channels" /> : <Printed text={r.channels.map((c) => CHANNEL_NAMES[c]).join(" · ")} face="sans" />}</dd>
        </dl>
        <span className={s.backFine}>
          <span>{phonogramOf(r)}</span>
          <span>{catalogueOf(r)}</span>
          {r.upc !== null && <span>UPC {r.upc}</span>}
        </span>
      </section>
      <section className={s.slip} aria-label="what Schedule commits">
        {problems.length === 0 ? <Chip label="nothing to fix" tone="emerald" dot /> : <Errata problems={[...blocks, ...warns]} label="errata" onGo={(step, track) => go(step, track ?? undefined)} />}
        <div className={s.slots}>
          <h3 className={s.blockHead}>calendar</h3>
          {slots.length === 0 ? (
            <Chip label="no channel picked" ghost />
          ) : (
            <ul className={s.slotList}>
              {slots.map((sl) => (
                <li key={sl.channel} className={s.slot}>
                  <span className={s.slotName}>{CHANNEL_NAMES[sl.channel]}</span>
                  <span className={s.code}>{sl.at === null ? "when processed" : day(sl.at)}</span>
                  <EntryPill entry={CHANNEL_ENTRY[sl.state]} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={s.commit}>
          <EntryPill entry={STATUS_ENTRY[r.status]} />
          <Button
            label={scheduled ? "Scheduled" : "Schedule"}
            tone="emerald"
            disabled={!ready || scheduled}
            {...(ready ? (warns.length > 0 ? { badge: { label: "warn", value: warns.length, tone: "amber" as const } } : {}) : { badge: { label: "block", value: blocks.length, tone: "rose" as const } })}
            onPress={() => dispatch({ type: "schedule", id: r.id })}
          />
        </div>
      </section>
    </div>
  );
}
