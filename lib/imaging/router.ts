// THE CHOKEPOINT — every image call in the app enters here.
//
// Callers ask for a CAPABILITY, never a vendor. That is the whole design: the
// dev/prod vendor split is one table in this file, and changing it is a
// one-line edit rather than a search across surfaces.
//
// The fallback chain is not defensive padding. Google's image models refuse
// recognisable public figures outright, and the fix that works in practice is
// a cross-vendor re-route, not a retry — so `reroutable` errors walk to the
// next CONFIGURED provider, and everything else throws immediately.
//
// THE INVARIANT THIS FILE KEEPS: **no elimination is silent.** A candidate can
// drop out of the chain four ways — it lacks the capability, it cannot honour a
// field of THIS request, it has no key, or it failed when called — and every
// one of them is recorded and reaches the caller, either as the error thrown at
// the end or (when a later vendor served) as the vendor named in `provenance`.
// The chain may bill a fallback when the preferred vendor has no key; what it
// may never do is leave the caller unable to find out that it did.

import { ImagingError, noKey, unsupported } from "./errors";
import { KEY_VAR, currentEnv, isConfigured, type ImagingEnv } from "./env";
import { googleProvider } from "./providers/google";
import { leonardoProvider } from "./providers/leonardo";
import { qwenProvider } from "./providers/qwen";
import type {
  Capability,
  GenerateRequest,
  GeneratedImages,
  ImagingProvider,
  ProviderId,
  RecognizeRequest,
  Recognition,
  EditRequest,
} from "./types";

/**
 * Vendor preference per capability, most-preferred first.
 *
 * dev  — Google for pixels (measured, see below), Leonardo behind it as the
 *        re-route target, Qwen for eyes.
 * prod — Google throughout: one vendor, one style-lock mechanism, and the
 *        reference-image window the production style block is tuned against.
 *
 * The trailing entries are re-route targets, reached only when the preferred
 * vendor refuses or is rate-limited AND the fallback actually has a key.
 */
const PLAN: Record<ImagingEnv, Record<Capability, ProviderId[]>> = {
  dev: {
    // MEASURED, not assumed. Leonardo was the dev generator on the premise
    // that Lucid Origin had the better quality-per-credit. The 6-style × 5-beat
    // grid (pipeline/build-style-trials.mts, both providers, 60 graded cells)
    // says the opposite once "quality" means USABLE — on-brief AND free of
    // text, which is the bar a plate has to clear to be worth anything:
    //
    //   leonardo   7/30 usable (23%)   $0.0257/render →  $0.110 per usable
    //   google    26/30 usable (87%)   $0.0450/render →  $0.052 per usable
    //
    // 14 cells flipped between the two and every one flipped the same way.
    // Leonardo drew the countable mechanism 0 times out of 6; Nano Banana drew
    // it 4. So the cheaper render was the more expensive plate, and Leonardo
    // stays in the chain as a fallback rather than as the default.
    generate: ["google", "leonardo"],
    // Leonardo is absent on purpose: its only adjustment surface is background
    // removal, not instruction-driven editing, so even in dev an edit is a
    // Nano Banana call.
    edit: ["google"],
    recognize: ["qwen", "google"],
  },
  prod: {
    generate: ["google"],
    edit: ["google"],
    recognize: ["google"],
  },
};

const PROVIDERS: Record<ProviderId, () => ImagingProvider> = {
  leonardo: leonardoProvider,
  google: googleProvider,
  qwen: qwenProvider,
};

/** Who would answer this capability right now, in order. Exported so the
 *  integration probe and any diagnostics surface report the same truth the
 *  router acts on rather than restating it. */
export function planFor(cap: Capability, env: ImagingEnv = currentEnv()): ProviderId[] {
  return PLAN[env][cap];
}

/**
 * A per-request narrowing of the chain: what this request needs, and the test
 * that decides who has it.
 *
 * `needs` is a plain-language noun phrase and it is not decoration — when the
 * constraint empties the chain it is the only thing that explains WHY a vendor
 * that is configured and capable still did not get the call.
 */
