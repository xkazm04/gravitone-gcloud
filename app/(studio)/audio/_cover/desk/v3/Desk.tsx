"use client";

// PROTOTYPE VARIANT v3 of the cover desk, SHEET (TODO(prototype, 2026-11-08): consolidate the cover desk switcher).
// A production sheet: the covers filed in a binder at the left (./History.tsx, grouped by state), and the cover in
// hand as one page in two columns - what went in, what came out (./Sheet.tsx) - with a transport at its foot
// (./Transport.tsx). Where the baseline is a column of steps that open in turn, the sheet is the whole session at
// once, every line on its baseline, a step not reached shrunk to the one word it waits on.
//
// Handed exactly what the baseline is handed. The flow is ../useCover.ts and the player ../useAB.ts, unchanged;
// the parts it reuses unchanged are ../Source.tsx SourceDrop, ../link/LinkSource.tsx SourceName, ../Score.tsx SectionPart,
// ../brief/Brief.tsx BriefPart and ../After.tsx WinnerPart and ChainPart. Copied and relaid as sheet lines: ScorePart
// (./Score.tsx), TakesPart (./Takes.tsx), RemixPart (./Remix.tsx).
import { useEffect, useMemo } from "react";

import type { CoverCard } from "@gt/domain/cover";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";

import type { DeskProps } from "../Layouts.tsx";
import { SourceDrop } from "../Source.tsx";
import { useAB } from "../useAB.ts";
import { useCover } from "../useCover.ts";
import type { Desk } from "../useDesk.ts";
import { History } from "./History.tsx";
import { Sheet } from "./Sheet.tsx";
import { Transport } from "./Transport.tsx";
import s from "./sheet.module.css";

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
  return (
    <div className={s.page}>
      <Sheet flow={flow} ab={ab} />
      <Transport flow={flow} ab={ab} />
    </div>
  );
}

export function DeskV3({ desk, view }: DeskProps) {
  if (view === null) return null;
  const current = view.current;
  return (
    <div className={view.covers.length > 0 ? s.desk : `${s.desk} ${s.alone}`}>
      {view.covers.length > 0 && <History desk={desk} view={view} />}
      {current === undefined ? (
        <div className={s.page}>
          {view.covers.length === 0 && <Empty label="no covers yet" />}
          <SourceDrop desk={desk} />
        </div>
      ) : (
        <Current key={current.record.id} card={current} desk={desk} />
      )}
    </div>
  );
}
