// /scout - the scout's decision graph (spark scout-decision-graph WP-S2; until 2026-10-23 a redirect to the newest
// night's packet, whose way to the Board now sits in this page's header). Every seed, idea, run and output the
// loop ever made, in stage columns, banded by audience and genre; what each branch spent; the operator's pauses
// and the advisory split the next night's brief carries.
//
// A Server Component: the graph is built here, on the server, where the stores are (./_port, the fixture or the
// scout store with the kernel's effort), and handed to one client island (./_scout/Scout.tsx) with the Server
// Actions that write the steer. A read that fails renders the store's own sentence.
import type { Metadata } from "next";
import { connection } from "next/server";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { serverScout } from "./_port/port.ts";
import { SCOUT_PORT } from "./_port/wire.ts";
import { Scout } from "./_scout/Scout.tsx";

export const metadata: Metadata = { title: "Gravitone · Scout" };

export default async function ScoutPage() {
  await connection();
  const view = await serverScout().view();
  if (!view.ok) return <ErrorLine message={`scout: ${view.error.message}`} live />;
  return <Scout initial={view.value} port={SCOUT_PORT} />;
}
