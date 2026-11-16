import "server-only";

import { ok, type Result } from "@gt/domain/errors";

import { kernel } from "../kernelStore.ts";

// THE SEQ A RENDER IS AT - where a page's live feed (app/(studio)/_shell/liveFeed.ts `openFeed`)
// continues from: the ledger's newest seq, whatever its type. The Floor and Runs read it beside
// their own loaders (`queryEvents(...).head`); the Library's page and the Board's island read it
// here, the same number by the same statement events-query's `head` runs.

export function ledgerHead(): Result<number> {
  const k = kernel();
  if (!k.ok) return k;
  const r = k.value.store.read((x) => x.get("SELECT coalesce(max(seq), 0) AS head FROM events")?.["head"]);
  if (!r.ok) return r;
  return ok(typeof r.value === "number" ? r.value : 0);
}
