// GET /api/ledger?<the Ledger page's own params>&format=jsonl[&cursor=<t>,<seq>]
//
// The agents' door to the ledger (plan §4: "`/api/ledger` and `pipeline/ledger.mts query`
// expose the same query() the prototype shows"; the prototype's `GT_LEDGER.query()`). The
// params ARE the page's (`q actor type lane project src from to order`, parsed by the same
// `parseParams`) and the page read is the same `readPage`, so a link copied from the
// Ledger's address bar and pasted here returns exactly the rows the page shows, as JSON
// Lines - one Event per line, the record as the kernel stored it.
//
// BOUNDED AND CURSOR-PAGED (audit-logging: audit-querying). A response is one page of at
// most PAGE events. The headers say what was answered: the canonical filter, the clock it
// ranges over, whether more rows match, how many rows an unindexed predicate examined, and - when
// there is more - `Link: <...>; rel="next"`, the same URL with the keyset cursor. Read-guarded
// (`access`): a read-scope CLI token (`Authorization: Bearer gt_...`) or the session cookie.
// Ordering, the cursor and the clock are the page's: newest first by `occurredAt ?? at`
// unless `order=asc`, ties broken by seq.

import { z } from "zod";

import { err } from "@gt/domain/errors";

import { parseParams, splitFilter, toSearch } from "../../(studio)/ledger/_ledger/filter.ts";
import { readPage } from "../../(studio)/ledger/_ledger/read.ts";
import { kernel } from "../../../lib/kernelStore.ts";
import { route } from "../../_server/route.ts";

export const maxDuration = 30;

const input = z
  .object({
    format: z.literal("jsonl"),
    cursor: z
      .string()
      .regex(/^[^,]+,\d+$/)
      .optional(),
  })
  .catchall(z.string());

export const GET = route({ guard: "access", bodyCap: 0, maxDuration, input }, async ({ req, input: q }) => {
  const k = kernel();
  if (!k.ok) return k;
  const f = parseParams(Object.fromEntries(new URL(req.url).searchParams));
  let cursor: { t: string; seq: number } | undefined;
  if (q.cursor !== undefined) {
    const at = q.cursor.lastIndexOf(",");
    const t = q.cursor.slice(0, at);
    const seq = Number(q.cursor.slice(at + 1));
    if (Number.isNaN(Date.parse(t)) || !Number.isSafeInteger(seq) || seq < 1) return err("invalid", `ledger: cursor "${q.cursor}" is not <iso>,<seq>`);
    cursor = { t, seq };
  }
  const page = readPage(k.value.store, f, cursor);
  if (!page.ok) return page;
  const { events, capped, scanned, exhausted } = page.value;
  const canonical = toSearch({ ...f, ev: null, view: "table" });
  const headers = new Headers({
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    "x-ledger-query": canonical,
    "x-ledger-generated-at": new Date().toISOString(),
    "x-ledger-clock": "occurredAt ?? at",
    "x-ledger-count": String(events.length),
    "x-ledger-capped": String(capped),
    "x-ledger-scanned": String(scanned),
    "x-ledger-exhausted": String(exhausted),
  });
  const ignored = splitFilter(f).ignored;
  if (ignored.length > 0) headers.set("x-ledger-ignored", ignored.join(" "));
  const next = page.value.cursor;
  if (next !== undefined) {
    const u = new URL(req.url);
    u.searchParams.set("cursor", `${next.t},${next.seq}`);
    headers.set("link", `<${u.pathname}${u.search}>; rel="next"`);
  }
  const body = events.map((e) => JSON.stringify(e)).join("\n");
  return new Response(events.length === 0 ? "" : `${body}\n`, { headers });
});
