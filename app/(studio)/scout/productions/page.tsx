// /scout/productions (spark concept-casting-stages S0): a kept concept walked through its stages, in three layouts on
// scripted data. A Server Component reads the port and hands one client island the plain view.
import type { Metadata } from "next";
import { connection } from "next/server";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { scoutHeaderFacts } from "../../_shell/headerFacts.ts";
import { serverBoard } from "../../board/_port/port.ts";
import { isScoutPacket, ScoutHead } from "../_scout/ScoutHead.tsx";
import s from "../_scout/scout.module.css";
import { serverProductions } from "./_port/port.ts";
import { Productions } from "./_productions/Productions.tsx";

export const metadata: Metadata = { title: "Gravitone · Productions" };

export default async function ProductionsPage() {
  await connection();
  const view = serverProductions();
  const [packets, facts] = await Promise.all([serverBoard().listPackets(), scoutHeaderFacts()]);
  const undecided = packets.ok ? packets.value.packets.filter((p) => isScoutPacket(p) && p.state === "open").length : 0;
  return (
    <div className={s.page}>
      <ScoutHead current="productions" undecided={undecided} facts={facts} />
      {view.ok ? <Productions view={view.value} /> : <ErrorLine message={`productions: ${view.error.message}`} live />}
    </div>
  );
}
