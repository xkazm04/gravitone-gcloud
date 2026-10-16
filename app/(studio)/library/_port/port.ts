import "server-only";

// THE SEAM: which side the Library's Server Actions and page answer from. ONE switch, `SIDE`,
// the produce ports' (../../projects/_port/port.ts): GRAVITONE_PRODUCE_SIDE=fixture moves the
// whole studio into its fixture universe at once, so a fixture lane never reads one route from
// the kernel and the next from memory.
//
// Wave A (L50) built the route against the fixture (./fixture.ts: an in-memory index over a
// generated 5,000-item corpus that keeps the index's rules). Wave B (L53) wrote the real side
// (./real.ts: the kernel's `library` module) and made it the default; nothing else in the route
// changed - the page, the actions and the client reach a side only through `serverLibrary()`, and
// both present through ./present.ts. The fixture stays for /kit and the fixture lane.
//
// The server side speaks the domain's `Result<T>`; ./actions.ts turns it into the wire envelope.

import { ok } from "@gt/domain/errors";

import { kernel } from "../../../../lib/kernelStore.ts";
import { ledgerFor } from "../../_shell/links.ts";
import { fixtureAct, fixtureDetail, fixtureEverything, fixtureLook, fixtureProjects, fixtureQuery } from "./fixture.ts";
import { fixtureUrl } from "./fixtureData.ts";
import { cardOf, detailOf, type Media } from "./present.ts";
import { makeRealLibrary, type ServerLibrary } from "./real.ts";

export type { ServerLibrary, Who } from "./real.ts";

export const SIDE: "fixture" | "real" = process.env["GRAVITONE_PRODUCE_SIDE"] === "fixture" ? "fixture" : "real";

/** The atelier of a style (the route beside this one). */
export const atelierOf = (styleId: string): string => `/library/style/${encodeURIComponent(styleId)}`;

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

const real: ServerLibrary = makeRealLibrary({
  store: () => {
    const k = kernel();
    return k.ok ? ok(k.value.store) : k;
  },
  atelierOf,
});

export function serverLibrary(): ServerLibrary {
  return SIDE === "fixture" ? fixture : real;
}
