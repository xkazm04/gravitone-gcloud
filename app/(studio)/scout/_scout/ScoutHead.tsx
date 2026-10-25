// THE TITLE SECTION of /scout and /scout/runs: where the operator is, and the two views of the scout's work - the
// decision graph, and the nights and seed batches waiting for (or past) their triage. Each tab is its own address
// (projects/runs/_runs/Runs.tsx is the precedent), so a reload or a pasted link lands on the same view.
//
// On the right (spark scout-storyboards WP2, moved here from the studio header): the last 24 hours' spend and the
// NEXT scout pile - the oldest scout or seeds pile still waiting (_shell/facts.ts nextScoutPile), opened on the Runs
// tab. No pile waiting draws no button: the Runs tab's tally already says 0. A scout store that could not be read
// draws a rose `next unread` instead, so its silence is never read as "nothing waiting".
import type { PacketSummary } from "@gt/domain/board";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Crumbs } from "@gt/ui/components/crumbs/Crumbs.tsx";
import { TabRail } from "@gt/ui/components/tabrail/TabRail.tsx";

import { SCOUT_PILE_SOURCES } from "../../_shell/facts.ts";
import type { ScoutHeaderFacts } from "../../_shell/headerFacts.ts";
import { SpendSlot } from "../../_shell/SpendSlot.tsx";
import s from "./scout.module.css";
import { ScoutNext } from "./ScoutNext.tsx";

/** The Board's packets that are the scout's: a night's, either wing's, and a seed batch's. */
export const isScoutPacket = (p: Pick<PacketSummary, "source">): boolean => SCOUT_PILE_SOURCES.has(p.source);

/** Where the Runs tab opens a packet (the Board island builds the same address from its `railBase`). */
export const runFor = (packetId: string): string => `/scout/runs/${encodeURIComponent(packetId)}`;

export function ScoutHead({ current, undecided, facts }: { readonly current: "graph" | "runs"; readonly undecided?: number; readonly facts: ScoutHeaderFacts }) {
  const next = facts.next;
  return (
    <div className={s.head}>
      <Crumbs trail={[]} here="Scout" />
      <TabRail
        label="view"
        mode="scout"
        current={current}
        tabs={[
          { id: "graph", label: "Graph", href: "/scout" },
          { id: "runs", label: "Runs", href: "/scout/runs", ...(undecided === undefined ? {} : { tally: { value: undecided, label: "undecided" } }) },
        ]}
      />
      <div className={s.headEnd}>
        <SpendSlot facts={facts} />
        {next !== null ? (
          <span className={s.headNext}>
            <ScoutNext next={{ title: next.title, count: next.count, href: runFor(next.packetId) }} />
          </span>
        ) : (
          facts.nextProblems.length > 0 && <Chip label="next" value="unread" tone="rose" name={`next scout run could not be read: ${facts.nextProblems.join("; ")}`} />
        )}
      </div>
    </div>
  );
}
