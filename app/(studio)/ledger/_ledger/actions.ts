"use server";

// THE LEDGER PAGE'S TWO READS AFTER RENDER - the next page of the same filter, and an act's
// related events - as Server Actions, because the page reads the kernel on the server and
// nothing in the studio fetches JSON from a route handler (plan §9.2; app/_server/route.ts).
//
// They go through the one action core (actionCore.ts: who, then the input door, then the
// body, then a serialisable answer) with `read` key use: a read must not fail closed on a
// key set the money path would refuse, and must not succeed for nobody.

import { z } from "zod";

import { err, ok } from "@gt/domain/errors";
import type { Event } from "@gt/domain/event";

import { runAction, type ActionResult } from "../../../_server/actionCore.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { principal } from "../../../_server/principal.ts";
import { parseParams } from "./filter.ts";
import { readOne, readPage, readRelated, type Page, type Related } from "./read.ts";

const olderInput = z.object({
  /** The page's own search string: the same filter, read by the same parser. */
  search: z.string().max(4000),
  cursor: z.object({ t: z.iso.datetime(), seq: z.number().int().positive() }),
});

export async function olderEvents(raw: unknown): Promise<ActionResult<Page>> {
  return runAction(
    "ledger older",
    () => principal("read"),
    olderInput,
    (input) => {
      const k = kernel();
      if (!k.ok) return k;
      const f = parseParams(Object.fromEntries(new URLSearchParams(input.search)));
      return readPage(k.value.store, f, input.cursor);
    },
    raw,
  );
}

const relatedInput = z.object({ seq: z.number().int().positive() });

export async function relatedEvents(raw: unknown): Promise<ActionResult<Related & { readonly event: Event }>> {
  return runAction(
    "ledger related",
    () => principal("read"),
    relatedInput,
    (input) => {
      const k = kernel();
      if (!k.ok) return k;
      const one = readOne(k.value.store, input.seq);
      if (!one.ok) return one;
      if (one.value === null) return err("not-found", `ledger: no event #${input.seq}`);
      const r = readRelated(k.value.store, one.value);
      return r.ok ? ok({ ...r.value, event: one.value }) : r;
    },
    raw,
  );
}
