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

import { ImagingError, unsupported } from "./errors";
import { currentEnv, isConfigured, type ImagingEnv } from "./env";
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
 * dev  — Leonardo for pixels (paid-for credits, Lucid Origin), Qwen for eyes.
 * prod — Google throughout: one vendor, one style-lock mechanism, and the
 *        reference-image window the production style block is tuned against.
 *
 * The trailing entries are re-route targets, reached only when the preferred
 * vendor refuses or is rate-limited AND the fallback actually has a key.
 */
const PLAN: Record<ImagingEnv, Record<Capability, ProviderId[]>> = {
  dev: {
    generate: ["leonardo", "google"],
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

async function run<T>(
  cap: Capability,
  call: (p: ImagingProvider) => Promise<T> | undefined,
): Promise<T> {
  const chain = planFor(cap);
  let first: ImagingError | null = null;

  for (let i = 0; i < chain.length; i++) {
    const id = chain[i];
    // Skip an unconfigured fallback silently, but never the FIRST choice — a
    // missing primary key is a real answer ("configure it"), not a reason to
    // quietly bill a different vendor.
    if (i > 0 && !isConfigured(id)) continue;

    const provider = PROVIDERS[id]();
    if (!provider.capabilities.includes(cap)) {
      if (i === 0) throw unsupported(id, cap);
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

  // Everything in the chain refused, was rate-limited, or had no key. The
  // FIRST error is the honest one — it describes the vendor we meant to use.
  throw first ?? new ImagingError(`No provider is configured for ${cap}.`, "no-key");
}

export const generate = (req: GenerateRequest): Promise<GeneratedImages> =>
  run("generate", (p) => p.generate?.(req));

export const edit = (req: EditRequest): Promise<GeneratedImages> =>
  run("edit", (p) => p.edit?.(req));

export const recognize = (req: RecognizeRequest): Promise<Recognition> =>
  run("recognize", (p) => p.recognize?.(req));
