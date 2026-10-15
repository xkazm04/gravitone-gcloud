// THE LEDGER'S FILTER - the URL, the query grammar and the kernel's query, as pure data.
//
// One module because the three must agree: the page reads the search params into a
// `LedgerFilter`, the toolbar writes one back into the URL, the JSONL route reads the same
// params, and `kernelQuery` decides which part the store can answer with an index and
// which part is checked against the rows it returns. Client-safe: kernel and domain types
// only (a value import of either would drag classic zod into the bundle).
//
// THE URL IS THE PROTOTYPE'S (ledger.js readHash/hashString), moved from the hash to the
// search params because a Server Component must see it: q, actor (one kind; absent is all),
// type/lane/project/src (comma lists), from/to (YYYY-MM-DD, UTC, inclusive), ev (the
// selected event, now its seq), order=asc, view=jsonl. Unknown or malformed values are
// dropped rather than refused: a hand-edited link still opens the Ledger, filtered by what
// it could read.
//
// THE GRAMMAR IS THE PROTOTYPE'S parseQ (ledger-data.js): `actor: type: lane: project: src:
// run: packet: subject: kind: id: style:` tokens plus free words. A closed prefix set; an
// unknown `x:y` stays a literal word (search: query-parsing). A URL facet wins over the same
// token in `q`, as the prototype's makeFilter did.

import type { ActorKind, Event } from "@gt/domain/event";
import type { EventQuery } from "@gt/kernel/events-query";

import { sourceOf } from "../../_shell/links.ts";

export const ACTORS: readonly ActorKind[] = ["operator", "agent", "machine"];

export type LedgerFilter = {
  readonly q: string;
  readonly actor: ActorKind | null;
  readonly type: readonly string[];
  readonly lane: readonly string[];
  readonly project: readonly string[];
  readonly src: readonly string[];
  readonly from: string | null;
  readonly to: string | null;
  readonly ev: number | null;
  readonly order: "desc" | "asc";
  readonly view: "table" | "jsonl";
};

export const EMPTY: LedgerFilter = { q: "", actor: null, type: [], lane: [], project: [], src: [], from: null, to: null, ev: null, order: "desc", view: "table" };

