"use client";

// THE FIVE TAKES ON THE CONSOLE (prototype v1; copied from ../Takes.tsx and changed). Each take is one dense line: its
// number (the key that plays it), its state, seed and render time, the A/B player against the section at matched
// level, the rights it carries, and Pick. What changed from the copy: the rows enter one by one, and a take that
// finishes while the desk is open swaps its waiting word for its player with an entrance, never on a loop. The
// player itself is the copy's (one row at a time, seekable, ComfyUI's sentence verbatim on a failed take).
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
import { clock, fiveTakes, RIGHTS_LABEL, RIGHTS_TONE, seconds, TAKE_TONE, takeUrl } from "../words.ts";
import { useMotionKit } from "./motion.ts";
import s from "../cover.module.css";
import c from "./console.module.css";

const SIDES = [
  { value: "a" as const, label: "section" },
  { value: "b" as const, label: "take" },
];

function Player({ name, url, flow, ab }: { readonly name: string; readonly url: string; readonly flow: CoverFlow; readonly ab: AB }) {
  const [heard, setHeard] = useState<Heard | null>(null);
  useEffect(() => {
    let live = true;
    void hearUrl(url).then((a) => {
      if (live && a.ok) setHeard(a.value);
    });
    return () => {
      live = false;
    };
  }, [url]);
  const here = ab.at === url;
  const at = ab.positionOf(url);
  const len = heard?.lenS ?? flow.span.endS - flow.span.startS;
  return (
    <div className={c.player}>
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

function waiting(r: CoverFlow["card"]["record"], first: boolean): string {
  if (r.state === "draft") return "—";
  if (r.state === "failed") return "not rendered";
  return r.state === "rendering" && first ? "rendering" : "queued";
}

function TakeRow({ t, i, flow, ab }: { readonly t: CoverTake; readonly i: number; readonly flow: CoverFlow; readonly ab: AB }) {
  const kit = useMotionKit();
  const r = flow.card.record;
  const url = takeUrl(flow.card, t);
  const name = `take ${t.n}`;
  const first = r.takes.find((x) => x.state === "pending")?.n === t.n;
  const winner = r.winnerSeed !== undefined && r.winnerSeed === t.seed && t.seed >= 0;
  const canPick = t.state === "done" && url !== undefined && (r.state === "judging" || r.state === "picked" || r.state === "failed");
  const playable = t.state === "done" && url !== undefined;
  return (
    <motion.li
      className={c.take}
      data-live={url !== undefined && ab.at === url ? "" : undefined}
      data-winner={winner ? "" : undefined}
      aria-label={name}
      initial={kit.still ? false : { opacity: 0, y: kit.rise }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...kit.enter, delay: i * kit.stagger }}
    >
      <span className={c.key} aria-hidden="true">
        {t.n}
      </span>
      <span className={c.takeMeta}>
        <Chip label={t.state} tone={TAKE_TONE[t.state]} dot casing="lower" />
        {winner && <Chip label="winner" tone="emerald" />}
        {t.seed >= 0 && <span className={c.num}>{`s${t.seed}`}</span>}
        {t.renderS !== undefined && <span className={c.num}>{seconds(t.renderS)}</span>}
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={playable ? "player" : t.state} className={c.takeBody} initial={kit.still ? false : { opacity: 0, y: kit.rise }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={kit.enter}>
          {playable ? <Player name={name} url={url} flow={flow} ab={ab} /> : t.state === "pending" ? <span className={c.wait}>{waiting(r, first)}</span> : <span />}
        </motion.div>
      </AnimatePresence>
      <span className={c.takeEnd}>
        <Chip label={RIGHTS_LABEL[r.rights]} tone={RIGHTS_TONE[r.rights]} casing="lower" name={`rights ${RIGHTS_LABEL[r.rights]}`} />
        {canPick && !winner && <Button label={flow.picking === t.seed ? "Picking" : "Pick"} size="sm" tone="emerald" disabled={flow.picking !== null} onPress={() => flow.pick(t.seed)} />}
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
    </motion.li>
  );
}

export function TakesStrip({ flow, ab }: { readonly flow: CoverFlow; readonly ab: AB }) {
  const takes = fiveTakes(flow.card.record.takes, COVER_TAKE_COUNT);
  return (
    <div className={s.fields}>
      <ol className={c.takes}>
        {takes.map((t, i) => (
          <TakeRow key={t.n} t={t} i={i} flow={flow} ab={ab} />
        ))}
      </ol>
      {flow.pickError !== null && <ErrorLine message={flow.pickError} live />}
    </div>
  );
}
