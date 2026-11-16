"use client";

// Step 5, the master: one universal recipe (uni-1, no parameters - owner, wave 2), one press per
// track. The focused track is a listening moment: where it sat and where the master landed against
// the streaming target, and - when both files exist - original against master at matched loudness.
// S1's press shows the recipe's planned result after a beat (`plannedMaster`); the trial's own
// renders arrive with a master take and its audio.
import { useEffect, useRef } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import type { StatusEntry } from "@gt/ui/components/status/status.ts";
import { MASTER_TARGET, type MasterState, type Release, type ReleaseTrack, type ShelfTake } from "@gt/domain/release";

import { plannedMaster } from "../../draft.ts";
import { AbPlayer } from "./AbPlayer.tsx";
import { clock, db } from "./fmt.ts";
import { Meter } from "./Meter.tsx";
import { Problems } from "./Problems.tsx";
import { problemsOnTrack, type StepProps } from "./steps.ts";
import { TrackStrip } from "./TrackStrip.tsx";
import s from "./master.module.css";

/** How long S1's press takes to show its planned result (the trial runs separately). */
const PLANNED_MS = 1500;

const MASTER_ENTRY: Readonly<Record<MasterState, StatusEntry>> = {
  none: { look: "idle", label: "not mastered" },
  running: { look: "running", label: "mastering" },
  done: { look: "done", label: "mastered" },
  failed: { look: "failed", label: "failed" },
};

function beforeOf(t: ReleaseTrack, shelf: readonly ShelfTake[]): { lufs: number; truePeakDb: number } | null {
  if (t.master.before !== null) return t.master.before;
  const take = shelf.find((x) => x.takeId === t.takeId);
  return take === undefined || take.lufs === null || take.truePeakDb === null ? null : { lufs: take.lufs, truePeakDb: take.truePeakDb };
}

function Listening({ t, i, props, onMaster }: { readonly t: ReleaseTrack; readonly i: number; readonly props: StepProps; readonly onMaster: () => void }) {
  const m = t.master;
  const before = beforeOf(t, props.read.shelf);
  const after = m.state === "done" ? m.after : null;
  const name = t.title.trim() === "" ? `track ${i + 1}` : t.title;
  return (
    <section className={s.listen} aria-label={`master of ${name}`}>
      <header className={s.listenHead}>
        <span className={s.listenNo} aria-hidden="true">
          {i + 1}
        </span>
        <div className={s.listenTitle}>
          <h3 className={s.title}>{name}</h3>
          <span className={s.sub}>
            {clock(t.durationS)} · recipe uni-1 · target {MASTER_TARGET.lufs} LUFS / {MASTER_TARGET.truePeakDb} dBTP
          </span>
        </div>
        <EntryPill entry={MASTER_ENTRY[m.state]} />
        <Button label={m.state === "done" ? "Master again" : m.state === "failed" ? "Master again" : "Master"} tone="emerald" pending={m.state === "running"} onPress={onMaster} />
      </header>
      {m.state === "failed" && m.error !== null && <ErrorLine message={m.error} />}
      <Problems problems={problemsOnTrack(props.problems, "master", i)} label={`track ${i + 1} master problems`} />
      <div className={s.meters}>
        <Meter name="integrated loudness" unit="LUFS" min={-24} max={-6} target={MASTER_TARGET.lufs} slack={0.5} before={before?.lufs ?? null} after={after?.lufs ?? null} ticks={[-24, -20, -14, -10, -6]} />
        <Meter name="true peak" unit="dBTP" min={-6} max={2} target={MASTER_TARGET.truePeakDb} slack={0} before={before?.truePeakDb ?? null} after={after?.truePeakDb ?? null} ticks={[-6, -3, -1, 0, 2]} />
        <div className={s.lra}>
          <span className={s.meterName}>loudness range</span>
          <span className={s.meterValues}>
            <span className={s.vBefore}>{m.before === null ? "—" : m.before.lra.toFixed(1)}</span>
            <span className={s.arrow} aria-hidden="true">
              →
            </span>
            <span className={s.vAfter}>{after === null ? "—" : after.lra.toFixed(1)}</span>
            <span className={s.unit}>LU</span>
          </span>
        </div>
      </div>
      <div className={s.player}>
        <CapsHeading text="A / B" variant="section" />
        {t.audioHref !== null && m.audioHref !== null && m.before !== null && m.after !== null ? (
          <AbPlayer key={`${t.audioHref}|${m.audioHref}`} name={name} originalHref={t.audioHref} masterHref={m.audioHref} gainDb={m.after.lufs - m.before.lufs} />
        ) : (
          <div className={s.noAudio}>
            {t.audioHref === null && <Chip label="no original audio" ghost />}
            {m.state === "done" && m.audioHref === null && <Chip label={m.takeId === null ? "planned · no master render" : "no master audio"} ghost />}
            {m.state !== "done" && <Chip label="no master yet" ghost />}
          </div>
        )}
      </div>
    </section>
  );
}

