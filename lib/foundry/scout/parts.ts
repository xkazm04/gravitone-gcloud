// A COMMIT IN PARTS (spark scout-storyboards) - pure and client-safe: no Node.
//
// "Allow to commit partial packets so large packets can be split and undecided ones resolved later." A night's
// or a seed batch's packet may commit with cells left undecided (the kernel's `undecidedAs: "leave"`, only for an
// adapter that opts in with `partial`). The decided cells are written; the undecided ones wait on a REMAINDER
// packet whose run id is the original run plus `:<n>` - `pkt:scout:2026-10-24:2`, then `:3`; a muse night's
// `pkt:scout:muse:2026-10-24:2`; a batch's `pkt:seeds:<batch>:2`. Kernel finality holds: each part is its own
// kernel packet, committed once.
//
// THE v1 RECORD STAYS ONE: `committed` is the union of every part so far (kept, rejected, reasons, notes), `open`
// the cells still undecided, `parts` how many have landed, `partAt` the instant of parts 2..n (`at` is part 1's).
// Absent `parts` reads as one, absent or empty `open` as nothing left: every record written before parts reads
// as a whole commit.
//
// A night id and a batch id never hold a colon (NIGHT_ID_RE), and a muse run is `muse:<night>`, so the part is
// the LAST `:<digits>` of a run id, and only a number from 2 up: `:1` is never spelled (part 1 is the bare run).

/** The part-carrying fields of NightCommit and SeedCommit (./types.ts): one shape, one merge rule. */
export type PartRecord = {
  readonly at: string;
  readonly by: string;
  readonly kept: readonly string[];
  readonly rejected: readonly string[];
  readonly reasons: Readonly<Record<string, readonly string[]>>;
  readonly notes: Readonly<Record<string, string>>;
  readonly dry: boolean;
  readonly open?: readonly string[];
  readonly parts?: number;
  readonly partAt?: readonly string[];
};

const PART_RE = /^(.+):([1-9]\d*)$/;

/** The run of a part: part 1 is the bare run, part n `<run>:<n>`. */
export function partRunId(run: string, part: number): string {
  return part <= 1 ? run : `${run}:${part}`;
}

/** A run id's base run and part (1 when it names none). A trailing `:1` or `:0` is not a part, so the id stays whole. */
export function splitPart(runId: string): { readonly run: string; readonly part: number } {
  const m = PART_RE.exec(runId);
  const n = m === null ? 1 : Number(m[2]);
  return m === null || n < 2 ? { run: runId, part: 1 } : { run: m[1] ?? runId, part: n };
}

/** The cells a record still leaves undecided (none for a whole commit, or no commit). */
export const openOf = (c: Pick<PartRecord, "open"> | undefined): readonly string[] => c?.open ?? [];

/** How many parts a record holds (0 before any commit). */
export const partsOf = (c: Pick<PartRecord, "parts"> | undefined): number => (c === undefined ? 0 : (c.parts ?? 1));

/** The part that decides what a record leaves open, or undefined when nothing is left (or nothing committed yet). */
export function nextPart(c: Pick<PartRecord, "open" | "parts"> | undefined): number | undefined {
  return c === undefined || openOf(c).length === 0 ? undefined : partsOf(c) + 1;
}

/** True when every cell is decided: committed whole, or its last part landed. */
export const isWhole = (c: Pick<PartRecord, "open"> | undefined): boolean => c !== undefined && openOf(c).length === 0;

/**
 * Why a packet for `part` cannot open over this record, or undefined when it can: part 1 only before any commit,
 * part n only as the one after the last, and only while something is left.
 */
export function partRefusal(c: Pick<PartRecord, "open" | "parts"> | undefined, part: number): string | undefined {
  if (c === undefined) return part === 1 ? undefined : `part ${part} has no part 1 committed before it`;
  const next = nextPart(c);
  if (next === undefined) return "already committed";
  return part === next ? undefined : `part ${part} is not the next part (${next})`;
}

