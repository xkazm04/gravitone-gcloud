// /library - the Library (plan §2.1 `/library`; Phase 5: L50 built it against the fixture at
// /library-next, L53 cut it over onto the kernel's index and into v1's address).
//
// A Server Component: the address is the query (./_library/url.ts), and every number on the page
// is the index's, read here in one render - the first block of rows, the total, the kind counts,
// each rail group counted with its own selection left out, and the selected item's detail. The
// client half (./_library/Library.tsx) owns only what a person does between renders.
//
// Freshness: rendering asks the projection to sync if one is due (lib/library/fresh.ts
// `freshLibrary`: non-blocking, claim-guarded across processes, at most once a minute), the way
// /ledger asks `freshLedger()`. What that sync lands is on the next render; new media it finds
// is queued for its facts as a `media-facts` job, never probed inside this request.
//
// v1's handoff: `/library?style=<id>` (the Foundry's adopt, a bookmark from v1's Styles tab)
// opens that style's atelier. A v1 theme id is resolved to the Style it was imported as
// (`v1-theme:<id>`); an id the store holds under neither name still opens the atelier, which
// answers 404 in its own words rather than this page guessing.

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { BLOCK } from "@gt/ui/components/library/library.ts";

import { freshLibrary } from "../../../lib/library/fresh.ts";
import { atelierOf, serverLibrary, SIDE } from "./_port/port.ts";
import { styleHandoff } from "./_port/handoff.ts";
import { LIBRARY_PORT } from "./_port/wire.ts";
import { Library } from "./_library/Library.tsx";
import { parseUrl, queryOf } from "./_library/url.ts";

export const metadata: Metadata = { title: "Gravitone · Library" };

type Search = Readonly<Record<string, string | string[] | undefined>>;

export default async function LibraryPage({ searchParams }: { readonly searchParams: Promise<Search> }) {
  const raw = await searchParams;
  const style = typeof raw["style"] === "string" ? raw["style"] : Array.isArray(raw["style"]) ? raw["style"][0] : undefined;
  if (style !== undefined && style !== "") redirect(atelierOf(SIDE === "real" ? styleHandoff(style) : style));
  const u = parseUrl(raw);
  const sync = SIDE === "real" ? freshLibrary() : null;
  const side = serverLibrary();
  const page = side.query(queryOf(u, 0, BLOCK));
  if (!page.ok) return <ErrorLine message={`library: ${page.error.message}`} live />;
  const detail = u.sel === null ? null : side.detail(u.sel, u.f);
  // A selection the index no longer holds is not an error to stop on: the page opens on the set.
  const shown = detail !== null && detail.ok ? detail.value : null;
  return (
    <>
      {sync !== null && !sync.ok && <ErrorLine message={`library sync: ${sync.error.message}`} />}
      <Library url={shown === null ? { ...u, sel: null } : u} page={page.value} detail={shown} port={LIBRARY_PORT} />
    </>
  );
}
