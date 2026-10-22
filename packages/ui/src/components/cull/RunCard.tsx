// One RUN on the mosaic: its picture edge to edge, the label and one pip per variant (kept / rejected /
// open, by shape and hue) laid over it. The face is what the run IS: the reference when it has one,
// else its first variant - a plate, a clip's first frame, a take's waveform, a finding's claim.
import type { BoardVerdict } from "../../board/boardGate.ts";
import type { Cell } from "../../board/cull.ts";
import type { ItemWords } from "../../board/port.ts";
import { runLooks, runState, type Run } from "../../board/runs.ts";
import { Plate } from "../desk/Plate.tsx";
import { cx } from "../cx.ts";
import { PipRow } from "../piprow/PipRow.tsx";
import { Wave } from "../wave/Wave.tsx";
import { kindOf, type TileMedia } from "./CullTile.tsx";
import s from "./Runs.module.css";

export type RunCardProps = {
  readonly run: Run;
  readonly at: number;
  readonly cells: readonly Cell[];
  readonly verdicts: Readonly<Record<string, BoardVerdict>>;
  readonly mediaOf: (id: string) => TileMedia;
  readonly wordsOf: (id: string) => ItemWords;
  /** square: a still's mosaic; wide: a clip's or a take's 16:9 card. */
  readonly shape?: "square" | "wide";
  readonly current: boolean;
  readonly nudged: boolean;
  readonly onPress: (at: number) => void;
};

export function RunFace({ run, cells, mediaOf, wordsOf }: Pick<RunCardProps, "run" | "cells" | "mediaOf" | "wordsOf">) {
  const firstId = cells[run.members[0] ?? -1]?.id ?? "";
  const first = mediaOf(firstId);
  const kind = kindOf(first.mime);
  if (kind === "text")
    return (
      <span className={s.faceText}>
        <span className={s.clamp}>{wordsOf(firstId).label}</span>
      </span>
    );
  if (kind === "audio") {
    const w = wordsOf(firstId);
    return (
      <span className={s.faceWave}>
        <Wave peaks={w.peaks ?? []} width={200} height={80} tone={w.music === true ? "violet" : "cyan"} stretch />
      </span>
    );
  }
  if (run.words?.ref !== undefined) return <Plate className={s.face} src={run.words.ref} alt="" lazy />;
  if (kind === "video") return <video className={s.face} src={first.url} muted playsInline preload="metadata" />;
  return <Plate className={s.face} src={first.url} alt="" lazy />;
}

export function RunCard({ run, at, cells, verdicts, mediaOf, wordsOf, shape = "square", current, nudged, onPress }: RunCardProps) {
  const state = runState(run, cells, verdicts);
  const label = run.words?.label ?? run.row;
  const looks = runLooks(run, cells, verdicts);
  const decided = looks.filter((l) => l !== "idle").length;
  return (
    <button
      type="button"
      className={cx(s.card, shape === "wide" && s.cardWide, current && s.cur, s[state], nudged && s.nudge)}
      data-run={at}
      role="gridcell"
      aria-selected={current}
      aria-label={`${label}, ${run.members.length} variant${run.members.length === 1 ? "" : "s"}, ${state === "open" ? `${decided} decided` : state}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPress(at)}
    >
      <RunFace run={run} cells={cells} mediaOf={mediaOf} wordsOf={wordsOf} />
      <span className={s.foot}>
        <span className={s.label}>{label}</span>
        <PipRow looks={looks} label={`${decided} of ${looks.length} decided`} />
      </span>
    </button>
  );
}
