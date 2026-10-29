"use client";

// THE SHEET'S RIGHT PANEL (spark suno-advisor S1, composition b): what answered the pinned version.
//   sketch    the free local sketch of its direction (a tweak after a verdict has none of its own, so
//             the nearest ancestor's speaks for it, marked with the version it came from)
//   takes     each Suno take the person brought back: its play mark and waveform, the agent's
//             measures chips about it, and its facts - measured here, and the listener's read behind
//             its "unconfirmed" stamp, with the priced Listen (TakeFacts, @gt/ui)
//   verdicts  what the person said about it, oldest first, in their words with the marks
//   taste     every line proposed in this conversation (keep / remove) and the kept profile
// Nothing here draws a section that has nothing in it. The pinned version's sounds are decoded when
// it is pinned, so the waveforms are drawn before the first press.
import { useEffect } from "react";

import { STUDIO_ACTION_GOES } from "@gt/domain/audio.studio.kinds";
import type { StudioTurn } from "@gt/domain/audio.studio";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { TakeFacts } from "@gt/ui/components/suno/TakeFacts.tsx";
import { TasteChips } from "@gt/ui/components/suno/TasteChips.tsx";
import { Wave } from "@gt/ui/components/wave/Wave.tsx";
import { clockOf } from "@gt/ui/components/audio/mix.ts";
import type { EarState } from "@gt/ui/components/audio/useEar.ts";

import { localPlay, soundKey, soundOf } from "../_host/press.ts";
import type { SunoVersion } from "../_host/suno.ts";
import type { VariantProps } from "../_host/types.ts";
import { sketchOf, takeMeasures, takeTrack, tasteRows, tasteTurn, verdictMark } from "./sheet.ts";
import s from "./sheet.module.css";

const PEAKS = 200;
const W = 600;
const H = 44;
const TONE = { ok: "emerald", warn: "amber", bad: "rose" } as const;

type SoundProps = {
  readonly v: VariantProps;
  readonly sound: string;
  readonly href: string;
  readonly name: string;
  /** Null: the name is the play mark's accessible name only (a take's facts head names it). */
  readonly facts: readonly string[] | null;
  readonly onPress: () => void;
  readonly tone: "cyan" | "violet";
};

/** One playable sound: its play mark, name and facts, and its waveform with the played part lit. */
function SoundRow({ v, sound, href, name, facts, onPress, tone }: SoundProps) {
  const { transport } = v;
  const state: EarState = transport.stateOf(sound);
  const peaks = transport.peaks(href, PEAKS);
  const played = state !== "idle" && transport.duration !== null && transport.duration > 0 ? Math.min(1, transport.clock / transport.duration) : undefined;
  return (
    <div className={s.sound} data-bare={facts === null || undefined}>
      <EarButton state={state} name={name} onPress={onPress} />
      {facts !== null && (
        <span className={s.soundWords}>
          <b className={s.soundName}>{name}</b>
          {facts.length > 0 && <span className={s.soundFacts}>{facts.join(" · ")}</span>}
        </span>
      )}
      <span className={s.soundWave}>{peaks === null ? <span className={s.flat}>{v.renders === "missing" ? "the sound is not in the store" : "drawing the waveform"}</span> : <Wave peaks={peaks} width={W} height={H} tone={tone} stretch {...(played !== undefined ? { played } : {})} />}</span>
    </div>
  );
}

function Sketch({ v, version, versions }: { readonly v: VariantProps; readonly version: SunoVersion; readonly versions: readonly SunoVersion[] }) {
  const found = sketchOf(versions, version.promptId);
  if (found === null) return null;
  const { turnId, node } = found.sketch;
  const length = node.lengthS ?? node.mix.durationS;
  const facts = [node.bpm === undefined ? null : `${node.bpm} bpm`, node.key ?? null, length === undefined ? null : clockOf(length)].filter((x) => x !== null);
  return (
    <section className={s.group} aria-label="sketch">
      <span className={s.groupHead}>
        <CapsHeading text="local sketch" level={4} />
        <Chip label="$0" tone="emerald" ghost casing="lower" />
        {found.from !== undefined && <Chip label="of" value={found.from} ghost casing="lower" />}
      </span>
      <SoundRow v={v} sound={soundKey(turnId, node.id)} href={node.mix.href} name={node.title ?? "the sketch"} facts={facts} tone="violet" onPress={() => v.dispatch(localPlay(node.id), turnId)} />
    </section>
  );
}

