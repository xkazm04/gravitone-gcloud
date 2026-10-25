// THE TITLE SECTION of /scout and /scout/runs: where the operator is, and the two views of the scout's work - the
// decision graph, and the nights and seed batches waiting for (or past) their triage. Each tab is its own address
// (projects/runs/_runs/Runs.tsx is the precedent), so a reload or a pasted link lands on the same view.
//
// On the right (spark scout-storyboards WP2, moved here from the studio header): the last 24 hours' spend and the
// NEXT scout pile - the oldest scout or seeds pile still waiting (_shell/facts.ts nextScoutPile), opened on the Runs
// tab. No pile waiting draws no button: the Runs tab's tally already says 0. A scout store that could not be read
// draws a rose `next unread` instead, so its silence is never read as "nothing waiting".
//
// Before them (spark scout-vision): the scout wing's backlog when the view knows it - a `52 backlog` stamp (kept ideas
// waiting for a storyboard) and, while the seed gate holds, an amber `fresh ≤ 20` chip (the fresh seeds a batch may
// take). The runs pages hold no view, so they pass none and draw neither.
import type { PacketSummary } from "@gt/domain/board";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Crumbs } from "@gt/ui/components/crumbs/Crumbs.tsx";
import { TabRail } from "@gt/ui/components/tabrail/TabRail.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import { SCOUT_PILE_SOURCES } from "../../_shell/facts.ts";
import type { ScoutHeaderFacts } from "../../_shell/headerFacts.ts";
import { SpendSlot } from "../../_shell/SpendSlot.tsx";
import type { ScoutBacklog } from "../_port/contract.ts";
import s from "./scout.module.css";
import { ScoutNext } from "./ScoutNext.tsx";

/** The Board's packets that are the scout's: a night's, either wing's, and a seed batch's. */
export const isScoutPacket = (p: Pick<PacketSummary, "source">): boolean => SCOUT_PILE_SOURCES.has(p.source);

/** Where the Runs tab opens a packet (the Board island builds the same address from its `railBase`). */
export const runFor = (packetId: string): string => `/scout/runs/${encodeURIComponent(packetId)}`;

function Backlog({ backlog }: { readonly backlog: ScoutBacklog }) {
  return (
    <>
      <span role="group" aria-label={`${backlog.waiting} kept ideas wait for a storyboard`} data-backlog="waiting">
        <Tally value={backlog.waiting} label="backlog" />
      </span>
      {backlog.gated && backlog.freshAllowed !== null && (
        <Chip label="fresh" value={`≤ ${backlog.freshAllowed}`} tone="amber" casing="lower" name={`fresh seeds limited to ${backlog.freshAllowed}`} />
      )}
    </>
  );
}

export function ScoutHead({ current, undecided, facts, backlog }: { readonly current: "graph" | "runs"; readonly undecided?: number; readonly facts: ScoutHeaderFacts; readonly backlog?: ScoutBacklog }) {
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
        {backlog !== undefined && <Backlog backlog={backlog} />}
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
