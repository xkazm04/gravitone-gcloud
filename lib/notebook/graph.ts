// THE GRAPH HALF: the graph checks on a notebook, reusing notebookIssues rather than
// restating it. Split out of validate.ts so the door can stay a short file.

import { notebookIssues, type GraphIssue } from "@/app/_phases/_shared/notebook/cards";
import { CONCLUSIONS } from "@/app/_phases/_shared/notebook/conclusions";
import { declaresOwn } from "@/app/_phases/_shared/notebook/source";
import type { Notebook } from "@/app/_phases/_shared/notebook/types";

import type { NotebookFinding } from "./failure";

/* ─────────────────────────────── the graph half ──────────────────────────── */

/**
 * The kinds of `notebookIssues` finding that CANNOT be evidence against a fresh
 * notebook, and why each is dropped rather than reported.
 *
 * This is the one place this module knowingly uses less of `check-notebook.mts`
 * than the terminal gate does, so it is stated rather than left to be
 * rediscovered:
 *
 *   · `untagged`  — `CARD_DIMENSION` (dimensions.ts) is a HAND-AUTHORED id →
 *     column table for the run-1 fixture. A notebook produced ten seconds ago
 *     has no rows in it by construction, so every one of its cards is
 *     "untagged". Reporting that would fail every real run for the crime of
 *     being new, and the remedy — "tag it in dimensions.ts" — is a source edit
 *     nobody can make from a route handler.
 *   · `stale-tag` — the mirror image: every id CARD_DIMENSION *does* hold names
 *     a fixture card this notebook does not have. Same table, same reason.
 *
 * Both remain live in `check-notebook.mts`, where they are exactly right: there
 * the notebook IS the fixture and the table IS supposed to cover it. What
 * survives here — `duplicate-id`, `dangling-ref`, `unlinked-conversion` — are
 * the three that are properties of the notebook alone.
 *
 * AND THE THIRD, WHICH IS NOT A KIND BUT A ROW. `notebookIssues` builds its card
 * universe with `buildCards`, which appends the FIXTURE's `CONCLUSIONS`
 * unconditionally — a `Notebook` has no conclusions field, by design
 * (conclusions.ts: reasoned, not researched, and filed apart from the sourced
 * facts on purpose). So every fresh notebook inherits twenty-odd conclusion
 * cards whose `restsOn` cites run-1 fact ids it has never heard of, and the
 * graph pass reports each one as a dangling reference against a notebook that
 * did not write them.
 *
 * MEASURED, not predicted: the minimal well-formed notebook in the verification
 * pass came back with 26 findings, 25 of them this. Uncorrected, the researched
 * path could not have accepted any answer at all.
 *
 * So findings OWNED BY a fixture conclusion are dropped, by owner rather than by
 * kind — `check-notebook.mts` still checks exactly those against the fixture,
 * where they belong.
 *
 * BOTH FILTERS NOW APPLY ONLY TO A NOTEBOOK THAT DECLARES NEITHER `dimensions`
 * NOR `conclusions` (research-scope-board-A stage 2). One that declares them is
 * dealt from its own data, so it is checked against that data, unfiltered.
 */
const FIXTURE_COUPLED: ReadonlySet<GraphIssue["kind"]> = new Set(["untagged", "stale-tag"]);

/** The fixture's conclusion ids — the `from` prefixes whose findings are about
 *  the shipped conclusions layer rather than about the notebook under test. */
const FIXTURE_CONCLUSION_IDS = new Set(CONCLUSIONS.map((c) => c.id));

export function graphFindings(nb: Notebook): NotebookFinding[] {
  // A notebook that declares its own dimensions or conclusions is dealt from them
  // (source.ts::asSource), so there is no fixture table or conclusion to filter
  // out: an untagged card and a conclusion resting on nothing are its own defects.
  const own = declaresOwn(nb);
  return notebookIssues(nb)
    .filter((i) => own || !FIXTURE_COUPLED.has(i.kind))
    .filter((i) => own || !FIXTURE_CONCLUSION_IDS.has(i.from.split(".")[0]))
    .map((i) => ({
      path: pathOfId(nb, i.from.split(".")[0]),
      rule: `[${i.kind}] ${i.from} → ${i.ref} — ${i.detail}`,
      observed: i.ref,
    }));
}

/** The arrays whose members carry an `id` a graph finding can name. */
const ID_ARRAYS = ["facts", "mechanisms", "reversals", "scaleConversions", "analogyCandidates", "conclusions"] as const;

/**
 * Where in the notebook a card id lives, as a JSON path (`facts[3]`).
 *
 * A graph finding names a CARD (`from`), not a field, so the address is the
 * card's own element. An id that is in no array (it is only referenced) has no
 * address and yields the id itself, which matches no path in the answer: a
 * repair turn then has nothing it may edit for that finding, which is the
 * honest outcome rather than a licence to edit anywhere.
 */
function pathOfId(nb: Notebook, id: string): string {
  const bag = nb as unknown as Record<string, unknown>;
  for (const key of ID_ARRAYS) {
    const rows = bag[key];
    if (!Array.isArray(rows)) continue;
    const at = rows.findIndex((r) => typeof r === "object" && r !== null && (r as { id?: unknown }).id === id);
    if (at >= 0) return `${key}[${at}]`;
  }
  return id;
}
