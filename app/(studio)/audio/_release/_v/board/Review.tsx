"use client";

// The release before it goes: every problem by severity in the store's words, each one a way to
// where it is fixed; the Calendar slots Publish would create, one per channel; and Schedule, which
// only a release with nothing blocking can take. In S1 nothing leaves the page.
import { CHANNEL_NAMES } from "@gt/domain/release";
import { releaseReady, type ReleaseProblem } from "@gt/domain/release.problems";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";

import { plannedSlots } from "../../draft.ts";
import { SECTION_LABEL, sectionOf, severityOf, shortDate, trackNo, type SectionProps } from "./board.ts";
import { ChanMark, SeverityChips } from "./Card.tsx";
import { StateChip } from "./Channels.tsx";
import { ProblemLine } from "./Sheet.tsx";
import s from "./sheet.module.css";

function where(p: ReleaseProblem, titles: readonly string[]): string {
  const n = trackNo(p);
  if (n !== null) return `${String(n).padStart(2, "0")} ${titles[n - 1] ?? ""}`;
  const sec = sectionOf(p);
  return sec === "head" ? "release" : SECTION_LABEL[sec];
}

function Group({ label, items, titles, jump }: { readonly label: string; readonly items: readonly ReleaseProblem[]; readonly titles: readonly string[]; readonly jump: (p: ReleaseProblem) => void }) {
  if (items.length === 0) return null;
  return (
    <div className={s.group}>
      <CapsHeading text={label} tally={{ value: items.length }} variant="section" />
      <ul className={s.problems}>
        {items.map((p) => (
          <li key={`${p.code}:${p.at}`} className={s.problem}>
            <span className={s.where}>{where(p, titles)}</span>
            <ProblemLine problem={p} onJump={() => jump(p)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Review({ release: r, problems, read, dispatch, jump }: SectionProps) {
  const ready = releaseReady(problems);
  const slots = plannedSlots(r, read.channels);
  const titles = r.tracks.map((t) => t.title);
  const scheduled = r.status === "scheduled" || r.status === "published";
  return (
    <div className={s.review}>
      <div className={s.reviewHead}>
        <SeverityChips sev={severityOf(problems)} />
        <span className={s.grow} />
        {scheduled ? (
          <Chip label={r.status} tone="violet" dot />
        ) : (
          <Button label="schedule" tone="violet" disabled={!ready} tally={{ value: slots.length, label: "slots" }} onPress={() => dispatch({ type: "schedule", id: r.id })} />
        )}
      </div>
      <Group label="blocks" items={problems.filter((p) => p.severity === "block")} titles={titles} jump={jump} />
      <Group label="warnings" items={problems.filter((p) => p.severity === "warn")} titles={titles} jump={jump} />
      <div className={s.group}>
        <CapsHeading text="calendar" tally={{ value: slots.length, label: "slots" }} variant="section" />
        {slots.length === 0 ? (
          <Empty label="no channel picked" />
        ) : (
          <ul className={s.slots}>
            {slots.map((x) => (
              <li key={x.channel} className={s.slot}>
                <ChanMark channel={x.channel} />
                <span className={s.slotName}>{CHANNEL_NAMES[x.channel]}</span>
                <span className={s.slotAt}>{x.at === null ? "no date" : shortDate(x.at)}</span>
                <StateChip state={x.state} />
                <span className={s.detail}>{x.detail ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
