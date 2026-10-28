// THE HOUSE TRANSPORT (variant "stage", kind `track`): above the stage, the song's name and facts, the
// one transport row (what sounds, where it is, seek, stop), and the two ways to hear the song: the band
// playing part by part (so stepping back and the spotlight are heard live) or the finished recording.
import type { StudioNodeOf } from "@gt/domain/audio.studio";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { clockOf } from "@gt/ui/components/audio/mix.ts";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { TransportRow } from "@gt/ui/components/audio/TransportRow.tsx";

import { localPlay, nodeSound } from "../../_host/press.ts";
import type { StageCtx } from "./ctx.ts";
import s from "./stage.module.css";

/** The band's sound for this turn (its parts with audio), else the finished recording; null for neither. */
export function bandPress(ctx: StageCtx, track: StudioNodeOf<"track"> | null): (() => void) | null {
  const { stems, stage, press } = ctx;
  if (stems !== null && nodeSound(stage, stems) !== null) return () => press(localPlay(stems.id), stage.id);
  if (track !== null) return () => press(localPlay(track.id), stage.id);
  return null;
}

export function House({ node, ctx }: { readonly node: StudioNodeOf<"track"> | null; readonly ctx: StageCtx }) {
  const { transport, stage, stems } = ctx;
  const now = transport.sounding;
  const band = stems === null ? null : nodeSound(stage, stems);
  const playBand = bandPress(ctx, node);
  const title = node?.title ?? "No song on stage yet";
  return (
    <section className={s.house} aria-label="the song">
      <div className={s.houseHead}>
        <h2 className={s.title}>{title}</h2>
        {node?.bpm !== undefined && <Chip label="speed" value={`${node.bpm} bpm`} casing="lower" />}
        {node?.key !== undefined && <Chip label="key" value={node.key} casing="lower" />}
        {node?.lengthS !== undefined && <Chip label="length" value={clockOf(node.lengthS)} casing="lower" />}
        {node?.source !== undefined && <SourceTag kind={node.source} />}
      </div>
      <TransportRow
        name={now?.name ?? (band !== null ? "the band" : (node?.title ?? "the song"))}
        state={transport.state}
        clock={transport.clock}
        duration={transport.duration}
        failed={transport.failed}
        onToggle={() => (now !== null ? transport.stop() : playBand?.())}
        onSeek={transport.seek}
        onStop={transport.stop}
      />
      <div className={s.ways}>
        {band !== null && stems !== null && (
          <span className={s.way}>
            <EarButton state={transport.stateOf(band.key)} name="the band, part by part" onPress={() => ctx.press(localPlay(stems.id), stage.id)} />
            the band, part by part
          </span>
        )}
        {node !== null && (
          <span className={s.way}>
            <EarButton state={transport.stateOf(nodeSound(stage, node)?.key ?? "")} name="the finished recording" onPress={() => ctx.press(localPlay(node.id), stage.id)} />
            the finished recording
          </span>
        )}
        {node === null && band === null && <span className={s.quiet}>Nothing here can be played yet.</span>}
      </div>
    </section>
  );
}
