// THE TRAILER STRUCTURAL CHECKER — functions that READ a beat chain.
//
// ─── the one honesty rule, inherited verbatim ───────────────────────────────
//
// **This checker may never report `pass` for something it did not check.**
//
// It is `../gate.ts`'s rule, restated because it is the reason this file exists
// in this shape rather than as another `checks[]` array. `../renders.ts:46-58`
// hand-types twelve verdicts onto each render; not one of them could catch the
// violation that actually shipped, because every one was a sentence a human wrote
// ABOUT the render rather than a function that read it (`../gate.ts:19-35`). The
// registry says the same thing as a law:
//   ai-registry/knowledge/media-generation/_laws.md#unmeasured-is-not-pass
//
// So `unmeasured` is a first-class verdict, it is counted separately, and
// `enforced` reports what fraction of the engaged rules were actually executable.
// The `Verdict` union is imported from `../gate` rather than redeclared, so the
// arithmetic is literally the same arithmetic.
//
// ─── the one thing this checker must NOT become ─────────────────────────────
//
// A gate. The golden path is explicit and it is the subject's central caveat:
//
//   "use the spine as the default and as the diagnostic, never as the gate. A cut
//    that deviates from it is either a specialty-lane choice or a defect, and the
//    structure alone cannot tell you which. What it *can* tell you is that the
//    deviation is real and deliberate — which is the useful thing to surface to a
//    human."
//   — trailer-structure.md § The spine is a default, not a law, and the exception
//     is a lane
//
// That is why `StructureReport.malformed` is `boolean | null` and not `blocked`:
// for a cut that declares the specialty lane it is `null`, and every caller has
// to handle the null rather than reading a green tick. And why the report always
// carries the standing `efficacy` row — "A structural checker can establish that a
// cut is malformed; it cannot establish that a cut works."
//
// ─── what it cannot do, stated rather than hidden ───────────────────────────
//
// It reads DECLARED structure only. It has no access to duration, shot count,
// loudness or image, so every magnitude rule ("the button must be smaller than
// the climax", "the peak must exceed the last rung") is `unmeasured` unless the
// caller injects a magnitude resolver — which is the seam the shot layer fills.
// It also cannot perform the promise ledger's own procedure, whose step 1 is to
// watch the cut "as a stranger … done from ignorance, and anyone who knows the
// work cannot perform it". A checker is never ignorant of its input, so it audits
// declared promises for a payer and reports the extraction itself as unmeasured.
//
// ─── where its numbers come from ────────────────────────────────────────────
//
// Not from here. The thresholds and closed sets this file tests against are read
// from `knowledge/templates/trailer/steps/01-script/params.json`, where each one
// carries its evidence label, the registry path it came from, and the quoted
// line. Before that file existed the rules lived twice — as prose in the step's
// `PATTERNS.md` and as literals in this file — and nothing held the two copies
// together. The params file is the single copy; see the read block below, which
// validates it and throws rather than running a rule it can no longer state.
//
// What stayed OUT of it matters as much: every hedged quantity the doctrine
// gives ("below roughly ten seconds per rung", "two or three rungs", the n=130
// shot-length curve measured on theatrical film trailers) is recorded in that
// file's `not_encoded` block with the source that would settle it. A params file
// is not a laundry: moving a hedge into JSON does not measure it.

import PARAMS from "@/knowledge/templates/trailer/steps/01-script/params.json";

import type { Verdict } from "../gate";
import {
  DROP_ORDER,
  OPTIONAL_ROLES,
  SPINE_ORDER,
  SPINE_RANK,
  type DroppablePart,
  type MovementRole,
  type RaisedVariable,
  type TrailerBeat,
  type TrailerBeatKind,
  type TrailerCut,
  type WithholdingBudget,
} from "./types";

/* ─────────────────────────────── findings ─────────────────────────────────── */

export type StructureRule =
  | "graph"
  | "connector"
  | "spine"
  | "escalation"
  | "reset"
  | "cue"
  | "magnitude"
  | "cards"
  | "promise"
  | "ladder"
  | "withholding"
  | "efficacy";

export interface StructureFinding {
  rule: StructureRule;
  subject: string;
  verdict: Verdict;
  detail: string;
  /** The beat that tripped it. A finding you cannot locate is a rumour. */
  at?: string;
  beatId?: string;
  /** The doctrine this rule is read from. A rule with no citation is this file
   *  inventing craft, and the citation is what lets a reader who disagrees go
   *  look — `knowledge/README.md` § The evidence contract, rule 2. */
  cites: string;
}

const REG = "registry: media-generation/narrative-craft/trailer-structure";
const CITE = {
  spine: `${REG}/trailer-structure.md § The spine, and what it is a spine of`,
  lane: `${REG}/trailer-structure.md § The spine is a default, not a law`,
  failures: `${REG}/trailer-structure.md § Failure modes of the naive reading`,
  measurable: `${REG}/trailer-structure.md § What is measurable, and what is not`,
  escalation: `${REG}/techniques/escalation-without-mechanism.md`,
  reset: `${REG}/techniques/dynamic-reset.md`,
  cue: `${REG}/techniques/cue-first-assembly.md`,
  ladder: `${REG}/techniques/length-ladder.md`,
  promise: `${REG}/techniques/promise-ledger.md`,
  budget: `${REG}/techniques/withholding-budget.md`,
  causality: "registry: media-generation/_laws.md#causality-over-sequence",
  unmeasured: "registry: media-generation/_laws.md#unmeasured-is-not-pass",
  graph: "this repo: pipeline/check-notebook.mts — a reference to nothing is a broken edge",
} as const;

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

/** Every `TrailerBeatKind`, as runtime data so the params file can be checked
 *  against it. `KIND_LIST_IS_EXHAUSTIVE` is the compiler's proof that adding a
 *  kind to the union without adding it here stops the build — the same device
 *  `types.ts` uses for `VOCABULARIES_ARE_DISJOINT`, and for the same reason: a
 *  list that silently falls behind its union validates nothing. */
const ALL_BEAT_KINDS = [
  "cold-open",
  "stakes",
  "rung",
  "reset",
  "peak",
  "title",
  "button",
  "cta",
] as const satisfies readonly TrailerBeatKind[];

