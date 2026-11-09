"use client";

// THE WINNER'S CARD: the picked take as it stood on the takes station - the same card, carried
// here by its layoutId (./TakeGrid.tsx takeLayout) - still heard against the section, beside the download.
import { motion, useReducedMotion } from "motion/react";

import { Chip } from "@gt/ui/components/chip/Chip.tsx";

import type { AB } from "../useAB.ts";
import type { CoverFlow } from "../useCover.ts";
import { RIGHTS_LABEL, RIGHTS_TONE, seconds, takeUrl } from "../words.ts";
import { takeLayout, TakePlayer } from "./TakeGrid.tsx";
import s from "./sleeve.module.css";

export function WinnerCard({ flow, ab }: { readonly flow: CoverFlow; readonly ab: AB }) {
  const reduce = useReducedMotion() === true;
  const r = flow.card.record;
  const t = r.takes.find((x) => x.seed === r.winnerSeed);
  const url = t === undefined ? undefined : takeUrl(flow.card, t);
  if (t === undefined || url === undefined) return null;
  return (
    // Under reduced motion it carries no layoutId, so the card is drawn where it lands: a zero-length flight is still a flight.
    <motion.div {...(reduce ? {} : { layoutId: takeLayout(r.id, t.seed), transition: { type: "spring" as const, stiffness: 380, damping: 36 } })} className={s.take} data-winner="" aria-label={`take ${t.n}, the winner`}>
      <div className={s.takeHead}>
        <span className={s.takeN}>{t.n}</span>
        <Chip label="winner" tone="emerald" />
      </div>
      <div className={s.takeFacts}>
        <Chip label={RIGHTS_LABEL[r.rights]} tone={RIGHTS_TONE[r.rights]} casing="lower" name={`rights ${RIGHTS_LABEL[r.rights]}`} />
        <span className={s.count}>{`seed ${t.seed}`}</span>
        {t.renderS !== undefined && <span className={s.count}>{seconds(t.renderS)}</span>}
      </div>
      <TakePlayer name={`take ${t.n}`} url={url} flow={flow} ab={ab} />
    </motion.div>
  );
}
