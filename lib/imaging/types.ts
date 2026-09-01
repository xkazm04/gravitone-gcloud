// THE IMAGING CONTRACT — three capabilities, many vendors, one shape.
//
// Step 3 needs exactly three things from an image vendor, and the whole point
// of this file is that the rest of the app never learns which vendor did them:
//
//   generate   a text prompt (+ approved style references) → plate images
//   edit       an image + an instruction                   → adjusted image
//   recognize  an image + a question                       → text, or JSON
//
// The vendor split is an ENVIRONMENT decision, not a code decision (see
// router.ts): dev generates and edits on Google with Leonardo behind it as the
// re-route target, and recognises on Qwen; production runs on Google
// throughout. A surface that imported a vendor directly would nail that
// decision into the UI, so nothing outside lib/imaging/ may.
//
// SERVER ONLY. Every provider holds an API key. Nothing here may be imported
// from a component — the seam is app/api/imaging/*.

// Type-only, and it must stay that way: errors.ts imports this file back, so a
// value import here would be a runtime cycle. `import type` is erased.
import type { ImagingErrorKind } from "./errors";

/* ── Aspect: a project-level contract, never a vendor default ─────────────── */

// The research batch's cheapest lesson, learned by someone else the hard way:
// a twelve-shot batch came back 9:16 because the parameter was left to a prompt
// default. So aspect is REQUIRED on every generate call — there is no default
// to fall back to, by construction.
export type Aspect = "16:9" | "9:16" | "1:1" | "4:5";

/** Pixel dimensions per aspect. Providers may snap to their own grid; they must
 *  never silently change the RATIO. */
export const ASPECT_PX: Record<Aspect, { w: number; h: number }> = {
  "16:9": { w: 1472, h: 832 },
  "9:16": { w: 832, h: 1472 },
  "1:1": { w: 1152, h: 1152 },
  "4:5": { w: 1024, h: 1280 },
};

/* ── The image itself ─────────────────────────────────────────────────────── */

/** An image in transit. Base64 WITHOUT the `data:` prefix — every vendor wants
 *  it differently, so we hold the raw thing and let each adapter dress it. */
export interface ImageRef {
  base64: string;
  mime: "image/png" | "image/jpeg" | "image/webp";
  width?: number;
  height?: number;
}

export const dataUrl = (img: ImageRef): string => `data:${img.mime};base64,${img.base64}`;

/* ── Requests ─────────────────────────────────────────────────────────────── */

/**
 * The caller's vendor steer — carried by all three requests.
 *
 * It exists for one measured reason: knowledge/VISUAL-STYLE.md §7 records that
 * a safety refusal is cleared by "a different model for one hop", not by a
 * better prompt. Without `avoid`, a surface that has just been refused has no
 * move to offer.
 *
 * A steer is a PREFERENCE, not a command. It reorders the router's plan, it
 * never escapes it: a vendor that is not planned for the capability, or has no
 * key, is not promoted. `avoid` is the one half with teeth — see router.ts
 * `orderFor` for what it means when there is nowhere left to go.
 */
export interface ProviderSteer {
  /** Try this vendor first, if it is planned for the capability and configured. */
  prefer?: ProviderId;
  /** Never send this request to this vendor. */
  avoid?: ProviderId;
}

export interface GenerateRequest extends ProviderSteer {
  prompt: string;
  negativePrompt?: string;
  aspect: Aspect;
  /** How many candidates. Frames shows a filmstrip, so >1 is the normal case. */
  count?: number;
  /** The locked theme's approved plates. Style conditioning, not content —
   *  capped by the provider's own reference window (Google's is 14). */
  references?: ImageRef[];
  seed?: number;
}

export interface EditRequest extends ProviderSteer {
  image: ImageRef;
  /** What to change, in plain language. */
  instruction: string;
  references?: ImageRef[];
}

export interface RecognizeRequest extends ProviderSteer {
  image: ImageRef;
  instruction: string;
  /** When set, the provider MUST return JSON conforming to it. Providers that
   *  cannot enforce a schema natively put it in the prompt and validate after —
   *  either way the caller gets `json` or an error, never prose it must parse. */
  schema?: Record<string, unknown>;
}

