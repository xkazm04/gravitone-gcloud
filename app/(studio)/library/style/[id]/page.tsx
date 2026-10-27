// /library/style/[id] - ONE STYLE, WORKED: the Library's style detail opened as its own
// atelier (Phase 5, L51). It replaces v1's /library Styles tab (LibraryAtelier, SpecEditor,
// Playground, TrialMatrix, parts.tsx) and the Foundry's style document with its "adopt into
// Library" button (app/foundry/StylesShelf.tsx): one record is both now, so the catalogue
// entry and its look are one page. Since wave B (L54) the view is the kernel store's, through
// the port's real side; the Foundry's shelf and its adopt route are retired (410 naming this page).
//
// A Server Component: the view is read here through the style port and handed to one client
// island with the port's actions. An unknown id is a 404 - never an empty atelier, and never
// another style standing in (v1 `projectStyle`: "an unannounced stand-in is the bug").
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { serverStyle, styleNow } from "../_port/port.ts";
import { STYLE_PORT } from "../_port/wire.ts";
import { Atelier } from "./_atelier/Atelier.tsx";

type Params = Promise<{ readonly id: string }>;

const decoded = (raw: string): string => {
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

/** One read of the style per request: the tab's title and the page both take it. */
const readStyle = cache((id: string) => serverStyle().loadStyle({ id }));

export async function generateMetadata({ params }: { readonly params: Params }): Promise<Metadata> {
  const id = decoded((await params).id);
  const view = await readStyle(id);
  // A read that failed titles the tab by the id: the page raises its own 404 or error.
  return { title: `Gravitone · ${view.ok ? view.value.name : id}` };
}

export default async function StylePage({ params }: { readonly params: Params }) {
  const { id } = await params;
  const view = await readStyle(decoded(id));
  if (!view.ok) {
    if (view.error.code === "not-found") notFound();
    throw view.error;
  }
  return <Atelier first={view.value} port={STYLE_PORT} nowMs={styleNow()} />;
}
