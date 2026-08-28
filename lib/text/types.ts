// THE VOCABULARY OF THE TEXT ENGINE — one module, imported by every side.
//
// This is lib/imaging/types.ts's sibling, and the parallel is deliberate down to
// the field names: an app that describes an image call one way and a reasoning
// call another way has two mental models where it needs one. `Provenance`,
// `RerouteStep`, `CostBasis` and the steer pair all mean here exactly what they
// mean there.
//
// WHAT IS NOT PARALLEL, AND WHY. Three things are true of a reasoning call and
// not of an image call, and each one earns a field:
//
//   1. THE TRANSPORT IS PART OF THE ANSWER. An image is an image whoever drew
//      it. A reasoning answer that came from a local subprocess billed to the
//      operator's seat and one that came from a metered cloud endpoint are the
//      same shape and different findings — different money, different privacy
//      boundary, different availability story. `transport` and `rung` carry it.
//   2. SCHEMA ENFORCEMENT IS A VENDOR CAPABILITY, NOT A REQUEST FIELD. The
//      `claude` CLI has no `output_config.format`, which /api/recalibrate's own
//      header records as a cost it pays: "the plan's shape is a REQUEST, not a
//      guarantee". Gemini enforces `responseSchema` at the vendor. Both can
//      serve the same caller, so the caller states the schema once and
//      `schemaEnforcement` says which way it was honoured.
//   3. THE TURN HAS A CLASS. Reasoning calls in this app are not
//      interchangeable — an edit plan is minutes of Opus at high effort, a
//      probe is a health check. `TurnClass` is the closed vocabulary routing
//      and spend attribution key on.

/** Every text provider this app knows how to reach. A closed union so a typo is
 *  a type error rather than a silent skip in the plan table. */
export const TEXT_PROVIDER_IDS = ["claude-cli", "google"] as const;
export type TextProviderId = (typeof TEXT_PROVIDER_IDS)[number];

/**
 * What a text provider can be asked to DO.
 *
 * One member today, and that is a statement rather than a placeholder: every
 * reasoning call in this app is the same shape — a built prompt in, one answer
 * out, no tool use, no multi-turn. `lib/claudeCli.ts` enforces that shape at the
 * transport (`--allowed-tools "" --max-turns 1`) for a reason its header states
 * in full, and the cloud adapter matches it by sending no tool declarations.
 *
 * A second member is what an agentic capability would be — a run that may read
 * the workspace — and it would be a SEPARATE SEAM, not a flag on this one. The
 * registry's agent-cli-transport golden path is explicit about why: folding a
 * neutral generate path and a workspace-touching path into one function with a
 * mode flag "would make 'which mode am I in?' a bug that type-checks."
 */
export type TextCapability = "reason";

/**
 * WHAT KIND OF TURN THIS IS. A closed vocabulary, per the registry's
 * model-routing/turn-classification technique.
 *
 * It exists so that routing, pricing and the log all key on the same word.
 * Without it the two production call sites are distinguishable only by which
 * route handler they came from, which means spend cannot be attributed, a
 * routing rule cannot be written for one and not the other, and a new call site
 * shows up unlabelled on every chart.
 *
 *   · `edit-plan`        /api/recalibrate — notes in, an edit plan out. The
 *                        dearest turn in the app: a ~40KB prompt at high effort,
 *                        minutes long, and its output is validated against a
 *                        schema before anything is changed.
 *   · `scene-direction`  /api/frames — a script and a notebook in, scene specs
 *                        out. Sixteen art-direction decisions in one turn.
 *   · `probe`            a health check. Must be cheap or free, and must never
 *                        be routed like the two above.
 *   · `style-synthesis`  lib/foundry/extract — a gallery's readbacks in, named
 *                        styles with recipes out. One turn per extract run,
 *                        schema-shaped, a few KB of prompt; cheap enough for
 *                        flash, and its answer is validated for coverage
 *                        before anything is generated from it.
 */
