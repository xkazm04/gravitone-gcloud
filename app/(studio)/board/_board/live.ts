"use client";

// THE BOARD STAYS CURRENT (spark fable-ten, package D) - the studio's one live rule
// (_shell/liveFeed.ts: events are advice, a re-read is the truth) applied to the Board, and the
// door from a decided packet to what it made.
//
//   what a refresh re-reads   the page's loader (load.ts): the rail - new packets, each one's
//                             decided count - and the packet as the server holds it. NOT the
//                             open desk: an open packet's cells were dealt when it was first
//                             opened and are frozen there, its marks are the gate's optimistic
//                             map, and the cull's selection and scroll are the desk's own state.
//                             router.refresh() merges the new props without remounting the
//                             desk (it is keyed by the packet id), so all of that survives. A
//                             DECIDED packet has nothing of the operator's in flight, so its
//                             gate re-reads too: an apply moving pending -> applied shows.
//   which events              every non-ingest event (no `families`): the rail's piles come
//                             from v1's live read, whose changes reach the ledger as each v1
//                             source's own event types - an open set (lib/ledger/v1/sources.ts:
//                             a new source "is drawn with no other change"), which an include
//                             list would silently leave to the backstop.
//   where                     the full page only. The sheet rides over another page, and the
//                             Floor it rises from re-reads the whole tree, the sheet's slot
//                             included, on its own feed - a second feed there would be a second
//                             loader run per burst for the same answer.
//   from which seq            the page's render (`head`) when the page passes it, else the
//                             ledger's head asked once on mount (../_port/head.ts); the backstop
//                             (20 s, while visible) covers the moment between the two.
//
// The two Server Actions (the head, the count) arrive as props on the port (../_port/wire.ts),
// never imported here: a client module that imported them would walk the client closure into
// their zod doors (tests/next-gates/client-closure.test.ts).

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { usePollBackstop } from "@gt/ui/freshness/useFreshness";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { BACKSTOP_MS, openFeed } from "../../_shell/liveFeed.ts";
import type { Made } from "../../library/_port/made.ts";

/** What the Board's port carries beside the BoardPort for this file (../_port/wire.ts BOARD_PORT). */
export type BoardDoors = {
  /** The ledger's newest seq (../_port/head.ts boardHead). */
  readonly head: () => Promise<ActionResult<number>>;
  /** What a run made in the Library, counted (../../library/_port/made.ts madeBy). */
  readonly made: (input: { readonly group: "job" | "run"; readonly value: string }) => Promise<ActionResult<Made>>;
};

type Live = {
  readonly id: string;
  readonly kind: "sheet" | "full";
  readonly head: number | undefined;
  /** The packet on the desk is decided: nothing of the operator's is in flight on it. */
  readonly decided: boolean;
  readonly gate: { readonly load: (id: string, keepVerdicts: boolean) => Promise<void> };
  /** Absent (a host that hands a bare BoardPort), the feed starts only from a `head` prop. */
  readonly ask?: BoardDoors["head"];
};

export function useLiveBoard({ id, kind, head, decided, gate, ask }: Live): void {
  const router = useRouter();
  const on = kind === "full";
  // The latest decided-ness, read when the refresh fires (not a dependency: a commit must not reopen the feed).
  const decidedNow = useRef(decided);
  useEffect(() => {
    decidedNow.current = decided;
  });
  const heard = useCallback(() => {
    if (decidedNow.current) void gate.load(id, false);
    router.refresh();
  }, [gate, id, router]);

  const [from, setFrom] = useState<number | null>(head ?? null);
  useEffect(() => {
    if (!on || from !== null || ask === undefined) return;
    let live = true;
    void ask().then(
      (r) => {
        if (live && r.ok) setFrom(r.value);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [on, from, ask]);
  // The stream errors into the backstop: the page keeps re-reading every BACKSTOP_MS while visible.
  useEffect(() => (on && from !== null ? openFeed({ head: from, refresh: heard, fail: () => undefined }) : undefined), [on, from, heard]);
  usePollBackstop(heard, BACKSTOP_MS, on);
}

/**
 * A decided packet's door to what its run made in the Library: counted first (../../library/
 * _port/made.ts), so a run the Library holds nothing of yet - a night not committed, a remainder
 * packet - draws no door. Asked only for a source the Library files runs under (the caller checks
 * lib/library/runSources.ts). Null while counting, on a refusal, at zero, and with no `made` to ask.
 */
export function useMade(made: BoardDoors["made"] | undefined, runId: string | null): Made | null {
  const [held, setHeld] = useState<{ readonly run: string; readonly made: Made } | null>(null);
  useEffect(() => {
    if (runId === null || made === undefined) return;
    let live = true;
    void made({ group: "run", value: runId }).then(
      (r) => {
        if (live && r.ok && r.value.n > 0) setHeld({ run: runId, made: r.value });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [made, runId]);
  return held !== null && held.run === runId ? held.made : null;
}
