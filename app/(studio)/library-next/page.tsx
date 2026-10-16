// /library-next - the Library (plan §2.1 `/library`; Phase 5 wave A, L50). v1 owns /library until
// the wave B cutover, which renames this route into its place.
//
// A Server Component: the address is the query (./_library/url.ts), and every number on the page
// is the index's, read here in one render - the first block of rows, the total, the kind counts,
// each rail group counted with its own selection left out, and the selected item's detail. The
// client half (./_library/Library.tsx) owns only what a person does between renders.

import type { Metadata } from "next";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { BLOCK } from "@gt/ui/components/library/library.ts";

import { serverLibrary } from "./_port/port.ts";
import { LIBRARY_PORT } from "./_port/wire.ts";
import { Library } from "./_library/Library.tsx";
import { parseUrl, queryOf } from "./_library/url.ts";

export const metadata: Metadata = { title: "Gravitone · Library" };

export default async function LibraryPage({ searchParams }: { readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>> }) {
  const u = parseUrl(await searchParams);
  const side = serverLibrary();
  const page = side.query(queryOf(u, 0, BLOCK));
  if (!page.ok) return <ErrorLine message={`library: ${page.error.message}`} live />;
  const detail = u.sel === null ? null : side.detail(u.sel, u.f);
  // A selection the index no longer holds is not an error to stop on: the page opens on the set.
  const shown = detail !== null && detail.ok ? detail.value : null;
  return <Library url={shown === null ? { ...u, sel: null } : u} page={page.value} detail={shown} port={LIBRARY_PORT} />;
}
