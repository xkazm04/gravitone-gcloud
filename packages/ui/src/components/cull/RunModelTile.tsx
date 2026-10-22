// One variant of an OPENED run (the mosaic's RunModal), where the current model is looked at in 3D
// (Director's ruling, spark game-3d-assets WP4): the cell under the cursor, when it is a model
// (`model/*`), mounts the lazy ModelViewer at the run's large size; every other cell is the
// ordinary CullTile, a poster. Moving the cursor moves the one canvas - the old cell drops back to
// its CullTile and its stage unmounts with it - so one WebGL context exists at a time, and the
// mosaic's cards (RunCard) never reach this file at all.
//
// THE DESK'S KEYS STAY THE DESK'S. The viewer orbits by pointer only (OrbitControls never listens
// to keys here), and a pointer press on the cell takes no focus - the CullTile's own rule - so K, X,
// the arrows, Z and ⏎ still reach the desk's keymap, never a focused toggle. The cell is not a
// button: the viewer's own toggles are buttons, and a button cannot hold a button.
import { lazy, Suspense } from "react";

import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { CullTile, kindOf, spokenTile, type CullTileProps } from "./CullTile.tsx";
import s from "./Cull.module.css";
import m from "./RunModelTile.module.css";

// Lazy for the same reason as the Zoom's: a run that never opens a model fetches none of it.
const ModelViewer = lazy(() => import("../model/ModelViewer.tsx").then((x) => ({ default: x.ModelViewer })));

export function RunModelTile(props: CullTileProps) {
  const { index, words, media, verdict, current, nudged, onPress } = props;
  if (!current || kindOf(media.mime) !== "model") return <CullTile {...props} />;
  return (
    <div
      className={cx(s.tile, s.large, s.cur, verdict?.verdict === "keep" && s.keep, verdict?.verdict === "reject" && s.reject, nudged && s.nudge)}
      data-tile={index}
      data-live-model=""
      role="gridcell"
      aria-selected
      aria-label={spokenTile(words, verdict)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPress(index)}
    >
      <div className={m.stage}>
        <Suspense fallback={null}>
          <ModelViewer key={media.url} src={media.url} title={words.label} fill {...(words.poster === undefined ? {} : { poster: words.poster })} />
        </Suspense>
      </div>
      <span className={s.cap}>
        <span className={s.ell}>{words.label}</span>
        {words.meta !== undefined && <span className={s.capMeta}>{words.meta} · 3D</span>}
      </span>
      <span className={s.badge} aria-hidden="true">
        {verdict?.verdict === "keep" ? "✓" : "✕"}
      </span>
      {verdict?.verdict === "reject" && verdict.reasons.length > 0 && (
        <span className={s.reasons} aria-hidden="true">
          {verdict.reasons.map((r) => (
            <Chip key={r} label={r} tone="rose" />
          ))}
        </span>
      )}
    </div>
  );
}
