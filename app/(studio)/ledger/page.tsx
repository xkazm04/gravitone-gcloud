// /ledger - every act the studio knows, as one typed, append-only list (plan §2.1; Phase 2).
//
// A Server Component: the filter is the URL's search params (the prototype kept it in the
// hash, which a server never sees), and every number on the page is the kernel's, read here
// in one render - the page of rows, the total and each facet with its own filter left out,
// the strip's per-day counts, the selected act. The client half (./_ledger/Ledger.tsx)
// owns only what a person does between renders: typing, selecting, scrolling, the drawer.
//
// Freshness: rendering asks the v1 projection to sync if one is due (lib/ledger/v1/sync.ts
// `freshLedger`: non-blocking, at most every 30 s, claim-guarded across processes). What
// that sync appends reaches this page through the event stream, which refreshes it.

import type { Metadata } from "next";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { kernel } from "../../../lib/kernelStore.ts";
import { freshLedger } from "../../../lib/ledger/v1/sync.ts";
import { identity, parseParams, splitFilter, toSearch } from "./_ledger/filter.ts";
import { Ledger } from "./_ledger/Ledger.tsx";
import { olderEvents, relatedEvents } from "./_ledger/actions.ts";
import { readView } from "./_ledger/read.ts";

export const metadata: Metadata = { title: "Gravitone · Ledger" };

export default async function LedgerPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseParams(await searchParams);
  const k = kernel();
  if (!k.ok) return <ErrorLine message={`ledger: ${k.error.message}`} live />;
  const sync = freshLedger();
  const v = readView(k.value.store, f);
  if (!v.ok) return <ErrorLine message={`ledger: ${v.error.message}`} live />;
  const inRange = f.from === null ? undefined : v.value.facets.total;
  return (
    <Ledger
      key={`${identity(f)}|${f.order}`}
      filter={f}
      search={toSearch(f)}
      page={v.value.page}
      facets={v.value.facets}
      strip={v.value.strip}
      selected={v.value.selected}
      nowMs={v.value.nowMs}
      ignored={splitFilter(f).ignored}
      {...(inRange === undefined ? {} : { inRange })}
      {...(sync.ok ? {} : { syncError: sync.error.message })}
      older={olderEvents}
      related={relatedEvents}
    />
  );
}