/** `before → after` of a done master; a dash for a track with no master. */
const span = (t: ReleaseTrack, k: "lufs" | "truePeakDb"): string =>
  t.master.state !== "done" || t.master.after === null ? "—" : `${t.master.before === null ? "—" : db(t.master.before[k])} → ${db(t.master.after[k])}`;

function AllTracks({ r, current, onPick, onMaster }: { readonly r: Release; readonly current: number; readonly onPick: (i: number) => void; readonly onMaster: (i: number) => void }) {
  return (
    <table className={s.all}>
      <caption className={s.allCap}>all tracks</caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">track</th>
          <th scope="col">state</th>
          <th scope="col">LUFS</th>
          <th scope="col">dBTP</th>
          <th scope="col">
            <span className={s.sr}>master</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {r.tracks.map((t, i) => (
          <tr key={t.takeId} data-current={i === current ? "" : undefined}>
            <td className={s.num}>{i + 1}</td>
            <td>
              <button type="button" className={s.rowBtn} onClick={() => onPick(i)} aria-pressed={i === current}>
                {t.title.trim() === "" ? "untitled" : t.title}
              </button>
            </td>
            <td>
              <EntryPill entry={MASTER_ENTRY[t.master.state]} />
            </td>
            <td className={s.num}>{span(t, "lufs")}</td>
            <td className={s.num}>{span(t, "truePeakDb")}</td>
            <td>
              <Button label="Master" size="sm" pending={t.master.state === "running"} onPress={() => onMaster(i)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StepMaster(props: StepProps) {
  const { release: r, problems, dispatch, track, setTrack, read } = props;
  // The planned result lands after the press; by then the tracks may have moved, so it finds its
  // track again by take id in the release as it is then.
  const latest = useRef(r);
  useEffect(() => {
    latest.current = r;
  });
  const press = (i: number) => {
    const t = r.tracks[i];
    if (t === undefined || t.master.state === "running") return;
    const before = beforeOf(t, read.shelf);
    dispatch({ type: "master", id: r.id, index: i, master: { ...t.master, state: "running", recipe: "uni-1", error: null } });
    window.setTimeout(() => {
      const now = latest.current.tracks.findIndex((x) => x.takeId === t.takeId);
      const cur = latest.current.tracks[now];
      if (cur !== undefined) dispatch({ type: "master", id: r.id, index: now, master: plannedMaster(cur, before) });
    }, PLANNED_MS);
  };
  const open = r.tracks.map((t, i) => ({ t, i })).filter(({ t }) => t.master.state === "none" || t.master.state === "failed");
  const t = r.tracks[track];
  if (t === undefined) return <Chip label="no tracks" ghost />;
  return (
    <div className={s.master}>
      <div className={s.toolbar}>
        <TrackStrip tracks={r.tracks} problems={problems} step="master" current={track} onPick={setTrack} />
        <Button label="Master all unmastered" tone="emerald" disabled={open.length === 0} tally={{ value: open.length }} onPress={() => open.forEach(({ i }) => press(i))} />
      </div>
      <div className={s.masterBody}>
        <Listening t={t} i={track} props={props} onMaster={() => press(track)} />
        <AllTracks r={r} current={track} onPick={setTrack} onMaster={press} />
      </div>
    </div>
  );
}
