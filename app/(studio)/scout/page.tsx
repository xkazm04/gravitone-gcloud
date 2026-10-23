// /scout - the header's way to a /scout night's morning packet (operator, 2026-10-23). It renders
// nothing of its own: it opens the newest night that is waiting for its triage on the Board - a
// closed, uncommitted night, live before dry - else the newest night there is, else the Floor.
// The nights are read from the scout store at request time (lib/foundry/scout/store.ts listNights).
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { listNights } from "@/lib/foundry/scout/store";

import { boardFor } from "../_shell/links.ts";

export default async function ScoutNight() {
  await connection();
  const nights = await listNights();
  const waiting = nights.filter((n) => n.state === "closed");
  const pick = waiting.find((n) => !n.dry) ?? waiting[0] ?? nights[0];
  redirect(pick === undefined ? "/floor" : boardFor(`pkt:scout:${pick.id}`));
}
