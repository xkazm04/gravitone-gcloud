"use client";

// THE MATRIX CULL (prototype index.html :452-572): rows of candidates, a cursor, K / X / U and
// the source's reason keys, ⇧K / ⇧X on a whole row as ONE act, Z for the lens, ⌫ to take the
// last act back, and a commit that refuses while anything is open - shaking, jumping to the
// first open tile and flashing every one (decision 5).
//
// The desk owns what is ITS: the cursor, the lens, the flash. A verdict is the caller's
// (`decide`, the gate: optimistic, windowed, one act per press) and so is the commit (`onCommit`,
// which previews the consequence before anything is written). Every verb is a keymap row
// (bindings.ts `board.cull`), bound with `useKeys`; the reason keys are read by the cap the
// operator pressed, so 1-9, 0, − follow the source's list in order (@gt/domain/source).
import { useEffect, useRef, useState } from "react";

import type { BoardPacket } from "../../board/port.ts";
import type { BoardVerdict } from "../../board/boardGate.ts";
import { clamp, cullCells, reasonAct, rowOf, tallyOf, undecidedOf, vertical } from "../../board/cull.ts";
import { useKeys } from "../../keymap/dispatch.ts";
import { Chip } from "../chip/Chip.tsx";
import { DeskFrame, OracleStrip } from "../desk/Desk.tsx";
import { Plate } from "../desk/Plate.tsx";
import { CullFoot } from "./CullFoot.tsx";
import { CullTile, Zoom, kindOf } from "./CullTile.tsx";
import { MatrixCullBand } from "./MatrixCullBand.tsx";
import { MatrixCullSheet } from "./MatrixCullSheet.tsx";
import { SeriesBadge } from "./SeriesBadge.tsx";
import s from "./Cull.module.css";

export type MatrixCullProps = {
  readonly packet: BoardPacket;
  readonly verdicts: Readonly<Record<string, BoardVerdict>>;
  readonly decide: (ids: readonly string[], v: BoardVerdict | null, label: string) => void;
  readonly undo: () => void;
  readonly onCommit: () => void;
  readonly busy?: boolean;
  /** Say it aloud (the shell's polite region). */
  readonly announce?: (message: string) => void;
  /** Off on a /kit specimen, whose keys are not the page's. */
  readonly keys?: boolean;
};

