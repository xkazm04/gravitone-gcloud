"use client";

// One universal master (uni-1, no parameters): one press per track and one for the record. A press
// runs for ~1.5 s and lands the recipe's planned result (S1: the trial renders separately, so a
// planned master names no file). Each track reads before -> after against the streaming target on a
// loudness scale, and plays A/B at matched loudness where both files exist.
import { MASTER_TARGET, type MasterMeasure, type MasterRef, type ReleaseTrack, type ShelfTake } from "@gt/domain/release";
import { SrOnly } from "@gt/ui/components/a11y/SrOnly.tsx";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { plannedMaster } from "../../draft.ts";
import { AbPlayer } from "./AbPlayer.tsx";
import { sectionOf, signed, trackNo, type SectionProps } from "./board.ts";
import { ProblemLine } from "./Sheet.tsx";
import s from "./sheet.module.css";

/** The loudness scale the meters draw: -24 to 0 LUFS. */
const FLOOR = -24;
const pct = (lufs: number): number => Math.max(0, Math.min(100, ((lufs - FLOOR) / -FLOOR) * 100));

type Before = { readonly lufs: number; readonly truePeakDb: number } | null;
function beforeOf(t: ReleaseTrack, shelf: readonly ShelfTake[]): Before {
  const take = shelf.find((x) => x.takeId === t.takeId);
  if (take !== undefined && take.lufs !== null && take.truePeakDb !== null) return { lufs: take.lufs, truePeakDb: take.truePeakDb };
  const b = t.master.before;
  return b === null ? null : { lufs: b.lufs, truePeakDb: b.truePeakDb };
}

const STATE_TONE = { none: "neutral", running: "cyan", done: "emerald", failed: "rose" } as const;

function Meter({ n, before, after }: { readonly n: number; readonly before: MasterMeasure | Before; readonly after: MasterMeasure | null }) {
  const said = `track ${n} loudness ${before === null ? "unmeasured" : `${signed(before.lufs)} LUFS`}${after === null ? "" : ` to ${signed(after.lufs)} LUFS`}, target ${MASTER_TARGET.lufs}`;
  return (
    <div className={s.meter} role="img" aria-label={said}>
      <span className={s.meterTarget} style={{ left: `${pct(MASTER_TARGET.lufs)}%` }} />
      {before !== null && after !== null && <span className={s.meterSpan} style={{ left: `${Math.min(pct(before.lufs), pct(after.lufs))}%`, width: `${Math.abs(pct(before.lufs) - pct(after.lufs))}%` }} />}
      {before !== null && <span className={s.meterBefore} style={{ left: `${pct(before.lufs)}%` }} />}
      {after !== null && <span className={s.meterAfter} style={{ left: `${pct(after.lufs)}%` }} />}
      <span className={s.meterTick} style={{ left: "0%" }} aria-hidden="true">
        {FLOOR}
      </span>
      <span className={s.meterTick} style={{ left: `${pct(MASTER_TARGET.lufs)}%` }} aria-hidden="true">
        {MASTER_TARGET.lufs}
      </span>
      <span className={s.meterTick} style={{ left: "100%" }} aria-hidden="true">
        0
      </span>
    </div>
  );
}

function Figures({ m, before }: { readonly m: MasterRef; readonly before: Before }) {
  const b = m.before ?? (before === null ? null : { ...before, lra: null });
  const a = m.after;
  const cell = (label: string, x: number | null | undefined, y: number | null | undefined, unit: string, off: boolean, fmt: (v: number) => string = signed) => (
    <span className={s.fig} data-off={off ? "" : undefined}>
      <span className={s.figLabel}>{label}</span>
      {x === null || x === undefined ? "—" : fmt(x)}
      <span aria-hidden="true"> → </span>
      <SrOnly text=" to " />
      <b>{y === null || y === undefined ? "—" : fmt(y)}</b> {unit}
    </span>
  );
  return (
    <div className={s.figs}>
      {cell("LUFS", b?.lufs, a?.lufs, "", a !== null && Math.abs(a.lufs - MASTER_TARGET.lufs) > 0.5)}
      {cell("TP", b?.truePeakDb, a?.truePeakDb, "dB", a !== null && a.truePeakDb > MASTER_TARGET.truePeakDb)}
      {cell("LRA", b?.lra, a?.lra, "LU", false, (v) => v.toFixed(1))}
    </div>
  );
}

export function Master({ release: r, problems, read, dispatch }: SectionProps) {
  const here = problems.filter((p) => sectionOf(p) === "master");
  const press = (i: number) => {
    const t = r.tracks[i];
    if (t === undefined || t.master.state === "running") return;
    const before = beforeOf(t, read.shelf);
    const running: MasterRef = { state: "running", recipe: "uni-1", takeId: null, audioHref: null, before: before === null ? null : { ...before, lra: t.master.before?.lra ?? 6 }, after: null, error: null };
    dispatch({ type: "master", id: r.id, index: i, master: running });
    window.setTimeout(() => dispatch({ type: "master", id: r.id, index: i, master: plannedMaster(t, before) }), 1500);
  };
  const open = r.tracks.filter((t) => t.master.state !== "done").length;
  const running = r.tracks.some((t) => t.master.state === "running");
  return (
    <div className={s.master}>
      <div className={s.masterHead}>
        <Chip label="recipe" value="uni-1" tone="cyan" />
        <Chip label="target" value={`${MASTER_TARGET.lufs} LUFS · ${MASTER_TARGET.truePeakDb} dBTP`} />
        <span className={s.grow} />
        <Button label="master all" tone="cyan" tally={{ value: open, label: "open" }} pending={running} disabled={open === 0} onPress={() => r.tracks.forEach((t, i) => (t.master.state === "done" ? undefined : press(i)))} />
      </div>
      <ol className={s.masterRows}>
        {r.tracks.map((t, i) => {
          const n = i + 1;
          const m = t.master;
          const before = beforeOf(t, read.shelf);
          const mine = here.filter((p) => trackNo(p) === n);
          const ab = t.audioHref !== null && m.audioHref !== null && m.before !== null && m.after !== null;
          return (
            <li key={t.takeId} className={s.masterRow} data-jump={`master:${n}`} data-state={m.state}>
              <div className={s.masterTop}>
                <span className={s.trackNo} aria-hidden="true">
                  {String(n).padStart(2, "0")}
                </span>
                <span className={s.rightsTitle}>{t.title}</span>
                <Chip label={m.state} tone={STATE_TONE[m.state]} dot={m.state === "running"} />
                {m.state === "done" && m.takeId === null && <Chip label="planned · no file" ghost casing="lower" />}
                {t.audioHref === null && <Chip label="no audio" ghost casing="lower" />}
                <span className={s.grow} />
                <Button label={m.state === "done" ? "re-master" : "master"} size="sm" tone="cyan" pending={m.state === "running"} onPress={() => press(i)} />
              </div>
              <Meter n={n} before={m.before ?? before} after={m.after} />
              <Figures m={m} before={before} />
              {m.state === "failed" && m.error !== null && <ErrorLine message={m.error} />}
              {ab && t.audioHref !== null && m.audioHref !== null && m.before !== null && m.after !== null && <AbPlayer name={`track ${n}`} original={t.audioHref} master={m.audioHref} matchDb={m.after.lufs - m.before.lufs} />}
              {mine.length > 0 && (
                <div className={s.lines}>
                  {mine.map((p) => (
                    <ProblemLine key={p.code} problem={p} />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
