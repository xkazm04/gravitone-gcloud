import "server-only";

import { err, ok, type Result } from "@gt/domain/errors";

import { mergePart, openOf, partRefusal, partsOf } from "../../../foundry/scout/parts.ts";
import { parseCellId, type Night, type NightCommit } from "../../../foundry/scout/types.ts";
import type { Built } from "./scoutPlan.ts";

// A SCOUT NIGHT IN PARTS (spark scout-storyboards) - what ./scout.ts needs to open, preview and apply part n of a
// night, kept here so the adapter does not grow past its bound. The rule is lib/foundry/scout/parts.ts's: the
// night's record is the union of its parts, `open` the cells still waiting, and part n's packet holds exactly
// those cells - `pkt:scout:<run>:<n>`.

/** Why a packet for `part` of this night cannot open, in the Board's words; undefined when it can. */
export function nightRefusal(n: Night, part: number): string | undefined {
  if (n.state === "open") return "The night is still running.";
  if (n.state === "committed") return "This night is already committed.";
  const no = partRefusal(n.committed, part);
  if (no === undefined) return undefined;
  return no === "already committed" ? "This night is already committed." : `${no[0]?.toUpperCase() ?? ""}${no.slice(1)}.`;
}

/**
 * The night's packet narrowed to what part n decides: the cells its record leaves open (part 1: every cell). Rows,
 * imported verdicts and style runs follow their cells; a loss stays only for a candidate still on the packet,
 * since part 1's gate already showed the rest.
 */
export function partOfBuilt(b: Built, n: Pick<Night, "committed">, part: number): Built {
  if (part <= 1) return b;
  const keep = new Set(openOf(n.committed));
  const cells = b.cells.filter((c) => keep.has(c.id));
  const rows = new Set(cells.map((c) => c.row));
  const candidates = new Set<string>(cells.map((c) => c.candidate));
  const of = (id: string | undefined): string | undefined => (id === undefined ? undefined : (parseCellId(id)?.candidate ?? id));
  return {
    cells,
    rows: b.rows.filter((r) => rows.has(r.id)),
    initial: b.initial.filter((d) => keep.has(d.candidate)),
    losses: b.losses.filter((l) => {
      const c = of(l.candidate);
      return c !== undefined && candidates.has(c);
    }),
    runs: Object.fromEntries(Object.entries(b.runs).filter(([cid]) => candidates.has(cid))),
  };
}

/** What the night's file line says a part does: the last part commits the night, an earlier one leaves it closed. */
export function partWords(part: number, left: number): string {
  if (part <= 1 && left === 0) return "committed: every verdict, its reasons and its note";
  return left === 0 ? `part ${part} · committed: every verdict so far, its reasons and its note` : `part ${part}: the decided verdicts, their reasons and notes; the night stays closed`;
}

/**
 * Part n's record over the night's (`mergePart`): undefined when it is still to be written, success when v1 already
 * holds it (a redelivery), or the refusal - a cell v1 holds with another verdict, named; a part out of turn.
 */
export function settledPart(id: string, was: NightCommit | undefined, record: NightCommit, part: number): Result<void> | undefined {
  const m = mergePart(was, record, part);
  if (m.kind === "write") return undefined;
  if (m.kind === "same") return ok(undefined);
  return err("refused", m.kind === "differ" ? `scout night ${id} was committed with other verdicts: ${m.why}` : `scout night ${id}: ${m.why}`);
}

/** The night with part n merged in: its state `committed` only once nothing is left open. Unchanged when v1 already holds it. */
export function withPart(n: Night, record: NightCommit, part: number): Night {
  const m = mergePart(n.committed, record, part);
  if (m.kind !== "write") return n;
  return { ...n, state: openOf(m.next).length === 0 ? "committed" : n.state, committed: m.next };
}

/** The part after the last that landed (part 1 before any). */
export const nextPartOf = (n: Pick<Night, "committed">): number => partsOf(n.committed) + 1;
