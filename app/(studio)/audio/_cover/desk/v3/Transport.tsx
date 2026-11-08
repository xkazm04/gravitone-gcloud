"use client";

// THE SHEET'S TRANSPORT (v3's ask 4): whatever was last pressed - a take or the section alone - held in a bar at the
// foot of the sheet, so audition never scrolls out of reach of a long sheet. Section/Take swap, seek on what plays,
// its position, the pick, and Stop, which lets the bar go. It is the same A/B pair (../useAB.ts) every line plays
// through, so the line and the bar never disagree. It rises once, on the first press; never on its own.
import { AnimatePresence, motion } from "motion/react";

import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Fader } from "@gt/ui/components/fader/Fader.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { Wave } from "@gt/ui/components/wave/Wave.tsx";

import { SECTION_KEY, type AB, type Side } from "../useAB.ts";
import type { CoverFlow } from "../useCover.ts";
import { clock, RIGHTS_LABEL, RIGHTS_TONE, takeUrl } from "../words.ts";
import { useMoves } from "./motion.ts";
import { SIDES, useHeard } from "./Takes.tsx";
import s from "./sheet.module.css";

/** The section's slice of the song's peaks. */
function slice(peaks: readonly number[], lenS: number, startS: number, endS: number): readonly number[] {
  if (peaks.length === 0 || lenS <= 0) return [];
  const from = Math.floor((startS / lenS) * peaks.length);
  const to = Math.max(from + 1, Math.ceil((endS / lenS) * peaks.length));
  return peaks.slice(from, to);
}

function Bar({ flow, ab }: { readonly flow: CoverFlow; readonly ab: AB }) {
  const r = flow.card.record;
  const at = ab.at ?? SECTION_KEY;
  const section = at === SECTION_KEY;
  const take = section ? undefined : r.takes.find((t) => takeUrl(flow.card, t) === at);
  const url = section ? undefined : at;
  const heard = useHeard(url);
  const name = section ? "the section" : take === undefined ? "take" : `take ${take.n}`;
  const spanLen = flow.span.endS - flow.span.startS;
  const len = section ? spanLen : (heard?.lenS ?? spanLen);
  const pos = ab.positionOf(at);
  const peaks = section ? slice(flow.heard?.peaks ?? [], flow.lenS, flow.span.startS, flow.span.endS) : (heard?.peaks ?? []);
  const winner = take !== undefined && r.winnerSeed === take.seed;
  const canPick = take !== undefined && !winner && (r.state === "judging" || r.state === "picked" || r.state === "failed");
  const urlOrNull = url ?? null;
  return (
    <div className={s.transport} role="group" aria-label="transport">
      <EarButton state={ab.playing ? "playing" : "idle"} name={name} onPress={() => ab.toggle(at, urlOrNull)} />
      <span className={s.tname}>{name}</span>
      {url !== undefined && <Seg<Side> label={`which side of ${name}`} options={SIDES} value={ab.side} onChange={(v) => ab.hear(at, url, v)} />}
      <div className={s.scrub}>
        <div className={s.mini}>
          <Wave peaks={peaks} width={1000} height={22} tone={section || ab.side === "a" ? "amber" : "cyan"} played={len > 0 ? pos / len : 0} stretch />
        </div>
        <Fader label={`position in ${name}`} value={Math.min(pos, len)} min={0} max={Math.max(len, 1)} step={1} onChange={(v) => ab.seek(at, urlOrNull, v)} valueText={`${clock(pos)} of ${clock(len)}`} />
      </div>
      <span className={s.time}>{`${clock(pos)} / ${clock(len)}`}</span>
      <Chip label={RIGHTS_LABEL[r.rights]} tone={RIGHTS_TONE[r.rights]} casing="lower" name={`rights ${RIGHTS_LABEL[r.rights]}`} />
      {winner && <Chip label="winner" tone="emerald" />}
      {canPick && <Button label={flow.picking === take.seed ? "Picking" : "Pick"} size="sm" tone="emerald" disabled={flow.picking !== null} onPress={() => flow.pick(take.seed)} />}
      <Button label="Stop" size="sm" onPress={ab.stop} />
    </div>
  );
}

export function Transport({ flow, ab }: { readonly flow: CoverFlow; readonly ab: AB }) {
  const moves = useMoves();
  return (
    <AnimatePresence initial={false}>
      {ab.at !== null && (
        <motion.div key="transport" className={s.foot} {...moves.arrive}>
          <Bar flow={flow} ab={ab} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
