// THE BAND ON STAGE (variant "stage", kind `stems`): every part of the song is a performer, standing
// where a band stands seen from the audience (drums at the back, bass and chords on the flanks, the
// tunes in front). Who is playing is who you see: a halo glows with each part's loudness at the
// playhead, a stepped-back (muted) player dims, the spotlight (solo) lights one, a part that sits out
// the picked section rests, and a part with no audio yet is a dashed silhouette joining soon.
// Each performer carries its own play mark, its waveform, step back, spotlight, volume and left/right.
import type { StudioNodeOf, StudioStem } from "@gt/domain/audio.studio";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { Fader } from "@gt/ui/components/fader/Fader.tsx";
import { effectiveGains, type StemMix } from "@gt/ui/components/audio/mix.ts";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { Wave } from "@gt/ui/components/wave/Wave.tsx";
import { Performer, type Presence } from "@gt/ui/components/studio-stage/Performer.tsx";
import { arrange, haloLevel, levelWords, panWords, playsIn, STAGE_PLACES } from "@gt/ui/components/studio-stage/stage.ts";

import { localMix, localPlay, soundKey } from "../../_host/press.ts";
import type { StageCtx } from "./ctx.ts";
import s from "./stage.module.css";

const PEAKS = 64;

/** A row's as-rendered mix (the turn's own settings), under which the person's changes sit. */
export const baseMix = (r: StudioStem): StemMix => ({
  ...(r.muted !== undefined ? { muted: r.muted } : {}),
  ...(r.solo !== undefined ? { solo: r.solo } : {}),
  ...(r.levelDb !== undefined ? { levelDb: r.levelDb } : {}),
  ...(r.pan !== undefined ? { pan: r.pan } : {}),
});

export function Band({ node, ctx }: { readonly node: StudioNodeOf<"stems">; readonly ctx: StageCtx }) {
  const { transport, turn, stage, focus, audition } = ctx;
  const mixes = node.rows.map((r) => ({ id: r.id, ...transport.mixOf(r.id, baseMix(r)) }));
  const gains = effectiveGains(mixes);
  const anySolo = mixes.some((m) => m.solo === true && m.muted !== true);
  const stemsKey = soundKey(stage.id, node.id);
  const key = transport.state === "playing" ? (transport.sounding?.key ?? null) : null;
  const ownParts = key !== null && (key === stemsKey || key.startsWith(`${stemsKey}/`));
  const lit = (id: string): boolean => (ownParts ? (transport.sounding?.ids.includes(id) ?? false) : key !== null && ctx.bandSounding);
  const candidatesFor = (id: string) => turn.show.find((n): n is StudioNodeOf<"candidates"> => n.kind === "candidates" && "stem" in n.for && n.for.stem === id);
  const silent = node.rows.every((r) => r.audio === undefined);
  const places = arrange(node.rows);

  const presence = (r: StudioStem, i: number): Presence => {
    const m = mixes[i];
    if (r.audio === undefined) return "soon";
    if (m?.muted === true) return "out";
    if (audition?.mode === "alone") return "dim";
    if (anySolo && m?.solo !== true) return "dim";
    return "on";
  };

  const tile = (r: StudioStem) => {
    const i = node.rows.indexOf(r);
    const m = mixes[i] ?? { id: r.id };
    const p = presence(r, i);
    const waiting = candidatesFor(r.id);
    const standIn = audition?.mode === "in_mix" && waiting?.id === audition.node ? (waiting.rows.find((c) => c.id === audition.candidate)?.name ?? null) : null;
    const peaks = r.audio === undefined ? null : transport.peaks(r.audio.href, PEAKS);
    const gain = ownParts ? (gains[r.id] ?? 0) : 1;
    const resting = focus !== null && !playsIn(r.enters, focus);
    const heard = p === "on" && !resting && lit(r.id);
    const level = heard ? haloLevel(peaks, transport.clock, transport.duration, gain) : 0;
    const played = lit(r.id) && transport.duration !== null && transport.duration > 0 ? transport.clock / transport.duration : undefined;
    const partKey = soundKey(stage.id, node.id, r.id);
    return (
      <Performer key={r.id} role={r.role} label={r.label} presence={p} resting={resting} spotlight={m.solo === true} level={level} sounding={heard} enters={r.enters} section={focus} standIn={standIn} waiting={waiting?.rows.length ?? 0}>
        {r.audio !== undefined && (
          <span className={s.hearRow}>
            <EarButton state={transport.stateOf(partKey)} name={`just the ${r.label}`} onPress={() => ctx.press(localPlay(node.id, r.id), stage.id)} />
            <span className={s.wave}>
              <Wave peaks={peaks ?? []} width={160} height={24} tone={p === "on" ? "cyan" : "violet"} {...(played !== undefined ? { played } : {})} stretch />
            </span>
          </span>
        )}
        <span className={s.chips}>
          <Chip label={m.muted === true ? "come back" : "step back"} casing="lower" pressed={m.muted === true} onPress={() => ctx.press(localMix(r.id, { muted: m.muted !== true }))} name={`${m.muted === true ? "bring back" : "step back"} the ${r.label}`} />
          <Chip label="spotlight" casing="lower" tone={m.solo === true ? "amber" : "neutral"} pressed={m.solo === true} onPress={() => ctx.press(localMix(r.id, { solo: m.solo !== true }))} name={`spotlight on the ${r.label}`} />
        </span>
        <span className={s.knob}>
          <span className={s.knobName}>volume</span>
          <Fader label={`${r.label} volume`} value={Math.max(-24, Math.min(6, m.levelDb ?? 0))} min={-24} max={6} step={1} onChange={(db) => ctx.press(localMix(r.id, { db }))} valueText={levelWords(m.levelDb ?? 0)} />
        </span>
        <span className={s.knob}>
          <span className={s.knobName}>left / right</span>
          <Fader label={`${r.label} left or right`} value={m.pan ?? 0} min={-1} max={1} step={0.1} centred onChange={(pan) => ctx.press(localMix(r.id, { pan: Math.round(pan * 10) / 10 }))} valueText={panWords(m.pan ?? 0)} />
        </span>
      </Performer>
    );
  };

  return (
    <div className={s.band}>
      <div className={s.bandHead}>
        <span className={s.bandWords}>{silent ? "Nobody on stage can be heard yet." : `${node.rows.filter((r) => r.audio !== undefined).length} of ${node.rows.length} players can be heard`}</span>
        {node.source !== undefined && <SourceTag kind={node.source} value="line-up" />}
      </div>
      <div className={s.arc}>
        {STAGE_PLACES.map((place) => (places[place].length === 0 ? null : <div key={place} className={s.spot} data-place={place}>{places[place].map(tile)}</div>))}
      </div>
    </div>
  );
}
