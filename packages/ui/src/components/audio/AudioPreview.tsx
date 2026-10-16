"use client";

// An audio item's preview (prototype library.js `preview` :512-515 + the one-element transport
// :610-637, library.css `.pv.aud`): play, a waveform that seeks, the time read out. The Library
// detail panel draws it for an audio item; the Audio lane's composer for a take it seeds from.
//
// The registry's media-playback golden path decides the shape, against three things the
// prototype (and v1's InspectorTakePlayer) did:
//   · THE CLOCK DOES NOT LIVE IN RENDER STATE. The prototype redrew the wave's SVG from a
//     120 ms throttle on `timeupdate`. Here React holds only what changes at human speed
//     (playing, failed); the element's own clock is read on `timeupdate` (about 4 Hz) into one
//     state cell the wave and the readout sample (playback-clock: a readout subscribes at a few
//     updates a second).
//   · NO ENGINE IS TRUSTED. A play that never reaches `playing` within the watchdog is declared
//     failed in words, never a spinner forever (transport-contract); an `error` event draws the
//     element's own code (`MEDIA_ERR_SRC_NOT_SUPPORTED`, prototype :517) and the play control
//     goes, because a control for a verb the source cannot do is decorative (engine-adapters).
//   · EVERY RESOURCE NAMES ITS REAPER. Unmounting pauses and releases the source, so audio never
//     outlives its panel (media-resource-lifecycle) - the defect "a voice I cannot stop".
// Seeking is a native range laid over the wave: arrows, Home/End and a click all seek, it has a
// name and a value for a screen reader, and no key binding is needed (the keymap owns keys;
// a native control owns its own).
//
// `src` null is "no file": the play control is absent (capability honesty) and the readout says
// so. `illustrative` dashes the rim amber, as the prototype marks a shape that is not a take.
import { useEffect, useRef, useState } from "react";

import { SrOnly } from "../a11y/SrOnly.tsx";
import { cx } from "../cx.ts";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { Wave } from "../wave/Wave.tsx";
import { fmtDur } from "./audio.ts";
import s from "./AudioPreview.module.css";

export type AudioPreviewProps = {
  readonly src: string | null;
  readonly peaks: readonly number[];
  readonly title: string;
  /** What the item says its length is, read out before the file has been opened. */
  readonly durationS: number | null;
  readonly illustrative?: boolean;
};

/** A play must reach `playing` within this, or it is declared failed (transport-contract). */
export const PLAY_WATCHDOG_MS = 4000;

const MEDIA_ERR: Readonly<Record<number, string>> = { 1: "MEDIA_ERR_ABORTED", 2: "MEDIA_ERR_NETWORK", 3: "MEDIA_ERR_DECODE", 4: "MEDIA_ERR_SRC_NOT_SUPPORTED" };

/** The element's failure in its own words: the code, never "could not play". */
export function mediaErrorWords(code: number | undefined, src: string): string {
  return `${code === undefined ? "MEDIA_ERR" : (MEDIA_ERR[code] ?? `MEDIA_ERR ${code}`)} · ${src.split("?")[0] ?? src}`;
}

const W = 300;
const H = 80;

function PlayMark({ on }: { readonly on: boolean }) {
  return on ? (
    <svg viewBox="0 0 10 10" className={s.mark} aria-hidden="true">
      <rect x="2" y="1" width="2.2" height="8" />
      <rect x="5.8" y="1" width="2.2" height="8" />
    </svg>
  ) : (
    <svg viewBox="0 0 10 10" className={s.mark} aria-hidden="true">
      <path d="M2 1l7 4-7 4z" />
    </svg>
  );
}

function Preview({ src, peaks, title, durationS, illustrative = false }: AudioPreviewProps) {
  const el = useRef<HTMLAudioElement | null>(null);
  const dog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [clock, setClock] = useState({ at: 0, of: 0 });
  const [failed, setFailed] = useState<string | null>(null);

  const calm = (): void => {
    if (dog.current !== null) clearTimeout(dog.current);
    dog.current = null;
  };

  // The reaper: an unmount (a new source remounts, see below) stops the element and lets go of it.
  useEffect(() => {
    const a = el.current;
    const watchdog = dog;
    return () => {
      if (watchdog.current !== null) clearTimeout(watchdog.current);
      if (a === null) return;
      a.pause();
      a.removeAttribute("src");
      a.load();
    };
  }, []);

  const toggle = (): void => {
    const a = el.current;
    if (a === null || src === null) return;
    if (!a.paused) {
      a.pause();
      return;
    }
    calm();
    dog.current = setTimeout(() => setFailed(`no answer from the player after ${PLAY_WATCHDOG_MS / 1000} s · ${src.split("?")[0] ?? src}`), PLAY_WATCHDOG_MS);
    void a.play().catch((e: unknown) => {
      calm();
      // An autoplay refusal is the browser's words, not the file's fault: shown verbatim.
      setFailed(e instanceof Error ? `${e.name} · ${e.message}` : String(e));
    });
  };

  const seek = (frac: number): void => {
    const a = el.current;
    if (a === null || !Number.isFinite(a.duration) || a.duration <= 0) return;
    a.currentTime = frac * a.duration;
    setClock({ at: a.currentTime, of: a.duration });
  };

  const played = clock.of > 0 ? clock.at / clock.of : undefined;
  const length = clock.of > 0 ? `${fmtDur(clock.of)} file` : src === null ? "no file" : fmtDur(durationS);
  const canPlay = src !== null && failed === null;
  return (
    <div className={s.box}>
      <div className={cx(s.pv, illustrative && s.ill)}>
        {canPlay && (
          <button type="button" className={cx(s.play, playing && s.on)} onClick={toggle} aria-label={`${playing ? "pause" : "play"} ${title}`}>
            <PlayMark on={playing} />
          </button>
        )}
        <div className={s.wave}>
          <Wave peaks={peaks} width={W} height={H} tone="cyan" stretch {...(played === undefined ? {} : { played })} />
          {canPlay && (
            <input
              type="range"
              className={s.seek}
              min={0}
              max={1000}
              step={1}
              value={Math.round((played ?? 0) * 1000)}
              aria-label={`seek ${title}`}
              aria-valuetext={`${fmtDur(clock.at)} of ${clock.of > 0 ? fmtDur(clock.of) : fmtDur(durationS)}`}
              onChange={(e) => seek(Number(e.currentTarget.value) / 1000)}
            />
          )}
        </div>
        <div className={s.tm} aria-hidden="true">
          <span>{fmtDur(clock.at)}</span>
          <span>{length}</span>
        </div>
        <SrOnly text={`${title}, ${length}`} />
        {src !== null && (
          <audio
            ref={el}
            src={src}
            preload="metadata"
            onPlaying={() => {
              calm();
              setPlaying(true);
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onLoadedMetadata={(e) => setClock({ at: e.currentTarget.currentTime, of: e.currentTarget.duration })}
            onTimeUpdate={(e) => setClock({ at: e.currentTarget.currentTime, of: e.currentTarget.duration })}
            onError={(e) => {
              calm();
              setPlaying(false);
              setFailed(mediaErrorWords(e.currentTarget.error?.code, src));
            }}
          />
        )}
      </div>
      {failed !== null && <ErrorLine message={failed} live />}
    </div>
  );
}

/** A new source is a new transport: keyed, so the old one's reaper runs and no clock or failure carries over. */
export function AudioPreview(props: AudioPreviewProps) {
  return <Preview key={props.src ?? "no-file"} {...props} />;
}
