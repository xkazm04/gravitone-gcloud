"use client";

// Original against master AT MATCHED LOUDNESS: both files run in lockstep and the switch only changes
// which one is heard, so the comparison is tone, not level. The louder file is turned down by the
// measured difference (element volume never exceeds 1, so it is always the louder one that moves):
// usually the original, by 10^((after - before) / 20).
import { useEffect, useRef, useState } from "react";

import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { TransportRow } from "@gt/ui/components/audio/TransportRow.tsx";
import type { EarState } from "@gt/ui/components/audio/useEar.ts";

import { db } from "./fmt.ts";
import s from "./master.module.css";

type Side = "original" | "master";
const MEDIA_ERR: Readonly<Record<number, string>> = { 1: "aborted", 2: "network error", 3: "could not decode", 4: "not found or not supported" };
/** Seconds the two files may drift apart before the original is pulled back onto the master's clock. */
const DRIFT_S = 0.06;

export function AbPlayer({ name, originalHref, masterHref, gainDb }: {
  readonly name: string;
  readonly originalHref: string;
  readonly masterHref: string;
  /** after.lufs - before.lufs: the level difference the match removes. */
  readonly gainDb: number;
}) {
  const orig = useRef<HTMLAudioElement | null>(null);
  const mast = useRef<HTMLAudioElement | null>(null);
  const [side, setSide] = useState<Side>("master");
  const [state, setState] = useState<EarState>("idle");
  const [clock, setClock] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const k = 10 ** (gainDb / 20);
  const volOrig = k <= 1 ? k : 1;
  const volMast = k <= 1 ? 1 : 1 / k;

  useEffect(() => {
    if (orig.current !== null) {
      orig.current.volume = volOrig;
      orig.current.muted = side !== "original";
    }
    if (mast.current !== null) {
      mast.current.volume = volMast;
      mast.current.muted = side !== "master";
    }
  }, [side, volOrig, volMast]);

  const both = (f: (el: HTMLAudioElement) => void) => [orig.current, mast.current].forEach((el) => el !== null && f(el));
  const stop = () => {
    both((el) => {
      el.pause();
      el.currentTime = 0;
    });
    setClock(0);
    setState("idle");
  };
  const toggle = () => {
    const a = orig.current;
    const b = mast.current;
    if (a === null || b === null) return;
    if (state !== "idle") {
      both((el) => el.pause());
      setState("idle");
      return;
    }
    setState("loading");
    setFailed(null);
    a.currentTime = b.currentTime;
    Promise.all([a.play(), b.play()]).then(
      () => setState("playing"),
      (e: unknown) => {
        both((el) => el.pause());
        setState("idle");
        setFailed(e instanceof Error ? e.message : String(e));
      },
    );
  };
  const fail = (href: string, el: HTMLAudioElement) => {
    const err = el.error;
    const why = err === null ? "did not load" : err.message !== "" ? err.message : (MEDIA_ERR[err.code] ?? `media error ${err.code}`);
    both((el) => el.pause());
    setState("idle");
    setFailed(`${href}: ${why}`);
  };

  return (
    <div className={s.ab}>
      <div className={s.abSwitch}>
        <Seg<Side>
          label={`hear the original or the master of ${name}`}
          options={[
            { value: "original", label: "A · original" },
            { value: "master", label: "B · master" },
          ]}
          value={side}
          onChange={setSide}
        />
        <Chip label="original" value={`${db(20 * Math.log10(volOrig))} dB`} casing="lower" />
        <Chip label="master" value={`${db(20 * Math.log10(volMast))} dB`} casing="lower" />
      </div>
      <TransportRow
        name={`${name} · ${side}`}
        state={state}
        clock={clock}
        duration={duration}
        failed={failed}
        onToggle={toggle}
        onStop={stop}
        onSeek={(t) => {
          both((el) => {
            el.currentTime = t;
          });
          setClock(t);
        }}
      />
      <audio
        ref={orig}
        src={originalHref}
        preload="metadata"
        onError={(e) => fail(originalHref, e.currentTarget)}
        onEnded={stop}
      />
      <audio
        ref={mast}
        src={masterHref}
        preload="metadata"
        onError={(e) => fail(masterHref, e.currentTarget)}
        onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null)}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setClock(t);
          const a = orig.current;
          if (a !== null && !a.paused && Math.abs(a.currentTime - t) > DRIFT_S) a.currentTime = t;
        }}
        onEnded={stop}
      />
    </div>
  );
}