type Exhaustive<Union, Listed> = [Exclude<Union, Listed>] extends [never] ? true : never;

export const KIND_LIST_IS_EXHAUSTIVE: Exhaustive<
  TrailerBeatKind,
  (typeof ALL_BEAT_KINDS)[number]
> = true;

const ALL_RULES = [
  "graph",
  "connector",
  "spine",
  "escalation",
  "reset",
  "cue",
  "magnitude",
  "cards",
  "promise",
  "ladder",
  "withholding",
  "efficacy",
] as const satisfies readonly StructureRule[];

export const RULE_LIST_IS_EXHAUSTIVE: Exhaustive<
  StructureRule,
  (typeof ALL_RULES)[number]
> = true;

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

const LEGAL_KINDS = readLegalKinds();

/** "It raises exactly one variable." Stated unconditionally by the doctrine,
 *  which is why it is a threshold and the rung floor is not. */
const RAISES_PER_RUNG = readCount(
  "escalation.raisedVariablesPerRung",
  PARAMS.escalation.raisedVariablesPerRung.value,
);

/** One structural reset, and the doctrine's removal threshold at three. These
 *  are two different numbers on purpose: "when there are three or more, remove
 *  all but one" is not a ceiling of one, so exactly two is REPORTED rather than
 *  failed. */
const STRUCTURAL_RESETS = readCount("reset.structuralResets", PARAMS.reset.structuralResets.value);
const RESETS_TOO_MANY = readCount("reset.tooManyAt", PARAMS.reset.tooManyAt.value);
const HOLDS_PER_RESET = readCount("reset.holdsPerReset", PARAMS.reset.holdsPerReset.value);

/* ───────────────────────────── shared readers ─────────────────────────────── */

/** The beats array order IS the chain order. Nothing sorts by `at`: a timecode is
 *  a position the author wrote, and re-ordering by it would silently repair a
 *  chain whose declared order is wrong — which is a defect the author should see. */
const chain = (cut: TrailerCut) => cut.beats;

const kindsOf = (cut: TrailerCut, kind: TrailerBeatKind) =>
  cut.beats.filter((b) => b.kind === kind);

const movementById = (cut: TrailerCut) =>
  new Map(cut.movements.map((m) => [m.id, m] as const));

const dropped = (cut: TrailerCut, part: DroppablePart) =>
  (cut.droppedParts ?? []).includes(part);

const where = (b: TrailerBeat) => ({ at: b.at, beatId: b.id });

/** The roles the spine treats as required for THIS cut — the full spine minus the
 *  optional parts minus whatever the ladder declared dropped. */
function requiredRoles(cut: TrailerCut): MovementRole[] {
  const optional = new Set<MovementRole>(OPTIONAL_ROLES);
  if (dropped(cut, "introduction")) optional.add("introduction");
  if (dropped(cut, "cold-open")) optional.add("cold-open");
  return SPINE_ORDER.filter((r) => !optional.has(r));
}

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

/* ──────────────────── 2 · connectors — AND THEN must be zero ───────────────
   The neighbouring subject's test, "applying here unchanged and for the same
   reason" (escalation-without-mechanism.md § What a rung is made of), and this
   repo's own first law (`knowledge/CRAFT-BASELINE.md` § 1). `../types.ts:24`
   already says "AND THEN is a defect, drawn as one" — this is the function that
   can say it about a chain nobody hand-annotated. */

export function checkConnectors(cut: TrailerCut): StructureFinding[] {
  const out: StructureFinding[] = [];
  const beats = chain(cut);
  let cleared = 0;

  beats.forEach((b, i) => {
    if (i === 0) {
      if (b.connector !== null) {
        out.push({
          rule: "connector", subject: b.id, verdict: "violation",
          detail: `The first beat declares connector "${b.connector}" — a relationship to a beat that does not exist.`,
          ...where(b), cites: CITE.causality,
        });
      }
      return;
    }
    const prev = beats[i - 1];
    if (b.connector === "AND THEN") {
      out.push({
        rule: "connector", subject: b.id, verdict: "violation",
        detail: `"${prev.label}" AND THEN "${b.label}" — the only honest connector is a sequence, so this is a list, not a chain. "an escalation whose rungs link only with 'and then' is flat for exactly the reason the neighbour gives". Repair is merge, reorder, or find the missing rung that makes one cause the other.`,
        ...where(b), cites: CITE.causality,
      });
      return;
    }
    if (b.connector === null) {
      out.push({
        rule: "connector", subject: b.id, verdict: "unmeasured",
        detail: `No connector declared to "${prev.label}". The relationship was never named, so it cannot be tested — which is not the same as it being causal. Say the connector aloud between the two and write it down.`,
        ...where(b), cites: CITE.causality,
      });
      return;
    }
    cleared++;
  });

  // A `pass` is earned only when at least one adjacency was actually declared and
  // cleared. A one-beat cut, or a chain with every connector left null, examined
  // nothing — and `not-engaged` stays out of the enforced denominator.
  out.push(
    cleared > 0
      ? {
          rule: "connector", subject: "adjacencies", verdict: "pass",
          detail: `${cleared} of ${Math.max(beats.length - 1, 0)} adjacencies carry a declared BUT/THEREFORE and none carries AND THEN.`,
          cites: CITE.causality,
        }
      : {
          rule: "connector", subject: "adjacencies", verdict: "not-engaged",
          detail: `No adjacency carries a declared connector, so nothing was tested. This check examined nothing and does not count as enforcement.`,
          cites: CITE.causality,
        },
  );
  return out;
}

/* ────────────────────────── 3 · the spine ─────────────────────────────────
   Diagnostic, never a gate — see the header. The findings are real for a
   specialty-lane cut too; what changes is that `malformed` refuses to render a
   verdict over them. */

