// /scout/productions (spark concept-casting-stages S1): a kept concept walked through its stages, graph first. A Server
// Component reads the port (the kernel's production record) and hands one client island the plain view.
import type { Metadata } from "next";
import { connection } from "next/server";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { scoutHeaderFacts } from "../../_shell/headerFacts.ts";
import { serverBoard } from "../../board/_port/port.ts";
import { isScoutPacket, ScoutHead } from "../_scout/ScoutHead.tsx";
import s from "../_scout/scout.module.css";
import { dropProductionAction, launchTakeAction, markProvenAction, moveProductionAction, refreshProductionsAction, startProductionAction } from "./_port/actions.ts";
import type { ProductionsPort } from "./_port/contract.ts";
import { serverProductions } from "./_port/port.ts";
import { Productions } from "./_productions/Productions.tsx";

export const metadata: Metadata = { title: "Gravitone · Productions" };

/** The Server Actions as the island holds them: passed as props, so no client module imports the actions file (or its zod). */
const port: ProductionsPort = { start: startProductionAction, launch: launchTakeAction, proven: markProvenAction, drop: dropProductionAction, move: moveProductionAction, refresh: refreshProductionsAction };

export default async function ProductionsPage({ searchParams }: { readonly searchParams: Promise<{ readonly from?: string | string[] }> }) {
  await connection();
  const view = await serverProductions().view();
  const raw = (await searchParams).from;
  const from = typeof raw === "string" && raw.trim() !== "" ? raw : undefined;
  const [packets, facts] = await Promise.all([serverBoard().listPackets(), scoutHeaderFacts()]);
  const undecided = packets.ok ? packets.value.packets.filter((p) => isScoutPacket(p) && p.state === "open").length : 0;
  return (
    <div className={s.page}>
      <ScoutHead current="productions" undecided={undecided} facts={facts} />
      {view.ok ? <Productions view={view.value} port={port} {...(from === undefined ? {} : { from })} /> : <ErrorLine message={`productions: ${view.error.message}`} live />}
    </div>
  );
}