function Takes({ v, version }: { readonly v: VariantProps; readonly version: SunoVersion }) {
  const { session, suno, transport } = v;
  if (version.takes.length === 0) return null;
  return (
    <section className={s.group} aria-label="takes">
      <CapsHeading text="takes" tally={{ value: version.takes.length }} level={4} />
      {version.takes.map((t) => {
        const facts = suno.takes[t.takeId];
        const track = takeTrack(session.turns, t.takeId);
        const measures = takeMeasures(session.turns, t.takeId);
        const name = facts?.name ?? track?.node.title ?? t.takeId;
        const href = track?.node.mix.href ?? facts?.href;
        const own = `take/${t.takeId}`;
        const sound = track !== null ? soundKey(track.turnId, track.node.id) : own;
        const play = (): void => {
          if (track !== null) v.dispatch(localPlay(track.node.id), track.turnId);
          else if (facts !== undefined) transport.toggle(own, [{ id: "take", href: facts.href }], { name: facts.name });
        };
        return (
          <div key={t.takeId} className={s.take}>
            {href !== undefined && <SoundRow v={v} sound={sound} href={href} name={t.clip === undefined ? name : `${name}, take ${t.clip}`} facts={facts === undefined ? [] : null} tone="cyan" onPress={play} />}
            {measures !== null && (
              <span className={s.chips}>
                {measures.rows.map((r) => (
                  <Chip key={r.label} label={r.label} value={r.value} tone={r.tone === undefined ? "neutral" : TONE[r.tone]} casing="lower" />
                ))}
              </span>
            )}
            {facts !== undefined ? <TakeFacts facts={facts} onListen={suno.listen} /> : <Chip label="no facts for" value={t.takeId} ghost casing="lower" />}
          </div>
        );
      })}
    </section>
  );
}

function Verdicts({ v, version }: { readonly v: VariantProps; readonly version: SunoVersion }) {
  if (version.verdicts.length === 0) return null;
  return (
    <section className={s.group} aria-label="verdicts">
      <CapsHeading text="verdicts" tally={{ value: version.verdicts.length }} level={4} />
      <ol className={s.verdicts}>
        {version.verdicts.map((x) => {
          const m = verdictMark(x);
          return (
            <li key={x.turnId} className={s.verdict}>
              <span className={s.marks}>
                <Chip label={m.take} casing="lower" />
                {m.call !== null && <Chip label={m.call} tone={m.call === "keep" ? "emerald" : "rose"} casing="lower" />}
                {m.off.map((o) => (
                  <Chip key={o} label={o} tone="amber" ghost casing="lower" />
                ))}
                {x.takeId !== undefined && <Chip label="with" value={v.suno.takes[x.takeId]?.name ?? x.takeId} tone="cyan" ghost casing="lower" />}
              </span>
              <blockquote className={s.said}>{x.text}</blockquote>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Taste({ v }: { readonly v: VariantProps }) {
  const rows = tasteRows(v.session.turns);
  if (rows.length === 0 && v.suno.taste.length === 0) return null;
  return (
    <section className={s.group} aria-label="taste">
      <CapsHeading text="taste" level={4} />
      <TasteChips proposed={rows.map(({ id, line, lean }) => ({ id, line, lean }))} kept={v.suno.taste} onKeep={(row) => v.suno.keepTaste(row, tasteTurn(rows, row.line))} onDrop={v.suno.dropTaste} />
    </section>
  );
}

/** Every sound the pinned version's panel draws: its sketch (or the one speaking for it) and its takes. */
function hrefsOf(v: VariantProps, version: SunoVersion, versions: readonly SunoVersion[]): readonly string[] {
  const sketch = sketchOf(versions, version.promptId)?.sketch.node.mix.href;
  const takes = version.takes.map((t) => takeTrack(v.session.turns, t.takeId)?.node.mix.href ?? v.suno.takes[t.takeId]?.href);
  return [sketch, ...takes].filter((h): h is string => h !== undefined);
}

export function SheetSide({ v, version, versions }: { readonly v: VariantProps; readonly version: SunoVersion; readonly versions: readonly SunoVersion[] }) {
  const { decode } = v.transport;
  // Joined, so the effect runs when the set of sounds changes, not on every render's new array.
  const hrefs = hrefsOf(v, version, versions).join(" ");
  useEffect(() => {
    if (hrefs !== "") decode(hrefs.split(" "));
  }, [decode, hrefs]);
  return (
    <aside className={s.side} aria-label={`what answered ${version.node.name ?? version.promptId}`}>
      <Sketch v={v} version={version} versions={versions} />
      <Takes v={v} version={version} />
      <Verdicts v={v} version={version} />
      <Taste v={v} />
    </aside>
  );
}

/** Is a local proposal sounding now (so its press reads as a stop). */
const sounding = (a: StudioTurn["actions"][number], turn: StudioTurn, v: VariantProps): boolean => {
  if (a.kind !== "play" && a.kind !== "hear") return false;
  const snd = soundOf(turn, a);
  return snd !== null && v.transport.stateOf(snd.key) !== "idle";
};

/** The newest answer's suggested next steps, under the pinned card: each a press that dispatches. */
export function Steps({ v, blocked }: { readonly v: VariantProps; readonly blocked: string | null }) {
  const turn = v.session.visible?.turn ?? null;
  const actions = turn?.actions ?? [];
  if (turn === null || actions.length === 0) return null;
  return (
    <section className={s.steps} aria-label="next steps">
      <CapsHeading text="next" tally={{ value: actions.length }} level={4} />
      <ul className={s.stepList}>
        {actions.map((a) => {
          const toAgent = STUDIO_ACTION_GOES[a.kind] === "agent";
          const on = !toAgent && sounding(a, turn, v);
          return (
            <li key={a.id} className={s.step}>
              <Button label={on ? `stop: ${a.label}` : a.label} size="sm" tone={toAgent ? "cyan" : "neutral"} disabled={toAgent && blocked !== null} onPress={() => v.dispatch(a)} />
              {a.why !== undefined && <span className={s.why}>{a.why}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
