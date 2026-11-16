// One RUN on the mosaic: its picture edge to edge, the label and one pip per variant (kept / rejected /
// open, by shape and hue) laid over it. The face is what the run IS: the reference when it has one,
// else its first variant - a plate, a clip's first frame, a take's waveform, a finding's claim, a
// model's poster render.
import type { BoardVerdict } from "../../board/boardGate.ts";
import type { Cell } from "../../board/cull.ts";
import type { ItemWords } from "../../board/port.ts";
import { runLooks, runState, type Run } from "../../board/runs.ts";
import { Chip } from "../chip/Chip.tsx";
import { Clip } from "../desk/Clip.tsx";
import { Plate } from "../desk/Plate.tsx";
import { tokens } from "../../tokens.ts";
import { cx } from "../cx.ts";
import { PipRow } from "../piprow/PipRow.tsx";
import { Wave } from "../wave/Wave.tsx";
import { kindOf, type TileMedia } from "./CullTile.tsx";
import s from "./Runs.module.css";

/** A mosaic card's least width: the hint for a blob's grid-size variant (the opened run asks for the original). */
const CARD = Number.parseInt(tokens["w-lib-tile-m"], 10);

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
  const face = run.words?.ref ?? run.words?.poster;
  if (face !== undefined) return <Plate className={s.face} src={face} alt="" lazy width={CARD} />;
  if (kind === "model") {
    // A model run is its first variant's poster render; a glb is never drawn on a card.
    const poster = wordsOf(firstId).poster;
    return poster === undefined ? (
      <span className={s.faceText}>
        <span className={s.clamp}>{wordsOf(firstId).label}</span>
      </span>
    ) : (
      <Plate className={s.face} src={poster} alt="" lazy width={CARD} />
    );
  }
  if (kind === "video") return <Clip className={s.face} src={first.url} label="" poster={wordsOf(firstId).poster} width={CARD} muted />;
  return <Plate className={s.face} src={first.url} alt="" lazy width={CARD} />;
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
      {run.words?.channel !== undefined && (
        <span className={s.channelTag}>
          <Chip label={run.words.channel} casing="lower" />
        </span>
      )}
      <span className={s.foot}>
        <span className={s.label}>{label}</span>
        <PipRow looks={looks} label={`${decided} of ${looks.length} decided`} />
      </span>
    </button>
  );
}
