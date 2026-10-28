"use client";

// THE CARD'S PARTS (canvas, WP3): the answer's stems as compact rows inside the card - each part's
// play mark (that part alone), its plain name, its waveform with the playhead and, when the turn
// shows sections, the per-section entry mask drawn under the same columns as a sections header -
// and "all controls" opens each row's level and side faders. Off / only-this / level / side go
// through the host's local presses (they persist by stem id for the session). Degraded: a part with
// no audio reads "planned, not yet audible", dashed and hatched, its settings still kept.
import type { CSSProperties } from "react";
import { useState } from "react";

import type { StudioStem } from "@gt/domain/audio.studio";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { Fader } from "@gt/ui/components/fader/Fader.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";
import { Wave } from "@gt/ui/components/wave/Wave.tsx";
import type { StemMix } from "@gt/ui/components/audio/mix.ts";

import { localMix, localPlay, soundKey, spansOf } from "../../../_host/press.ts";
import { bandCells, entersWords, levelWords, nodeOf, panWords, type Cell } from "../model.ts";
import { soundsUnder, usePlayhead } from "../live.ts";
import type { PieceCtx, PieceProps } from "../registry.tsx";
import s from "./pieces.module.css";

const box = (c: Cell): CSSProperties => ({ left: `${c.left * 100}%`, width: `${c.width * 100}%` });

const baseOf = (r: StudioStem): StemMix => ({
  ...(r.muted !== undefined ? { muted: r.muted } : {}),
  ...(r.solo !== undefined ? { solo: r.solo } : {}),
  ...(r.levelDb !== undefined ? { levelDb: r.levelDb } : {}),
  ...(r.pan !== undefined ? { pan: r.pan } : {}),
});

const changed = (base: StemMix, now: StemMix): boolean =>
  (now.muted ?? false) !== (base.muted ?? false) || (now.solo ?? false) !== (base.solo ?? false) || (now.levelDb ?? 0) !== (base.levelDb ?? 0) || (now.pan ?? 0) !== (base.pan ?? 0);

export function Parts({ node, ctx }: PieceProps<"stems">) {
  const { turn, transport } = ctx;
  const [full, setFull] = useState(false);
  const sections = nodeOf(turn, "sections");
  const cells = sections === undefined ? null : bandCells(sections.rows, spansOf(turn), ctx.lengthS);
  const partsOn = soundsUnder(transport, turn.id, node.id);
  const pos = usePlayhead(transport, partsOn);
  const len = partsOn ? transport.duration : null;
  const frac = partsOn && len !== null && len > 0 ? pos / len : undefined;
  const audible = node.rows.filter((r) => r.audio !== undefined).length;
  const allKey = soundKey(turn.id, node.id);
  const edits = node.rows.some((r) => changed(baseOf(r), transport.mixOf(r.id, baseOf(r))));
  const illustrative = node.source === "illustrative";
  return (
    <section className={s.parts} aria-label="the parts" data-provisional={illustrative || undefined}>
      <div className={s.partsHead}>
        <CapsHeading text="the parts" level={4} tally={{ value: audible, of: node.rows.length, label: "can be heard" }} />
        {illustrative && <SourceTag kind="illustrative" />}
        <span className={s.grow} />
        {audible > 0 && (
          <span className={s.inline}>
            <EarButton state={transport.stateOf(allKey)} name="every part together" onPress={() => ctx.press(localPlay(node.id))} />
            <span className={s.quietInline}>every part together</span>
          </span>
        )}
        <Toggle label="all controls" on={full} onToggle={setFull} name={full ? "hide level and side controls" : "show level and side controls"} />
      </div>
      {edits && !partsOn && <p className={s.hint}>{"Your changes are heard when every part plays together (the play mark above), not in the finished take."}</p>}
      <div className={s.grid} data-full={full || undefined}>
        {sections !== undefined && cells !== null && (
          <div className={s.row} data-head="true" aria-hidden="true">
            <span />
            <span className={s.micro}>plays in</span>
            <span className={s.lane}>
              {sections.rows.map((sec, i) => {
                const c = cells[i];
                return c === undefined ? null : (
                  <span key={`${sec.name}-${i}`} className={s.laneHead} style={box(c)}>
                    {sec.name}
                  </span>
                );
              })}
            </span>
            <span />
          </div>
        )}
        {node.rows.map((r) => (
          <Row key={r.id} row={r} nodeId={node.id} ctx={ctx} cells={cells} sectionNames={sections?.rows ?? null} frac={frac} full={full} illustrative={illustrative} />
        ))}
      </div>
    </section>
  );
}

