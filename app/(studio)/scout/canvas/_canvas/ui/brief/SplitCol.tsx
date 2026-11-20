"use client";

// THE ADVISORY SPLIT AND THE PAUSES - each audience's target share beside the share the last nights actually took, and
// the branches the steer holds paused (resume one here). Port of the winner's brief.js split column. The night's caps
// and the money line the prototype printed under it are not in the canvas's view, so they are not drawn.

import { pause } from "../../acts.ts";
import type { River } from "../../scene/types.ts";
import type { CanvasStore } from "../../store.ts";
import { Chip, cx, Gl, kit } from "../kit.tsx";
import d from "../desk.module.css";
import { AUD, type Aud } from "./command.ts";

export function SplitCol({ st, split, onSplit, can }: { readonly st: CanvasStore; readonly split: Readonly<Record<string, number>>; readonly onSplit: (k: Aud, v: number) => void; readonly can: boolean }) {
  const actual = (k: string): number => st.view.graph.groups.find((g) => g.key === k)?.share?.actual ?? 0;
  const paused: River[] = st.scene.rivers.filter((r) => r.paused);
  return (
    <div className={d.col}>
      <h3>
        Split {can ? <Chip>exists</Chip> : <Chip tone="planned">planned</Chip>} <span className={d.sub}>target · recent nights</span>
      </h3>
      {AUD.map((k) => (
        <div key={k} className={d.split}>
          <span className={d.k}>{k}</span>
          <input type="range" min={0} max={100} value={split[k] ?? 0} aria-label={`${k} share`} onChange={(e) => onSplit(k, Number(e.currentTarget.value))} />
          <span className={d.v}>{split[k] ?? 0}%</span>
          <span className={d.ac}>{actual(k)}%</span>
        </div>
      ))}
      <h3 className={d.gap}>
        Paused{" "}
        <span className={d.sub}>
          {paused.length} branches · {st.view.graph.paused.length} seeds
        </span>
      </h3>
      {paused.map((r) => (
        <div key={r.key} className={cx(kit.noterow, d.pausedRow)}>
          <Gl name="pause" size={13} />
          <span className={kit.t}>{r.name}</span>
          <button type="button" aria-label={`Resume ${r.name}`} disabled={!can} onClick={() => void pause(st, r)}>
            <Gl name="play" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
