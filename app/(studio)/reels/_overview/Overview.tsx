// /reels - every reel, in one of three views behind the switch (spark reel-studio wave 3, owner: "prototype all
// three variants at once"; one wins and the others are deleted when it is picked): filmstrip rows, a poster grid, a
// stage board. The view is the address's (`?view=`), so each is a link and a capture. The head counts what waits on
// the operator - a film to judge, a bed to upload, a release to keep - and the newest finished film lights the room.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { RoomLight } from "@gt/ui/components/roomlight/RoomLight.tsx";
import { TabRail } from "@gt/ui/components/tabrail/TabRail.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import type { ReelRow } from "../_port/types.ts";
import { STAGE_LOOK } from "./facts.ts";
import { PosterGrid } from "./PosterGrid.tsx";
import { StageBoard } from "./StageBoard.tsx";
import { StripRows } from "./StripRows.tsx";
import o from "./overview.module.css";

export const VIEWS = ["strips", "posters", "stages"] as const;
export type OverviewView = (typeof VIEWS)[number];

export const viewOf = (raw: string | string[] | undefined): OverviewView => VIEWS.find((v) => v === raw) ?? "strips";

const LABEL: Readonly<Record<OverviewView, string>> = { strips: "Strips", posters: "Posters", stages: "Stages" };

export function Overview({ rows, view }: { readonly rows: readonly ReelRow[]; readonly view: OverviewView }) {
  const yours = rows.filter((r) => STAGE_LOOK[r.stage].yours).length;
  const released = rows.filter((r) => r.stage === "released").length;
  const sleeve = rows.find((r) => r.poster !== undefined && (r.stage === "released" || r.stage === "release"))?.poster ?? rows.find((r) => r.poster !== undefined)?.poster ?? null;
  return (
    <div className={o.page}>
      <RoomLight kind={yours > 0 ? "warn" : "neutral"} sleeve={sleeve} />
      <header className={o.head}>
        <h1 className={o.title}>Reels</h1>
        <span className={o.tallies}>
          <Tally value={yours} label="yours" />
          <Tally value={released} of={rows.length} label="released" />
        </span>
        <span className={o.headEnd}>
          <TabRail label="view" mode="reels" current={view} tabs={VIEWS.map((v) => ({ id: v, label: LABEL[v], href: v === "strips" ? "/reels" : `/reels?view=${v}` }))} />
          <Button label="new reel" tone="cyan" href="/reels/new" />
        </span>
      </header>
      <div className={o.body} data-view={view}>
        {rows.length === 0 ? (
          <Empty label="no reels yet" action={{ label: "new reel", href: "/reels/new", tone: "cyan" }} />
        ) : view === "posters" ? (
          <PosterGrid rows={rows} />
        ) : view === "stages" ? (
          <StageBoard rows={rows} />
        ) : (
          <StripRows rows={rows} />
        )}
      </div>
    </div>
  );
}