interface Constraint {
  readonly needs: string;
  readonly test: (p: ImagingProvider) => boolean;
}

async function run<T>(
  cap: Capability,
  call: (p: ImagingProvider) => Promise<T> | undefined,
  constraint?: Constraint,
): Promise<T> {
  const chain = planFor(cap);
  /** The first thing that went wrong. It describes the vendor we MEANT to use,
   *  which is the honest headline when the whole chain comes up empty. */
  let first: ImagingError | null = null;
  /** How many candidates the request-level constraint eliminated. */
  let rejected = 0;

  for (let i = 0; i < chain.length; i++) {
    const id = chain[i];
    const provider = PROVIDERS[id]();

    // A plan entry that cannot do the job is a bug in the table above, not a
    // runtime condition. As the FIRST choice it throws — nothing else was asked
    // for, so there is no result to hide it behind.
    if (!provider.capabilities.includes(cap)) {
      if (i === 0) throw unsupported(id, cap);
      first ??= unsupported(id, cap);
      continue;
    }

    // A provider that cannot honour this request is passed over even when it
    // is the preferred one — silently dropping the field would be worse.
    if (constraint && !constraint.test(provider)) {
      rejected++;
      continue;
    }

    // No key: step over it, at ANY position, but record it. Calling it instead
    // would reach the same place by a longer road — the adapter's own keyFor()
    // throws `no-key`, which is reroutable — while spending a provider
    // construction to get there. Recording is what makes the skip non-silent:
    // an unconfigured primary is why the caller ends up on a fallback, and it
    // is the message they get if the fallback has no key either.
    if (!isConfigured(id)) {
      first ??= noKey(id, KEY_VAR[id]);
      continue;
    }

    try {
      const out = call(provider);
      if (out === undefined) throw unsupported(id, cap);
      return await out;
    } catch (e) {
      const err =
        e instanceof ImagingError
          ? e
          : new ImagingError(`${id} failed unexpectedly.`, "failed", id, String(e));
      first ??= err;
      if (!err.reroutable) throw err;
      // else: try the next configured vendor
    }
  }

  // Nothing served the request. Report the most specific cause we hold, and the
  // request-level constraint outranks the vendor error: "no API key for google"
  // on its own does not explain why google was the only candidate for a request
  // that carries references, and the reader is left to guess at the narrowing.
  if (constraint && rejected) {
    const eligible = chain.filter((id) => constraint.test(PROVIDERS[id]()));
    const why = first ? ` ${first.message}` : "";
    throw new ImagingError(
      eligible.length
        ? `This request needs a provider that supports ${constraint.needs}; for ${cap} that is ` +
          `${eligible.join(" or ")}, which could not serve it.${why}`
        : `This request needs a provider that supports ${constraint.needs}, and none of the ` +
          `${cap} chain (${chain.join(", ")}) does.${why}`,
      first?.kind ?? (eligible.length ? "no-key" : "unsupported"),
      first?.provider,
      first?.detail,
    );
  }
  // The floor only fires if a PLAN row above were emptied — every other way out
  // of the loop records `first`.
  throw first ?? new ImagingError(`No provider is configured for ${cap}.`, "no-key");
}

export const generate = (req: GenerateRequest): Promise<GeneratedImages> =>
  run(
    "generate",
    (p) => p.generate?.(req),
    // Style-locked generation must go to a provider that actually reads the
    // references. In dev that means the request never falls back to Leonardo —
    // deliberately: an unconditioned image in the wrong style is not a cheaper
    // success, it is a failure that looks like one.
    req.references?.length
      ? { needs: "reference images", test: (p) => Boolean(p.supportsReferences) }
      : undefined,
  );

export const edit = (req: EditRequest): Promise<GeneratedImages> =>
  run("edit", (p) => p.edit?.(req));

export const recognize = (req: RecognizeRequest): Promise<Recognition> =>
  run("recognize", (p) => p.recognize?.(req));
