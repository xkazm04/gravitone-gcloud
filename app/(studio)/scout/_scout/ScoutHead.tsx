// THE TITLE SECTION of /scout and /scout/runs: where the operator is, and the two views of the scout's work - the
// decision graph, and the nights and seed batches waiting for (or past) their triage. Each tab is its own address
// (projects/runs/_runs/Runs.tsx is the precedent), so a reload or a pasted link lands on the same view.
import type { PacketSummary } from "@gt/domain/board";
import { Crumbs } from "@gt/ui/components/crumbs/Crumbs.tsx";
import { TabRail } from "@gt/ui/components/tabrail/TabRail.tsx";

import s from "./scout.module.css";

/** The Board's packets that are the scout's: a night's, either wing's, and a seed batch's. */
export const isScoutPacket = (p: Pick<PacketSummary, "source">): boolean => p.source === "scout" || p.source === "seeds";

/** Where the Runs tab opens a packet (the Board island builds the same address from its `railBase`). */
export const runFor = (packetId: string): string => `/scout/runs/${encodeURIComponent(packetId)}`;

export function ScoutHead({ current, undecided }: { readonly current: "graph" | "runs"; readonly undecided?: number }) {
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
    </div>
  );
}
