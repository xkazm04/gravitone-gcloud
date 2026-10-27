// Rule 1 · graph integrity — `checkGraph`. Data, not craft: a beat pointing at a
// movement that does not exist would otherwise fall out of every craft rule and
// report nothing. Split out of `../structure.ts` (the door re-exports it).

import { SPINE_RANK, type TrailerCut } from "@/lib/script/trailer/types";
import { CITE, type StructureFinding } from "@/lib/script/trailer/structureTypes";
import { movementById, where } from "@/lib/script/trailer/readers";

/* ──────────────────── 1 · graph integrity (data, not craft) ────────────────
   Modelled on `pipeline/check-notebook.mts`: "a stale reference and a healthy one
   look identical — and the one that looks healthy is the dangerous one". A beat
   pointing at a movement that does not exist would otherwise silently fall out of
   every craft rule below and report nothing. */

export function checkGraph(cut: TrailerCut): StructureFinding[] {
  const out: StructureFinding[] = [];
  const byId = movementById(cut);

  if (byId.size !== cut.movements.length) {
    out.push({
      rule: "graph", subject: "movement ids", verdict: "violation",
      detail: `${cut.movements.length} movements but ${byId.size} distinct ids — a reused id silently overwrites the earlier row and one movement's beats are attributed to the other.`,
      cites: CITE.graph,
    });
  }

  const ordinals = cut.movements.map((m) => m.ordinal);
  if (new Set(ordinals).size !== ordinals.length) {
    out.push({
      rule: "graph", subject: "movement ordinals", verdict: "violation",
      detail: `Duplicate ordinal(s) in ${ordinals.join(", ")} — the spine's order is read from these, so a tie makes the order undecidable rather than wrong.`,
      cites: CITE.graph,
    });
  }

  const beatIds = cut.beats.map((b) => b.id);
  if (new Set(beatIds).size !== beatIds.length) {
    out.push({
      rule: "graph", subject: "beat ids", verdict: "violation",
      detail: `Beat ids are not distinct. Every finding below locates itself by id; a reused id makes a finding point at two beats.`,
      cites: CITE.graph,
    });
  }

  for (const b of cut.beats) {
    if (!byId.has(b.movement)) {
      out.push({
        rule: "graph", subject: b.id, verdict: "violation",
        detail: `Beat names movement "${b.movement}", which does not exist. Beats belong to a movement — that is the whole point of the container — so this beat is outside every act-level rule.`,
        ...where(b), cites: CITE.graph,
      });
    }
  }

  // A role the spine does not rank is a stored record the type no longer
  // describes. checkSpine used to index LEGAL_KINDS with it and throw; it now
  // skips the movement, and this row is where the defect is reported.
  for (const m of cut.movements) {
    if (!Object.hasOwn(SPINE_RANK, m.role)) {
      out.push({
        rule: "graph", subject: m.id, verdict: "violation",
        detail: `Movement "${m.label}" declares role "${m.role}", which is not a part of the spine (${Object.keys(SPINE_RANK).join(" / ")}). No act-level rule can place it.`,
        cites: CITE.graph,
      });
    }
  }

  const populated = new Set(cut.beats.map((b) => b.movement));
  for (const m of cut.movements) {
    if (!populated.has(m.id)) {
      out.push({
        rule: "graph", subject: m.id, verdict: "violation",
        detail: `Movement "${m.label}" (${m.role}) holds no beats. An empty part is a part the viewer never sees, and it makes the role look present to every check below.`,
        cites: CITE.graph,
      });
    }
  }

  // ALWAYS a row, including for a cut with nothing in it. The old guard was
  // `!out.length && cut.beats.length && cut.movements.length`, so an empty cut
  // produced no graph finding AT ALL — and a rule that is absent from the report
  // is indistinguishable from a rule that ran and found nothing. The graph rule
  // is the one that owns "is there a chain here", so silence is the one answer it
  // may not give. It is `not-engaged` rather than a violation because an empty
  // cut has no broken edges, it has no edges; the missing parts are already
  // reported, as violations, by the spine.
  if (!out.length) {
    out.push(
      cut.beats.length && cut.movements.length
        ? {
            rule: "graph", subject: "chain", verdict: "pass",
            detail: `${cut.beats.length} beats over ${cut.movements.length} movements: every id distinct, every reference resolves, every movement populated.`,
            cites: CITE.graph,
          }
        : {
            rule: "graph", subject: "chain", verdict: "not-engaged",
            detail: `The cut declares ${cut.movements.length} movement(s) and ${cut.beats.length} beat(s), so there are no references to resolve. This check examined nothing and does not count as enforcement — read the spine rows for what is actually missing.`,
            cites: CITE.graph,
          },
    );
  }
  return out;
}
