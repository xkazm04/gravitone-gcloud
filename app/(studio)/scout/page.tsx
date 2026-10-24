// /scout - the scout's decision graph (spark scout-decision-graph WP-S2; until 2026-10-23 a redirect to the newest
// night's packet, whose way to the Board now sits in this page's header). Every seed, idea, run and output the
// loop ever made, in stage columns, banded by audience and genre; what each branch spent; the operator's pauses
// and the advisory split the next night's brief carries.
//
// A Server Component: the graph is built here, on the server, where the stores are (./_port, the fixture or the
// scout store with the kernel's effort), and handed to one client island (./_scout/Scout.tsx) with the Server
// Actions that write the steer. A read that fails renders the store's own sentence. `?wing=muse` opens on the muse
// wing's graph (spark scout-muse); anything else is the scout wing's.
import type { Metadata } from "next";
import { connection } from "next/server";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { isWing } from "../../../lib/foundry/scout/wing.ts";
import { serverScout } from "./_port/port.ts";
import { SCOUT_PORT } from "./_port/wire.ts";
import { Scout } from "./_scout/Scout.tsx";
import s from "./_scout/scout.module.css";
import { isScoutPacket, ScoutHead } from "./_scout/ScoutHead.tsx";
import { serverBoard } from "../board/_port/port.ts";

export const metadata: Metadata = { title: "Gravitone · Scout" };

type Search = Promise<Readonly<Record<string, string | string[] | undefined>>>;

export default async function ScoutPage({ searchParams }: { readonly searchParams: Search }) {
  await connection();
  const [q, view, packets] = await Promise.all([searchParams, serverScout().view(), serverBoard().listPackets()]);
  const undecided = packets.ok ? packets.value.packets.filter((p) => isScoutPacket(p) && p.state === "open").length : 0;
  const head = <ScoutHead current="graph" undecided={undecided} />;
  if (!view.ok) {
    return (
      <div className={s.page}>
        {head}
        <ErrorLine message={`scout: ${view.error.message}`} live />
      </div>
    );
  }
  const asked = Array.isArray(q["wing"]) ? q["wing"][0] : q["wing"];
  return (
    <div className={s.page}>
      {head}
      <Scout initial={view.value} port={SCOUT_PORT} wing={isWing(asked) ? asked : "scout"} />
    </div>
  );
}
