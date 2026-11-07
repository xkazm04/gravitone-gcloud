"use client";

// WHERE THE DESK'S DATA COMES FROM: the server's view and acts as handed down, or - on a development build,
// under `?fixture=<state>` - ./fixture.ts's stand-ins. Either way the layouts see one shape: a view, the acts,
// a sender for the two file routes, a re-read, and a way to open a cover. While a cover's job is queued or
// rendering the view is re-read on an interval (router.refresh), so takes land in their rows as they finish.
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import type { CoverDeskView } from "@gt/domain/cover";

import type { CoverActs, CoverLayout } from "../contract.ts";
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
};

export const POLL_MS = 5000;

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

  const refresh = useCallback(() => {
    if (fixture !== null) fx.refresh();
    else router.refresh();
  }, [fixture, fx, router]);

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
  const state = shown?.current?.record.state;
  const working = state === "queued" || state === "rendering";
  useEffect(() => {
    if (!working) return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [working, refresh]);

  return { view: shown, acts: fixture !== null ? fx.acts : acts, sender: fixture !== null ? fx.sender : routeSender, refresh, open, hrefOf, fixture };
}