export function checkSpine(cut: TrailerCut): StructureFinding[] {
  const out: StructureFinding[] = [];
  const byId = movementById(cut);
  const present = new Set(cut.movements.map((m) => m.role));

  for (const role of requiredRoles(cut)) {
    if (!present.has(role)) {
      out.push({
        rule: "spine", subject: role, verdict: "violation",
        detail:
          role === "introduction"
            ? `No introduction movement. It is "the part that gets cut first at shorter lengths, and the part whose absence turns the escalation into noise" — and it is the move that personalising cost depends on. If it was dropped for this rung, declare it in droppedParts.`
            : `No ${role} movement. The spine is cold open → introduction → escalation → climax → (button), and ${role} is not one of the optional parts.`,
        cites: CITE.spine,
      });
    }
  }

  // Order. Repeats are allowed (two escalation movements is a shape, not a
  // defect); going backwards is not.
  const ordered = [...cut.movements].sort((a, b) => a.ordinal - b.ordinal);
  for (let i = 1; i < ordered.length; i++) {
    const prevIdx = SPINE_ORDER.indexOf(ordered[i - 1].role);
    const thisIdx = SPINE_ORDER.indexOf(ordered[i].role);
    if (thisIdx < prevIdx) {
      out.push({
        rule: "spine", subject: ordered[i].id, verdict: "violation",
        detail: `"${ordered[i].label}" (${ordered[i].role}) sits after "${ordered[i - 1].label}" (${ordered[i - 1].role}). The spine runs ${SPINE_ORDER.join(" → ")}; this pair runs backwards.`,
        cites: CITE.spine,
      });
    }
  }

  // Beats must run in movement order. A peak beat sitting before the escalation
  // is the front-loading failure — "The peak lands before the viewer has stakes,
  // and everything after is downhill."
  const ordinalOf = (b: TrailerBeat) => byId.get(b.movement)?.ordinal ?? null;
  const beats = chain(cut);
  for (let i = 1; i < beats.length; i++) {
    const a = ordinalOf(beats[i - 1]);
    const b = ordinalOf(beats[i]);
    if (a === null || b === null) continue; // already a graph violation
    if (b < a) {
      out.push({
        rule: "spine", subject: beats[i].id, verdict: "violation",
        detail: `Beat "${beats[i].label}" belongs to an earlier movement than the beat before it. The chain order and the movement order disagree, so the acts interleave.`,
        ...where(beats[i]), cites: CITE.failures,
      });
      break; // one report; the rest are consequences of the same inversion
    }
  }

  // Kind legality per role.
  let illegal = 0;
  for (const b of beats) {
    const m = byId.get(b.movement);
    if (!m) continue;
    if (!LEGAL_KINDS[m.role].includes(b.kind)) {
      illegal++;
      out.push({
        rule: "spine", subject: b.id, verdict: "violation",
        detail: `A "${b.kind}" beat sits in a ${m.role} movement, which carries ${LEGAL_KINDS[m.role].join(" / ")}. ${b.kind === "peak" ? "A peak outside the climax is the front-loading failure: the cut has spent its ceiling early." : "The part and the beat disagree about what this moment is."}`,
        ...where(b), cites: CITE.spine,
      });
    }
  }

  const peaks = kindsOf(cut, "peak");
  if (peaks.length === 0 && !cut.moodLed) {
    out.push({
      rule: "spine", subject: "peak", verdict: "violation",
      detail: `No peak beat. The climax is the part the whole shape builds to; a cut with no declared peak has nothing for the reset to precede and nothing for the button to be smaller than. If this is a sustained-gradient piece, set moodLed.`,
      cites: CITE.spine,
    });
  }

  if (!out.length && beats.length) {
    out.push({
      rule: "spine", subject: "shape", verdict: "pass",
      detail: `Roles ${ordered.map((m) => m.role).join(" → ")}: every required part present, order forward, ${beats.length - illegal} beats legal for their movement.`,
      cites: CITE.spine,
    });
  }
  return out;
}

/* ──────────────────────── 4 · the escalation rungs ────────────────────────
   "In a tool, make the raised variable an explicit field. A rung that declares no
   variable, or repeats the previous one, is mechanically detectable — which turns
   the most common structural defect in the form into something a checker can
   surface." — escalation-without-mechanism.md § Decision rules. This is that
   checker, written to that instruction. */

export function checkEscalation(cut: TrailerCut): StructureFinding[] {
  if (cut.moodLed) {
    return [{
      rule: "escalation", subject: "rungs", verdict: "not-engaged",
      detail: `The cut declares moodLed. "A cut built as one sustained emotional gradient rather than a sequence of steps is a recognised and successful shape, and auditing it for rungs will report a defect that is a deliberate choice." Not checked, and deliberately not scored as a pass.`,
      cites: CITE.escalation,
    }];
  }

  const out: StructureFinding[] = [];
  const rungs = kindsOf(cut, "rung");

  if (rungs.length === 0) {
    out.push({
      rule: "escalation", subject: "rungs", verdict: "violation",
      detail: `No rung beats. The escalation is what stops a montage reading as one long beat; with nothing declared as a rung there is no chain to raise anything.`,
      cites: CITE.escalation,
    });
    return out;
  }

  let clean = 0;
  for (const b of rungs) {
    const raises = b.raises ?? [];
    if (raises.length < RAISES_PER_RUNG) {
      out.push({
        rule: "escalation", subject: b.id, verdict: "violation",
        detail: `Rung "${b.label}" declares no raised variable. One of scale / threat / speed / intimacy / cost. A rung that declares none cannot be shown to raise anything, and the doctrine names exactly this as mechanically detectable.`,
        ...where(b), cites: CITE.escalation,
      });
      continue;
    }
    if (raises.length > RAISES_PER_RUNG) {
      out.push({
        rule: "escalation", subject: b.id, verdict: "violation",
        detail: `Rung "${b.label}" raises ${raises.length} variables (${raises.join(", ")}). "It raises exactly one variable … A rung that raises three at once has nothing left for the rung after it."`,
        ...where(b), cites: CITE.escalation,
      });
      continue;
    }
    clean++;
  }

  // Consecutive repeat. Non-consecutive reuse is not a defect — the rule the
  // doctrine states is "check that no variable repeats consecutively".
  for (let i = 1; i < rungs.length; i++) {
    const prev = new Set<RaisedVariable>(rungs[i - 1].raises ?? []);
    const shared = (rungs[i].raises ?? []).filter((v) => prev.has(v));
    if (shared.length) {
      out.push({
        rule: "escalation", subject: rungs[i].id, verdict: "violation",
        detail: `"${rungs[i - 1].label}" and "${rungs[i].label}" both raise ${shared.join(", ")}. "When two rungs raise the same variable, merge them. Two widenings in a row are one widening with extra runtime." This is the flat-escalation failure: content varies, magnitude does not.`,
        ...where(rungs[i]), cites: CITE.escalation,
      });
    }
  }

  if (!out.length) {
    out.push({
      rule: "escalation", subject: "rungs", verdict: "pass",
      detail: `${clean} rungs, each raising exactly one variable (${rungs.map((r) => (r.raises ?? []).join("+")).join(" → ")}), no variable repeated consecutively.`,
      cites: CITE.escalation,
    });
  }
  return out;
}