const verdictOf = (c: Pick<PartRecord, "kept" | "rejected">, cell: string): "keep" | "reject" | "undecided" => (c.kept.includes(cell) ? "keep" : c.rejected.includes(cell) ? "reject" : "undecided");
const sameSet = (a: readonly string[], b: readonly string[]): boolean => [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

/** A merge's answer: the record to write, the record already holding it, or a loud refusal - `differ` when v1 holds
 *  another verdict for a cell (naming each: `c-03/clip is reject in v1, keep here`), `refuse` for a part out of turn. */
export type Merge<R> = { readonly kind: "write"; readonly next: R } | { readonly kind: "same" } | { readonly kind: "differ" | "refuse"; readonly why: string };

/**
 * PART `part` OVER WHAT v1 HOLDS (`was`). `got` is this part's record: its decided cells, and `open` = the cells of
 * its packet it leaves undecided.
 *   · no record yet: part 1 is written as it is (a whole one bare of `parts`/`open`); a later part is refused.
 *   · a part already landed (n <= parts): success when each of its decided cells holds the same verdict in the
 *     union - a redelivery. A whole commit compared to a whole commit keeps the old rule: the same sets exactly.
 *   · the next part (parts + 1): its cells join the union, `open` loses them, `parts` = n, `partAt` gains its instant.
 *   · a cell decided here that v1 holds with the OTHER verdict is refused, always: never an overwrite.
 */
export function mergePart<R extends PartRecord>(was: R | undefined, got: R, part: number): Merge<R> {
  const decided = [...got.kept, ...got.rejected];
  if (was === undefined) {
    if (part !== 1) return { kind: "refuse", why: `part ${part} has no part 1 committed before it` };
    const { open, parts: _p, partAt: _a, ...bare } = got;
    return { kind: "write", next: (open === undefined || open.length === 0 ? bare : { ...bare, open, parts: 1 }) as R };
  }
  const differ = decided.filter((c) => verdictOf(was, c) !== "undecided" && verdictOf(was, c) !== verdictOf(got, c));
  const wasParts = partsOf(was);
  if (part === 1 && wasParts === 1 && openOf(was).length === 0 && openOf(got).length === 0) {
    if (sameSet(was.kept, got.kept) && sameSet(was.rejected, got.rejected)) return { kind: "same" };
    const all = [...new Set([...decided, ...was.kept, ...was.rejected])].filter((c) => verdictOf(was, c) !== verdictOf(got, c));
    return { kind: "differ", why: said(was, got, all) };
  }
  if (differ.length > 0) return { kind: "differ", why: said(was, got, differ) };
  if (part <= wasParts) {
    const missing = decided.filter((c) => verdictOf(was, c) === "undecided");
    return missing.length === 0 ? { kind: "same" } : { kind: "refuse", why: `part ${part} landed without ${missing.join(", ")}` };
  }
  if (part !== wasParts + 1) return { kind: "refuse", why: `part ${part} does not follow part ${wasParts}` };
  const left = openOf(was);
  if (left.length === 0) return { kind: "refuse", why: "every cell was already committed" };
  const stray = decided.filter((c) => !left.includes(c) && verdictOf(was, c) === "undecided");
  if (stray.length > 0) return { kind: "refuse", why: `part ${part} decides cells no part left open: ${stray.join(", ")}` };
  const fresh = new Set(decided.filter((c) => left.includes(c)));
  const reasons: Record<string, readonly string[]> = { ...was.reasons };
  const notes: Record<string, string> = { ...was.notes };
  for (const c of fresh) {
    const r = got.reasons[c];
    if (r !== undefined) reasons[c] = r;
    const n = got.notes[c];
    if (n !== undefined) notes[c] = n;
  }
  const next: R = {
    ...was,
    by: was.by === "operator" || got.by === "operator" ? "operator" : was.by,
    kept: [...was.kept, ...got.kept.filter((c) => fresh.has(c))],
    rejected: [...was.rejected, ...got.rejected.filter((c) => fresh.has(c))],
    reasons,
    notes,
    open: left.filter((c) => !fresh.has(c)),
    parts: part,
    partAt: [...(was.partAt ?? []), got.at],
  };
  return { kind: "write", next };
}

function said(was: PartRecord, got: PartRecord, cells: readonly string[]): string {
  return cells.map((c) => `${c} is ${verdictOf(was, c)} in v1, ${verdictOf(got, c)} here`).join("; ");
}

/** The consequence's line for what a part leaves: `30 undecided → pkt:scout:2026-10-24:2`. */
export const remainderLine = (undecided: number, packetId: string): string => `${undecided} undecided → ${packetId}`;
