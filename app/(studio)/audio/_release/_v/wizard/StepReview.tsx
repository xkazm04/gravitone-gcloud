"use client";

// Step 8, review: the whole draft, assembled from the same model Schedule commits (registry
// wizard-flows/commit-boundary) - every problem in the store's words, each a door to the step that
// fixes it; the Calendar slots Publish would create, one per picked channel; and Schedule, which
// only a release with nothing blocking may press. Warnings ride along; they never block.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { CHANNEL_NAMES, releaseKind } from "@gt/domain/release";
import { PROBLEM_TEXT, releaseReady, type ReleaseProblem } from "@gt/domain/release.problems";

import { plannedSlots } from "../../draft.ts";
import { clock, day, KIND_LABEL } from "./fmt.ts";
import { CHANNEL_ENTRY, STATUS_ENTRY } from "./status.ts";
import { STEP_LABEL, stepOf, trackIndexOf, type StepProps } from "./steps.ts";
import s from "./review.module.css";

function Group({ title, tone, problems, props }: { readonly title: string; readonly tone: "rose" | "amber"; readonly problems: readonly ReleaseProblem[]; readonly props: StepProps }) {
  if (problems.length === 0) return null;
  const { release: r, go } = props;
  return (
    <section className={s.group} data-tone={tone} aria-label={title}>
      <CapsHeading text={title} tally={{ value: problems.length }} variant="section" />
      <ul className={s.list}>
        {problems.map((p, i) => {
          const step = stepOf(p);
          const ti = trackIndexOf(p);
          const where = ti === null ? STEP_LABEL[step] : `${STEP_LABEL[step]} · ${ti + 1} ${r.tracks[ti]?.title ?? ""}`;
          return (
            <li key={`${p.code}:${p.at}:${i}`}>
              <button type="button" className={s.problem} onClick={() => go(step, ti ?? undefined)} aria-label={`${PROBLEM_TEXT[p.code]} Fix in ${where}`}>
                <span className={s.dot} aria-hidden="true" />
                <span className={s.text}>{PROBLEM_TEXT[p.code]}</span>
                <span className={s.where} aria-hidden="true">
                  {where} ›
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function StepReview(props: StepProps) {
  const { release: r, read, problems, dispatch } = props;
  const blocks = problems.filter((p) => p.severity === "block");
  const warns = problems.filter((p) => p.severity === "warn");
  const ready = releaseReady(problems);
  const slots = plannedSlots(r, read.channels);
  const total = r.tracks.reduce((a, t) => a + t.durationS, 0);
  const scheduled = r.status === "scheduled" || r.status === "published";
  return (
    <div className={s.review}>
      <div className={s.problems}>
        {problems.length === 0 && <Chip label="nothing to fix" tone="emerald" dot />}
        <Group title="Blocks" tone="rose" problems={blocks} props={props} />
        <Group title="Warnings" tone="amber" problems={warns} props={props} />
      </div>
      <aside className={s.side} aria-label="what Schedule commits">
        <div className={s.summary}>
          {r.sleeve !== null && r.sleeve.href !== null ? <Plate src={r.sleeve.href} alt={`sleeve of ${r.title}`} className={s.art} width={160} aspect={1} /> : <PlateMissing label="no sleeve" className={s.art} aspect={1} />}
          <Facts
            facts={[
              { term: "title", value: r.title.trim() === "" ? "—" : r.version === null ? r.title : `${r.title} (${r.version})` },
              { term: "artist", value: r.artist.trim() === "" ? "—" : r.artist },
              { term: "kind", value: `${KIND_LABEL[releaseKind(r.tracks)]} · ${r.tracks.length} · ${clock(total)}` },
              { term: "date", value: r.releaseDate === null ? "when processed" : day(r.releaseDate) },
              { term: "genre", value: [r.genre.primary, r.genre.secondary].filter((g) => g !== null).join(" / ") || "—" },
              { term: "UPC", value: r.upc ?? "none" },
            ]}
          />
        </div>
        <section aria-label="calendar slots">
          <CapsHeading text="Calendar slots" tally={{ value: slots.length }} variant="section" />
          {slots.length === 0 ? (
            <Chip label="no channel picked" ghost />
          ) : (
            <ul className={s.slots}>
              {slots.map((sl) => (
                <li key={sl.channel} className={s.slot}>
                  <span className={s.slotName}>{CHANNEL_NAMES[sl.channel]}</span>
                  <span className={s.slotAt}>{sl.at === null ? "when processed" : day(sl.at)}</span>
                  <EntryPill entry={CHANNEL_ENTRY[sl.state]} />
                  {sl.detail !== null && <span className={s.slotDetail}>{sl.detail}</span>}
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
            badge={ready ? (warns.length > 0 ? { label: "warn", value: warns.length, tone: "amber" } : undefined) : { label: "block", value: blocks.length, tone: "rose" }}
            onPress={() => dispatch({ type: "schedule", id: r.id })}
          />
        </div>
      </aside>
    </div>
  );
}
