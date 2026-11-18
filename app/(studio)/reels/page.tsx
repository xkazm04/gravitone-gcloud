// /reels - the reel studio's overview (spark reel-studio WP3): every reel from a question to its Calendar slot, in
// the view the address names. A Server Component: the reels are read here through ./_port (the fixture universe, or
// the reels root with each reel's verdicts and jobs) and drawn without a client island - no video on the overview,
// only each film's stills. A read that fails draws the store's own sentence.
import type { Metadata } from "next";
import { connection } from "next/server";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { ContextColumn } from "../_shell/ContextColumn.tsx";
import { serverReels } from "./_port/port.ts";
import type { ReelRow } from "./_port/types.ts";
import { Overview, viewOf } from "./_overview/Overview.tsx";
import { reelsRooms } from "./_overview/rooms.ts";
import o from "./_overview/overview.module.css";

export const metadata: Metadata = { title: "Gravitone · Reels" };

export default async function ReelsPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const q = await searchParams;
  let rows: readonly ReelRow[] | undefined;
  let failure: string | undefined;
  try {
    rows = await serverReels().listReels();
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }
  return (
    <div className={o.desk}>
      <ContextColumn rooms={reelsRooms("all")} />
      <div className={o.work}>{rows === undefined ? <ErrorLine message={`reels: ${failure ?? "unreadable"}`} live /> : <Overview rows={rows} view={viewOf(q["view"])} />}</div>
    </div>
  );
}
