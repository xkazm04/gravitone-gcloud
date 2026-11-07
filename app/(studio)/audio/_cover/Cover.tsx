"use client";

// THE COVER DESK (spark track-mirror-studio, WP3): an uploaded song, a section of it, a style; five YuE2 takes
// heard against the section; a winner picked and downloaded; the Suno remix brought back with its style. The
// island holds only the owner's unsaved edits and the players; every write is an act or a route, and the view
// is re-read after it (./desk/useDesk.ts). Three compositions of the same parts sit behind `?layout=`
// (./desk/Layouts.tsx) until the owner picks one.
import { useMemo } from "react";

import type { CoverCard } from "@gt/domain/cover";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { TabRail } from "@gt/ui/components/tabrail/TabRail.tsx";

import { COVER_LAYOUTS, type CoverActs, type CoverDeskView, type CoverLayout } from "./contract.ts";
import { CoverLayoutOf } from "./desk/Layouts.tsx";
import { CoverList, SourceDrop } from "./desk/Source.tsx";
import { useAB } from "./desk/useAB.ts";
import { useCover } from "./desk/useCover.ts";
import { useDesk, type Desk } from "./desk/useDesk.ts";
import s from "./desk/cover.module.css";

function Current({ card, desk, layout }: { readonly card: CoverCard; readonly desk: Desk; readonly layout: CoverLayout }) {
  const flow = useCover(card, desk.acts, desk.sender, desk.refresh);
  const { heard, span } = flow;
  const rms = useMemo(() => heard?.rms(span.startS, span.endS), [heard, span.startS, span.endS]);
  const ab = useAB(card.sourceUrl, span, rms);
  return <CoverLayoutOf layout={layout} flow={flow} ab={ab} />;
}

export function CoverDesk({ view, acts, layout }: { readonly view: CoverDeskView; readonly acts: CoverActs; readonly layout: CoverLayout }) {
  const desk = useDesk(view, acts, layout);
  const shown = desk.view;
  const current = shown?.current;
  const tabs = COVER_LAYOUTS.map((l) => ({ id: l, label: l, href: desk.hrefOf(current?.record.id, l) }));
  return (
    <div className={s.section}>
      <div className={s.bar}>
        <TabRail label="cover layout" mode="audio" tabs={tabs} current={layout} />
      </div>
      {shown !== null && shown.covers.length > 0 && <CoverList desk={desk} view={shown} layout={layout} />}
      {shown === null ? null : current === undefined ? (
        <>
          {shown.covers.length === 0 && <Empty label="no covers yet" />}
          <SourceDrop desk={desk} />
        </>
      ) : (
        <Current key={current.record.id} card={current} desk={desk} layout={layout} />
      )}
    </div>
  );
}
