// THE DESK'S TIMELINE ROWS (spark audio-agent-studio, variant "desk"): the sections ruler across the
// top (columns sized by seconds, or by bars when the tempo is unknown; energy as a soft fill; press
// one to play from there), and one lane per stem beneath - its head (LaneHead: mute, only this,
// volume, left or right) and its body (waveform from the transport's peaks, the sections it plays
// in lit, the rest veiled, a planned stem hatched). The `--desk-at` playhead is shared by all.
import type { CSSProperties } from "react";

import type { StudioNodeOf } from "@gt/domain/audio.studio";
import { Wave } from "@gt/ui/components/wave/Wave.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { LaneHead } from "@gt/ui/components/studio-desk/LaneHead.tsx";
import { ROLE_TONE } from "@gt/ui/components/studio-desk/RoleMark.tsx";
import { laneState, rowMix, type Placed } from "@gt/ui/components/studio-desk/desk.ts";

import { localMix, localPlay, nodeSound, spansOf } from "../../_host/press.ts";
import { turnOf, type DeskCtx } from "./ctx.ts";
import s from "./lanes.module.css";

const PEAKS = 200;
const W = 600;
const H = 52;

/** A lane's body: waveform, section cells (lit where the stem plays), the shared playhead. */
export function LaneBody({ ctx, peaks, tone, enters, planned = false, note, markEnd = false }: { readonly ctx: DeskCtx; readonly peaks: readonly number[] | null; readonly tone: "cyan" | "violet" | "emerald" | "amber"; readonly enters?: readonly boolean[] | undefined; readonly planned?: boolean; readonly note?: string; readonly markEnd?: boolean }) {
  const cols = ctx.axis === null ? 0 : ctx.axis.weights.length;
  const audio = ctx.axis?.audio ?? 1;
  const tail = ctx.axis !== null && ctx.axis.tail > 0;
  const cells = Array.from({ length: cols + (tail ? 1 : 0) }, (_, i) => (enters === undefined ? null : (enters[Math.min(i, enters.length - 1)] ?? true)));
  return (
    <div className={s.body} data-planned={planned}>
      {cols > 0 && (
        <div className={s.cells} aria-hidden="true">
          {cells.map((on, i) => (
            <span key={i} className={s.cell} data-on={on === null ? undefined : on} />
          ))}
        </div>
      )}
      {!planned && (
        <span className={s.wave} style={{ width: `${audio * 100}%` }}>
          {peaks === null ? <span className={s.flat}>{note ?? "drawing the waveform"}</span> : <Wave peaks={peaks} width={W} height={H} tone={tone} stretch {...(ctx.head === null ? {} : { played: ctx.head })} />}
        </span>
      )}
      {markEnd && audio < 1 && (
        <span className={s.beyond} style={{ left: `${audio * 100}%` }}>
          the sound ends here; the rest is planned
        </span>
      )}
      {planned && <span className={s.plannedWords}>planned, not yet audible</span>}
      <span className={s.playhead} aria-hidden="true" />
    </div>
  );
}

/** The sections kind: the ruler above the lanes. */
export function SectionsRuler({ placed, ctx }: { readonly placed: Placed<"sections">; readonly ctx: DeskCtx }) {
  const { node } = placed;
  const t = turnOf(ctx.v, placed.turnId);
  const spans = t === undefined ? null : spansOf(t);
  const tail = ctx.axis !== null && ctx.axis.tail > 0;
  return (
    <div className={s.lane} data-row="ruler">
      <div className={s.corner}>
        <span className={s.kicker}>sections</span>
        {node.source !== undefined && <SourceTag kind={node.source} />}
        <span className={s.hint}>{spans === null ? "no tempo, so sections are drawn by bars" : "press one to play from there"}</span>
      </div>
      <div className={s.ruler}>
        {node.rows.map((r, i) => {
          const from = spans?.[i]?.startS;
          return (
            <button key={`${r.name}-${i}`} type="button" className={s.sec} style={{ "--e": r.energy } as CSSProperties} disabled={from === undefined} aria-label={from === undefined ? `${r.name}, ${r.bars} bars` : `play from ${r.name}`} onClick={() => from !== undefined && ctx.playFrom(from)}>
              <span className={s.energy} aria-hidden="true" />
              <b className={s.secName}>{r.name}</b>
              <span className={s.secBars}>{`${r.bars} bars · ${energyWords(r.energy)}`}</span>
            </button>
          );
        })}
        {tail && <span className={s.tailSec}>the end</span>}
      </div>
    </div>
  );
}