export type TurnClass = "edit-plan" | "scene-direction" | "style-synthesis" | "probe";

/**
 * HOW THE ANSWER WAS REACHED. Not cosmetic — see the header, point 1.
 *
 *   · `local-subprocess` a binary on this machine, billed to whoever is logged
 *     into it. The prompt never left the host.
 *   · `cloud-api` a metered HTTP endpoint. The prompt crossed the network to a
 *     vendor, which is a fact a creator working on unpublished material is
 *     entitled to see.
 */
export type TextTransport = "local-subprocess" | "cloud-api";

/**
 * WHICH RUNG OF THE FALLBACK LADDER SERVED.
 *
 * The registry's fallback-ladder technique calls a deterministic result that
 * renders indistinguishably from a model verdict "the ladder's cardinal sin",
 * and requires the rung label to travel with the result to every surface that
 * shows it. This is that label. It is on `Provenance`, which the routes already
 * return to the client as `engine`, so it reaches the UI by the path the receipt
 * already takes.
 *
 * There is no `floor` member and that is deliberate. Rung 3 of the registry's
 * ladder is a deterministic stand-in, and neither of this app's two turns has an
 * honest one: there is no heuristic that writes an edit plan or art-directs a
 * script. Per the technique's own rung 4, the answer for those is honest refusal
 * — which is a thrown `TextError`, not a `Provenance` with a lying rung. If a
 * turn is ever added that DOES have a deterministic floor, it gets a member here
 * and the label carries it.
 */
export type LadderRung = "preferred" | "alternate";

/** Where a cost figure came from. Same three values, same meanings, as
 *  lib/imaging/types.ts — a number with no basis is a number nobody can audit. */
export type CostBasis = "vendor-reported" | "estimated" | "unpriced";

/** How a schema the caller asked for was actually honoured. */
export type SchemaEnforcement =
  /** The vendor constrained its own output. Malformed JSON is impossible. */
  | "native"
  /** The schema was appended to the prompt and the answer was validated after
   *  the fact. A refusal to comply is caught, but it costs a whole turn. */
  | "prompted"
  /** No schema was asked for. */
  | "none";

/** Why a candidate dropped out of the chain. Every elimination lands in the
 *  trail — see router.ts's invariant, which is lib/imaging/router.ts's invariant
 *  restated for this engine because it is the same promise. */
export interface RerouteStep {
  provider: TextProviderId;
  why:
    /** The plan named it but the adapter does not implement the capability. */
    | "unsupported"
    /** No credential for it. */
    | "no-key"
    /** The local transport cannot exist here at all (see lib/deployment.ts). */
    | "policy-forbidden"
    | "managed-platform"
    /** The binary is absent or not logged in — the probe said so. */
    | "not-installed"
    | "not-logged-in"
    /** It was called and it failed. */
    | "failed"
    | "refused"
    | "rate-limited"
    | "timeout"
    | "bad-response";
}

/** A caller may steer within the plan; it may never replace it. Identical rules
 *  to lib/imaging/types.ts::ProviderSteer, and enforced in the same place. */
export interface TextSteer {
  /** Try this one first, if it is planned for the turn and usable. A preference
   *  that cannot be honoured is DROPPED, not raised as an error. */
  prefer?: TextProviderId;
  /** Never this one. If that empties the chain the request is refused with
   *  `no-alternative` rather than quietly served by the avoided provider. */
  avoid?: TextProviderId;
}

