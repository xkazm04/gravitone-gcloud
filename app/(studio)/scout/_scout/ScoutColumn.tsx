"use client";

// THE SCOUT'S ROOMS (design baseline P4, 2026-11-17): Graph, Runs, Productions, Ventures as the context column the
// audio desk, the kit and the Library stand in - the tab row the head drew retired into it. Which room is open is the
// pathname's (../../_shell/navModel.ts scoutRooms); the Runs tally is the layout's count of open scout packets.
import { usePathname } from "next/navigation";

import { ContextColumn } from "../../_shell/ContextColumn.tsx";
import { scoutRooms } from "../../_shell/navModel.ts";

export function ScoutColumn({ undecided }: { readonly undecided: number | undefined }) {
  return <ContextColumn rooms={scoutRooms(usePathname(), undecided)} />;
}