type RowProps = {
  readonly row: StudioStem;
  readonly nodeId: string;
  readonly ctx: PieceCtx;
  readonly cells: readonly Cell[] | null;
  readonly sectionNames: readonly { readonly name: string }[] | null;
  readonly frac: number | undefined;
  readonly full: boolean;
  readonly illustrative: boolean;
};

function Row({ row, nodeId, ctx, cells, sectionNames, frac, full, illustrative }: RowProps) {
  const { transport, turn } = ctx;
  const mix = transport.mixOf(row.id, baseOf(row));
  const planned = row.audio === undefined;
  const peaks = row.audio === undefined ? null : transport.peaks(row.audio.href, 90);
  const where = entersWords(row, sectionNames);
  const db = mix.levelDb ?? 0;
  const pan = mix.pan ?? 0;
  const silent = mix.muted === true;
  return (
    <div className={s.row} data-planned={planned || undefined} data-off={silent || undefined} data-only={mix.solo === true || undefined}>
      {planned ? (
        <span className={s.plannedMark} aria-hidden="true" />
      ) : (
        <EarButton state={transport.stateOf(soundKey(turn.id, nodeId, row.id))} name={`${row.label} alone`} onPress={() => ctx.press(localPlay(nodeId, row.id))} />
      )}
      <span className={s.words}>
        <span className={s.partName}>{row.label}</span>
        <span className={s.micro}>
          {planned ? (illustrative ? "planned, not yet audible" : "no sound for this part yet") : (where ?? row.role)}
          {planned && where !== null ? ` · ${where}` : ""}
        </span>
      </span>
      <span className={s.lane}>
        {peaks !== null ? <Wave peaks={peaks} width={400} height={28} tone={silent ? "amber" : "violet"} stretch {...(frac !== undefined ? { played: frac } : {})} /> : <span className={s.laneEmpty} />}
        {cells !== null &&
          row.enters !== undefined &&
          cells.map((c, i) => (row.enters?.[i] === true ? <span key={i} className={s.enterOn} style={box(c)} /> : <span key={i} className={s.enterOff} style={box(c)} />))}
        {frac !== undefined && !planned && <span className={s.head} style={{ left: `${Math.max(0, Math.min(1, frac)) * 100}%` }} />}
      </span>
      <span className={s.toggles}>
        <Toggle label="off" on={silent} onToggle={(next) => ctx.press(localMix(row.id, { muted: next }))} name={`${silent ? "turn on" : "turn off"} ${row.label}`} />
        <Toggle label="only this" on={mix.solo === true} onToggle={(next) => ctx.press(localMix(row.id, { solo: next }))} name={`hear only ${row.label}`} />
      </span>
      {full && (
        <span className={s.faders}>
          <span className={s.fader}>
            <span className={s.micro}>{`loudness: ${levelWords(db)}`}</span>
            <Fader label={`loudness of ${row.label}`} value={db} min={-30} max={6} step={1} valueText={levelWords(db)} onChange={(v) => ctx.press(localMix(row.id, { db: v }))} />
          </span>
          <span className={s.fader}>
            <span className={s.micro}>{`side: ${panWords(pan)}`}</span>
            <Fader label={`side of ${row.label}`} value={pan} min={-1} max={1} step={0.1} centred valueText={panWords(pan)} onChange={(v) => ctx.press(localMix(row.id, { pan: Math.round(v * 10) / 10 }))} />
          </span>
          {(db !== (row.levelDb ?? 0) || pan !== (row.pan ?? 0)) && (
            <Button
              label="as made"
              size="sm"
              onPress={() => {
                ctx.press(localMix(row.id, { db: row.levelDb ?? 0 }));
                ctx.press(localMix(row.id, { pan: row.pan ?? 0 }));
              }}
            />
          )}
        </span>
      )}
    </div>
  );
}
