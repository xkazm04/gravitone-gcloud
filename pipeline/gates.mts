// THE GATE REGISTRY - every gate this repository blocks on, declared ONCE.
//
// Before this file the blocking set was written out by hand in three places -
// package.json's `verify` chain, the `gates` job in .github/workflows/gates.yml,
// and the pre-push hook's banner - and the copies drifted: check:narration,
// check:clips and check:style-refs joined `verify` (2026-09-04..09) and never
// reached CI, while the hook promised the two were "the exact blocking set";
// gate-regression.mts exited 0 on failure and was wired to nothing; and
// assets-tree-regression.mts was a passing regression nobody ran (moonshot
// card pipeline-scripts-A, 2026-10-05).
//
// Now every copy is a PROJECTION of the list below:
//   npm run verify       -> node pipeline/run-gates.mts   (runs `blocking`, in this order)
//   gates.yml `gates`    -> one step per blocking gate, same order
//                           (tests/golden-path/gate-registry.probe.spec.ts holds it)
//   .githooks/pre-push   -> its skip banner prints `run-gates.mts --list`
//   gate liveness        -> a pipeline/*-regression.mts or pipeline/check-* that no
//                           registered gate runs, and that UNREGISTERED does not
//                           excuse, is refused by the runner and by the probe
//
// ADDING A GATE is one entry here plus its npm script and its gates.yml step.
// The probe is red until all three agree, so none can be forgotten.
//
// GRADING (blocking vs advisory) is decided on INPUT DETERMINISM, not severity -
// the rule and its long-form reasoning stay in gates.yml's header, which is the
// document a CI reader opens. Each `rationale` below is the one-line answer to
// that header's question for this gate: what does it read, and can anything
// outside this commit move its verdict?
//
// OUTCOMES says how to read the exit code, and it is per gate on purpose:
//   "012"  0 pass · 1 fail · 2 COULD-NOT-RUN (the gate asserted its own instrument
//          and found it broken - a clean verdict would have been manufactured)
//   "01"   0 pass · any non-zero is a fail. `tsc --noEmit` exits 2 on type
//          errors, so reading 2 as could-not-run for every gate would turn a
//          type error into "could not run". Only a gate that DOCUMENTS the
//          three-outcome protocol gets it.
//
// Runs under plain `node` (type stripping): erasable TypeScript only - no enums,
// no namespaces, no parameter properties.

export type GateClass = "blocking" | "advisory";
export type GateOutcomes = "012" | "01";

export type Gate = {
  /** Stable name used in reports, `needs` and `--only`. */
  readonly id: string;
  /** The package.json script it runs - the ONE definition, local and CI alike. */
  readonly npmScript: string;
  readonly class: GateClass;
  /** Ids that must PASS before this gate may start; each must appear earlier in GATES. */
  readonly needs?: readonly string[];
  readonly outcomes: GateOutcomes;
  /** What it reads, and why that input lets it block (or only advise). */
  readonly rationale: string;
};

