"use client";

// THE SUNO STATION (spark suno-covers): a picked cover's winner sent to Suno, its two covers heard on suno.com and
// one kept as the remix. The send form is the left column, always in view; what Suno made stands beside it - the
// latest send's steps and its two takes stacked, the earlier sends below. The receipt takes the full width under
// both, where its table has room. Composition picked by the owner from three prototypes (2026-11-10, variant a).

import { Chip } from "@gt/ui/components/chip/Chip.tsx";

import { DurationField, LyricsField, ModelField, NegativeField, SendPress, SliderControls, StyleField, VarietyControl } from "./form.tsx";
import { ReceiptBlock, SendHead, Steps, StepsTally, TakeCard, takesOf } from "./results.tsx";
import type { CoverFlow } from "../useCover.ts";
import type { Desk } from "../useDesk.ts";
import { useSunoSend } from "./useSunoSend.ts";
import s from "./suno.module.css";

export function SunoStation({ flow: cover, desk }: { readonly flow: CoverFlow; readonly desk: Desk }) {
  const flow = useSunoSend(cover.card.record, desk.acts, desk.refresh, cover.brief.readAtMs);
  const [latest, ...earlier] = flow.sends;
  return (
    <div className={s.a}>
      <section className={s.aForm} aria-label="send">
        <StyleField flow={flow} />
        <LyricsField flow={flow} />
        <div className={s.pair}>
          <ModelField flow={flow} />
          <DurationField flow={flow} />
        </div>
        <SliderControls flow={flow} />
        <VarietyControl flow={flow} />
        <NegativeField flow={flow} />
        <SendPress flow={flow} />
      </section>
      <section className={s.aOut} aria-label="covers">
        {latest === undefined ? (
          <Chip label="no sends" ghost casing="lower" />
        ) : (
          <>
            <div className={s.sendBlock}>
              <SendHead send={latest} flow={flow} />
              <div className={s.row}>
                <Steps send={latest} flow={flow} />
                <StepsTally send={latest} flow={flow} />
              </div>
              <div className={s.stack}>
                {takesOf(latest).map((t) => (
                  <TakeCard key={t.take} send={latest} take={t} flow={flow} />
                ))}
              </div>
            </div>
            {earlier.length > 0 && (
              <ol className={s.earlier} aria-label="earlier sends">
                {earlier.map((e) => (
                  <li key={e.n} className={s.sendBlock}>
                    <SendHead send={e} flow={flow} />
                    <div className={s.stack}>
                      {takesOf(e).map((t) => (
                        <TakeCard key={t.take} send={e} take={t} flow={flow} compact />
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>
      <div className={s.aReceipt}>
        <ReceiptBlock flow={flow} />
      </div>
    </div>
  );
}
