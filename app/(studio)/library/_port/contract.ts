// THE LIBRARY PORT AS THE SCREEN HOLDS IT - client-safe (types only): the Server Actions the
// Library route calls, and the shapes it draws. The READ contract is the index's own
// (@gt/domain/library, L49: LibraryQuery, LibraryPage, LibraryDetail, LibraryAct); what this file
// adds is PRESENTATION - what the domain row becomes on a screen - because a domain row names its
// cover by blob sha and a tile needs an address, and a lineage node names a record where the
// screen needs a door. Both sides (the fixture now, the kernel's index at the wave B cutover)
// answer through one pure mapping (./present.ts), so the screen cannot tell them apart.
//
//   ShownPage    the index's page with its rows as cards (face resolved), plus how many items
//                the Library holds before any filter (the rail's head, the summary's "of N").
//   ShownDetail  the index's detail with the parts the panel draws already shaped: facet lines
//                labelled, lineage grouped by role into doors, the preview resolved.
//
// Every verb answers the action core's envelope (app/_server/actionCore.ts): `{ok, value}` or
// `{ok, error}`, never a throw. Acts are events on the server (`library.pinned`, `library.used`).

import type { LibraryAct, LibraryActName, LibraryDetail, LibraryExtras, LibraryPage, LibraryQuery, MediaFacts } from "@gt/domain/library";
import type { FacetLine } from "@gt/ui/components/library/DetailPanel.tsx";
import type { Face } from "@gt/ui/components/library/Face.tsx";
import type { LineageNode } from "@gt/ui/components/library/Lineage.tsx";
import type { LibraryCard } from "@gt/ui/components/library/LibraryTile.tsx";

import type { ActionResult } from "../../../_server/actionCore.ts";

export type ShownPage = Omit<LibraryPage, "items"> & {
  readonly items: readonly LibraryCard[];
  /** Everything the Library holds, before the query: the rail's head and the summary's "of". */
  readonly everything: number;
};

export type Choice = { readonly value: string; readonly label: string };

export type ShownDetail = {
  readonly card: LibraryCard;
  readonly origin: LibraryDetail["row"]["origin"];
  /** The item's vocabulary as doors, every value labelled (DetailFacets). */
  readonly lines: readonly FacetLine[];
  readonly lineage: readonly LineageNode[];
  readonly extras: LibraryExtras;
  readonly media: MediaFacts | null;
  /** What the preview draws: the face, or a player for a clip or an export that decodes. */
  readonly preview: { readonly face: Face; readonly video?: { readonly src: string; readonly poster?: string; readonly loop: boolean } };
  readonly acts: readonly LibraryActName[];
  readonly pinned: boolean;
  /** The projects "Use in project" can name. */
  readonly projects: readonly Choice[];
  /** The projects that already use it. */
  readonly usedBy: readonly Choice[];
  /** A style's own page (the atelier), when the item is a style. */
  readonly atelier?: string;
  /** The Calendar's schedule sheet for this item, when it is an export a slot can publish. */
  readonly schedule?: string;
};

export type ActOutcome = { readonly detail: ShownDetail; readonly said: string };

/** The filter the detail's facet chips are drawn against (a value in it is drawn pressed). */
export type Held = Readonly<Record<string, readonly string[]>>;

export type LibraryPort = {
  readonly query: (q: LibraryQuery) => Promise<ActionResult<ShownPage>>;
  readonly detail: (input: { readonly id: string; readonly facets?: Held }) => Promise<ActionResult<ShownDetail>>;
  readonly act: (input: { readonly id: string; readonly act: LibraryAct; readonly facets?: Held }) => Promise<ActionResult<ActOutcome>>;
};
