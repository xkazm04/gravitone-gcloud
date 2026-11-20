"use client";

// A PRODUCTION NODE AS A TILE - the one shape every street variant draws a node with: its picture (or the take, or a
// hatch where nothing is drawn yet), its label and state, the eye's drift badge (identity · room · wardrobe, holds or
// drifts) with the eye's reason on hover and focus, and an accessible name that says all of it. Pictures are the
// file door's own bytes (next/image would re-encode the frames being judged: the scout canvas's reason, eslint scope).

import type { CSSProperties } from "react";

import { DRIFT_AXES, type Drift, type ProductionNode } from "@gt/domain/productionGraph";

import { cx } from "../ui/kit.tsx";
import { drifting, NODE_STATE, nodeName } from "./model.ts";
import s from "./street.module.css";

/** A node's picture: its image, a take's video, or a hatch with the state's word where there is nothing to show. */
export function Pic({ n, video = false, pending = false, poster }: { readonly n: ProductionNode; readonly video?: boolean; readonly pending?: boolean; readonly poster?: string | undefined }) {
  const m = n.media;
  return (
    <span className={s.pic}>
      {pending ? (
        <span className={s.pendingPic}>pending</span>
      ) : m === undefined || m.kind === "audio" ? (
        <span className={s.empty}>{n.label}</span>
      ) : m.kind === "video" && video ? (
        <video src={m.src} poster={poster} muted playsInline loop preload="metadata" aria-hidden="true" />
      ) : m.kind === "video" && poster !== undefined ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" loading="lazy" decoding="async" />
      ) : m.kind === "video" ? (
        <span className={s.empty}>{n.label}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.src} alt="" loading="lazy" decoding="async" />
      )}
    </span>
  );
}

/** Three marks, identity · room · wardrobe: hollow holds, filled drifts. The words are the tile's accessible name. */
export function DriftBadge({ d }: { readonly d: Drift }) {
  return (
    <span className={s.drift} aria-hidden="true">
      {DRIFT_AXES.map((a) => (
        <i key={a} className={cx(d[a] === "drifts" && s.dr)} />
      ))}
    </span>
  );
}

export type TileProps = {
  readonly n: ProductionNode;
  readonly on?: boolean;
  /** The ripple's delay in ms while it plays (the accept just made this node stale). */
  readonly ripple?: number | null;
  /** A take plays its video instead of a still. */
  readonly video?: boolean;
  /** A preview frame the experiment has not drawn yet. */
  readonly pending?: boolean;
  readonly caption?: string;
  /** A small tile: the state is its border and hatch only (and its accessible name), no word. */
  readonly compact?: boolean;
  /** A take's or the cut's still (model.ts posterOf). */
  readonly poster?: string | undefined;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly onPick?: (n: ProductionNode) => void;
};

export function Tile({ n, on = false, ripple = null, video = false, pending = false, caption, compact = false, poster, className, style, onPick }: TileProps) {
  const state = pending ? "pending" : n.state;
  const drift = pending ? undefined : n.drift;
  const st = NODE_STATE[state];
  const drifts = drift === undefined ? [] : drifting(drift);
  const name = pending ? `${n.label}, pending` : nodeName(n);
  return (
    <button
      type="button"
      className={cx(s.tile, state !== "made" && s[state], on && s.on, ripple !== null && s.ripple, className)}
      style={ripple === null ? style : ({ ...style, "--delay": `${ripple}ms` } as CSSProperties)}
      aria-label={name}
      aria-pressed={onPick === undefined ? undefined : on}
      data-node={n.id}
      data-state={state}
      onClick={onPick === undefined ? undefined : () => onPick(n)}
    >
      <Pic n={n} video={video} pending={pending} poster={poster} />
      {drift !== undefined && <DriftBadge d={drift} />}
      {state !== "made" && !pending && !compact && <span className={s.st}>{st.word}</span>}
      {caption !== undefined && caption !== "" && <span className={s.cap}>{caption}</span>}
      {drift !== undefined && (
        <span className={s.why} aria-hidden="true">
          <b>{drifts.length === 0 ? "holds" : `${drifts.join(" · ")} drifts`}</b>
          {drift.reason}
        </span>
      )}
    </button>
  );
}
