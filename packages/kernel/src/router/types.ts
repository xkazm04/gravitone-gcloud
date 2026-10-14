import type { AppErrorCode } from "@gt/domain/errors";
import type { Estimate } from "@gt/domain/estimate";
import type { ResourceLane } from "@gt/domain/lane";
import type { PriceUnit } from "../pricing/table.ts";
import type { Quote, Usage } from "../pricing/quote.ts";

// THE ROUTER'S VOCABULARY - one shape for every medium (plan §3.2).
//
// v1 had two routers with deliberately parallel vocabularies
// (lib/imaging/types.ts and lib/text/types.ts: "an app that describes an image
// call one way and a reasoning call another way has two mental models where it
// needs one"). Parallel by discipline is two copies that agree today. Here it
// is one set of types, and audio and video join it instead of growing a third
// and fourth copy.

/** The engine media. `text` serves the article lane and every other turn that
 *  reasons (scripts, treatments, metadata), so it is not the Floor's `article`. */
export const ROUTER_MEDIA = ["image", "text", "audio", "video"] as const;
export type RouterMedium = (typeof ROUTER_MEDIA)[number];

/**
 * HOW A CANDIDATE IS REACHED, which decides what can rule it out before it is
 * asked anything:
 *   cloud         a metered endpoint; reachable iff its credential is set.
 *   local-binary  a process this machine spawns (the `claude` CLI, `agy`,
 *                 ComfyUI, ffmpeg). Impossible on a managed platform and
 *                 forbidden by LOCAL_BINARIES=off, whatever is installed.
 *   local-daemon  a service on this box's network (Ollama): its address is its key.
 *   browser       the operator's signed-in Chrome over CDP (Suno, the Leonardo studio).
 */
export type Transport = "cloud" | "local-binary" | "local-daemon" | "browser";

/** Request fields a candidate may silently ignore - a routing CONSTRAINT, not a
 *  capability (lib/imaging/types.ts supportsReferences: "a perfectly good
 *  image that is not in the locked style, and nothing would report a problem"). */
export const NEEDS = ["references"] as const;
export type Need = (typeof NEEDS)[number];
export const NEED_PHRASE: Readonly<Record<Need, string>> = { references: "reference images" };

export type Pace = { readonly secondsPerUnit: number; readonly basis: "measured" | "illustrative"; readonly source: string };

export type Candidate = {
  readonly provider: string;
  readonly capabilities: readonly string[];
  readonly lane: ResourceLane;
  readonly transport: Transport;
  readonly honours: readonly Need[];
  /** Reached only when a steer names it, and then alone (v1 PREFER_ONLY): a
   *  request that chose whose credits to spend is never moved onto another meter. */
  readonly preferOnly?: true;
  /** The wire model per plan key, falling back to the capability. */
  readonly models: Readonly<Record<string, string>>;
  /** Per plan key or capability: the price unit one work unit bills, where
   *  that is known before the call (a turn's tokens are not). */
  readonly bills?: Readonly<Record<string, PriceUnit>>;
  /** Per plan key or capability: seconds per work unit, where declared. */
  readonly pace?: Readonly<Record<string, Pace>>;
  /** What an operator sets to make it reachable; named in every no-key sentence. */
  readonly credential: string;
};

/**
 * One medium's table. `plans[env][planKey]` is the ordered chain, where a plan
 * key is a capability (`generate`) or a capability and a turn class
 * (`reason/edit-plan`). An empty row is a capability this posture does not
 * have - absent, refused honestly, never routed to a stand-in.
 */
export type MediumTable = {
  readonly medium: RouterMedium;
  readonly candidates: readonly Candidate[];
  readonly plans: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
};

export type LocalPosture = "available" | "policy-forbidden" | "managed-platform";

/** The deployment, as an INPUT (lib/deployment.ts, lib/imaging/env.ts and
 *  lib/text/env.ts each read process.env per call; here one pure reading is
 *  handed in, so a test or a Runs preview can route under any posture). */
