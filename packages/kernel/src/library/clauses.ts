import { z } from "zod";
import type { Parsed } from "@gt/domain/door";
import {
  ATTENTION,
  KIND_LABELS,
  LIBRARY_KINDS,
  LIBRARY_ORIGINS,
  LIBRARY_PAGE_MAX,
  LIBRARY_SORTS,
  LIBRARY_SOURCES,
  LIBRARY_STATES,
  normText,
  parseSearch,
  railGroups,
} from "@gt/domain/library";
import type { Param, Reader } from "../store.ts";
import { ftsExpression, isColumnGroup } from "./core.ts";

// THE QUERY, COMPILED - every predicate of a LibraryQuery as a clause tagged with
// the group it belongs to: `kind`, a rail group, or null for the search text
// (which narrows every count). The page ANDs them all; the counts leave a
// group's own clause out (./counts.ts). User text reaches SQL only as bound
// parameters and as ONE quoted FTS5 expression (core.ts `ftsExpression`).

const RAIL_KEYS: ReadonlySet<string> = new Set(LIBRARY_KINDS.flatMap((k) => railGroups(k).map((g) => g.key)));

export const querySchema = z.object({
  kind: z.enum(LIBRARY_KINDS).optional(),
  q: z.string().max(500).optional(),
  facets: z.record(z.string().refine((k) => RAIL_KEYS.has(k), "not a Library rail group"), z.array(z.string().min(1)).max(200)).optional(),
  sort: z.enum(LIBRARY_SORTS).optional(),
  offset: z.number().int().nonnegative().max(1_000_000).optional(),
  limit: z.number().int().min(0).max(LIBRARY_PAGE_MAX),
});
export type ParsedQuery = Parsed<z.output<typeof querySchema>>;

export type Clause = { readonly group: string | null; readonly sql: string; readonly params: readonly Param[] };

export const marks = (n: number): string => Array.from({ length: n }, () => "?").join(", ");

const COLUMN_VALUES: Readonly<Record<string, readonly string[]>> = {
  state: LIBRARY_STATES,
  origin: LIBRARY_ORIGINS,
  source: LIBRARY_SOURCES,
  attention: ATTENTION,
};

const NEVER = "0";

/** `group` IN `values`, against the item column or the facet rows. */
function selection(group: string, values: readonly string[], tag: string | null): Clause {
  if (values.length === 0) return { group: tag, sql: NEVER, params: [] };
  if (isColumnGroup(group)) return { group: tag, sql: `i.${group} IN (${marks(values.length)})`, params: values };
  return { group: tag, sql: `i.seq IN (SELECT item_seq FROM library_facets WHERE grp = ? AND value IN (${marks(values.length)}))`, params: [group, ...values] };
}

/** Every clause of the query; `key:value` tokens resolved against the values the index holds. */
export function clausesOf(r: Reader, q: ParsedQuery): Clause[] {
  const out: Clause[] = [];
  if (q.kind !== undefined) out.push({ group: "kind", sql: "i.kind = ?", params: [q.kind] });
  for (const [group, values] of Object.entries(q.facets ?? {})) {
    if (values !== undefined && values.length > 0) out.push(selection(group, [...new Set(values)], group));
  }
  const parsed = parseSearch(q.q ?? "");
  const fts = ftsExpression(parsed.words);
  if (fts !== null) out.push({ group: null, sql: "i.seq IN (SELECT rowid FROM library_fts WHERE library_fts MATCH ?)", params: [fts] });
  for (const t of parsed.tokens) {
    if (t.key === "id") {
      out.push({ group: null, sql: "i.seq IN (SELECT seq FROM library_docs WHERE instr(lower(id), lower(?)) > 0)", params: [t.value] });
    } else if (t.key === "kind") {
      const kinds = KIND_LABELS.filter((k) => k.kind !== "all" && (k.kind.includes(t.value) || normText(k.short).includes(t.value))).map((k) => k.kind);
      out.push(kinds.length === 0 ? { group: null, sql: NEVER, params: [] } : { group: null, sql: `i.kind IN (${marks(kinds.length)})`, params: kinds });
    } else if (isColumnGroup(t.key)) {
      out.push(selection(t.key, (COLUMN_VALUES[t.key] ?? []).filter((v) => normText(v).includes(t.value)), null));
    } else {
      // Substring over the value AND its label (library.js `nf`), on the values
      // table - a few thousand rows - never on the items.
      const hits = r.all("SELECT value FROM library_values WHERE grp = ? AND instr(norm, ?) > 0", t.key, t.value).map((row) => String(row["value"]));
      out.push(selection(t.key, hits, null));
    }
  }
  return out;
}

export function whereOf(clauses: readonly Clause[]): { where: string; params: Param[] } {
  if (clauses.length === 0) return { where: "", params: [] };
  return { where: ` WHERE ${clauses.map((c) => c.sql).join(" AND ")}`, params: clauses.flatMap((c) => [...c.params]) };
}

export const num = (v: unknown): number => (typeof v === "number" ? v : 0);