/* ───────────────────────── 5 · the dynamic reset ──────────────────────────
   "Locate the peak first. The reset has no position of its own; it sits
   immediately before whatever the cut's largest moment is." — dynamic-reset.md
   § Procedure. Everything here is anchored to the peak, including the refusals. */

export function checkReset(cut: TrailerCut): StructureFinding[] {
  if (cut.moodLed) {
    return [{
      rule: "reset", subject: "reset", verdict: "not-engaged",
      detail: `The cut declares moodLed. "A cut built as one sustained gradient has nothing to reset before, and inserting a stop invents a structure the piece deliberately does not have." Not checked.`,
      cites: CITE.reset,
    }];
  }
  if (dropped(cut, "reset")) {
    return [{
      rule: "reset", subject: "reset", verdict: "not-engaged",
      detail: `The reset is declared dropped for this ${cut.rung}. It is item 4 in the ladder's drop order — "At around thirty seconds there is no dynamic range to reset and the gap costs a tenth of the runtime." A declared absence is not a defect and is also not a pass.`,
      cites: CITE.ladder,
    }];
  }

  const out: StructureFinding[] = [];
  const beats = chain(cut);
  const resets = kindsOf(cut, "reset");
  const peaks = kindsOf(cut, "peak");

  if (resets.length < STRUCTURAL_RESETS) {
    out.push({
      rule: "reset", subject: "reset", verdict: "violation",
      detail: `No reset. "When the cut has no reset, it has no climax — regardless of how large the ending is." A peak is perceived against the level it rose from; a cut that never falls has no headroom left to peak into.`,
      cites: CITE.reset,
    });
  } else if (resets.length >= RESETS_TOO_MANY) {
    out.push({
      rule: "reset", subject: "reset", verdict: "violation",
      detail: `${resets.length} resets. "When there are three or more, remove all but one." Repetition converts the device from a reset into a rhythm — a stop used constantly resets nothing.`,
      cites: CITE.reset,
    });
  }

  // Position. Only decidable against ONE peak.
  if (peaks.length !== 1) {
    out.push({
      rule: "reset", subject: "position", verdict: "unmeasured",
      detail: `${peaks.length} beats are declared as the peak. The reset "sits immediately before whatever the cut's largest moment is", and with ${peaks.length === 0 ? "no peak" : "several peaks"} this checker cannot say which moment that is. Which peak is largest is a magnitude question — see the magnitude rule.`,
      cites: CITE.reset,
    });
  } else if (resets.length >= STRUCTURAL_RESETS) {
    const peakIdx = beats.indexOf(peaks[0]);
    const before = peakIdx > 0 ? beats[peakIdx - 1] : null;
    if (before && before.kind === "reset") {
      out.push({
        rule: "reset", subject: "position", verdict: "pass",
        detail: `The reset "${before.label}" sits immediately before the peak "${peaks[0].label}".`,
        ...where(before), cites: CITE.reset,
      });
    } else {
      out.push({
        rule: "reset", subject: "position", verdict: "violation",
        detail: `The beat before the peak "${peaks[0].label}" is ${before ? `"${before.label}" (${before.kind})` : "nothing — the peak opens the cut"}, not a reset. "an escalation that climbs monotonically into its climax arrives with nowhere to go."`,
        ...(before ? where(before) : {}), cites: CITE.reset,
      });
    }

    // A second reset is PERMITTED — "A punchline reset and a pre-peak reset can
    // coexist if the first is brief and clearly smaller." Brevity is duration and
    // duration is the shot layer's. So: reported, never graded.
    if (resets.length > STRUCTURAL_RESETS && resets.length < RESETS_TOO_MANY) {
      const extra = resets.find((r) => beats.indexOf(r) !== peakIdx - 1);
      out.push({
        rule: "reset", subject: extra ? extra.id : "second reset", verdict: "unmeasured",
        detail: `A second reset ("${extra?.label ?? "?"}"). This is permitted only "if the first is brief and clearly smaller" than the structural one. Brevity is a duration and this checker models no durations, so it cannot tell a punchline reset from a device that has stopped resetting anything.`,
        ...(extra ? where(extra) : {}), cites: CITE.reset,
      });
    }
  }

  // What the silence holds. "Fill the silence with one thing … A reset that holds
  // two ideas has spent its whole value carrying neither."
  for (const r of resets) {
    const holds = r.resetHolds ?? [];
    if (holds.length === 0) {
      out.push({
        rule: "reset", subject: r.id, verdict: "unmeasured",
        detail: `Reset "${r.label}" does not declare what the silence holds. A line, an image, or nothing at all — the choice is what the reset means, and undeclared is not the same as empty.`,
        ...where(r), cites: CITE.reset,
      });
    } else if (holds.length > HOLDS_PER_RESET) {
      out.push({
        rule: "reset", subject: r.id, verdict: "violation",
        detail: `Reset "${r.label}" holds ${holds.length} things (${holds.join(", ")}). "Fill the silence with one thing … A reset that holds two ideas has spent its whole value carrying neither."`,
        ...where(r), cites: CITE.reset,
      });
    }
  }

  // Where it can land is the cue's decision, not the plan's.
  for (const r of resets) {
    const section = cut.cue?.sections.find((s) => s.id === r.cueMark);
    if (!cut.cue || !r.cueMark) {
      out.push({
        rule: "reset", subject: r.id, verdict: "unmeasured",
        detail: `Reset "${r.label}" names no cue mark${cut.cue ? "" : " and the cut declares no cue"}. "Stop on a natural downbeat … the cue's own section boundaries decide where the reset can go." Without the cue this checker is measuring against positions the music does not mark.`,
        ...where(r), cites: CITE.cue,
      });
    } else if (!section) {
      out.push({
        rule: "reset", subject: r.id, verdict: "violation",
        detail: `Reset "${r.label}" names cue mark "${r.cueMark}", which is not a section of cue "${cut.cue.title}".`,
        ...where(r), cites: CITE.graph,
      });
    } else if (!section.isBoundary) {
      out.push({
        rule: "reset", subject: r.id, verdict: "violation",
        detail: `Reset "${r.label}" lands on "${section.label}", which is not a boundary. "A cue cut mid-phrase reads as a dropout. The stop belongs where the music would breathe anyway."`,
        ...where(r), cites: CITE.cue,
      });
    } else {
      out.push({
        rule: "reset", subject: r.id, verdict: "pass",
        detail: `Reset "${r.label}" lands on the cue boundary "${section.label}".`,
        ...where(r), cites: CITE.cue,
      });
    }
  }

  return out;
}

