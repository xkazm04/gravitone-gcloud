import { parseAt } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";
import { clausesOf, eventQuerySchema, whereOf, type EventQuery, type Facet } from "./events-query.ts";
import type { Param, Row, Store } from "./store.ts";

// COUNTING THE LEDGER - the facet column beside the Ledger's list, and the
// reconcile probe's side of "does the ledger hold what v1 holds".
//
// EACH FACET IS COUNTED WITH ITS OWN FILTER LEFT OUT. A facet that counted
// under its own predicate would show only the values already chosen - pick
// `verdict.*` and every other type reads 0, so the column can never say what
// the next click would find. The prototype's facet column (docs/next/prototype/
// app/ledger.js) behaves this way; it computed it over an in-memory array.
// Here it is one GROUP BY per facet over the same compiled predicates
// (events-query.ts `clausesOf`), so a facet and the list can never disagree
// about what a filter means. The registry carries no subject for this rule
// (a coverage gap, reported with Phase 2's lot 14).
//
// ONE READ TRANSACTION for the total and every facet (bounded-enumeration:
// declare-the-inconsistency): a sync landing between two GROUP BYs would
// otherwise give a total that is not the sum of any facet.
//
// BOUNDED, AND IT SAYS SO. Each facet returns at most TOP values, largest
// first; the rest is summed into `other` and `truncated` is set
// (bounded-enumeration: required-limit-breaks-unaware-clients). 50 is a
// screen of facet rows: the prototype's busiest facet (type) has 18 values,
// and the v1 projection's vocabulary stays under 40.

const TOP = 50;

/** facet -> the column it groups by. The groups of `type` and `lane` are their own facets for counting. */
const GROUPS: readonly { readonly name: FacetCount["facet"]; readonly facet: Facet; readonly column: string }[] = [
  { name: "actorKind", facet: "actorKind", column: "actor_kind" },
  { name: "type", facet: "type", column: "type" },
  { name: "typeGroup", facet: "type", column: "type_group" },
  { name: "lane", facet: "lane", column: "lane" },
  { name: "laneGroup", facet: "lane", column: "lane_group" },
  { name: "subjectKind", facet: "subjectKind", column: "subject_kind" },
  { name: "source", facet: "source", column: "source" },
];

export type FacetValue = { readonly value: string; readonly n: number };

export type FacetCount = {
  readonly facet: "actorKind" | "type" | "typeGroup" | "lane" | "laneGroup" | "subjectKind" | "source";
  readonly values: readonly FacetValue[];
  /** Matching rows whose value fell past the TOP shown; 0 unless truncated. */
  readonly other: number;
  readonly truncated: boolean;
  /** Matching rows with no value for this column (no lane, no source). */
  readonly none: number;
};

export type EventCounts = {
  /** Rows matching every predicate. */
  readonly total: number;
  readonly head: number;
  readonly facets: readonly FacetCount[];
};

/**
 * The total under the whole filter, and each facet's values under the filter
 * minus that facet's own predicate. Paging fields (`limit`, cursors, order)
 * are ignored: a count is over the whole match, never a page of it.
 */
export function countEvents(store: Store, input: Omit<EventQuery, "limit">, only?: readonly FacetCount["facet"][]): Result<EventCounts> {
  const p = parseAt("ledger count", eventQuerySchema, { ...input, limit: 1 });
  if (!p.ok) return p;
  const clauses = clausesOf(p.value);
  return store.read((r) => {
    const all = whereOf(clauses);
    const totalRow = r.get(`SELECT count(*) AS n FROM events${all.where}`, ...all.params);
    const headRow = r.get("SELECT coalesce(max(seq), 0) AS head FROM events");
    // `only` names the facets a caller reads (the Ledger strip reads one of seven); the rest are
    // not counted and not returned. Absent, every facet is.
    const wanted = only === undefined ? GROUPS : GROUPS.filter((g) => only.includes(g.name));
    // The sums (matching rows, and those with a value) depend only on the filter left out, so
    // `type` and `typeGroup` (and `lane`, `laneGroup`) share one statement.
    const sums = new Map<Facet, Row | undefined>();
    for (const left of new Set(wanted.map((g) => g.facet))) {
      const { where, params } = whereOf(clauses.filter((c) => c.facet !== left));
      const cols = wanted.filter((g) => g.facet === left).map((g) => `count(${g.column}) AS v_${g.column}`);
      sums.set(left, r.get(`SELECT count(*) AS n, ${cols.join(", ")} FROM events${where}`, ...params));
    }
    const facets: FacetCount[] = wanted.map((g) => {
      const { where, params } = whereOf(clauses.filter((c) => c.facet !== g.facet));
      const args: Param[] = [...params, TOP + 1];
      // The NULL group is `none`, counted below; left in, it would take one of the TOP + 1 slots
      // ahead of the values and hide that the facet was cut.
      const valuedOnly = `${where === "" ? " WHERE" : `${where} AND`} ${g.column} IS NOT NULL`;
      const rows = r.all(`SELECT ${g.column} AS value, count(*) AS n FROM events${valuedOnly} GROUP BY ${g.column} ORDER BY n DESC, value LIMIT ?`, ...args);
      const sum = sums.get(g.facet);
      const values: FacetValue[] = [];
      for (const row of rows) {
        if (typeof row["value"] === "string" && typeof row["n"] === "number") values.push({ value: row["value"], n: row["n"] });
      }
      const truncated = values.length > TOP;
      const shown = values.slice(0, TOP);
      const n = typeof sum?.["n"] === "number" ? sum["n"] : 0;
      const v = sum?.[`v_${g.column}`];
      const valued = typeof v === "number" ? v : 0;
      const other = valued - shown.reduce((acc, x) => acc + x.n, 0);
      return { facet: g.name, values: shown, other, truncated, none: n - valued };
    });
    return {
      total: typeof totalRow?.["n"] === "number" ? totalRow["n"] : 0,
      head: typeof headRow?.["head"] === "number" ? headRow["head"] : 0,
      facets,
    };
  });
}

/** One facet's counts as a plain map, for a caller that compares (the reconcile probe). */
export function facetMap(counts: EventCounts, facet: FacetCount["facet"]): Record<string, number> {
  const f = counts.facets.find((x) => x.facet === facet);
  return Object.fromEntries((f?.values ?? []).map((v) => [v.value, v.n]));
}
