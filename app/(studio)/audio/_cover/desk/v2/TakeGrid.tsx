"use client";

// THE TAKES STATION (prototype v2, Sleeve; copied from ../Takes.tsx and changed): the five takes as five cards side by
// side rather than five rows, each landing as it finishes. A card keeps everything the row had - its state, ComfyUI's
// sentence verbatim on a failure, the rights (every take carries the source's melody), its seed and render time, the
// A/B against the section at matched level with seek, and the pick - stacked to a fifth of the width. Each done card
// carries the layoutId the winner station's card answers, so a pick carries the card across.
import { motion, useReducedMotion } from "motion/react";
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
import { clock, fiveTakes, RIGHTS_LABEL, RIGHTS_TONE, seconds, TAKE_TONE, takeUrl } from "../words.ts";
import s from "./v2.module.css";

const SIDES = [
  { value: "a" as const, label: "section" },
  { value: "b" as const, label: "take" },
];

/** The layoutId a take's card wears on the takes station and the winner station alike. */
export const takeLayout = (coverId: string, seed: number): string => `v2-take-${coverId}-${seed}`;

export function useHeard(url: string | undefined): Heard | null {
  const [heard, setHeard] = useState<Heard | null>(null);
  useEffect(() => {
    if (url === undefined) return;
    let live = true;
    void hearUrl(url).then((a) => {
      if (live && a.ok) setHeard(a.value);
    });
    return () => {
      live = false;
    };
  }, [url]);
  return heard;
}

export function TakePlayer({ name, url, flow, ab }: { readonly name: string; readonly url: string; readonly flow: CoverFlow; readonly ab: AB }) {
  const heard = useHeard(url);
  const here = ab.at === url;
  const at = ab.positionOf(url);
  const len = heard?.lenS ?? flow.span.endS - flow.span.startS;
  return (
    <div className={s.player}>
      <div className={s.mini}>
        <Wave peaks={heard?.peaks.filter((_, i) => i % 4 === 0) ?? []} width={1000} height={28} tone={here && ab.side === "a" ? "amber" : "cyan"} played={len > 0 ? at / len : 0} stretch />
      </div>
      <div className={s.row}>
        <EarButton state={here && ab.playing ? "playing" : "idle"} name={name} onPress={() => ab.toggle(url, url)} />
        <Seg<Side> label={`which side of ${name}`} options={SIDES} value={here ? ab.side : "b"} onChange={(v) => ab.hear(url, url, v)} />
        <span className={s.time}>{`${clock(at)} / ${clock(len)}`}</span>
      </div>
      <Fader label={`position in ${name}`} value={Math.min(at, len)} min={0} max={Math.max(len, 1)} step={1} onChange={(v) => ab.seek(url, url, v)} valueText={`${clock(at)} of ${clock(len)}`} />
    </div>
  );
}

function TakeCard({ t, flow, ab, i }: { readonly t: CoverTake; readonly flow: CoverFlow; readonly ab: AB; readonly i: number }) {
  const reduce = useReducedMotion() === true;
  const r = flow.card.record;
  const url = takeUrl(flow.card, t);
  const name = `take ${t.n}`;
  const first = r.takes.find((x) => x.state === "pending")?.n === t.n;
  const winner = r.winnerSeed !== undefined && r.winnerSeed === t.seed && t.seed >= 0;
  const canPick = t.state === "done" && url !== undefined && (r.state === "judging" || r.state === "picked" || r.state === "failed");
  const done = t.state === "done" && url !== undefined;
  return (
    <motion.li
      className={s.take}
      data-live={url !== undefined && ab.at === url ? "" : undefined}
      data-winner={winner ? "" : undefined}
      data-state={t.state}
      aria-label={name}
      {...(done ? { layoutId: takeLayout(r.id, t.seed) } : {})}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.32, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={s.takeHead}>
        <span className={s.takeN}>{t.n}</span>
        <Chip label={t.state} tone={TAKE_TONE[t.state]} dot casing="lower" />
        {winner && <Chip label="winner" tone="emerald" />}
      </div>
      <div className={s.takeFacts}>
        <Chip label={RIGHTS_LABEL[r.rights]} tone={RIGHTS_TONE[r.rights]} casing="lower" name={`rights ${RIGHTS_LABEL[r.rights]}`} />
        {t.seed >= 0 && <span className={s.count}>{`seed ${t.seed}`}</span>}
        {t.renderS !== undefined && <span className={s.count}>{seconds(t.renderS)}</span>}
      </div>
      {done ? (
        // Keyed by state so a take that finishes while watched lands, rather than appearing.
        <motion.div key="done" className={s.takeBody} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <TakePlayer name={name} url={url} flow={flow} ab={ab} />
          {canPick && !winner && <Button label={flow.picking === t.seed ? "Picking" : "Pick"} size="sm" tone="emerald" disabled={flow.picking !== null} onPress={() => flow.pick(t.seed)} />}
        </motion.div>
      ) : (
        t.state === "pending" && <span className={s.wait}>{r.state === "draft" ? "—" : r.state === "failed" ? "not rendered" : r.state === "rendering" && first ? "rendering" : "queued"}</span>
      )}
      {t.state === "failed" && t.error !== undefined && <ErrorLine message={t.error} />}
      {url !== undefined && ab.at === url && ab.failed !== null && <ErrorLine message={ab.failed} live />}
    </motion.li>
  );
}

export function TakeGrid({ flow, ab }: { readonly flow: CoverFlow; readonly ab: AB }) {
  const takes = fiveTakes(flow.card.record.takes, COVER_TAKE_COUNT);
  return (
    <>
      <ol className={s.takes}>
        {takes.map((t, i) => (
          <TakeCard key={t.n} t={t} flow={flow} ab={ab} i={i} />
        ))}
      </ol>
      {flow.pickError !== null && <ErrorLine message={flow.pickError} live />}
    </>
  );
}