export const GATES: readonly Gate[] = [
  {
    id: "typecheck",
    npmScript: "typecheck",
    class: "blocking",
    outcomes: "01",
    rationale: "This tree's .ts/.tsx/.mts plus a lock-pinned typescript; covers pipeline/ and tests/, which the build does not compile.",
  },
  {
    id: "lint",
    npmScript: "lint:ratchet",
    class: "blocking",
    outcomes: "012",
    rationale: "Sources plus a lock-pinned rule set; errors held at zero, warning debt ratcheted in lint-baseline.json; a short walk is could-not-run.",
  },
  {
    id: "manifest",
    npmScript: "check:manifest",
    class: "blocking",
    outcomes: "012",
    rationale: ".ai/manifest.yaml against .ai/SPEC.md and the scripts and paths it names - all committed.",
  },
  {
    id: "notebook",
    npmScript: "check:notebook",
    class: "blocking",
    outcomes: "01",
    rationale: "The notebook graph under app/_phases/_shared/notebook/ - string ids spent twice, dangling, or untagged. No network.",
  },
  {
    id: "type-scale",
    npmScript: "check:type",
    class: "blocking",
    outcomes: "01",
    rationale: "app/**/*.tsx and components/**/*.tsx for a font size under the readable floor. Filesystem only.",
  },
  {
    id: "narration",
    npmScript: "check:narration",
    class: "blocking",
    outcomes: "01",
    rationale: "Committed source only: the long-title ratchet and the <Hint> word cap (CLAUDE.md, 'The app does not explain itself').",
  },
  {
    id: "clips",
    npmScript: "check:clips",
    class: "blocking",
    outcomes: "012",
    rationale: "Committed clips under public/clips/ against their manifest and budget; decoding needs ffprobe, and its absence is could-not-run, never a pass.",
  },
  {
    id: "trailer-structure",
    npmScript: "check:trailer-structure",
    class: "blocking",
    outcomes: "01",
    rationale: "knowledge/templates/** and the trailer structure module - committed corpus, no network.",
  },
  {
    id: "render-gate",
    npmScript: "check:gate",
    class: "blocking",
    outcomes: "01",
    rationale: "The render-boundary gate's own regression: the 2026-08-11 causal sentence must trip, its correction must pass. Pure function.",
  },
  {
    id: "frames-prompt",
    npmScript: "check:frames-prompt",
    class: "blocking",
    outcomes: "01",
    rationale: "pipeline/FRAMES-SCENE-PROMPT.md and shotPrompt.ts against the rules a human gated through the Dojo. Filesystem only.",
  },
  {
    id: "ads-prompts",
    npmScript: "check:ads-prompts",
    class: "blocking",
    outcomes: "01",
    rationale: "pipeline/ADS-*-PROMPT.md against the registry rules they quote (19 pins), plus lib/ads/validate.ts behavioural cases. Filesystem only, no model.",
  },
  {
    id: "style-refs",
    npmScript: "check:style-refs",
    class: "blocking",
    outcomes: "01",
    rationale: "Pure function over lib/themes: the founding proof must survive a full sheet in the reference window.",
  },
  {
    id: "assets-tree",
    npmScript: "check:assets-tree",
    class: "blocking",
    outcomes: "01",
    rationale: "Pure function over lib/assets.ts: a parent folder totals and shows its whole subtree. Unwired from 2026-08 until gate liveness found it.",
  },
  {
    id: "kit-census",
    npmScript: "check:kit-census",
    class: "blocking",
    outcomes: "01",
    rationale: "app/kit/census.json recomputed from an AST walk of app/ and components/ and diffed: the /kit migration map cannot go stale, and hand-rolled suspects only ratchet down.",
  },
  {
    id: "probes",
    npmScript: "test",
    class: "blocking",
    outcomes: "01",
    rationale: "Node-context probes over the repo's own modules; sealNetwork() proves no call leaves the process.",
  },
  {
    id: "build",
    npmScript: "build",
    class: "blocking",
    outcomes: "01",
    rationale: "Committed sources and lock, with NO environment: an absent key must degrade, not crash.",
  },
  {
    id: "bundle",
    npmScript: "check:bundle",
    class: "blocking",
    needs: ["build"],
    outcomes: "012",
    rationale: "The browser chunks the build just emitted, for server-only names, secrets and the live-harness surface; asserts a positive control first.",
  },
];

// GATE LIVENESS. A file matching one of these patterns IS a gate by its name, so
// it must be run by a registered gate (its npm script names the file) or be
// excused below with the reason it is not one. A regression nobody runs is a
// courtesy that looks like a gate.
export const LIVENESS_PATTERNS: readonly RegExp[] = [/^[^/]+-regression\.mts$/, /^check-[^/]+$/];

/** pipeline/<file> -> why it is deliberately not a registered gate. */
export const UNREGISTERED: Readonly<Record<string, string>> = {};
