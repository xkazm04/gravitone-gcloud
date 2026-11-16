"use client";

// THE HEADER'S SLOT FOR WORK THAT NEEDS THE OPERATOR - failed and interrupted jobs, counted
// where every screen can see them. Since the bell retired (app/layout.tsx) a failed job was
// visible on Runs only; this is its count, beside the spend, and the door to Runs showing only
// those jobs (`?state=needs`).
//
// What it counts is Runs' one definition (../projects/runs/_runs/needs.ts), over the jobs the
// server read for this render (./headerFacts.ts readNeeds - no v1 store is opened: an interrupted
// v1 run is on Runs and not in this count). At zero the chip is absent: nothing failed is not a
// fact worth a chip (the header lost two badges on the operator's word, ./HeaderBar.tsx). A
// count that could not be read is a rose `unread` chip with the store's words as its name, never
// an absence that reads as "nothing failed" (./SpendSlot.tsx's rule).
//
// IT STAYS CURRENT ON ITS OWN. The Floor and Runs refresh the whole render (and so this header)
// on their feeds; every other screen does not, so the chip keeps its own: a `job.*` event on the
// ledger's stream, or the backstop, re-reads the count through a guarded action (./bellJobs.ts),
// handed down by the server half (./StudioHeader.tsx) rather than imported: a client module that
// imports an action's module walks into its zod (tests/next-gates/client-closure.test.ts).
// A server render arriving later (a navigation, a page's refresh) replaces whatever it holds.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { usePollBackstop } from "@gt/ui/freshness/useFreshness";

import { NEEDS_HREF } from "../projects/runs/_runs/needs.ts";
import type { ActionResult } from "../../_server/actionCore.ts";
import type { NeedsFacts } from "./headerFacts.ts";
import { BACKSTOP_MS, openFeed } from "./liveFeed.ts";
import { needsChip } from "./needsChip.ts";
import f from "./FailedSlot.module.css";

export type NeedsReread = () => Promise<ActionResult<NeedsFacts>>;

export function FailedSlot({ facts, reread: ask }: { readonly facts: NeedsFacts; readonly reread: NeedsReread }) {
  const [held, setHeld] = useState(facts);
  const [seen, setSeen] = useState(facts);
  if (seen !== facts) {
    // The server read again (a navigation or a page's refresh): its copy is the newer.
    setSeen(facts);
    setHeld(facts);
  }
  const reread = useCallback(async (): Promise<void> => {
    try {
      const r = await ask();
      setHeld((cur) => (r.ok ? r.value : { needs: null, problems: [r.error.error], head: cur.head }));
    } catch (e) {
      setHeld((cur) => ({ needs: null, problems: [e instanceof Error ? e.message : String(e)], head: cur.head }));
    }
  }, [ask]);
  usePollBackstop(reread, BACKSTOP_MS);
  // The stream opens once, from the first render's seq; with no seq (the kernel unread) the backstop alone re-reads.
  const [head] = useState(facts.head);
  useEffect(() => (head === null ? undefined : openFeed({ head, families: ["job"], refresh: () => void reread(), fail: () => undefined })), [head, reread]);

  const chip = needsChip(held);
  if (chip === null) return null;
  return (
    <Link className={f.slot} href={NEEDS_HREF} prefetch={false} aria-label={chip.name}>
      <Chip label={chip.label} value={chip.value} tone={chip.tone} />
    </Link>
  );
}
