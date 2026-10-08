// THE NOTEBOOK THE BOARD DEALS — one object, not five module constants.
//
// Before this file, "the notebook" downstream of Step 1 was whatever a module
// happened to import: `NOTEBOOK` for the facts, `CONCLUSIONS` appended by
// `buildCards` to any notebook it was handed, `CARD_DIMENSION` for the columns,
// and `research/scope.ts`'s `OPT_IN_IDS` built from CONCLUSIONS at module load.
// Each was the 2026-08-11 Bitcoin run, and each was read separately, so a
// creator's own notebook could not be dealt without the fixture's conclusions and
// tagging riding in behind it (lib/notebook/validate.ts measured the cost: a
// fresh notebook got 26 findings, 25 of them inherited conclusion cards).
//
// A NotebookSource is everything a reader needs to deal ONE notebook: the
// notebook, the conclusions that go with it, the columns and the tags that file
// its cards, where it came from, and an identity. The fixture is one source among
// several; nothing downstream should have to know which.
//
// STAGE 1 (research-scope-board-A): the type, the fixture adapter, and the board
// and scope arithmetic reading it — behaviour identical on the fixture, pinned by
// tests/golden-path/notebook-source.probe.spec.ts.
// STAGE 2: the notebook may carry `dimensions[]`, `conclusions[]` and a
// `dimension` on each card, and `sourceOf` reads them. Not yet: picking the live
// notebook for a project, and Step 2's readers (gate, recalibrate payload).
//
// `indexNotebook` is phase-shared-B's idea: the by-id maps notebook.ts builds at
// module load, built from whichever notebook is being dealt instead.

import type { EngineReceipt } from "../../research/run/live";
import { CONCLUSIONS, type Conclusion } from "./conclusions";
import { CARD_DIMENSION, DIMENSIONS, UNTAGGED_DIMENSION_ID, type Dimension, type DimensionId } from "./dimensions";
import { NOTEBOOK } from "./notebook";
import type { Fact, Notebook, Unknown } from "./types";

/** Where a notebook came from — its provenance, which is not inferable from content.
 *    · replay     — the shipped 2026-08-11 run (the seed, the harness, the UAT lane)
 *    · reasoned   — an engine reasoned it for the creator's topic, without search
 *    · researched — an engine that could search produced it (no rung can today) */
export type NotebookSourceKind = "replay" | "reasoned" | "researched";

export interface NotebookIndex {
  facts: Record<string, Fact>;
  unknowns: Record<string, Unknown>;
}

export interface NotebookSource {
  kind: NotebookSourceKind;
  notebook: Notebook;
  /** Reasoned claims dealt as opt-in cards. Empty for a notebook that carries none —
   *  never the fixture's by default. */
  conclusions: readonly Conclusion[];
  /** The columns the board renders and `scopeSummary` rolls up by. */
  dimensions: readonly Dimension[];
  /** Card id → column. Data, so a checker can enumerate it (stale tags). */
  tags: Readonly<Record<string, DimensionId>>;
  /** The column a card id files under; untagged when the source did not tag it. */
  tagOf(id: string): DimensionId;
  /** The run's receipt, when an engine produced the notebook. */
  receipt?: EngineReceipt;
  /** Identity of what is dealt: notebook + conclusions + columns + tags. Two
   *  sources that would deal different boards have different digests. */
  readonly digest: string;
  /** By-id maps over THIS notebook (indexNotebook). */
  readonly byId: NotebookIndex;
}

/** The by-id maps, for any notebook. `Object.fromEntries`, so a duplicate id
 *  keeps the later row — `cards.ts::notebookIssues` reports that. */
export function indexNotebook(nb: Notebook): NotebookIndex {
  return {
    facts: Object.fromEntries(nb.facts.map((f) => [f.id, f])),
    unknowns: Object.fromEntries(nb.unknowns.map((u) => [u.id, u])),
  };
}

