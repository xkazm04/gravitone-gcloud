"use client";

// WHERE THE DESK'S DATA COMES FROM: the server's view and acts as handed down, or - on a development build,
// under `?fixture=<state>` - ./fixture.ts's stand-ins. Either way the layouts see one shape: a view, the acts,
// a sender for the two file routes, a re-read, and a way to open a cover. While the cover's brief is queued or
// running, or its job queued or rendering, the view is re-read once a minute (COVER_POLL_MS, router.refresh) and
// again when the tab comes back into view; nothing in flight, no timer.
//
// A cover made from a link is opened with its brief's receipt already asked (cover from a link, WP-C): `briefOnOpen`
// names that cover until the desk has asked once, so the one Confirm left is the receipt's.
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { CoverDeskView } from "@gt/domain/cover";

import { COVER_POLL_MS, type CoverActs, type CoverLayout } from "../contract.ts";
import { inFlight } from "./brief/brief.ts";
import { markRead } from "./brief/readClock.ts";
import { FIXTURE_STATES, useFixture, type FixtureState } from "./fixture.ts";
import { routeSender, type Sender } from "./send.ts";

export type Desk = {
  readonly view: CoverDeskView | null;
  readonly acts: CoverActs;
  readonly sender: Sender;
  readonly refresh: () => void;
  /** Open a cover (undefined: a new one), keeping the layout. */
  readonly open: (id: string | undefined) => void;
  readonly hrefOf: (id: string | undefined, layout: CoverLayout) => string;
  readonly fixture: FixtureState | null;
  /** The cover whose brief receipt is asked the moment it opens (a link's cover), until `briefAsked`. */
  readonly briefOnOpen: string | null;
  readonly openWithBrief: (id: string) => void;
  readonly briefAsked: () => void;
};

function fixtureOf(raw: string | null): FixtureState | null {
  if (process.env.NODE_ENV === "production") return null;
  return FIXTURE_STATES.find((s) => s === raw) ?? null;
}

export function useDesk(view: CoverDeskView, acts: CoverActs, layout: CoverLayout): Desk {
  const router = useRouter();
  const q = useSearchParams();
  const fixture = fixtureOf(q.get("fixture"));
  const fx = useFixture(fixture ?? "empty");

  const hrefOf = useCallback(
    (id: string | undefined, l: CoverLayout): string => {
      const p = new URLSearchParams();
      p.set("s", "cover");
      if (l !== "steps") p.set("layout", l);
      if (fixture !== null) p.set("fixture", fixture);
      if (id !== undefined) p.set("cover", id);
      else if (fixture === null) p.set("cover", "new");
      return `/audio?${p.toString()}`;
    },
    [fixture],
  );

  // Stable across renders (the fixture's own re-read is), so the minute's interval is not restarted by a render.
  const fxRefresh = fx.refresh;
  const refresh = useCallback(() => {
    markRead();
    if (fixture !== null) fxRefresh();
    else router.refresh();
  }, [fixture, fxRefresh, router]);

  const open = useCallback(
    (id: string | undefined) => {
      if (fixture !== null) fx.select(id);
      router.push(hrefOf(id, layout), { scroll: false });
    },
    [fixture, fx, router, hrefOf, layout],
  );

  // `?cover=new` asks for the upload: the server's read answers its newest cover for an id it does not hold.
  const asked = q.get("cover");
  const shown: CoverDeskView | null = fixture !== null ? fx.view : asked === "new" ? { covers: view.covers } : view;
  const working = inFlight(shown?.current?.record);
  useEffect(() => {
    if (!working) return;
    const t = setInterval(refresh, COVER_POLL_MS);
    const back = (): void => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", back);
    };
  }, [working, refresh]);

  const [briefOnOpen, setBriefOnOpen] = useState<string | null>(null);
  const openWithBrief = useCallback(
    (id: string) => {
      setBriefOnOpen(id);
      open(id);
    },
    [open],
  );
  const briefAsked = useCallback(() => setBriefOnOpen(null), []);

  return { view: shown, acts: fixture !== null ? fx.acts : acts, sender: fixture !== null ? fx.sender : routeSender, refresh, open, hrefOf, fixture, briefOnOpen, openWithBrief, briefAsked };
}