/* ───────────────────────────── 6 · the cue ────────────────────────────────
   "In a tool, model the cue as the timeline's parent, not as a track."
   The checks here are about whether the acts have marks to sit on at all. */

export function checkCue(cut: TrailerCut): StructureFinding[] {
  const out: StructureFinding[] = [];
  const cue = cut.cue;

  if (!cue) {
    out.push({
      rule: "cue", subject: "cue", verdict: "unmeasured",
      detail: `The cut declares no cue. In this form "the cue is the structure and the picture is fitted to it" — act boundaries ARE cue boundaries — so with no cue there is nothing marking where the acts fall and every boundary rule here is measured against positions the music does not mark. Not a violation: a plan may legitimately precede a cue. It is also not a pass.`,
      cites: CITE.cue,
    });
    return out;
  }

  const byId = new Map(cue.sections.map((s) => [s.id, s] as const));
  for (const m of cut.movements) {
    if (!m.cueSection) {
      out.push({
        rule: "cue", subject: m.id, verdict: "unmeasured",
        detail: `Movement "${m.label}" sits on no cue section. "a boundary the music does not mark is a boundary the viewer cannot perceive" — this act boundary is unverifiable rather than wrong.`,
        cites: CITE.cue,
      });
    } else if (!byId.has(m.cueSection)) {
      out.push({
        rule: "cue", subject: m.id, verdict: "violation",
        detail: `Movement "${m.label}" names cue section "${m.cueSection}", which cue "${cue.title}" does not contain.`,
        cites: CITE.graph,
      });
    }
  }

  for (const b of cut.beats) {
    if (b.cueMark && !byId.has(b.cueMark)) {
      out.push({
        rule: "cue", subject: b.id, verdict: "violation",
        detail: `Beat "${b.label}" names cue mark "${b.cueMark}", which cue "${cue.title}" does not contain.`,
        ...where(b), cites: CITE.graph,
      });
    }
  }

  // "When a cue has no breath before its peak, reject it however good it sounds.
  // There is nowhere to put the reset, and the cut will have no climax."
  const peakIdx = cue.sections.findIndex((s) => s.kind === "peak");
  if (peakIdx < 0) {
    out.push({
      rule: "cue", subject: cue.id, verdict: "violation",
      detail: `Cue "${cue.title}" declares no peak section. The cut's climax has no musical arrival to sit on.`,
      cites: CITE.cue,
    });
  } else if (!cue.sections.slice(0, peakIdx).some((s) => s.isBoundary)) {
    out.push({
      rule: "cue", subject: cue.id, verdict: "violation",
      detail: `Cue "${cue.title}" has no boundary before its peak. "When a cue has no breath before its peak, reject it however good it sounds. There is nowhere to put the reset, and the cut will have no climax."`,
      cites: CITE.cue,
    });
  } else {
    out.push({
      rule: "cue", subject: cue.id, verdict: "pass",
      detail: `Cue "${cue.title}" has a boundary before its peak, so the reset has somewhere to land.`,
      cites: CITE.cue,
    });
  }
  return out;
}

/* ───────────────────── 7 · magnitude — the injected seam ──────────────────
   Two rules in the doctrine are about SIZE, and size is not in the beat layer:

     "The button … has one hard constraint: it must be smaller than the climax."
     "Verify the last rung is the largest, and that the peak after it exceeds the
      last rung by a margin a viewer would notice."

   The beat layer holds no duration, shot count or energy, and inventing a
   magnitude scale here would be exactly the thing this repo refuses to do. So the
   rules are executable ONLY when the caller injects a resolver — which is the
   shot layer's seam — and `unmeasured` otherwise. Note the second rule's margin
   ("a margin a viewer would notice") stays unmeasured even WITH a resolver,
   because the doctrine gives no threshold and this file does not invent one. */

export type MagnitudeOf = (beat: TrailerBeat) => number | null;

