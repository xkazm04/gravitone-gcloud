// One RUN on the run grid: its picture, its label and one pip per variant (kept / rejected / open,
// shape and hue). Two faces for the two grid views being prototyped (2026-10-22):
//   sheet   the reference above a strip of the variants themselves - what the run tried, at a glance;
//   mosaic  the picture alone, edge to edge, the label and pips laid over it - the densest grid.
// A text run (a scout finding, a watch line) shows its claim where the picture would be.
import type { BoardVerdict } from "../../board/boardGate.ts";
import type { Cell } from "../../board/cull.ts";
import type { ItemWords } from "../../board/port.ts";
import { runLooks, runState, type Run } from "../../board/runs.ts";
import { Plate } from "../desk/Plate.tsx";
import { cx } from "../cx.ts";
import { PipRow } from "../piprow/PipRow.tsx";
import { kindOf, type TileMedia } from "./CullTile.tsx";
import s from "./Runs.module.css";

export type RunCardProps = {
  readonly run: Run;
  readonly at: number;
  readonly cells: readonly Cell[];
  readonly verdicts: Readonly<Record<string, BoardVerdict>>;
  readonly mediaOf: (id: string) => TileMedia;
  readonly wordsOf: (id: string) => ItemWords;
  readonly face: "sheet" | "mosaic";
  readonly current: boolean;
  readonly nudged: boolean;
  readonly onPress: (at: number) => void;
};

/** The run's face: its reference, else its first variant that has pixels. */
export function RunFace({ run, cells, mediaOf, wordsOf, className }: Pick<RunCardProps, "run" | "cells" | "mediaOf" | "wordsOf"> & { readonly className?: string }) {
  const firstId = cells[run.members[0] ?? -1]?.id ?? "";
  const first = mediaOf(firstId);
  if (kindOf(first.mime) === "text") return <span className={cx(s.faceText, className)}>{wordsOf(firstId).label}</span>;
  if (run.words?.ref !== undefined) return <Plate className={className} src={run.words.ref} alt="" lazy />;
  if (kindOf(first.mime) === "video") return <video className={className} src={first.url} muted playsInline preload="metadata" />;
  return <Plate className={className} src={first.url} alt="" lazy />;
}

export function RunCard({ run, at, cells, verdicts, mediaOf, wordsOf, face, current, nudged, onPress }: RunCardProps) {
  const state = runState(run, cells, verdicts);
  const label = run.words?.label ?? run.row;
  const looks = runLooks(run, cells, verdicts);
  const decided = looks.filter((l) => l !== "idle").length;
  return (
    <button
      type="button"
      className={cx(s.card, face === "mosaic" && s.mosaic, current && s.cur, s[state], nudged && s.nudge)}
      data-run={at}
      role="gridcell"
      aria-selected={current}
      aria-label={`${label}, ${run.members.length} variant${run.members.length === 1 ? "" : "s"}, ${state === "open" ? `${decided} decided` : state}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPress(at)}
    >
      <RunFace run={run} cells={cells} mediaOf={mediaOf} wordsOf={wordsOf} className={s.face} />
      {face === "sheet" && kindOf(mediaOf(cells[run.members[0] ?? -1]?.id ?? "").mime) !== "text" && (
        <span className={s.strip} aria-hidden="true">
          {run.members.slice(0, 4).map((i) => {
            const id = cells[i]?.id ?? "";
            const m = mediaOf(id);
            const v = verdicts[id]?.verdict;
            return kindOf(m.mime) === "image" ? (
              <Plate key={id} className={cx(s.mini, v === "keep" && s.miniKeep, v === "reject" && s.miniReject)} src={m.url} alt="" lazy />
            ) : (
              <span key={id} className={cx(s.mini, s.miniBlank, v === "keep" && s.miniKeep, v === "reject" && s.miniReject)}>
                {kindOf(m.mime) === "video" ? "▶" : ""}
              </span>
            );
          })}
        </span>
      )}
      <span className={s.foot}>
        <span className={s.label}>{label}</span>
        <PipRow looks={looks} label={`${decided} of ${looks.length} decided`} />
      </span>
    </button>
  );
}
