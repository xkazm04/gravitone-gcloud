// The thresholds this checker reads from the knowledge layer, validated at import.
// Split out of `structure.ts` so the params read, its validation and its consumers
// live together, and so the door stays under the 200-line cap. Every value here is
// read from `knowledge/templates/trailer/steps/01-script/params.json`; the file
// itself is the single copy of each rule's number and its evidence.

import PARAMS from "@/knowledge/templates/trailer/steps/01-script/params.json";

import { SPINE_RANK, type MovementRole, type TrailerBeatKind } from "@/lib/script/trailer/types";
import {
  ALL_BEAT_KINDS,
  ALL_RULES,
  type StructureRule,
} from "@/lib/script/trailer/structureTypes";

/* ─────────────── the thresholds, READ from the knowledge layer ──────────────
   Every number and closed set below used to be a TypeScript literal sitting a
   few lines from the quote it came from. That is one copy of the rule in the
   document and another in the checker, with nothing holding them together — and
   `knowledge/templates/trailer/steps/01-script/OPEN-QUESTIONS.md` r2 named the
   drift directly. They now live once, in that step's `params.json`, where each
   value carries its evidence label, its registry path and the quoted line, and
   this file READS them.

   What did NOT move, and why it did not: the hedged quantities. "Below roughly
   ten seconds per rung", "two or three rungs", the n=130 shot-length curve — all
   of them are in the params file's `not_encoded` block with the source that
   would settle them, exactly because a params file is not a laundry. Moving a
   hedge into JSON does not measure it; it only hides the hedge behind a field
   name. `checkMagnitude`'s "margin a viewer would notice" is the same refusal
   with a resolver attached.

   THE READ IS VALIDATED AND IT THROWS. A params file that names a role the type
   union does not have, or a beat kind that does not exist, is a document and a
   checker that have already drifted — and the one thing this file may never do
   is keep running a rule it can no longer state correctly. It fails at import,
   loudly, naming the file. `npm run check:trailer-structure` imports this module,
   so the failure is caught by a gate rather than by a creator. */

const PARAMS_PATH = "knowledge/templates/trailer/steps/01-script/params.json";

function paramsFault(field: string, why: string): never {
  throw new Error(
    `${PARAMS_PATH} → ${field}: ${why}. The craft document and the checker have drifted; the checker refuses to run a rule it cannot state correctly.`,
  );
}

/** Which beat kinds may sit in which movement — `params.spine.legalBeatKinds`.
 *  `title` is legal everywhere: a title card names the work AND punctuates a
 *  section boundary. The params file records that this table is INFERRED rather
 *  than quoted — the doctrine says what each part is FOR and never enumerates
 *  the legal kinds — and it is the only inferred value the checker consumes. */
function readLegalKinds(): Record<MovementRole, TrailerBeatKind[]> {
  const raw: Record<string, string[]> = PARAMS.spine.legalBeatKinds.value;
  const known = new Set<string>(ALL_BEAT_KINDS);
  const roles = Object.keys(SPINE_RANK) as MovementRole[];

  for (const role of Object.keys(raw)) {
    if (!(role in SPINE_RANK)) paramsFault("spine.legalBeatKinds", `names role "${role}", which is not a MovementRole`);
  }

  const out = {} as Record<MovementRole, TrailerBeatKind[]>;
  for (const role of roles) {
    const list = raw[role];
    if (!Array.isArray(list) || list.length === 0) {
      paramsFault("spine.legalBeatKinds", `role "${role}" has no legal kinds, so every beat in it would be reported illegal`);
    }
    for (const kind of list) {
      if (!known.has(kind)) paramsFault("spine.legalBeatKinds", `role "${role}" allows "${kind}", which is not a TrailerBeatKind`);
    }
    out[role] = list as TrailerBeatKind[];
  }
  return out;
}

function readCount(field: string, value: number): number {
  if (!Number.isInteger(value) || value < 0) paramsFault(field, `${JSON.stringify(value)} is not a whole count`);
  return value;
}

export const LEGAL_KINDS = readLegalKinds();

/** "It raises exactly one variable." Stated unconditionally by the doctrine,
 *  which is why it is a threshold and the rung floor is not. */
export const RAISES_PER_RUNG = readCount(
  "escalation.raisedVariablesPerRung",
  PARAMS.escalation.raisedVariablesPerRung.value,
);

/** One structural reset, and the doctrine's removal threshold at three. These
 *  are two different numbers on purpose: "when there are three or more, remove
 *  all but one" is not a ceiling of one, so exactly two is REPORTED rather than
 *  failed. */
export const STRUCTURAL_RESETS = readCount("reset.structuralResets", PARAMS.reset.structuralResets.value);
export const RESETS_TOO_MANY = readCount("reset.tooManyAt", PARAMS.reset.tooManyAt.value);
export const HOLDS_PER_RESET = readCount("reset.holdsPerReset", PARAMS.reset.holdsPerReset.value);

/** The relations between the counts that the rules' own sentences assume. Each
 *  count was validated alone (a whole number), so `tooManyAt: 1` loaded cleanly
 *  and every one-reset cut was told "1 resets ... remove all but one". Exported
 *  so the regression control can hand it a drifted set. */
export function countFaults(c: {
  raisesPerRung: number;
  structuralResets: number;
  tooManyAt: number;
  holdsPerReset: number;
}): { field: string; why: string }[] {
  const out: { field: string; why: string }[] = [];
  if (c.raisesPerRung < 1) out.push({ field: "escalation.raisedVariablesPerRung", why: "is below 1, so no rung could be short of a raised variable" });
  if (c.holdsPerReset < 1) out.push({ field: "reset.holdsPerReset", why: "is below 1, so every declared silence would hold one thing too many" });
  if (c.structuralResets < 1) out.push({ field: "reset.structuralResets", why: "is below 1, so a cut with no reset would never be told it has no climax" });
  if (c.tooManyAt <= c.structuralResets) {
    out.push({ field: "reset.tooManyAt", why: `${c.tooManyAt} is not above structuralResets (${c.structuralResets}), so the reset a cut needs would read as too many` });
  }
  return out;
}

for (const f of countFaults({
  raisesPerRung: RAISES_PER_RUNG,
  structuralResets: STRUCTURAL_RESETS,
  tooManyAt: RESETS_TOO_MANY,
  holdsPerReset: HOLDS_PER_RESET,
})) paramsFault(f.field, f.why);

/** Rules whose findings NEVER contribute to `malformed`, each because its own
 *  doctrine says so. The promise ledger: "As a gate … A system that blocks on it
 *  will block on correct work; report the rows and let a human read them."
 *
 *  Read from `params.checker.advisoryRules`, where that quote and its registry
 *  path live — so a rule cannot be quietly promoted into a gate by editing this
 *  file, and cannot be quietly demoted out of one by editing the document. */
export const ADVISORY_RULES: readonly StructureRule[] = readAdvisoryRules();

function readAdvisoryRules(): readonly StructureRule[] {
  const known = new Set<string>(ALL_RULES);
  const raw: string[] = PARAMS.checker.advisoryRules.value;
  if (!Array.isArray(raw) || raw.length === 0) {
    paramsFault("checker.advisoryRules", "is empty, which would make every advisory finding a blocking one");
  }
  for (const rule of raw) {
    if (!known.has(rule)) paramsFault("checker.advisoryRules", `names "${rule}", which is not a StructureRule`);
  }
  return raw as StructureRule[];
}