export function checkMagnitude(cut: TrailerCut, magnitudeOf?: MagnitudeOf): StructureFinding[] {
  const out: StructureFinding[] = [];
  const buttons = kindsOf(cut, "button");
  const peaks = kindsOf(cut, "peak");
  const rungs = kindsOf(cut, "rung");
  const peak = peaks.length === 1 ? peaks[0] : null;

  const mag = (b: TrailerBeat) => (magnitudeOf ? magnitudeOf(b) : null);
  const noResolver = `No magnitude resolver was supplied. Magnitude lives in the shot layer (duration, shot count, energy); this file models beats and movements and refuses to invent a scale for them. Supply \`magnitudeOf\` — the shot lane's seam — to make this rule executable.`;

  if (buttons.length === 0) {
    out.push({
      rule: "magnitude", subject: "button", verdict: "not-engaged",
      detail: `No button. It is optional — "a last joke, sting or flourish after the title" — so there is nothing to size against the climax.`,
      cites: CITE.spine,
    });
  } else if (!peak) {
    out.push({
      rule: "magnitude", subject: "button", verdict: "unmeasured",
      detail: `A button is present but ${peaks.length === 0 ? "no peak is declared" : "several peaks are declared"}, so there is no single climax to be smaller than.`,
      cites: CITE.spine,
    });
  } else {
    for (const btn of buttons) {
      const a = mag(btn);
      const b = mag(peak);
      if (a === null || b === null) {
        out.push({
          rule: "magnitude", subject: btn.id, verdict: "unmeasured",
          detail: `Whether the button "${btn.label}" is smaller than the climax "${peak.label}" is not decidable from the beat layer. ${noResolver}`,
          ...where(btn), cites: CITE.spine,
        });
      } else if (a >= b) {
        out.push({
          rule: "magnitude", subject: btn.id, verdict: "violation",
          detail: `The button "${btn.label}" (${a}) is not smaller than the climax "${peak.label}" (${b}). "A button that outperforms the peak retroactively re-reads the peak as its setup" — and the last few seconds are what gets quoted.`,
          ...where(btn), cites: CITE.failures,
        });
      } else {
        out.push({
          rule: "magnitude", subject: btn.id, verdict: "pass",
          detail: `The button "${btn.label}" (${a}) is smaller than the climax "${peak.label}" (${b}).`,
          ...where(btn), cites: CITE.spine,
        });
      }
    }
  }

  if (rungs.length && peak) {
    const last = rungs[rungs.length - 1];
    const mags = rungs.map(mag);
    const lastMag = mags[mags.length - 1];
    const peakMag = mag(peak);

    if (mags.some((m) => m === null) || peakMag === null || lastMag === null) {
      out.push({
        rule: "magnitude", subject: "rise", verdict: "unmeasured",
        detail: `Whether the last rung is the largest, and whether the peak exceeds it, is not decidable from the beat layer. ${noResolver}`,
        cites: CITE.escalation,
      });
    } else {
      const biggest = Math.max(...(mags as number[]));
      if (lastMag < biggest) {
        out.push({
          rule: "magnitude", subject: last.id, verdict: "violation",
          detail: `The last rung "${last.label}" (${lastMag}) is not the largest (${biggest}). "Verify the last rung is the largest" — an escalation whose biggest step is not its last one falls before the peak.`,
          ...where(last), cites: CITE.escalation,
        });
      } else if (peakMag <= lastMag) {
        out.push({
          rule: "magnitude", subject: "rise", verdict: "violation",
          detail: `The peak "${peak.label}" (${peakMag}) does not exceed the last rung "${last.label}" (${lastMag}). "An escalation that arrives level with its own climax has no climax."`,
          ...where(peak), cites: CITE.escalation,
        });
      } else {
        out.push({
          rule: "magnitude", subject: "rise", verdict: "pass",
          detail: `Last rung is the largest rung (${lastMag}) and the peak exceeds it (${peakMag}).`,
          cites: CITE.escalation,
        });
      }
      out.push({
        rule: "magnitude", subject: "noticeable margin", verdict: "unmeasured",
        detail: `The peak must exceed the last rung "by a margin a viewer would notice". The doctrine states no threshold, and this file does not invent one — so the direction is checked above and the SIZE of the gap is not.`,
        cites: CITE.escalation,
      });
    }
  }

  return out;
}

/* ────────────────────────── 8 · card ordering ─────────────────────────────
   The registry lists these among the properties that are "mechanically
   checkable": "Card ordering (does a title precede the button) … the position of
   a brand mark in the first seconds". */

export function checkCards(cut: TrailerCut): StructureFinding[] {
  const out: StructureFinding[] = [];
  const beats = chain(cut);
  const titles = kindsOf(cut, "title");
  const buttons = kindsOf(cut, "button");

  if (titles.length === 0) {
    out.push({
      rule: "cards", subject: "title", verdict: "violation",
      detail: `No title card. The ladder names the title and the call-to-action as the LAST things to go — "The first two are contractual and are the only thing the cut is actually buying."`,
      cites: CITE.ladder,
    });
  }

  for (const btn of buttons) {
    const btnIdx = beats.indexOf(btn);
    const titleBefore = titles.some((t) => beats.indexOf(t) < btnIdx);
    out.push(
      titleBefore
        ? {
            rule: "cards", subject: btn.id, verdict: "pass",
            detail: `The button "${btn.label}" follows a title card, which is what makes it a button rather than a final beat of the climax.`,
            ...where(btn), cites: CITE.spine,
          }
        : {
            rule: "cards", subject: btn.id, verdict: "violation",
            detail: `The button "${btn.label}" is not preceded by any title card. The button is "a last joke, sting or flourish AFTER the title"; before it, it is just the end of the cut.`,
            ...where(btn), cites: CITE.spine,
          },
    );
  }

  // The brand mark. The registry says the position is checkable and that the
  // JUDGEMENT is not: "Where the mark carries real pedigree this is a deliberate
  // asset; where it does not, it belongs at the end." So report the position and
  // refuse the verdict.
  const first = beats[0];
  if (first && first.kind === "title") {
    out.push({
      rule: "cards", subject: first.id, verdict: "unmeasured",
      detail: `The cut opens on a card ("${first.label}"). "Opening on an unearned mark" spends the most valuable seconds of the form; where the mark carries real pedigree the same choice is a deliberate asset. This checker cannot know which, so it reports the position and leaves the verdict to a human.`,
      ...where(first), cites: CITE.failures,
    });
  } else if (first) {
    out.push({
      rule: "cards", subject: "opening", verdict: "pass",
      detail: `The cut opens on "${first.label}" (${first.kind}), not on a card.`,
      ...where(first), cites: CITE.failures,
    });
  }

  return out;
}

/* ──────────────────────── 9 · the promise ledger ──────────────────────────
   ADVISORY BY CONSTRUCTION — see `ADVISORY_RULES` below. "In a tool, make the
   payer a required field … should be surfaced as incomplete rather than accepted",
   and, four lines earlier in the same technique, "As a gate … A system that blocks
   on it will block on correct work; report the rows and let a human read them."
   Both are honoured: the rows are computed, and they never reach `malformed`. */

