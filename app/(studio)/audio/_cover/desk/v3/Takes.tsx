"use client";

// WHAT CAME OUT (copied from ../Takes.tsx, one line per take): the five takes in their places, each pending, done or
// failed (ComfyUI's sentence verbatim). A take that finishes arrives into its line; a done take plays in its line
// against the section - A/B at matched level, one at a time, seekable - and is picked from it. Unlike the baseline
// the rights are not on every row: they sit on the in column's rights line and on the transport (./Transport.tsx).
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { COVER_TAKE_COUNT, type CoverTake } from "@gt/domain/cover";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Fader } from "@gt/ui/components/fader/Fader.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { Wave } from "@gt/ui/components/wave/Wave.tsx";

import { hearUrl, type Heard } from "../audio.ts";
import type { AB, Side } from "../useAB.ts";
import type { CoverFlow } from "../useCover.ts";
import { clock, fiveTakes, seconds, TAKE_TONE, takeUrl } from "../words.ts";
import { useMoves } from "./motion.ts";
import s from "./sheet.module.css";

export const SIDES = [
  { value: "a" as const, label: "section" },
  { value: "b" as const, label: "take" },
];

/** A take's decoded peaks and length, once per address (../audio.ts caches the decode). */
export function useHeard(url: string | undefined): Heard | null {
  const [heard, setHeard] = useState<{ readonly url: string; readonly h: Heard } | null>(null);
  useEffect(() => {
    if (url === undefined) return;
    let live = true;
    void hearUrl(url).then((a) => {
      if (live && a.ok) setHeard({ url, h: a.value });
    });
    return () => {
      live = false;
    };
  }, [url]);
  return heard !== null && heard.url === url ? heard.h : null;
}

function Player({ name, url, flow, ab }: { readonly name: string; readonly url: string; readonly flow: CoverFlow; readonly ab: AB }) {
  const heard = useHeard(url);
  const here = ab.at === url;
  const at = ab.positionOf(url);
  const len = heard?.lenS ?? flow.span.endS - flow.span.startS;
  return (
    <div className={s.player}>
      <EarButton state={here && ab.playing ? "playing" : "idle"} name={name} onPress={() => ab.toggle(url, url)} />
      <Seg<Side> label={`which side of ${name}`} options={SIDES} value={here ? ab.side : "b"} onChange={(v) => ab.hear(url, url, v)} />
      <div className={s.scrub}>
        <div className={s.mini}>
          <Wave peaks={heard?.peaks.filter((_, i) => i % 4 === 0) ?? []} width={1000} height={22} tone={here && ab.side === "a" ? "amber" : "cyan"} played={len > 0 ? at / len : 0} stretch />
        </div>
        <Fader label={`position in ${name}`} value={Math.min(at, len)} min={0} max={Math.max(len, 1)} step={1} onChange={(v) => ab.seek(url, url, v)} valueText={`${clock(at)} of ${clock(len)}`} />
      </div>
      <span className={s.time}>{`${clock(at)} / ${clock(len)}`}</span>
    </div>
  );
}

function waitWord(t: CoverTake, flow: CoverFlow): string {
  const r = flow.card.record;
  if (r.state === "failed") return "not rendered";
  const first = r.takes.find((x) => x.state === "pending")?.n === t.n;
  return r.state === "rendering" && first ? "rendering" : "queued";
}

function TakeLine({ t, flow, ab }: { readonly t: CoverTake; readonly flow: CoverFlow; readonly ab: AB }) {
  const r = flow.card.record;
  const moves = useMoves();
  const url = takeUrl(flow.card, t);
  const name = `take ${t.n}`;
  const winner = r.winnerSeed !== undefined && r.winnerSeed === t.seed && t.seed >= 0;
  const canPick = t.state === "done" && url !== undefined && (r.state === "judging" || r.state === "picked" || r.state === "failed");
  const playable = t.state === "done" && url !== undefined;
  return (
    <li className={s.take} data-live={url !== undefined && ab.at === url ? "" : undefined} data-winner={winner ? "" : undefined} aria-label={name}>
      <span className={s.n}>{t.n}</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={playable ? "done" : t.state} className={s.takeBody} {...moves.arrive}>
          {playable ? (
            <>
              <Player name={name} url={url} flow={flow} ab={ab} />
              {winner ? <Chip label="winner" tone="emerald" /> : canPick && <Button label={flow.picking === t.seed ? "Picking" : "Pick"} size="sm" tone="emerald" disabled={flow.picking !== null} onPress={() => flow.pick(t.seed)} />}
            </>
          ) : (
            <Chip label={t.state === "pending" ? waitWord(t, flow) : t.state} tone={t.state === "pending" && waitWord(t, flow) === "rendering" ? "cyan" : TAKE_TONE[t.state]} dot casing="lower" />
          )}
        </motion.div>
      </AnimatePresence>
      <span className={s.takeMeta}>
        {t.seed >= 0 && <span className={s.count}>{`seed ${t.seed}`}</span>}
        {t.renderS !== undefined && <span className={s.count}>{seconds(t.renderS)}</span>}
      </span>
      {t.state === "failed" && t.error !== undefined && (
        <span className={s.err}>
          <ErrorLine message={t.error} />
        </span>
      )}
      {url !== undefined && ab.at === url && ab.failed !== null && (
        <span className={s.err}>
          <ErrorLine message={ab.failed} live />
        </span>
      )}
    </li>
  );
}

export function TakeList({ flow, ab }: { readonly flow: CoverFlow; readonly ab: AB }) {
  const takes = fiveTakes(flow.card.record.takes, COVER_TAKE_COUNT);
  return (
    <div className={s.stack}>
      <ol className={s.takes}>
        {takes.map((t) => (
          <TakeLine key={t.n} t={t} flow={flow} ab={ab} />
        ))}
      </ol>
      {flow.pickError !== null && <ErrorLine message={flow.pickError} live />}
    </div>
  );
}