const energyWords = (e: number): string => (e < 0.4 ? "quiet" : e < 0.75 ? "medium" : "full");

/** No sections on the desk: one ruler cell saying so, so the lanes still have a top edge. */
export function RulerAbsent() {
  return (
    <div className={s.lane} data-row="ruler">
      <div className={s.corner}>
        <span className={s.kicker}>sections</span>
      </div>
      <div className={s.ruler}>
        <span className={s.tailSec}>this answer did not split the track into sections</span>
      </div>
    </div>
  );
}

/** The stems kind: one lane per part, a "try instead" drawer docked under the part it would replace. */
export function StemLanes({ placed, ctx }: { readonly placed: Placed<"stems">; readonly ctx: DeskCtx }) {
  const { node, turnId } = placed;
  const { transport } = ctx.v;
  const t = turnOf(ctx.v, turnId);
  const mixes = node.rows.map((r) => transport.mixOf(r.id, rowMix(r)));
  const anySolo = node.rows.some((r, i) => r.audio !== undefined && mixes[i]?.solo === true);
  const heard = node.rows.filter((r) => r.audio !== undefined).length;
  return (
    <>
      <div className={s.groupHead}>
        <span className={s.kicker}>{`the parts · ${heard} of ${node.rows.length} audible`}</span>
        {node.source !== undefined && <SourceTag kind={node.source} />}
        {placed.carried && <span className={s.hint}>from an earlier answer</span>}
      </div>
      {node.rows.map((r, i) => {
        const mix = mixes[i] ?? {};
        const snd = t === undefined ? null : nodeSound(t, node, r.id);
        const state = laneState(r.audio !== undefined, mix, anySolo);
        return (
          <div key={r.id} className={s.group}>
            <div className={s.lane} data-state={state} data-row="stem">
              <LaneHead
                role={r.role}
                label={r.label}
                state={state}
                mix={mix}
                illustrative={node.source === "illustrative" && r.audio === undefined}
                ear={snd === null ? null : { state: transport.stateOf(snd.key), onPress: () => ctx.press(localPlay(node.id, r.id), turnId) }}
                onMute={(on) => ctx.press(localMix(r.id, { muted: on }), turnId)}
                onSolo={(on) => ctx.press(localMix(r.id, { solo: on }), turnId)}
                onLevel={(db) => ctx.press(localMix(r.id, { db }), turnId)}
                onPan={(pan) => ctx.press(localMix(r.id, { pan }), turnId)}
              />
              <LaneBody ctx={ctx} peaks={r.audio === undefined ? null : transport.peaks(r.audio.href, PEAKS)} tone={ROLE_TONE[r.role]} enters={r.enters} planned={r.audio === undefined} />
            </div>
            {ctx.slot("candidates", (c) => c.kind === "candidates" && "stem" in c.for && c.for.stem === r.id)}
          </div>
        );
      })}
    </>
  );
}

/** No parts on the desk: the lanes' place says what would be there. */
export function LanesAbsent() {
  return <p className={s.absent}>No parts yet. When the agent splits the track into parts, each one gets its own lane here.</p>;
}

export const stemsOnDesk = (n: StudioNodeOf<"stems"> | undefined): ReadonlySet<string> => new Set(n?.rows.map((r) => r.id) ?? []);
export { PEAKS };