export function checkPromises(cut: TrailerCut): StructureFinding[] {
  const out: StructureFinding[] = [];
  const rows = cut.beats.flatMap((b) => (b.promises ?? []).map((p) => [b, p] as const));

  for (const [b, p] of rows) {
    if (!p.payer) {
      out.push({
        rule: "promise", subject: p.id, verdict: "violation",
        detail: `Promise "${p.sentence}" (by ${p.source}) names no payer. "A promise with no named payer is a finding, not a maybe" — and it is invisible at approval because everybody in the room already knows the work.`,
        ...where(b), cites: CITE.promise,
      });
    } else if (p.grade === "unpaid") {
      out.push({
        rule: "promise", subject: p.id, verdict: "violation",
        detail: `Promise "${p.sentence}" is graded unpaid against "${p.payer}". "When a promise has no payer, fix the cut, not the promise" — softening the wording leaves the register and the assembly intact, and those made most of it.`,
        ...where(b), cites: CITE.promise,
      });
    } else {
      out.push({
        rule: "promise", subject: p.id, verdict: "pass",
        detail: `Promise "${p.sentence}" names a payer ("${p.payer}")${p.grade ? `, graded ${p.grade}` : ""}.`,
        ...where(b), cites: CITE.promise,
      });
    }
  }

  // THE EXTRACTION ITSELF IS NOT AUTOMATABLE, and saying so is the point.
  out.push({
    rule: "promise", subject: "extraction", verdict: "unmeasured",
    detail: `${rows.length} promise(s) are declared on beats. The ledger's own step 1 is to watch the cut as a stranger and write down everything you now believe — "the whole value of the pass is that it is done from ignorance, and anyone who knows the work cannot perform it". A checker is never ignorant of its input, so whether this list is COMPLETE is unmeasured, and promises made by register (cue, grade, rhythm) are outside the beat layer entirely.`,
    cites: CITE.promise,
  });

  return out;
}

/* ─────────────────────────── 10 · the length ladder ───────────────────────
   "Halving a cut does not halve its parts. It removes parts, in a known order."
   The drop order is data (`DROP_ORDER`), so this is a real check. The part COUNTS
   per rung are not encoded — see the unmeasured row at the bottom. */

export function checkLadder(cut: TrailerCut): StructureFinding[] {
  const out: StructureFinding[] = [];
  const drops = cut.droppedParts ?? [];

  // A cut with nothing in it engages no ladder rule. The drop order removes
  // PARTS, and a cut that declares none has no parts for it to have removed —
  // so "nothing was dropped" is not a fact about this cut's shape, it is the
  // absence of a cut. Without this guard the long-cut branch below was the last
  // place in the file that could still say `pass` about something it never read:
  // an empty cut, and a one-beat cut missing its escalation, climax, peak, reset
  // and title, both scored `pass — the full spine`.
  if (!cut.beats.length && !cut.movements.length) {
    out.push({
      rule: "ladder", subject: "rung", verdict: "not-engaged",
      detail: `The cut declares no movements and no beats, so the drop order has no parts to have removed. This check examined nothing and does not count as enforcement.`,
      cites: CITE.ladder,
    });
    return out;
  }

  if (cut.rung === "long-cut") {
    out.push(
      drops.length
        ? {
            rule: "ladder", subject: "rung", verdict: "violation",
            detail: `Declared a long-cut but drops ${drops.join(", ")}. "The long cut — four parts and an optional button. The full spine." A long cut with parts removed is a shorter rung wearing the long cut's name.`,
            cites: CITE.ladder,
          }
        : {
            // What the ladder can see is the DECLARATION. Whether the spine is
            // actually complete is `checkSpine`'s answer, and claiming it here
            // asserted a second, unchecked verdict over the same cut — one that
            // contradicted the spine rows sitting directly above it.
            rule: "ladder", subject: "rung", verdict: "pass",
            detail: `A long cut, and no part is declared dropped — "The long cut — four parts and an optional button." This is a verdict on the DECLARATION only; whether every part is really present is the spine rule's answer, above.`,
            cites: CITE.ladder,
          },
    );
    return out;
  }

  if (!drops.length) {
    out.push({
      rule: "ladder", subject: "drops", verdict: "unmeasured",
      detail: `Declared rung "${cut.rung}" but no dropped parts. A shorter rung is derived by DELETING whole parts down the drop order, never by trimming all of them; with nothing declared, whether this cut was derived or trimmed cannot be read.`,
      cites: CITE.ladder,
    });
  } else {
    let ordered = true;
    for (const part of drops) {
      const idx = DROP_ORDER.indexOf(part);
      const skipped = DROP_ORDER.slice(0, idx).filter((p) => !drops.includes(p));
      if (skipped.length) {
        ordered = false;
        out.push({
          rule: "ladder", subject: part, verdict: "violation",
          detail: `Drops "${part}" while keeping ${skipped.join(", ")}, which the order puts ahead of it. The order is the technique's actual content: ${DROP_ORDER.join(" → ")}. Keeping the largest saving and cutting a later one is how a short cut ends up with a setup too short to establish anything.`,
          cites: CITE.ladder,
        });
      }
    }
    if (ordered) {
      out.push({
        rule: "ladder", subject: "drops", verdict: "pass",
        detail: `Drops ${drops.join(", ")} — a prefix of the drop order ${DROP_ORDER.join(" → ")}.`,
        cites: CITE.ladder,
      });
    }
  }

  out.push({
    rule: "ladder", subject: "part count", verdict: "unmeasured",
    detail: `Part counts per rung ("Two for a teaser, three for a spot") are stated by the technique in a part vocabulary that does not map onto the spine's movement roles without inventing the mapping — a teaser is "a context section, and one set-piece"; a spot is "a state, a consequence, a payoff". Not checked, and deliberately not approximated. Runtimes are likewise absent: every figure the doctrine gives for them is hedged.`,
    cites: CITE.ladder,
  });

  return out;
}

/* ────────────────────── 11 · the withholding budget ───────────────────────
   "decided once, in advance, by whoever owns the work rather than by whoever is
   measured on the cut." Without that page there is nothing to audit against — and
   the honest verdict is not "clean", it is "undecided". */

