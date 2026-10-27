// /scout/runs - the Runs tab with no night chosen: the newest scout packet still open, else the newest there is.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { scoutHeaderFacts } from "../../_shell/headerFacts.ts";
import { serverBoard } from "../../board/_port/port.ts";
import { isScoutPacket, runFor, ScoutHead } from "../_scout/ScoutHead.tsx";
import s from "../_scout/scout.module.css";

export const metadata: Metadata = { title: "Gravitone · Scout runs" };

export default async function ScoutRuns() {
  await connection();
  const list = await serverBoard().listPackets();
  if (!list.ok) return <ErrorLine message={`scout runs: ${list.error.message}`} live />;
  const mine = list.value.packets.filter(isScoutPacket).sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  const to = mine.find((p) => p.state === "open") ?? mine[0];
  if (to !== undefined) redirect(runFor(to.id));
  return (
    <div className={s.page}>
      <ScoutHead current="runs" undecided={0} facts={await scoutHeaderFacts()} />
      <ErrorLine message="scout: no night or seed batch has opened a packet yet" />
    </div>
  );
}
