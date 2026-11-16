"use client";

// The desk's right column - the release's meter bridge. On top the verdict and every problem by
// severity, each one a jump to where it is fixed; then the sleeve, the channels and the extras;
// pinned at the foot the Calendar slots Publish would create and Schedule, armed only when nothing
// blocks. In S1 nothing leaves the page: the slots carry each channel's own state.
import type { Dispatch } from "react";

import { CHANNEL_NAMES, RELEASE_CHANNELS, type ChannelRow, type Release, type ReleaseChannelId } from "@gt/domain/release";
import { PROBLEM_TEXT, releaseReady, type ProblemAt, type ReleaseProblem } from "@gt/domain/release.problems";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import type { ReleaseRead } from "../../_port/port.ts";
import { plannedSlots, type DraftEvent } from "../../draft.ts";
import { Extras } from "./Extras.tsx";
import { CHANNEL_STATE_LABEL, CHANNEL_TONE, count, placeOf } from "./fmt.ts";
import { SleeveBlock } from "./SleeveBlock.tsx";
import s from "./desk.module.css";
import r from "./rail.module.css";

export type RailProps = {
  readonly release: Release;
  readonly problems: readonly ReleaseProblem[];
  readonly read: ReleaseRead;
  readonly dispatch: Dispatch<DraftEvent>;
  readonly onJump: (at: ProblemAt) => void;
};

const isDirect = (id: ChannelRow["id"]): id is ReleaseChannelId => (RELEASE_CHANNELS as readonly string[]).includes(id);

function ProblemList({ title, problems, place, onJump }: { readonly title: string; readonly problems: readonly ReleaseProblem[]; readonly place: (at: ProblemAt) => string; readonly onJump: (at: ProblemAt) => void }) {
  if (problems.length === 0) return null;
  return (
    <>
      <CapsHeading text={title} tally={{ value: problems.length }} level={4} />
      <ul className={r.problems}>
        {problems.map((p, i) => (
          <li key={`${p.code}:${p.at}:${i}`}>
            <button type="button" className={r.problem} data-sev={p.severity} onClick={() => onJump(p.at)}>
              <Glyph name="warn" className={r.sevGlyph} />
              <span className={r.problemText}>{PROBLEM_TEXT[p.code]}</span>
              <span className={r.place}>
                <span className={r.placeText}>{place(p.at)}</span>
                <Glyph name="chevR" className={r.jumpGlyph} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Rail({ release, problems, read, dispatch, onJump }: RailProps) {
  const ready = releaseReady(problems);
  const blocks = count(problems, "block");
  const warns = count(problems, "warn");
  const place = (at: ProblemAt) => placeOf(at, (n) => release.tracks[n - 1]?.title);
  const slots = plannedSlots(release, read.channels);
  const direct = read.channels.filter((c) => c.kind === "direct");
  const dsps = read.channels.filter((c) => c.kind === "dsp");
  const dspDetails = [...new Set(dsps.map((d) => d.detail))];
  const scheduled = release.status === "scheduled" || release.status === "published";
  const chanMark = problems.some((p) => p.at === "channels");

  return (
    <aside className={s.col} aria-label="readiness">
      <div className={s.colBody}>
        <section className={r.block} aria-label="problems">
          <div className={r.verdict} data-ready={ready}>
            <span className={r.verdictWord}>{ready ? "ready" : "blocked"}</span>
            <Tally value={blocks} label="block" />
            <Tally value={warns} label="warn" />
          </div>
          <ProblemList title="blocks" problems={problems.filter((p) => p.severity === "block")} place={place} onJump={onJump} />
          <ProblemList title="warnings" problems={problems.filter((p) => p.severity === "warn")} place={place} onJump={onJump} />
        </section>

        <SleeveBlock key={release.id} release={release} problems={problems.filter((p) => p.at === "sleeve")} looks={read.mvLooks} dispatch={dispatch} />

        <section id="desk-channels" tabIndex={-1} className={r.block} aria-label="channels" data-mark={chanMark ? "block" : undefined}>
          <CapsHeading text="channels" tally={{ value: release.channels.length, of: direct.length }} level={3} />
          <ul className={r.chans}>
            {direct.map((c) => {
              const on = isDirect(c.id) && release.channels.includes(c.id);
              return (
                <li key={c.id} className={r.chan}>
                  <button type="button" className={r.chanPick} aria-pressed={on} onClick={() => (isDirect(c.id) ? dispatch({ type: "toggleChannel", id: release.id, channel: c.id }) : undefined)}>
                    <span className={s.box} aria-hidden="true" />
                    {CHANNEL_NAMES[c.id]}
                  </button>
                  <Chip label={CHANNEL_STATE_LABEL[c.state]} tone={CHANNEL_TONE[c.state]} dot={c.state !== "not-wired"} />
                  {c.detail !== null && <span className={r.detail}>{c.detail}</span>}
                </li>
              );
            })}
          </ul>
          {dspDetails.map((detail) => (
            <div key={detail ?? "none"} className={r.dsps}>
              <span className={r.dspNames}>
                {dsps
                  .filter((d) => d.detail === detail)
                  .map((d) => (
                    <Chip key={d.id} label={CHANNEL_NAMES[d.id]} casing="lower" ghost name={`${CHANNEL_NAMES[d.id]}: ${CHANNEL_STATE_LABEL[d.state]}`} />
                  ))}
              </span>
              <span className={r.detail}>
                {detail === null ? CHANNEL_STATE_LABEL["not-reachable"] : `${CHANNEL_STATE_LABEL["not-reachable"]} · ${detail}`}
              </span>
            </div>
          ))}
        </section>

        <Extras release={release} problems={problems.filter((p) => p.at === "splits")} dispatch={dispatch} />
      </div>

      <footer className={r.foot} aria-label="schedule">
        <CapsHeading text="planned slots" tally={{ value: slots.length }} level={3} />
        {slots.length === 0 ? (
          <span className={r.detail}>—</span>
        ) : (
          <ul className={r.slots}>
            {slots.map((sl) => (
              <li key={sl.channel} className={r.slot}>
                <span className={r.slotName}>{CHANNEL_NAMES[sl.channel]}</span>
                <span className={r.slotAt}>{sl.at ?? "no date"}</span>
                <Chip label={CHANNEL_STATE_LABEL[sl.state]} tone={CHANNEL_TONE[sl.state]} dot={sl.state !== "not-wired"} />
              </li>
            ))}
          </ul>
        )}
        <Button
          label={scheduled ? "Scheduled" : "Schedule"}
          tone="violet"
          disabled={!ready || scheduled}
          onPress={() => dispatch({ type: "schedule", id: release.id })}
          {...(ready ? {} : { badge: { label: "blocks", value: blocks, tone: "rose" as const } })}
        />
      </footer>
    </aside>
  );
}
