"use client";

// A TAKE IN THE OVERLAY (spark character-cores S1.5 WP7): the take large, played against the track from its `at` on
// @gt/ui's master clock (the track's audio is the clock, the take follows it muted; the same hook the cut's Timeline
// plays by), held to the take's own span - at its end the playhead returns to its start. Beside it, for a take, the
// verdict and the direction (@gt/ui ClipReview: VerdictPick + reasons + RejectNote), written through the canvas port's
// `productionVerdict`: the per-take review that was docked under the street (WP3) lives here now. The cut plays the
// same way and carries no verdict (the port judges takes).
//
// On another device's production (spark device-metadata-sync KS3) the take's verdict, reasons and note are its owner's
// record, read as text: no VerdictPick, no RejectNote, no direction field - a lesson, never a judging.
//
// The reasons are the scout source's video axes, the vocabulary the round's Board packet keys
// (@gt/ui/board/productionReasons), so a take judged here and in the gallery speaks one language.

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

import type { Production, ProductionNode } from "@gt/domain/productionGraph";
import { productionReasons } from "@gt/ui/board/productionReasons";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { ClipReview, type TimelineVerdict } from "@gt/ui/components/timeline/ClipReview.tsx";
import { timecode, type TimelineBlock } from "@gt/ui/components/timeline/geometry.ts";
import { useMasterClock } from "@gt/ui/components/timeline/useMasterClock.ts";
import { targetInfo } from "@gt/ui/keymap/target";

import type { CanvasStore } from "../store.ts";
import { Chip, cx, Gl } from "../ui/kit.tsx";
import { posterOf, sectionAt } from "./model.ts";
import o from "./overlay.module.css";

export const REASONS = productionReasons();

/** A take or the cut as the master clock's block: its span, its verdict, its video and its start still. */
export function blockOf(p: Production, n: ProductionNode): TimelineBlock {
  const poster = posterOf(p, n);
  return {
    id: n.id,
    label: n.label,
    at: n.at ?? 0,
    dur: n.dur ?? 0,
    state: n.state,
    ...(n.verdict === undefined ? {} : { verdict: n.verdict }),
    ...(n.media?.kind === "video" ? { video: n.media.src } : {}),
    ...(poster === undefined ? {} : { poster }),
  };
}

/** Writes one verdict through the port; the production it answers with replaces the store's. Answers the refusal. */
export async function writeVerdict(st: CanvasStore, production: string, v: TimelineVerdict): Promise<string | null> {
  const got = await st.port.productionVerdict({ production, node: v.node, verdict: v.verdict, reasons: v.reasons, ...(v.note === undefined ? {} : { note: v.note }) });
  if (!got.ok) return got.error.error;
  const after = got.value.production;
  st.prod.productions = st.prod.productions.map((x) => (x.id === after.id ? after : x));
  for (const r of st.scene.rivers) if (r.prod?.id === after.id) r.prod = after;
  st.changed("verdict");
  return null;
}

/** The take on the master clock, from its `at` to its end. Keyed by the node: a step to the next take is a new clock. */
export function ClipPlayer({ p, n }: { readonly p: Production; readonly n: ProductionNode }) {
  const block = useMemo(() => blockOf(p, n), [p, n]);
  const blocks = useMemo(() => [block], [block]);
  const t0 = block.at;
  const t1 = block.at + block.dur;
  const { audio, videos, showing, t, playing, toggle, pause, seek } = useMasterClock({ seconds: p.track.seconds, audioSrc: p.track.audio, blocks });
  // On open: the playhead at the take's first frame.
  useEffect(() => {
    seek(t0);
  }, [seek, t0]);
  // The take's end returns the playhead to its start.
  useEffect(() => {
    if (playing && t >= t1 - 0.04) {
      pause();
      seek(t0);
    }
  }, [playing, t, t0, t1, pause, seek]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== " " || targetInfo(e.target as HTMLElement).control || targetInfo(e.target as HTMLElement).editable) return;
    e.preventDefault();
    toggle();
  };
  const into = block.dur > 0 ? Math.min(1, Math.max(0, (t - t0) / block.dur)) : 0;
  const section = sectionAt(p.track, t);
  return (
    <div className={o.player} onKeyDown={onKey} role="group" aria-label={`${n.label}, ${timecode(t0)} to ${timecode(t1)} on ${p.track.title}`}>
      <div className={o.frame}>
        {videos.map((ref, i) => (
          <video key={i} ref={ref} className={cx(o.take, showing === i && o.on)} muted playsInline preload="auto" aria-hidden="true" />
        ))}
        {/* eslint-disable-next-line @next/next/no-img-element -- the take's own start frame, by the production's file door */}
        {showing === null && block.poster !== undefined && <img className={cx(o.take, o.on)} src={block.poster} alt="" />}
      </div>
      <div className={o.transport}>
        <button type="button" className={o.btn} onClick={toggle} aria-label={playing ? "Pause" : "Play"} aria-keyshortcuts="Space" data-role="overlay-play">
          <Gl name={playing ? "pause" : "play"} />
        </button>
        <span className={o.clock}>
          <b>{timecode(t)}</b> / {timecode(t1)}
        </span>
        {section !== "" && <span className={o.section}>{section}</span>}
        <span className={o.progress} aria-hidden="true">
          <i style={{ width: `${(into * 100).toFixed(2)}%` }} />
        </span>
      </div>
      {p.track.audio !== undefined && <audio ref={audio} src={p.track.audio} preload="auto" data-master="" />}
    </div>
  );
}

/** The take's verdict and direction; a refusal lands under it as the side's own sentence. */
export function ClipVerdict({ st, p, n }: { readonly st: CanvasStore; readonly p: Production; readonly n: ProductionNode }) {
  const [error, setError] = useState<string | null>(null);
  const judge = async (v: TimelineVerdict): Promise<void> => {
    setError(null);
    setError(await writeVerdict(st, p.id, v));
  };
  return (
    <div data-role="clip-verdict">
      <ClipReview block={blockOf(p, n)} reasons={REASONS} noteMax={REASONS.noteMax} onVerdict={(v) => void judge(v)} />
      {error !== null && <ErrorLine message={error} live />}
    </div>
  );
}

/** Another device's verdict on a take, as text: the verdict, its reasons and its note, nothing to press. */
export function ClipVerdictText({ n }: { readonly n: ProductionNode }) {
  const v = n.verdict;
  return (
    <div className={o.facts2} data-role="clip-verdict-read" role="group" aria-label={`verdict on ${n.label}`}>
      <span className={o.k}>verdict</span>
      <span>{v === undefined ? <Chip tone="faint">no verdict</Chip> : <Chip tone={v.verdict === "keep" ? "emerald" : "rose"}>{v.verdict}</Chip>}</span>
      {v !== undefined && v.reasons.length > 0 && (
        <>
          <span className={o.k}>reasons</span>
          <span className={o.axes}>
            {v.reasons.map((r) => (
              <Chip key={r} tone="faint">
                {r}
              </Chip>
            ))}
          </span>
        </>
      )}
      {v?.note !== undefined && (
        <>
          <span className={o.k}>note</span>
          <q className={o.prompt}>{v.note}</q>
        </>
      )}
    </div>
  );
}
