"use client";

// THE COVER DESK'S COMPOSITION: the covers made so far, then the one in hand as a column of steps - a part opens as
// the one before it completes. The brief sits after the song's facts and before the section, inside the section part.
// The owner kept steps (2026-11-08) over the two compositions it was tried beside, and they are gone.
//
// `Baseline` is the whole desk as it stands; the prototype variants (./v1, ./v2, ./v3) receive exactly its props.
// It lives here, not in ../Cover.tsx, so a variant can render it without importing the switcher that imports it.
import { useEffect, useMemo, type ReactNode } from "react";

import { COVER_TAKE_COUNT, type CoverCard, type CoverDeskView, type CoverState } from "@gt/domain/cover";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import { ChainPart, RemixPart, WinnerPart } from "./After.tsx";
import { BriefPart } from "./brief/Brief.tsx";
import { ScorePart, SectionPart } from "./Score.tsx";
import { CoverList, SourceDrop, SourceFacts } from "./Source.tsx";
import { doneCount, TakesPart } from "./Takes.tsx";
import { useAB, type AB } from "./useAB.ts";
import { useCover, type CoverFlow } from "./useCover.ts";
import type { Desk } from "./useDesk.ts";
import { clock } from "./words.ts";
import s from "./cover.module.css";

type PartId = "section" | "score" | "takes" | "winner" | "remix";
const ORDER: readonly PartId[] = ["section", "score", "takes", "winner", "remix"];

/** How far the work has come: the parts a state has opened. */
function reached(state: CoverState): number {
  if (state === "draft") return 2;
  if (state === "picked") return 5;
  return 3;
}

function Block({ n, title, open, extra, children }: { readonly n?: number; readonly title: string; readonly open: boolean; readonly extra?: ReactNode; readonly children: ReactNode }) {
  return (
    <section className={open ? s.block : `${s.block} ${s.closed}`} aria-label={title}>
      <div className={s.head}>
        {n !== undefined && <span className={s.n}>{n}</span>}
        <CapsHeading text={title} level={3} />
        {extra}
      </div>
      {open && children}
    </section>
  );
}

type Props = { readonly flow: CoverFlow; readonly ab: AB };

export function parts({ flow, ab }: Props): Record<PartId, { readonly title: string; readonly extra?: ReactNode; readonly body: ReactNode }> {
  const r = flow.card.record;
  const done = doneCount(r.takes);
  return {
    section: {
      title: "section",
      extra: <Chip label={`${clock(flow.span.startS)}–${clock(flow.span.endS)}`} casing="lower" />,
      body: (
        <>
          <SourceFacts card={flow.card} lenS={flow.lenS} />
          <BriefPart flow={flow} />
          <SectionPart flow={flow} ab={ab} />
        </>
      ),
    },
    score: { title: "score", body: <ScorePart flow={flow} /> },
    takes: { title: "takes", extra: <Tally value={done} of={COVER_TAKE_COUNT} label="done" />, body: <TakesPart flow={flow} ab={ab} /> },
    winner: { title: "winner", body: <WinnerPart flow={flow} /> },
    remix: {
      title: "remix",
      ...(r.remix === undefined ? {} : { extra: <Chip label="chain" tone="emerald" casing="lower" dot /> }),
      body: (
        <>
          <RemixPart flow={flow} />
          <ChainPart flow={flow} quiet={ab.stop} />
        </>
      ),
    },
  };
}

export function StepsLayout(p: Props) {
  const all = parts(p);
  const upTo = reached(p.flow.card.record.state);
  return (
    <div className={s.steps}>
      {ORDER.map((id, i) => (
        <Block key={id} n={i + 1} title={all[id].title} open={i < upTo} extra={all[id].extra}>
          {all[id].body}
        </Block>
      ))}
    </div>
  );
}

function Current({ card, desk }: { readonly card: CoverCard; readonly desk: Desk }) {
  const flow = useCover(card, desk.acts, desk.sender, desk.refresh);
  const { heard, span } = flow;
  const rms = useMemo(() => heard?.rms(span.startS, span.endS), [heard, span.startS, span.endS]);
  const ab = useAB(card.sourceUrl, span, rms);
  // A cover made from a link opens on its brief's receipt (desk.briefOnOpen): asked once, here, as it mounts.
  const askNow = desk.briefOnOpen === card.record.id;
  const { briefAsked } = desk;
  const ask = flow.brief.ask;
  useEffect(() => {
    if (!askNow) return;
    briefAsked();
    ask();
  }, [askNow, briefAsked, ask]);
  return <StepsLayout flow={flow} ab={ab} />;
}

/** What the desk and every prototype variant of it is handed: the desk from useDesk, and the view it shows. */
export type DeskProps = { readonly desk: Desk; readonly view: CoverDeskView | null };

export function Baseline({ desk, view }: DeskProps) {
  const current = view?.current;
  return (
    <>
      {view !== null && view.covers.length > 0 && <CoverList desk={desk} view={view} />}
      {view === null ? null : current === undefined ? (
        <>
          {view.covers.length === 0 && <Empty label="no covers yet" />}
          <SourceDrop desk={desk} />
        </>
      ) : (
        <Current key={current.record.id} card={current} desk={desk} />
      )}
    </>
  );
}
