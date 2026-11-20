"use client";

// A · THE RIVER OF STATIONS - the production as the canvas's own idiom: one river from the track to the cut, a station
// marker on it for each of the six stations, and under each station the nodes it holds. A swap's stale marks ripple
// downstream station by station (once), then the stale state holds: amber hatch on every node the swap invalidated,
// the station's marker hatched while any of its nodes is stale.

import { cx } from "../ui/kit.tsx";
import { caption, countLine, posterOf, STATION_NAME, stationsOf, type StationCol } from "./model.ts";
import { CastCard, TrackFacts, type StreetProps } from "./parts.tsx";
import { Tile } from "./Tile.tsx";
import v from "./variants.module.css";

/** One station's step in the ripple, and a node's place inside it. */
const STEP_MS = 260;
const IN_STATION_MS = 14;

function Station({ col, ix, props }: { readonly col: StationCol; readonly ix: number; readonly props: StreetProps }) {
  const { p, focus, rippling, onPick } = props;
  const name = STATION_NAME[col.station];
  const dense = col.station === "keyframe";
  const tiles = col.station === "look" ? col.nodes.filter((n) => n.id !== "look") : col.nodes;
  return (
    <section className={v.station} aria-label={`${name}, ${countLine(col.counts)}`} data-station={col.station}>
      <div className={v.stHead}>
        <i className={cx(v.mark, col.counts.stale > 0 && v.stale)} aria-hidden="true" />
        <h3 className={v.h3}>{name}</h3>
        <span className={v.n}>
          {col.counts.stale > 0 ? <span className={v.amberText}>{col.counts.stale} stale</span> : col.nodes.length}
        </span>
      </div>
      {col.station === "track" && <TrackFacts p={p} />}
      {col.station === "look" && (
        <p className={v.read} style={{ marginBottom: 10 }}>
          {p.look}
        </p>
      )}
      {col.station === "cast" ? (
        <CastCard p={p} onSwap={props.onSwap} onDropCore={props.onDropCore} />
      ) : col.station === "track" ? null : (
        <div className={cx(v.tiles, dense && v.small, col.station === "cut" && v.one)}>
          {tiles.map((n, i) => (
            <Tile
              key={n.id}
              n={n}
              on={focus === n.id}
              ripple={rippling?.has(n.id) === true ? ix * STEP_MS + i * IN_STATION_MS : null}
              caption={caption(n)}
              compact={dense}
              poster={posterOf(p, n)}
              onPick={onPick}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function RiverStreet(props: StreetProps) {
  return (
    <div className={v.river} data-variant="a">
      {stationsOf(props.p).map((col, ix) => (
        <Station key={col.station} col={col} ix={ix} props={props} />
      ))}
    </div>
  );
}
