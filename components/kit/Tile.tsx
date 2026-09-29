"use client";

// A CANDIDATE. A picture that is judged, and shows the judgement on itself:
//
//   kept       an Aldebaran ring draws itself around it and a spark crosses it
//   rejected   a dark disc slides across it and the picture goes to ash
//   focused    plate registration corners close in on it
//   undecided  nothing: the hairline of an unjudged plate
//
// A tile that has no picture says why in a mark and a word: queued, generating (with
// its step), failed (with the real error), deleted (the file is gone, the record
// stays). Nothing in a tile is focusable except its own buttons: the window owns
// the arrow keys (CullGrid), and Enter is the caller's.

import { StatusGlyph } from "./StatusGlyph";

export type TileState = "ready" | "queued" | "generating" | "failed" | "deleted";

export function Tile({
  id,
  label,
  src,
  alt = "",
  ratio = "16 / 9",
  verdict,
  focused = false,
  state = "ready",
  detail,
  step,
  chips,
  actions,
  flag,
  onFocus,
  onOpen,
  keepStamp = "kept",
}: {
  /** The DOM id, for scrolling a focused tile into view. */
  id?: string;
  /** The tile's accessible name: "Blueprint, words only, seed 3". */
  label: string;
  src?: string;
  alt?: string;
  ratio?: string;
  verdict?: "keep" | "reject" | null;
  focused?: boolean;
  state?: TileState;
  /** The real error (failed) or the words under the mark. */
  detail?: string;
  /** Progress of a generating tile, 0-1. */
  step?: number;
  /** Score chips, drawn over the picture's lower edge. */
  chips?: React.ReactNode;
  /** `<VerdictKeys variant="tile">`, shown on hover / focus / when decided. */
  actions?: React.ReactNode;
  /** A chip in the top-right corner (TEXT on a source). */
  flag?: React.ReactNode;
  onFocus?: () => void;
  onOpen?: () => void;
  keepStamp?: string;
}) {
  const v = state === "ready" ? verdict : null;
  return (
    <div
      id={id}
      role="group"
      aria-roledescription="candidate"
      aria-label={`${label}${v ? (v === "keep" ? ", kept" : ", rejected") : ""}`}
      onClick={onFocus}
      className={`k-tile${v ? ` k-tile--${v}` : ""}${focused ? " k-tile--focus" : ""}`}
      style={{ aspectRatio: ratio }}
    >
      {state === "ready" && src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- local disk through the file seam */}
          <img src={src} alt={alt} loading="lazy" draggable={false} onClick={onOpen} />
          <span className="k-tile__occ" aria-hidden="true" />
          <svg className="k-tile__ring" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">
            <rect x="1" y="1" width="98" height="98" pathLength="1" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="k-tile__fl" aria-hidden="true" />
          <span className="k-tile__fl k-tile__fl--v" aria-hidden="true" />
        </>
      ) : (
        <TileEmpty state={state === "ready" ? "queued" : state} detail={detail} step={step} />
      )}
      <i className="k-cn k-cn--a" aria-hidden="true" />
      <i className="k-cn k-cn--b" aria-hidden="true" />
      <i className="k-cn k-cn--c" aria-hidden="true" />
      <i className="k-cn k-cn--d" aria-hidden="true" />
      {v === "keep" && (
        <span className="k-stamp k-stamp--keep">
          <span aria-hidden="true">✦</span> {keepStamp}
        </span>
      )}
      {v === "reject" && <span className="k-stamp k-stamp--reject">rejected</span>}
      {chips && <div className="k-tile__chips">{chips}</div>}
      {flag && <span className="k-tile__flag">{flag}</span>}
      {actions && state === "ready" && <div className="k-tile__vb">{actions}</div>}
    </div>
  );
}

function TileEmpty({ state, detail, step }: { state: Exclude<TileState, "ready">; detail?: string; step?: number }) {
  if (state === "generating") {
    return (
      <div className="k-tempty">
        <svg viewBox="-20 -20 40 40" aria-hidden="true">
          <circle r="15" className="k-s-gold k-f-none" strokeOpacity="0.3" />
          <circle r="15" className="k-spin k-s-gold k-f-none" strokeWidth="1.6" strokeDasharray="14 80" style={{ animationDuration: "1.8s" }} />
          <circle r="2.6" className="k-f-white k-s-none" />
        </svg>
        <b>generating</b>
        {detail && <span className="k-num">{detail}</span>}
        {typeof step === "number" && (
          <span className="k-tempty__bar" aria-hidden="true">
            <i style={{ width: `${Math.round(100 * step)}%` }} />
          </span>
        )}
      </div>
    );
  }
  const word = state === "failed" ? "failed" : state === "deleted" ? "deleted" : "queued";
  const kind = state === "failed" ? "failed" : state === "deleted" ? "reject" : "queued";
  return (
    <div className={`k-tempty${state === "failed" ? " k-tempty--failed" : ""}`}>
      <StatusGlyph kind={kind} decorative size={30} />
      <b>{word}</b>
      {detail && <span>{detail}</span>}
    </div>
  );
}