/* ── Results ──────────────────────────────────────────────────────────────── */

/** The vendor roster, as a value: a request may name a vendor, so validation
 *  needs the list at runtime and there may be exactly one copy of it. */
export const PROVIDER_IDS = ["leonardo", "google", "qwen", "ollama"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/** One vendor that did NOT serve the request, and why it dropped out. */
export interface RerouteStep {
  provider: ProviderId;
  /** The error it raised, or `constraint` when the request itself ruled the
   *  vendor out — a field it cannot honour — before it was ever called. */
  why: ImagingErrorKind | "constraint";
}

/**
 * What happened, kept with the result. `cleanup` is here because Leonardo is a
 * STUDIO as well as an API: every generation we leave behind is clutter in the
 * user's account, so the wrapper deletes them and this field is the receipt.
 * A vendor with no server-side artifact reports "not-applicable".
 *
 * `provider` is the answer to "which vendor made this image", and it is worth
 * PERSISTING: an asset outlives the response it arrived in, and after the fact
 * the vendor is not re-derivable from the pixels.
 */
/**
 * Where a cost figure came from. The distinction is the point: a vendor-reported
 * figure is a receipt, an estimated one is our arithmetic over the table in
 * `pricing.ts`, and downstream must be able to say which before it prints a
 * dollar sign.
 *
 * Declared HERE rather than in `pricing.ts` — which is where the reasoning about
 * prices lives — because it travels on `Provenance`, and a type that crosses the
 * wire belongs with the other wire types. `pricing.ts` re-exports it so the
 * pricing code still reads as one piece.
 */
export type CostBasis = "vendor-reported" | "estimated" | "unpriced";

export interface Provenance {
  provider: ProviderId;
  model: string;
  /** Vendor-side ids, kept so a failed cleanup can be chased by hand. */
  remoteIds?: string[];
  costUsd?: number;
  /**
   * How to read `costUsd`. Absent on a call made before this field existed.
   *
   * Without it a reader can only INFER whether a figure is a receipt or our own
   * arithmetic — Playground did exactly that, by noticing when the number
   * differed from its own estimate, and had to stay cautious whenever the two
   * happened to coincide. An estimate presented as a receipt is the error worth
   * spending two lines to make impossible.
   */
  costBasis?: CostBasis;
  durationMs: number;
  cleanup?: "deleted" | "failed" | "not-applicable";
  /** Vendors eliminated before the one that served, most-preferred first.
   *  Absent on the ordinary single-hop call — its PRESENCE is the re-route,
   *  which is how "why is this plate from Leonardo?" stays answerable later. */
  reroutedFrom?: RerouteStep[];
}

export interface GeneratedImages {
  images: ImageRef[];
  provenance: Provenance;
}

export interface Recognition {
  text: string;
  /** Present iff the request carried a schema and the response satisfied it. */
  json?: unknown;
  provenance: Provenance;
}

/* ── The provider interface ───────────────────────────────────────────────── */

export type Capability = "generate" | "edit" | "recognize";

/** A vendor adapter. Every method is optional; `capabilities` is the truth the
 *  router reads, so a provider cannot claim something it did not implement. */
export interface ImagingProvider {
  readonly id: ProviderId;
  readonly capabilities: readonly Capability[];
  /**
   * Can this provider CONDITION a generation on reference images?
   *
   * Separate from `capabilities` because it is not about which methods exist —
   * both providers generate — but about whether a field of the request is
   * honoured or quietly ignored. Leonardo's v1 API takes no style reference,
   * so routing a style-locked request there would return a perfectly good
   * image that is not in the locked style, and nothing would report a problem.
   * That silent near-miss is the worst failure this layer could have, so the
   * router treats reference support as a routing constraint rather than
   * letting adapters drop the field on the floor.
   */
  readonly supportsReferences?: boolean;
  generate?(req: GenerateRequest): Promise<GeneratedImages>;
  edit?(req: EditRequest): Promise<GeneratedImages>;
  recognize?(req: RecognizeRequest): Promise<Recognition>;
}