export type Posture = {
  /** Which plan column each medium reads. */
  readonly plan: Readonly<Record<RouterMedium, string>>;
  readonly local: LocalPosture;
  /** TEXT_RETRIEVE: may a `retrieve` candidate search and fetch at all. */
  readonly retrieval: boolean;
};

/** What only a probe or a key lookup can say about a candidate right now. */
export type Availability = { readonly ok: true } | { readonly ok: false; readonly why: "no-key" | "not-installed" | "not-logged-in"; readonly detail: string };

/** A call that already went out in this request and failed. */
export const FAILURE_KINDS = ["refused", "rate-limited", "timeout", "bad-response", "invalid-request", "failed", "cancelled"] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];
export type Attempt = { readonly provider: string; readonly kind: FailureKind; readonly detail: string };

export type Facts = {
  /** Missing entry = not configured: an unknown is never a yes. */
  readonly availability: Readonly<Record<string, Availability>>;
  readonly attempts?: readonly Attempt[];
  /** The instant the decision is made; quotes price for its day. */
  readonly now: string;
};

/**
 * A STEER - the Runs view's re-route act, and v1's prefer/avoid. It moves
 * within the plan, never escapes it (consumer-overrides: an override is a
 * preference within the permitted set, not an exemption from it):
 *   pin      this provider and nothing else; refused if the plan does not permit it.
 *   prefer   try it first if it can serve; an unhonourable preference is dropped
 *            and the drop is reported.
 *   exclude  never these; if that empties the chain the request is refused
 *            `no-alternative` rather than served by an excluded provider.
 */
export type Steer = { readonly pin?: string; readonly prefer?: string; readonly exclude?: readonly string[] };

export type RouteRequest = {
  readonly medium: RouterMedium;
  readonly capability: string;
  /** The turn class, for media whose plan is per class (text). */
  readonly class?: string;
  /** Work units: images, turns, clips, seconds of audio. */
  readonly units: number;
  /** Billing usage when it differs from `units` of the candidate's unit. */
  readonly usage?: Usage;
  readonly size?: string;
  readonly needs?: readonly Need[];
  readonly steer?: Steer;
};

export type Why =
  | "unsupported"
  | "constraint"
  | "steered-out"
  | "not-planned"
  | "no-key"
  | "not-installed"
  | "not-logged-in"
  | "policy-forbidden"
  | "managed-platform"
  | FailureKind;

export type Elimination = { readonly provider: string; readonly why: Why; readonly detail: string };

/** There is no `floor` rung, on purpose (lib/text/types.ts LadderRung): no turn
 *  here has an honest deterministic stand-in, so the bottom is a refusal. */
export type Rung = "preferred" | "alternate";

export type Choice = {
  readonly provider: string;
  readonly model: string;
  readonly lane: ResourceLane;
  readonly transport: Transport;
  readonly rung: Rung;
  readonly quote: Quote;
  /** Null when no pace is declared for the candidate: unknown, not instant. */
  readonly seconds: number | null;
  /** Present exactly when `seconds` is known. */
  readonly estimate?: Estimate;
};

export type Delta = {
  /** The provider the unsteered request would have chosen, or null if it refuses. */
  readonly vs: string | null;
  readonly usd: number | null;
  readonly seconds: number | null;
  /** Why a figure is null, when one is. */
  readonly note?: string;
};

export type Routed = {
  readonly kind: "routed";
  readonly planKey: string;
  readonly chain: readonly string[];
  readonly choice: Choice;
  readonly trail: readonly Elimination[];
  /** A preference the plan could not honour, said out loud. */
  readonly steerDropped?: string;
  /** Present exactly when the request carried a steer. */
  readonly delta?: Delta;
};

export type RefusalReason = "misconfigured" | "absent" | "not-permitted" | "no-alternative" | "exhausted" | "stopped" | "table-bug";

export type Refused = {
  readonly kind: "refused";
  readonly reason: RefusalReason;
  /** The taxonomy code a driver raises it as. */
  readonly code: AppErrorCode;
  readonly message: string;
  readonly trail: readonly Elimination[];
};

export type RouteOutcome = Routed | Refused;
