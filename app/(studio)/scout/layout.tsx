// The Scout's frame (design baseline P4, 2026-11-17): its rooms' column beside every Scout page. The Runs room's
// tally - the scout packets still open on the Board - is read here once, for every page under it; a decision on the
// Board re-reads it through the router's refresh, which re-renders layouts too. A Board that cannot be read draws the
// room with no count, never a 0 that reads as "nothing waiting".
import type { ReactNode } from "react";
import { connection } from "next/server";

import { serverBoard } from "../board/_port/port.ts";
import { ScoutColumn } from "./_scout/ScoutColumn.tsx";
import { isScoutPacket } from "./_scout/ScoutHead.tsx";
import s from "./_scout/scout.module.css";

export default async function ScoutLayout({ children }: { readonly children: ReactNode }) {
  await connection();
  const packets = await serverBoard().listPackets();
  const undecided = packets.ok ? packets.value.packets.filter((p) => isScoutPacket(p) && p.state === "open").length : undefined;
  return (
    <div className={s.desk}>
      <ScoutColumn undecided={undecided} />
      <div className={s.work}>{children}</div>
    </div>
  );
}