/** FNV-1a, 32-bit, hex. An identity check, not a security boundary: it has to
 *  run in the browser and in Node, synchronously, with no dependency. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Card id → column, read from the `dimension` each Fact, Mechanism and Reversal
 *  carries. Empty for a notebook that tags nothing. */
function tagsOf(nb: Notebook): Record<string, DimensionId> {
  const tags: Record<string, DimensionId> = {};
  for (const c of [...nb.facts, ...nb.mechanisms, ...nb.reversals]) if (c.dimension) tags[c.id] = c.dimension;
  return tags;
}

/** Does this notebook bring its own columns or conclusions? Then the fixture's
 *  tables and conclusions are not its to inherit, and it is checked against what
 *  it declared. A notebook that declares neither is every notebook stored before
 *  stage 2 and keeps the older meaning (`asSource`). */
export function declaresOwn(nb: Notebook): boolean {
  return nb.dimensions !== undefined || nb.conclusions !== undefined;
}

export interface SourceOptions {
  /** Defaults to `reasoned`: a notebook that is not the replay was reasoned by an
   *  engine, and nothing searches today. */
  kind?: NotebookSourceKind;
  conclusions?: readonly Conclusion[];
  dimensions?: readonly Dimension[];
  tags?: Readonly<Record<string, DimensionId>>;
  receipt?: EngineReceipt;
}

/** A source over any notebook. Unset fields are EMPTY rather than the fixture's:
 *  no conclusions, no tags (every card untagged), the incumbent market columns. */
export function sourceOf(notebook: Notebook, opts: SourceOptions = {}): NotebookSource {
  // What the caller passes wins; then what the notebook carries itself (stage 2);
  // then empty. Never the fixture's.
  const conclusions = opts.conclusions ?? notebook.conclusions ?? [];
  const dimensions = opts.dimensions ?? notebook.dimensions ?? DIMENSIONS;
  const tags = opts.tags ?? tagsOf(notebook);
  let digest: string | undefined;
  let byId: NotebookIndex | undefined;
  return {
    kind: opts.kind ?? "reasoned",
    notebook,
    conclusions,
    dimensions,
    tags,
    tagOf: (id) => tags[id] ?? UNTAGGED_DIMENSION_ID,
    receipt: opts.receipt,
    // Lazy: the legacy `buildCards(notebook)` path wraps a source per call and
    // never asks for either.
    get digest() {
      return (digest ??= fnv1a(JSON.stringify([notebook, conclusions, dimensions.map((d) => d.id), tags])));
    },
    get byId() {
      return (byId ??= indexNotebook(notebook));
    },
  };
}

let fixture: NotebookSource | undefined;

/** The shipped 2026-08-11 run as a source: NOTEBOOK, its CONCLUSIONS, the market
 *  columns and CARD_DIMENSION. One object for the life of the module, so a hook
 *  that memoises on the source deals the board once. */
export function fixtureSource(): NotebookSource {
  return (fixture ??= sourceOf(NOTEBOOK, {
    kind: "replay",
    conclusions: CONCLUSIONS,
    dimensions: DIMENSIONS,
    tags: CARD_DIMENSION,
  }));
}

export function isNotebookSource(x: NotebookSource | Notebook): x is NotebookSource {
  return "notebook" in x && "tagOf" in x;
}

/** The older spelling: a bare Notebook means "this notebook, dealt with the
 *  fixture's conclusions and tags" (unless it declares its own) — exactly what `buildCards(nb)` and
 *  `notebookIssues(nb)` did before sources existed. lib/notebook/validate.ts and
 *  the graph probes still call it that way; the fixture notebook itself resolves
 *  to the fixture source. */
export function asSource(x: NotebookSource | Notebook = NOTEBOOK): NotebookSource {
  if (isNotebookSource(x)) return x;
  if (x === NOTEBOOK) return fixtureSource();
  if (declaresOwn(x)) return sourceOf(x);
  return sourceOf(x, { conclusions: CONCLUSIONS, dimensions: DIMENSIONS, tags: CARD_DIMENSION });
}
