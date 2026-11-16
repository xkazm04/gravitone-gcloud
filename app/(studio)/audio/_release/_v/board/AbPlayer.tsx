"use client";

// Original against master at matched loudness, so the comparison is tone, not level: the original is
// scaled by 10^((after - before) / 20) - by the element's volume when that is at most 1, through a
// WebAudio gain node when the original is the quieter of the two. Switching sides keeps the position.
import { useEffect, useRef, useState } from "react";

import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";

import { clock, signed } from "./board.ts";
import s from "./sheet.module.css";

type Side = "original" | "master";
const SIDE_OPTS: readonly { readonly value: Side; readonly label: string }[] = [
  { value: "original", label: "original" },
  { value: "master", label: "master" },
];

const MEDIA_ERR: Readonly<Record<number, string>> = { 1: "MEDIA_ERR_ABORTED", 2: "MEDIA_ERR_NETWORK", 3: "MEDIA_ERR_DECODE", 4: "MEDIA_ERR_SRC_NOT_SUPPORTED" };
const mediaError = (e: MediaError | null): string => (e === null ? "unknown media error" : `${MEDIA_ERR[e.code] ?? `code ${e.code}`}${e.message === "" ? "" : ` · ${e.message}`}`);

export function AbPlayer({ name, original, master, matchDb }: { readonly name: string; readonly original: string; readonly master: string; readonly matchDb: number }) {
  const ra = useRef<HTMLAudioElement>(null);
  const rb = useRef<HTMLAudioElement>(null);
  const graph = useRef<{ readonly ctx: AudioContext } | null>(null);
  const [side, setSide] = useState<Side>("master");
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gain = 10 ** (matchDb / 20);

  const el = (k: Side) => (k === "original" ? ra.current : rb.current);

  const level = () => {
    const a = ra.current;
    if (a === null) return;
    if (gain <= 1) {
      a.volume = gain;
      return;
    }
    if (graph.current === null) {
      const ctx = new AudioContext();
      const g = ctx.createGain();
      g.gain.value = gain;
      ctx.createMediaElementSource(a).connect(g).connect(ctx.destination);
      graph.current = { ctx };
    }
    void graph.current.ctx.resume();
  };

  const play = (k: Side) => {
    const cur = el(k);
    if (cur === null) return;
    level();
    cur.play().then(
      () => setPlaying(true),
      (e: unknown) => {
        setPlaying(false);
        setError(`${k}: ${e instanceof Error ? e.message : String(e)}`);
      },
    );
  };

  const toggle = () => {
    const cur = el(side);
    if (cur === null) return;
    if (playing) {
      cur.pause();
      setPlaying(false);
    } else play(side);
  };

  const pick = (k: Side) => {
    if (k === side) return;
    const from = el(side);
    const to = el(k);
    if (from !== null && to !== null) {
      to.currentTime = from.currentTime;
      if (playing) {
        from.pause();
        play(k);
      }
    }
    setSide(k);
  };

  useEffect(() => {
    const a = ra.current;
    const b = rb.current;
    const g = graph;
    return () => {
      a?.pause();
      b?.pause();
      void g.current?.ctx.close();
    };
  }, []);

  const wire = (k: Side, href: string) => ({
    src: href,
    preload: "metadata" as const,
    onEnded: () => setPlaying(false),
    onTimeUpdate: (e: { currentTarget: HTMLAudioElement }) => {
      if (k === side) setAt(e.currentTarget.currentTime);
    },
    onLoadedMetadata: (e: { currentTarget: HTMLAudioElement }) => {
      if (k === "master") setLength(e.currentTarget.duration);
    },
    onError: (e: { currentTarget: HTMLAudioElement }) => setError(`${k} ${href}: ${mediaError(e.currentTarget.error)}`),
  });

  return (
    <div className={s.ab} role="group" aria-label={`${name} A/B`}>
      <audio ref={ra} {...wire("original", original)} />
      <audio ref={rb} {...wire("master", master)} />
      <EarButton state={playing ? "playing" : "idle"} name={`${name} ${side}`} onPress={toggle} />
      <Seg<Side> label={`${name} A/B side`} options={SIDE_OPTS} value={side} onChange={pick} />
      <span className={s.abTime}>
        {clock(at)}
        {length !== null && Number.isFinite(length) ? ` / ${clock(length)}` : ""}
      </span>
      <Chip label="original level" value={`${signed(matchDb)} dB`} casing="lower" />
      {error !== null && (
        <div className={s.abErr}>
          <ErrorLine message={error} />
        </div>
      )}
    </div>
  );
}
