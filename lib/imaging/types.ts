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
// router.ts): dev runs on Leonardo + Qwen because the credits are already paid
// for, production runs on Google. A surface that imported a vendor directly
// would nail that decision into the UI, so nothing outside lib/imaging/ may.
//
// SERVER ONLY. Every provider holds an API key. Nothing here may be imported
// from a component — the seam is app/api/imaging/*.

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

export interface GenerateRequest {
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

export interface EditRequest {
  image: ImageRef;
  /** What to change, in plain language. */
  instruction: string;
  references?: ImageRef[];
}

export interface RecognizeRequest {
  image: ImageRef;
  instruction: string;
  /** When set, the provider MUST return JSON conforming to it. Providers that
   *  cannot enforce a schema natively put it in the prompt and validate after —
   *  either way the caller gets `json` or an error, never prose it must parse. */
  schema?: Record<string, unknown>;
}

/* ── Results ──────────────────────────────────────────────────────────────── */

export type ProviderId = "leonardo" | "google" | "qwen";

/**
 * What happened, kept with the result. `cleanup` is here because Leonardo is a
 * STUDIO as well as an API: every generation we leave behind is clutter in the
 * user's account, so the wrapper deletes them and this field is the receipt.
 * A vendor with no server-side artifact reports "not-applicable".
 */
export interface Provenance {
  provider: ProviderId;
  model: string;
  /** Vendor-side ids, kept so a failed cleanup can be chased by hand. */
  remoteIds?: string[];
  costUsd?: number;
  durationMs: number;
  cleanup?: "deleted" | "failed" | "not-applicable";
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
  generate?(req: GenerateRequest): Promise<GeneratedImages>;
  edit?(req: EditRequest): Promise<GeneratedImages>;
  recognize?(req: RecognizeRequest): Promise<Recognition>;
}