export type Params = Readonly<Record<string, string | readonly string[] | undefined>>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: string): boolean => DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00.000Z`)) && new Date(`${v}T00:00:00.000Z`).toISOString().startsWith(v);
const isActor = (v: string): v is ActorKind => (ACTORS as readonly string[]).includes(v);
const one = (p: Params, k: string): string => {
  const v = p[k];
  return typeof v === "string" ? v : (v?.[0] ?? "");
};
const list = (raw: string): string[] => [...new Set(raw.split(",").map((x) => x.trim()).filter((x) => x !== ""))];

/** The URL's params, read leniently into a filter. */
export function parseParams(p: Params): LedgerFilter {
  const actor = one(p, "actor");
  let from: string | null = isDay(one(p, "from")) ? one(p, "from") : null;
  let to: string | null = isDay(one(p, "to")) ? one(p, "to") : null;
  if (from === null && to !== null) from = to;
  if (from !== null && to === null) to = from;
  if (from !== null && to !== null && to < from) [from, to] = [to, from];
  const ev = Number(one(p, "ev"));
  return {
    q: one(p, "q").trim(),
    actor: isActor(actor) ? actor : null,
    type: list(one(p, "type")),
    lane: list(one(p, "lane")),
    project: list(one(p, "project")),
    src: list(one(p, "src")),
    from,
    to,
    ev: Number.isSafeInteger(ev) && ev > 0 ? ev : null,
    order: one(p, "order") === "asc" ? "asc" : "desc",
    view: one(p, "view") === "jsonl" ? "jsonl" : "table",
  };
}

/** `,` `:` `/` stay readable in a link (ledger.js hashString's rule). */
const enc = (v: string): string => encodeURIComponent(v).replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%2F/g, "/");

/** The canonical search string, in the prototype's order; empty for the unfiltered Ledger. */
export function toSearch(f: LedgerFilter): string {
  const out: string[] = [];
  const put = (k: string, v: string | null): void => {
    if (v !== null && v !== "") out.push(`${k}=${enc(v)}`);
  };
  put("q", f.q);
  put("actor", f.actor);
  put("type", f.type.join(","));
  put("lane", f.lane.join(","));
  put("project", f.project.join(","));
  put("src", f.src.join(","));
  put("from", f.from);
  put("to", f.to);
  put("ev", f.ev === null ? null : String(f.ev));
  if (f.order === "asc") put("order", "asc");
  if (f.view === "jsonl") put("view", "jsonl");
  return out.join("&");
}

/** The filter without the parts that only change what is shown (selection, view, order). */
export const identity = (f: LedgerFilter): string => toSearch({ ...f, ev: null, view: "table", order: "desc" });

/** Facets and search active: what "clear" would reset. */
export const isFiltered = (f: LedgerFilter): boolean =>
  f.q !== "" || f.actor !== null || f.type.length + f.lane.length + f.project.length + f.src.length > 0 || f.from !== null;

// ── the query grammar ───────────────────────────────────────────────────────

const TOKENS = ["actor", "type", "lane", "project", "src", "run", "packet", "subject", "kind", "id", "style"] as const;
type Token = Exclude<(typeof TOKENS)[number], "kind">;
const TOKEN_RE = new RegExp(`^(${TOKENS.join("|")}):(.+)$`, "i");
/** Free words past this are dropped: a pasted paragraph is not a query (search: query-parsing). */
export const MAX_WORDS = 8;

export type Parsed = { readonly tokens: Readonly<Partial<Record<Token, string>>>; readonly words: readonly string[] };

export function parseQuery(q: string): Parsed {
  const tokens: Partial<Record<Token, string>> = {};
  const words: string[] = [];
  for (const tok of q.trim().split(/\s+/).filter(Boolean)) {
    const m = TOKEN_RE.exec(tok);
    const k = m?.[1]?.toLowerCase();
    if (m !== null && k !== undefined && m[2] !== undefined) {
      tokens[k === "kind" ? "subject" : (k as Token)] = m[2];
    } else if (words.length < MAX_WORDS) words.push(tok.toLowerCase());
  }
  return { tokens, words };
}

// ── what the kernel answers, and what is checked against its rows ─────────────

/** A kernel query without its paging: what `countEvents` takes. */
export type KernelFilter = Omit<EventQuery, "limit" | "by" | "after" | "before" | "cursor" | "order">;

/** Predicates no index serves: applied to the rows the kernel returns (events-query.ts:15-20). */
export type Post = {
  readonly words: readonly string[];
  readonly id?: string;
  readonly packet?: string;
  readonly style?: string;
  /** More than one project: the kernel's `project` takes one. */
  readonly projects?: readonly string[];
};

const PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*(\.\*)?$/;
const SOURCE = /^[a-z][a-z0-9-]*$/;

/**
 * A type value as the facet and the grammar write it: `job.fail` exact, `job.*` or `job*`
 * the group, a bare group name (`verdict`) the group too - the facet's group rows are bare
 * names, and the kernel's `x.*` on a dot-less stem is the indexed group column, which also
 * holds a dot-less type of that name (`commit`).
 */
function typePattern(v: string): string | null {
  const p = v.endsWith("*") && !v.endsWith(".*") ? `${v.slice(0, -1)}.*` : !v.includes(".") && !v.endsWith("*") ? `${v}.*` : v;
  return PATTERN.test(p) ? p : null;
}

/** A lane matches exactly or as a prefix (ledger-data.js: `inList || startsWith`). */
const lanePatterns = (v: string): string[] => (v.includes("*") ? [] : [v, `${v}.*`]);

/** `from`/`to` as the kernel's half-open window on `t`. */
export function windowOf(from: string | null, to: string | null): { since?: string; until?: string } {
  if (from === null || to === null) return {};
  const until = new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000).toISOString();
  return { since: `${from}T00:00:00.000Z`, until };
}

export type Split = { readonly kernel: KernelFilter; readonly post: Post; readonly ignored: readonly string[] };

/**
 * The filter split by who can answer it. Every facet and every token the kernel indexes goes
 * to the store; the rest is checked against the rows it returns. A value neither side can
 * read (an actor kind that does not exist, a malformed type) is named in `ignored` and the
 * page says so, rather than silently widening the result.
 */
export function splitFilter(f: LedgerFilter): Split {
  const { tokens, words } = parseQuery(f.q);
  const ignored: string[] = [];
  const keep = <T,>(xs: readonly string[], ok: (x: string) => T | null, name: string): T[] => {
    const out: T[] = [];
    for (const x of xs) {
      const v = ok(x);
      if (v === null) ignored.push(`${name}:${x}`);
      else out.push(v);
    }
    return out;
  };
  const kinds = keep(f.actor !== null ? [f.actor] : list(tokens.actor ?? ""), (a) => (isActor(a) ? a : null), "actor");
  const types = keep(f.type.length > 0 ? f.type : list(tokens.type ?? ""), typePattern, "type");
  const lanes = (f.lane.length > 0 ? f.lane : list(tokens.lane ?? "")).flatMap(lanePatterns);
  const sources = keep(f.src.length > 0 ? f.src : list(tokens.src ?? ""), (x) => (SOURCE.test(x) ? x : null), "src");
  const projects = f.project.length > 0 ? f.project : list(tokens.project ?? "");
  const kernel: KernelFilter = {
    ...(kinds.length > 0 ? { actor: { kind: kinds } } : {}),
    ...(types.length > 0 ? { type: types } : {}),
    ...(lanes.length > 0 ? { lane: lanes } : {}),
    ...(sources.length > 0 ? { source: sources } : {}),
    ...(projects.length === 1 && projects[0] !== undefined ? { project: projects[0] } : {}),
    ...(tokens.run === undefined ? {} : { run: tokens.run }),
    ...(tokens.subject === undefined ? {} : { subject: { kind: tokens.subject } }),
    ...windowOf(f.from, f.to),
  };
  const post: Post = {
    words,
    ...(tokens.id === undefined ? {} : { id: tokens.id }),
    ...(tokens.packet === undefined ? {} : { packet: tokens.packet }),
    ...(tokens.style === undefined ? {} : { style: tokens.style }),
    ...(projects.length > 1 ? { projects } : {}),
  };
  return { kernel, post, ignored };
}

export const hasPost = (p: Post): boolean => p.words.length > 0 || p.id !== undefined || p.packet !== undefined || p.style !== undefined || p.projects !== undefined;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Every id an act is about (ledger-data.js `idsOf`), lower-cased for comparison. */
export function idsOf(e: Event): string[] {
  const d = e.data;
  return [String(e.seq), e.key ?? "", e.subject.id, str(d["runId"]) ?? "", str(d["projectId"]) ?? "", str(d["packetId"]) ?? "", str(d["styleId"]) ?? "", e.actor.id, e.lane ?? ""]
    .filter((x) => x !== "")
    .map((x) => x.toLowerCase());
}

/** What a free word is matched against: the act's ids, words and verbatim text. */
function hay(e: Event): string {
  const d = e.data;
  return [e.type, e.subject.kind, e.actor.kind, sourceOf(e) ?? "", str(d["note"]) ?? "", str(d["error"]) ?? "", str(d["reason"]) ?? "", str(d["status"]) ?? "", ...idsOf(e)]
    .join(" \u0001 ")
    .toLowerCase();
}

/**
 * The checks no index serves. A word equal to one of the act's ids matches it exactly; any
 * other word is a substring of the act's text (ledger-data.js: "a word equal to a known id
 * matches exactly, else substring" - here "known" is this act's own ids, so the rule needs
 * no index of every id ever seen).
 */
export function matchesPost(e: Event, p: Post): boolean {
  const d = e.data;
  if (p.id !== undefined && !idsOf(e).includes(p.id.toLowerCase())) return false;
  if (p.packet !== undefined && d["packetId"] !== p.packet) return false;
  if (p.style !== undefined && d["styleId"] !== p.style) return false;
  if (p.projects !== undefined && !p.projects.includes(str(d["projectId"]) ?? "")) return false;
  if (p.words.length === 0) return true;
  const ids = idsOf(e);
  const text = hay(e);
  return p.words.every((w) => ids.includes(w) || text.includes(w));
}
