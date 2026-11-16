"use client";

// Original against master, at matched loudness: both files play together from the same second and
// the A/B switch only changes which one is heard, so the comparison is tone, not level. The
// original is scaled by 10^((after - before) / 20) - through the element's volume when that is at
// most 1, through a WebAudio gain when the original is the quieter one.
import { useRef, useState } from "react";

import { TransportRow } from "@gt/ui/components/audio/TransportRow.tsx";
import type { EarState } from "@gt/ui/components/audio/useEar.ts";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";

import { delta } from "./fmt.ts";
import t from "./sheet.module.css";

type Side = "a" | "b";
type Graph = { readonly ctx: AudioContext; readonly gain: GainNode };

export type AbPlayerProps = {
  readonly name: string;
  readonly original: string;
  readonly master: string;
  readonly beforeLufs: number;
  readonly afterLufs: number;
};

const why = (label: string, href: string, el: HTMLAudioElement): string => {
  const e = el.error;
  return `${label} ${href}: ${e === null ? "not loaded" : e.message !== "" ? e.message : `media error ${e.code}`}`;
};

export function AbPlayer({ name, original, master, beforeLufs, afterLufs }: AbPlayerProps) {
  const gainDb = afterLufs - beforeLufs;
  const gain = 10 ** (gainDb / 20);
  const a = useRef<HTMLAudioElement>(null);
  const b = useRef<HTMLAudioElement>(null);
  const graph = useRef<Graph | null>(null);
  const [side, setSide] = useState<Side>("b");
  const [state, setState] = useState<EarState>("idle");
  const [clock, setClock] = useState(0);
  const [length, setLength] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const level = (which: Side) => {
    const ea = a.current;
    const eb = b.current;
    if (ea === null || eb === null) return;
    const g = graph.current;
    if (g === null) {
      ea.volume = which === "a" ? Math.min(gain, 1) : 0;
    } else {
      ea.volume = 1;
      g.gain.gain.value = which === "a" ? gain : 0;
    }
    eb.volume = which === "b" ? 1 : 0;
  };

  const stop = () => {
    a.current?.pause();
    b.current?.pause();
    setState("idle");
  };

  const toggle = () => {
    const ea = a.current;
    const eb = b.current;
    if (ea === null || eb === null) return;
    if (state !== "idle") return stop();
    setFailed(null);
    setState("loading");
    if (gain > 1 && graph.current === null) {
      const ctx = new AudioContext();
      const g = ctx.createGain();
      ctx.createMediaElementSource(ea).connect(g).connect(ctx.destination);
      graph.current = { ctx, gain: g };
    }
    level(side);
    eb.currentTime = ea.currentTime;
    const resumed = graph.current === null ? Promise.resolve() : graph.current.ctx.resume();
    resumed
      .then(() => Promise.all([ea.play(), eb.play()]))
      .then(() => setState("playing"))
      .catch((e: unknown) => {
        ea.pause();
        eb.pause();
        setState("idle");
        setFailed(e instanceof Error ? e.message : String(e));
      });
  };

  const pick = (v: Side) => {
    setSide(v);
    level(v);
    const ea = a.current;
    const eb = b.current;
    if (ea !== null && eb !== null && Math.abs(eb.currentTime - ea.currentTime) > 0.05) eb.currentTime = ea.currentTime;
  };

  const seek = (sec: number) => {
    if (a.current !== null) a.current.currentTime = sec;
    if (b.current !== null) b.current.currentTime = sec;
    setClock(sec);
  };

  const fail = (label: string, href: string, el: HTMLAudioElement) => {
    setFailed(why(label, href, el));
    stop();
  };

  return (
    <div className={t.ab} role="group" aria-label={`${name} A/B`}>
      <div className={t.abHead}>
        <Seg<Side>
          label={`${name} A/B`}
          options={[
            { value: "a", label: "A original" },
            { value: "b", label: "B master" },
          ]}
          value={side}
          onChange={pick}
        />
        <Chip label="A matched" value={`${delta(gainDb)} dB`} casing="lower" name={`original at ${delta(gainDb)} dB, matched to the master`} />
      </div>
      <TransportRow
        name={`${name} · ${side === "a" ? "original" : "master"}`}
        state={state}
        clock={clock}
        duration={length}
        failed={failed}
        onToggle={toggle}
        onSeek={seek}
        onStop={stop}
      />
      <audio
        ref={a}
        src={original}
        preload="metadata"
        onLoadedMetadata={(e) => setLength(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null)}
        onTimeUpdate={(e) => setClock(e.currentTarget.currentTime)}
        onEnded={stop}
        onError={(e) => fail("original", original, e.currentTarget)}
      />
      <audio ref={b} src={master} preload="metadata" onError={(e) => fail("master", master, e.currentTarget)} />
    </div>
  );
}
