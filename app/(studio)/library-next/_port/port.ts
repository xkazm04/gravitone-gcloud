import "server-only";

// THE SEAM: which side the Library's Server Actions and page answer from. ONE switch, `SIDE`, the
// Board's shape (../../board/_port/port.ts).
//
// Wave A (L50) builds the route against the fixture (./fixture.ts: an in-memory index over a
// generated 5,000-item corpus that keeps the index's rules). Wave B writes the real side over the
// kernel's `library` module (L49: `query`, `detail`, the acts as events) and flips SIDE; nothing
// else in the route changes - the page, the actions and the client reach a side only through
// `serverLibrary()`, and both present through ./present.ts.
//
// The server side speaks the domain's `Result<T>`; ./actions.ts turns it into the wire envelope.

import { ok, type Result } from "@gt/domain/errors";
import type { LibraryAct, LibraryQuery } from "@gt/domain/library";

import { ledgerFor } from "../../_shell/links.ts";
import type { ActOutcome, ShownDetail, ShownPage } from "./contract.ts";
import { fixtureAct, fixtureDetail, fixtureEverything, fixtureLook, fixtureProjects, fixtureQuery } from "./fixture.ts";
import { fixtureUrl } from "./fixtureData.ts";
import { cardOf, detailOf, type Media } from "./present.ts";

export type ServerLibrary = {
  readonly query: (q: LibraryQuery) => Result<ShownPage>;
  readonly detail: (id: string, held: Readonly<Record<string, readonly string[] | undefined>>) => Result<ShownDetail>;
  readonly act: (id: string, act: LibraryAct, held: Readonly<Record<string, readonly string[] | undefined>>) => Result<ActOutcome>;
};

export const SIDE: "fixture" | "real" = "fixture";

/** The atelier of a style (L51's route beside this one). */
export const atelierOf = (styleId: string): string => `/library-next/style/${encodeURIComponent(styleId)}`;

const fixtureMedia: Media = { url: (sha) => fixtureUrl(sha), look: fixtureLook, ledger: ledgerFor };

const fixture: ServerLibrary = {
  query: (q) => {
    const p = fixtureQuery(q);
    return p.ok ? ok({ ...p.value, items: p.value.items.map((r) => cardOf(r, fixtureMedia)), everything: fixtureEverything() }) : p;
  },
  detail: (id, held) => {
    const d = fixtureDetail(id);
    return d.ok ? ok(detailOf(d.value, fixtureMedia, held, fixtureProjects(), atelierOf)) : d;
  },
  act: (id, act, held) => {
    const done = fixtureAct(id, act, () => new Date().toISOString());
    if (!done.ok) return done;
    const d = fixtureDetail(id);
    return d.ok ? ok({ detail: detailOf(d.value, fixtureMedia, held, fixtureProjects(), atelierOf), said: done.value.said }) : d;
  },
};

export function serverLibrary(): ServerLibrary {
  return fixture;
}