export function checkWithholding(cut: TrailerCut, budget?: WithholdingBudget): StructureFinding[] {
  const out: StructureFinding[] = [];
  const spends = cut.beats.flatMap((b) => (b.spends ?? []).map((id) => [b, id] as const));

  if (!budget) {
    out.push({
      rule: "withholding", subject: "budget", verdict: "unmeasured",
      detail: `No withholding budget supplied. ${spends.length} beat(s) declare a spend. The budget is a campaign artifact written before any cutting starts and signed by whoever owns the work; without it, whether this cut spends something held is not merely unchecked, it is UNDECIDED — which is the drift the technique exists to prevent.`,
      cites: CITE.budget,
    });
    return out;
  }

  const byId = new Map(budget.assets.map((a) => [a.id, a] as const));
  for (const [b, id] of spends) {
    const asset = byId.get(id);
    if (!asset) {
      out.push({
        rule: "withholding", subject: id, verdict: "violation",
        detail: `Beat "${b.label}" spends asset "${id}", which campaign budget "${budget.campaignId}" does not list. An asset nobody budgeted is an asset nobody decided about.`,
        ...where(b), cites: CITE.graph,
      });
      continue;
    }
    if (asset.allowance === "hold") {
      out.push({
        rule: "withholding", subject: asset.id, verdict: "violation",
        detail: `Beat "${b.label}" puts "${asset.name}" (${asset.kind}) on screen; the budget holds it — "may not be referenced at all". Treat a change as a decision requiring the same signature the budget got.`,
        ...where(b), cites: CITE.budget,
      });
    } else if (asset.allowance === "imply") {
      out.push({
        rule: "withholding", subject: asset.id, verdict: "violation",
        detail: `Beat "${b.label}" shows "${asset.name}" (${asset.kind}); the budget allows it to be IMPLIED only — "may be signalled that it exists, never shown". Once the viewer has seen it in the promotion, the work has lost the first encounter it was built around.`,
        ...where(b), cites: CITE.budget,
      });
    } else if (!asset.trade) {
      out.push({
        rule: "withholding", subject: asset.id, verdict: "violation",
        detail: `Beat "${b.label}" spends "${asset.name}" and the budget records no trade for it. "A spend with no recorded reason is a drift that has already happened."`,
        ...where(b), cites: CITE.budget,
      });
    } else {
      out.push({
        rule: "withholding", subject: asset.id, verdict: "pass",
        detail: `"${asset.name}" is allowed to be spent and the trade is recorded: ${asset.trade}`,
        ...where(b), cites: CITE.budget,
      });
    }
  }

  out.push({
    rule: "withholding", subject: "campaign drift", verdict: "unmeasured",
    detail: `The characteristic breach is campaign drift — "a later cut reveals what the first one implied" — and it "happens across rungs rather than within one". This function sees ONE cut, so it cannot see the breach the budget mainly exists to prevent. Audit the family against the same page.`,
    cites: CITE.budget,
  });

  return out;
}

/* ────────────────────────────── the report ────────────────────────────────── */

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

export interface StructureReport {
  cutId: string;
  findings: StructureFinding[];
  violations: number;
  passes: number;
  unmeasured: number;
  notEngaged: number;
  /** Of the rules that COULD have been executed, how many were. Same arithmetic
   *  as `../gate.ts` — the number that keeps this file honest about its reach. */
  enforced: number;
  /** `null` for a cut that declares the specialty lane. The golden path forbids
   *  reading the spine as a gate there: "the structure alone cannot tell you"
   *  whether a deviation is a choice or a defect. A caller that wants a boolean
   *  must read `findings` and decide, which is the point. */
  malformed: boolean | null;
  /** Why `malformed` is what it is, in one sentence, always populated. */
  malformedNote: string;
}

export interface StructureOptions {
  /** The shot layer's seam. Without it every magnitude rule reports unmeasured. */
  magnitudeOf?: MagnitudeOf;
  /** The campaign's withholding budget. Without it the budget rule reports
   *  undecided rather than clean. */
  budget?: WithholdingBudget;
}

/** THE STANDING ROW. "A structural checker can establish that a cut is malformed;
 *  it cannot establish that a cut works … it must report that gap rather than let
 *  a green structural verdict stand in for an unmeasured one." It is emitted on
 *  every report, including a perfect one, and it counts in `unmeasured` — so a
 *  cut can never score `enforced: 100`, which is correct. */
function efficacyRow(): StructureFinding {
  return {
    rule: "efficacy",
    subject: "does this cut work",
    verdict: "unmeasured",
    detail: `Not measurable from structure. The instrument practitioners actually use is a survey, and almost none of its questions are about the artifact — they ask what the viewer understood, what it reminded them of, what was unclear, and how they would describe it to somebody else. Everything above establishes only that the cut is well-formed or not.`,
    cites: CITE.measurable,
  };
}

export function runStructureCheck(cut: TrailerCut, opts: StructureOptions = {}): StructureReport {
  const findings = [
    ...checkGraph(cut),
    ...checkConnectors(cut),
    ...checkSpine(cut),
    ...checkEscalation(cut),
    ...checkReset(cut),
    ...checkCue(cut),
    ...checkMagnitude(cut, opts.magnitudeOf),
    ...checkCards(cut),
    ...checkPromises(cut),
    ...checkLadder(cut),
    ...checkWithholding(cut, opts.budget),
    efficacyRow(),
  ];

  const count = (v: Verdict) => findings.filter((f) => f.verdict === v).length;
  const violations = count("violation");
  const passes = count("pass");
  const unmeasured = count("unmeasured");
  const testable = passes + violations + unmeasured;

  const blocking = findings.filter(
    (f) => f.verdict === "violation" && !ADVISORY_RULES.includes(f.rule),
  );

  const specialty = cut.lane === "specialty";
  return {
    cutId: cut.id,
    findings,
    violations,
    passes,
    unmeasured,
    notEngaged: count("not-engaged"),
    enforced: testable ? Math.round(((passes + violations) / testable) * 100) : 0,
    malformed: specialty ? null : blocking.length > 0,
    malformedNote: specialty
      ? `This cut declares the specialty lane, where abandoning the spine deliberately is the lane's signature. ${blocking.length} structural deviation(s) are reported above and NONE of them is graded: "a cut that deviates from it is either a specialty-lane choice or a defect, and the structure alone cannot tell you which."`
      : blocking.length > 0
        ? `${blocking.length} structural violation(s) outside the advisory rules (${ADVISORY_RULES.join(", ")}). Malformed is a diagnosis, not a ship gate — the doctrine calls the spine "the default and the diagnostic, never the gate".`
        : `No structural violation outside the advisory rules. This says the cut is well-FORMED. It says nothing about whether it works — see the efficacy row.`,
  };
}