function MatrixCullBaseline({ packet, verdicts, decide, undo, onCommit, busy = false, announce = () => undefined, keys = true }: MatrixCullProps) {
  const { view, present } = packet;
  const cells = cullCells(present.rows, view.items);
  const byId = new Map<string, (typeof view.items)[number]>(view.items.map((it) => [it.id, it]));
  const [cur, setCur] = useState(() => Math.max(0, undecidedOf(cells, verdicts)[0] ?? 0));
  const [zoom, setZoom] = useState(false);
  const [nudged, setNudged] = useState<ReadonlySet<number>>(new Set());
  const [refusals, setRefusals] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const t = tallyOf(cells, verdicts);
  const lane = view.lane;
  const at = cells[cur];

  // The flash is one beat (prototype `.nudge`, .9s); cleared so the next refusal replays it.
  useEffect(() => {
    if (nudged.size === 0) return;
    const t = setTimeout(() => setNudged(new Set()), 950);
    return () => clearTimeout(t);
  }, [nudged]);

  // The cursor follows its tile into view (prototype `cullMove`'s scrollIntoView).
  useEffect(() => {
    document.querySelector(`[data-tile="${cur}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cur]);

  const wordsOf = (id: string) => present.items[id] ?? { label: id };
  const mediaOf = (id: string) => {
    const it = byId.get(id);
    return { url: it?.url ?? "", mime: it?.media.mime ?? "image/png" };
  };
  const move = (to: number) => {
    const next = clamp(cells, to);
    setCur(next);
    if (playing !== null) play(next);
  };
  const advance = () => {
    if (cur < cells.length - 1) move(cur + 1);
  };
  const mark = (idx: readonly number[], v: BoardVerdict | null) => {
    const ids = idx.flatMap((i) => {
      const c = cells[i];
      return c === undefined ? [] : [c.id];
    });
    const first = ids[0];
    if (first === undefined) return;
    const label = ids.length > 1 ? `${ids.length} items` : wordsOf(first).label;
    decide(ids, v, label);
    announce(`${label} ${v === null ? "undecided" : v.verdict}${v !== null && v.reasons.length > 0 ? `, ${v.reasons.join(", ")}` : ""}`);
  };
  function play(i: number) {
    const id = cells[i]?.id;
    const el = audio.current;
    if (id === undefined || el === null) return;
    if (playing === id) {
      el.pause();
      setPlaying(null);
      return;
    }
    el.src = mediaOf(id).url;
    void el.play().then(
      () => setPlaying(id),
      (e: unknown) => announce(`cannot play: ${e instanceof Error ? e.message : "unknown"}`),
    );
  }
  const commit = () => {
    const open = undecidedOf(cells, verdicts);
    const first = open[0];
    if (first === undefined) {
      onCommit();
      return;
    }
    setRefusals((n) => n + 1);
    setNudged(new Set(open));
    move(first);
    announce(`${open.length} undecided`);
  };

  useKeys(
    "board.cull",
    {
      keep: () => {
        mark([cur], { verdict: "keep", reasons: [] });
        advance();
      },
      reject: () => {
        mark([cur], { verdict: "reject", reasons: [] });
        advance();
      },
      undecide: () => mark([cur], null),
      reason: ({ cap }) => {
        if (at === undefined) return;
        const act = reasonAct(view.reasons.list, view.reasons.max, cap, verdicts[at.id]);
        if (act.kind === "refuse") {
          announce(act.why);
          return;
        }
        mark([cur], act.verdict);
        if (act.advance) advance();
      },
      prev: () => move(cur - 1),
      next: () => move(cur + 1),
      "row-up": () => move(vertical(cells, cur, -1)),
      "row-down": () => move(vertical(cells, cur, 1)),
      "keep-row": () => mark(rowOf(cells, cur), { verdict: "keep", reasons: [] }),
      "reject-row": () => mark(rowOf(cells, cur), { verdict: "reject", reasons: [] }),
      zoom: () => setZoom((z) => !z),
      undo: () => {
        undo();
        announce("undone");
      },
      play: () => play(cur),
      commit,
    },
    { facts: lane === "audio" ? ["audio"] : [], enabled: keys },
  );

  const rows = [...new Set(cells.map((c) => c.row))];
  const isAudio = lane === "audio";
  return (
    <DeskFrame
      title={view.title ?? view.id}
      {...(present.meta !== undefined ? { meta: present.meta } : {})}
      marks={
        <>
          {present.oracle !== undefined && <OracleStrip oracle={present.oracle} />}
          {present.series !== undefined && <SeriesBadge measured={present.series.measured} graded={present.series.graded} />}
        </>
      }
      over={
        zoom && at !== undefined && kindOf(mediaOf(at.id).mime) !== "audio" ? (
          <Zoom words={wordsOf(at.id)} media={mediaOf(at.id)} verdict={verdicts[at.id]} position={`${cur + 1}/${cells.length}`} onClose={() => setZoom(false)} specimen={!keys} />
        ) : undefined
      }
      foot={
        <>
          <CullFoot tally={t} reasons={view.reasons.list.length} audio={isAudio} refusals={refusals} busy={busy} onCommit={commit} />
        </>
      }
    >
      <div className={s.matrix} role="grid" aria-label="candidates">
        {rows.map((row) => {
          const words = present.rows.find((r) => r.id === row);
          const members = cells.flatMap((c, i) => (c.row === row ? [i] : []));
          return (
            <div key={row} className={s.row} role="row">
              <div className={s.label}>
                <span>{words?.label ?? row}</span>
                {words?.ref !== undefined && (
                  <>
                    <Plate className={s.ref} src={words.ref} alt={`reference ${words.label}`} />
                    <span className={s.refNote}>reference · not output</span>
                  </>
                )}
                {words?.inCatalogue === false && <Chip label="new look" ghost />}
                {words?.inCatalogue === true && <Chip label="in catalogue" />}
              </div>
              <div className={isAudio ? s.tilesAudio : s.tiles}>
                {members.map((i) => {
                  const id = cells[i]?.id ?? "";
                  return (
                    <CullTile
                      key={id}
                      index={i}
                      words={wordsOf(id)}
                      media={mediaOf(id)}
                      verdict={verdicts[id]}
                      current={i === cur}
                      nudged={nudged.has(i) && verdicts[id] === undefined}
                      playing={playing === id}
                      onPress={move}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {isAudio && <audio ref={audio} onEnded={() => setPlaying(null)} />}
    </DeskFrame>
  );
}

// TODO(prototype, 2026-10-22): consolidate the MatrixCull view switcher - the run-grid prototype
// (scout grid view). Throwaway: the winner becomes the sole render and this strip goes.
const VIEWS = [
  { id: "rows", label: "rows", sub: "today: a row per run" },
  { id: "sheet", label: "contact sheet", sub: "run grid, loupe takes the desk" },
  { id: "band", label: "mosaic + band", sub: "dense grid, run unfolds in place" },
] as const;
type View = (typeof VIEWS)[number]["id"];

export function MatrixCull(props: MatrixCullProps) {
  const [v, setV] = useState<View>("rows");
  return (
    <>
      {props.keys !== false && (
        <div className={s.proto} role="tablist" aria-label="cull view (prototype)">
          {VIEWS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={v === x.id} className={s.protoTab} onMouseDown={(e) => e.preventDefault()} onClick={() => setV(x.id)}>
              <b>{x.label}</b> <span>{x.sub}</span>
            </button>
          ))}
        </div>
      )}
      {v === "sheet" ? <MatrixCullSheet {...props} /> : v === "band" ? <MatrixCullBand {...props} /> : <MatrixCullBaseline {...props} />}
    </>
  );
}
