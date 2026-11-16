"use client";

// A track's master: ONE press (the universal recipe uni-1, no parameters - owner, wave 2), the
// measures before and after against the streaming target, and the A/B when both files exist.
import { MASTER_TARGET, type MasterRef, type ReleaseTrack, type ShelfTake } from "@gt/domain/release";
import type { ReleaseProblem } from "@gt/domain/release.problems";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";

import { AbPlayer } from "./AbPlayer.tsx";
import { fig, worst } from "./fmt.ts";
import t from "./sheet.module.css";

export function MasterChip({ master }: { readonly master: MasterRef }) {
  switch (master.state) {
    case "none":
      return <Chip label="unmastered" tone="amber" ghost />;
    case "running":
      return <Chip label="mastering" tone="cyan" dot />;
    case "failed":
      return <Chip label="master failed" tone="rose" dot />;
    case "done":
      return <Chip label={master.recipe ?? "master"} value={master.after === null ? "—" : `${fig(master.after.lufs)} LUFS`} tone="emerald" />;
  }
}

type Row = { readonly term: string; readonly before: number | null; readonly after: number | null; readonly target: string; readonly on: boolean | null };

function rows(m: MasterRef, take: ShelfTake | undefined): Row[] {
  const b = m.before;
  const a = m.after;
  const lufsB = b?.lufs ?? take?.lufs ?? null;
  const tpB = b?.truePeakDb ?? take?.truePeakDb ?? null;
  return [
    { term: "LUFS", before: lufsB, after: a?.lufs ?? null, target: fig(MASTER_TARGET.lufs), on: a === null ? null : Math.abs(a.lufs - MASTER_TARGET.lufs) <= 0.5 },
    { term: "true peak", before: tpB, after: a?.truePeakDb ?? null, target: `≤ ${fig(MASTER_TARGET.truePeakDb)}`, on: a === null ? null : a.truePeakDb <= MASTER_TARGET.truePeakDb },
    { term: "LRA", before: b?.lra ?? null, after: a?.lra ?? null, target: "—", on: null },
  ];
}

export type TrackMasterProps = {
  readonly track: ReleaseTrack;
  readonly n: number;
  readonly shelf: readonly ShelfTake[];
  readonly problems: readonly ReleaseProblem[];
  readonly onMaster: () => void;
};

export function TrackMaster({ track: x, n, shelf, problems, onMaster }: TrackMasterProps) {
  const m = x.master;
  const take = shelf.find((s) => s.takeId === x.takeId);
  const running = m.state === "running";
  const name = x.title.trim() === "" ? `track ${n}` : x.title;
  return (
    <div className={t.part} role="group" aria-label={`track ${n} master`} data-mark={worst(problems, ["unmastered", "master-off-target"])}>
      <div className={t.masterHead}>
        <CapsHeading text="master" level={4} />
        <Chip label="recipe" value="uni-1" casing="lower" />
        <MasterChip master={m} />
      </div>
      <Button label={m.state === "done" ? "Master again" : "Master"} tone="cyan" pending={running} onPress={onMaster} />
      {m.state === "failed" && <ErrorLine message={m.error ?? "master failed"} />}
      <table className={t.measure} aria-label={`${name} loudness before and after`}>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">before</th>
            <th scope="col">after</th>
            <th scope="col">target</th>
          </tr>
        </thead>
        <tbody>
          {rows(m, take).map((r) => (
            <tr key={r.term}>
              <th scope="row">{r.term}</th>
              <td>{fig(r.before)}</td>
              <td data-on={r.on === null ? undefined : r.on}>{running ? "…" : fig(r.after)}</td>
              <td className={t.target}>{r.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {m.state === "done" && m.audioHref === null && <Chip label="no master file" ghost casing="lower" />}
      {x.audioHref === null && <Chip label="no audio" ghost casing="lower" />}
      {m.before !== null && m.after !== null && x.audioHref !== null && m.audioHref !== null && (
        <AbPlayer name={name} original={x.audioHref} master={m.audioHref} beforeLufs={m.before.lufs} afterLufs={m.after.lufs} />
      )}
    </div>
  );
}
