// /scout/ventures (spark concept-casting-stages S6): the future channels. Every venture: its channel card, its productions, its
// accepted lessons. A Server Component reads the port and hands one client island the plain view.
import type { Metadata } from "next";
import { connection } from "next/server";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { scoutHeaderFacts } from "../../_shell/headerFacts.ts";
import { serverBoard } from "../../board/_port/port.ts";
import { isScoutPacket, ScoutHead } from "../_scout/ScoutHead.tsx";
import s from "../_scout/scout.module.css";
import { createVentureAction } from "./_port/actions.ts";
import type { VenturesPort } from "./_port/contract.ts";
import { serverVentures } from "./_port/port.ts";
import { Ventures } from "./_ventures/Ventures.tsx";

export const metadata: Metadata = { title: "Gravitone · Ventures" };

const port: VenturesPort = { create: createVentureAction };

export default async function VenturesPage({ searchParams }: { readonly searchParams: Promise<{ readonly v?: string | string[] }> }) {
  await connection();
  const view = await serverVentures().view();
  const raw = (await searchParams).v;
  const from = typeof raw === "string" && raw.trim() !== "" ? raw : undefined;
  const [packets, facts] = await Promise.all([serverBoard().listPackets(), scoutHeaderFacts()]);
  const undecided = packets.ok ? packets.value.packets.filter((p) => isScoutPacket(p) && p.state === "open").length : 0;
  return (
    <div className={s.page}>
      <ScoutHead current="ventures" undecided={undecided} facts={facts} />
      {view.ok ? <Ventures view={view.value} port={port} {...(from === undefined ? {} : { from })} /> : <ErrorLine message={`ventures: ${view.error.message}`} live />}
    </div>
  );
}
