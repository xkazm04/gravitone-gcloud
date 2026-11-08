"use client";

// TAKE AGAINST TAKE (prototype v2, ask 4): two done takes chosen, heard together at one loudness from the same second,
// one side at a time (./usePair.ts). Drawn once two takes are done; until then there is nothing to hold up.
import { useState } from "react";

import type { CoverTake } from "@gt/domain/cover";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Fader } from "@gt/ui/components/fader/Fader.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";

import type { CoverFlow } from "../useCover.ts";
import { clock, takeUrl } from "../words.ts";
import { useHeard } from "./TakeGrid.tsx";
import type { Pair, PairSide } from "./usePair.ts";
import s from "./v2.module.css";

type Done = { readonly t: CoverTake; readonly url: string };

export function Compare({ flow, pair, quiet }: { readonly flow: CoverFlow; readonly pair: Pair; readonly quiet: () => void }) {
  const done: Done[] = flow.card.record.takes.flatMap((t) => {
    const url = takeUrl(flow.card, t);
    return t.state === "done" && url !== undefined ? [{ t, url }] : [];
  });
  const [xn, setXn] = useState<string | null>(null);
  const [yn, setYn] = useState<string | null>(null);
  const x = done.find((d) => String(d.t.n) === xn) ?? done[0];
  const y = done.find((d) => String(d.t.n) === yn) ?? done.find((d) => d !== x);
  const hx = useHeard(x?.url);
  const hy = useHeard(y?.url);
  if (x === undefined || y === undefined) return null;
  const options = done.map((d) => ({ value: String(d.t.n), label: String(d.t.n) }));
  const len = Math.max(hx?.lenS ?? 0, hy?.lenS ?? 0, 1);
  const choose = (set: (v: string) => void) => (v: string) => {
    pair.stop();
    set(v);
  };
  const sides = [
    { value: "x" as const, label: `take ${x.t.n}` },
    { value: "y" as const, label: `take ${y.t.n}` },
  ];
  return (
    <div className={s.compare} role="group" aria-label="take against take">
      <span className={s.label}>a</span>
      <Seg<string> label="first take" options={options} value={String(x.t.n)} onChange={choose(setXn)} />
      <span className={s.label}>b</span>
      <Seg<string> label="second take" options={options} value={String(y.t.n)} onChange={choose(setYn)} />
      <EarButton
        state={pair.playing ? "playing" : "idle"}
        name={`take ${x.t.n} against take ${y.t.n}`}
        onPress={() => {
          quiet();
          pair.toggle(x.url, y.url);
        }}
      />
      <Seg<PairSide> label="which take is heard" options={sides} value={pair.side} onChange={pair.hear} />
      <div className={s.compareScrub}>
        <Fader label={`position in take ${x.t.n} and take ${y.t.n}`} value={Math.min(pair.clock, len)} min={0} max={len} step={1} onChange={pair.seek} valueText={`${clock(pair.clock)} of ${clock(len)}`} />
      </div>
      <span className={s.time}>{`${clock(pair.clock)} / ${clock(len)}`}</span>
      {pair.failed !== null && (
        <span className={s.wide}>
          <ErrorLine message={pair.failed} live />
        </span>
      )}
    </div>
  );
}