/** One reasoning call. */
export interface TextRequest extends TextSteer {
  /** The whole prompt, already built by the caller. This engine composes
   *  nothing: the two production prompts are assembled from versioned documents
   *  in pipeline/ plus the run's payload, and that assembly is the caller's
   *  domain knowledge, not the transport's. */
  prompt: string;
  /** What kind of turn this is. Required — an unlabelled turn is the exact
   *  defect turn-classification exists to prevent. */
  turn: TurnClass;
  /**
   * The shape the answer must take, as a JSON Schema object.
   *
   * A REQUEST TO THE ENGINE, not to a vendor: a provider that can enforce it
   * does, one that cannot has it appended to the prompt and the answer checked
   * on the way back, and `provenance.schemaEnforcement` says which happened.
   * Either way `result.json` is populated or the call throws — the caller never
   * receives an unvalidated body it has to hand-parse.
   */
  schema?: Record<string, unknown>;
  /**
   * The application's ceiling, in milliseconds.
   *
   * ALWAYS the application's — no tool in this class ships a wall-clock flag and
   * a cloud endpoint's own timeout is its business, not ours. A nonsensical
   * value is MISCONFIGURATION and is floored to a sane minimum rather than being
   * read as "immediately": an instant kill on every call fails every transport in
   * milliseconds and routes the whole product to its bottom rung, quietly, with
   * a healthy-looking probe. See router.ts::resolveTimeout.
   */
  timeoutMs?: number;
}

/** The receipt. Travels with the answer, and onward to the client as `engine`. */
export interface TextProvenance {
  provider: TextProviderId;
  /** Exact model id as it went on the wire. `unknown` is not a value here — if
   *  an adapter cannot name the model it served, it says so in the string. */
  model: string;
  transport: TextTransport;
  rung: LadderRung;
  turn: TurnClass;
  schemaEnforcement: SchemaEnforcement;
  /** The serving provider's own elapsed time. The router's total, including any
   *  re-route, is on the log line — they differ and both matter. */
  durationMs: number;
  /** USD for this turn. `undefined` means UNPRICED, never free. */
  costUsd?: number;
  costBasis: CostBasis;
  /** Characters sent. The one input-size figure that is true for every
   *  transport — token counts are per-tokeniser and not comparable across
   *  vendors, and /api/recalibrate already reports this field. */
  promptChars: number;
  /** The CLI's own session id, where there is one. Kept because it is how a
   *  local run is chased afterwards in ~/.claude. */
  sessionId?: string;
  /** Who was tried and lost before this one answered. Present only when the
   *  chain actually walked. */
  reroutedFrom?: readonly RerouteStep[];
}

export interface TextResult {
  /** The answer as the provider gave it, normalised out of its envelope. */
  text: string;
  /** Set iff the request carried a schema — validated, whichever way it was
   *  enforced. */
  json?: unknown;
  provenance: TextProvenance;
}

/** What a probe found. Zero-token where the transport allows it. */
export interface ProbeResult {
  ok: boolean;
  /** Free-text, already written for a human, naming the remedy where there is
   *  one. Shown by a diagnostics surface; logged by the router on descent. */
  detail: string;
  /** The reason, in the trail's own vocabulary, so a descent record and a probe
   *  report cannot disagree about what went wrong. */
  why?: RerouteStep["why"];
  /** Version string where the transport reports one. */
  version?: string;
  /** Did answering this cost anything? A probe that cannot be free says so
   *  rather than pretending — the registry's availability-probe technique. */
  freeToRun: boolean;
}

/** The contract every adapter implements. Two functions, exactly as the
 *  registry's agent-cli-transport golden path specifies: `probe()` and one
 *  `run`-shaped call, both returning normalised results rather than raw
 *  envelopes. */
export interface TextProvider {
  readonly id: TextProviderId;
  readonly capabilities: readonly TextCapability[];
  readonly transport: TextTransport;
  /**
   * CAN THIS PROVIDER CONSTRAIN ITS OWN OUTPUT TO A SCHEMA?
   *
   * DATED DATA, NOT A BAKED CONSTANT. The registry's dated-capability-matrix
   * technique is emphatic about this and it is right: these are properties of a
   * vendor version on a date, and the tools ship weekly. Each adapter states the
   * date it was verified and how, beside the flag. A flag with no date beside it
   * is folklore.
   */
  readonly enforcesSchema: boolean;
  probe(): Promise<ProbeResult>;
  reason(req: TextRequest, timeoutMs: number): Promise<TextResult>;
}
