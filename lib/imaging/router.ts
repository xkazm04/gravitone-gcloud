// THE CHOKEPOINT — every image call in the app enters here.
//
// Callers ask for a CAPABILITY. That is the whole design: the dev/prod vendor
// split is one table in this file, and changing it is a one-line edit rather
// than a search across surfaces.
//
// A caller may also STEER (`prefer` / `avoid`, see orderFor) — but a steer
// moves within the table, it does not replace it. No caller anywhere names a
// vendor and gets it: it names one it would rather have, or one it must not
// have, and the plan still decides.
//
// The fallback chain is not defensive padding. Google's image models refuse
// recognisable public figures outright, and the fix that works in practice is
// a cross-vendor re-route, not a retry — so `reroutable` errors walk to the
// next CONFIGURED provider, and everything else throws immediately.
//
// THE INVARIANT THIS FILE KEEPS: **no elimination is silent.** A candidate can
// drop out of the chain four ways — it lacks the capability, it cannot honour a
// field of THIS request, it has no key, or it failed when called — and every
// one of them lands in `trail`, which reaches the caller three ways: as the
// error thrown at the end, as `provenance.reroutedFrom` when a later vendor
// served, and as one line on the server log either way. The chain may bill a
// fallback when the preferred vendor has no key; what it may never do is leave
// anyone unable to find out that it did.

import { ImagingError, noAlternative, noKey, unsupported } from "./errors";
import { assertWithinBudget, estimatePendingUsd, recordSpend } from "./budget";
import { KEY_VAR, currentEnv, isConfigured, type ImagingEnv } from "./env";
import { logCall } from "./log";
import { googleProvider } from "./providers/google";
import { leonardoProvider } from "./providers/leonardo";
import { qwenProvider } from "./providers/qwen";
import type {
  Capability,
  GenerateRequest,
  GeneratedImages,
  ImagingProvider,
  Provenance,
  ProviderId,
  ProviderSteer,
  RecognizeRequest,
  Recognition,
  RerouteStep,
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
 * The chain this request will actually walk: the plan, steered.
 *
 * `avoid` REMOVES. It is the half that VISUAL-STYLE.md §7 needs — the move
 * after a safety refusal is another vendor, and a re-route that could quietly
 * land back on the refusing vendor is not a re-route. So when avoidance empties
 * the chain this throws `no-alternative` rather than serving the avoided
 * vendor: in production it ALWAYS empties the chain, because every prod
 * capability is single-entry by design.
 *
 * `prefer` only REORDERS, and only when it can be honoured — the named vendor
 * has to be planned for this capability and have a key. A preference that
 * cannot be honoured is dropped, not raised: the caller asked for a better
 * first try, not for a failure. Which vendor actually served is in
 * `provenance.provider`, so a dropped preference is visible after the fact.
 *
 * Exported so a diagnostics surface can show the real order without restating
 * the rules — the same reason planFor is exported.
 */
export function orderFor(
  cap: Capability,
  steer: ProviderSteer = {},
  env: ImagingEnv = currentEnv(),
): ProviderId[] {
  const chain = planFor(cap, env);
  const kept = steer.avoid ? chain.filter((id) => id !== steer.avoid) : chain;
  if (!kept.length) throw noAlternative(steer.avoid as ProviderId, cap);

  const p = steer.prefer;
  if (p && p !== steer.avoid && kept.includes(p) && isConfigured(p))
    return [p, ...kept.filter((id) => id !== p)];
  return kept;
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

/**
 * Did this failure cost money?
 *
 * The rule is: the vendor is presumed to have billed only where it is presumed
 * to have DONE WORK. Erring in either direction has a cost, and they are not
 * symmetric — an over-count refuses calls the operator could afford, an
 * under-count is a ceiling that lets an incident run. The kinds are enumerated
 * rather than defaulted so that a new kind added to the taxonomy fails to
 * compile here instead of silently landing on whichever side is written last.
 *
 *   timeout        BILLED. The request was in flight when our clock ran out. The
 *                  vendor very likely finished and will invoice it; the one thing
 *                  we know for certain is that we cannot know, and a spend guard
 *                  that guesses should guess high.
 *   bad-response   BILLED. The vendor answered. It ran.
 *   refused        BILLED. A safety block is a decision the model makes AFTER
 *                  reading the prompt, and the adapters raise it from a 200 body
 *                  (see http.ts's header) — inference happened.
 *   failed         BILLED ONLY IF DISPATCHED. This kind covers both a 4xx the
 *                  vendor answered and a host that could not be reached at all.
 *                  Only http.ts knows which, and it says so on the error.
 *
 *   rate-limited    NOT billed. A 429 is the door refusing before anything ran.
 *   invalid-request NOT billed. An adapter checked one of the vendor's own
 *                   limits and refused to dispatch. Nothing left the process.
 *   no-key         NOT billed. Rejected at authentication, or never attempted.
 *   unsupported    NOT billed. A routing-table fact; no call is made.
 *   no-alternative NOT billed. The chain emptied before a vendor was chosen.
 *   over-budget    NOT billed. Refused by our own ceiling, before any vendor.
 *
 * The last three cannot reach this function anyway — each is a `continue` or a
 * throw upstream of the try block — and they are listed so the reasoning is
 * complete rather than because the branch is live.
 *
 * Exported so the probe suite asserts THIS predicate rather than restating the
 * table, which is the same reason planFor and orderFor are exported: a second
 * copy of a decision is a second authority for it.
 */
export function billedOnFailure(err: ImagingError): boolean {
  switch (err.kind) {
    case "timeout":
    case "bad-response":
    case "refused":
      return true;
    case "failed":
      return err.dispatched;
    case "rate-limited":
    case "invalid-request":
    case "no-key":
    case "unsupported":
    case "no-alternative":
    case "over-budget":
      return false;
  }
}

async function run<T extends { provenance: Provenance }>(
  cap: Capability,
  call: (p: ImagingProvider) => Promise<T> | undefined,
  steer: ProviderSteer,
  constraint?: Constraint,
  pendingImages: number = 1,
): Promise<T> {
  const started = Date.now();
  /** Every vendor that dropped out, and why. This is the same record twice
   *  over: it settles into `provenance.reroutedFrom` when a later vendor
   *  served, and into the settle log either way. */
  const trail: RerouteStep[] = [];

  /**
   * The figure to book when the call itself reported none.
   *
   * `estimatePendingUsd` is the dearest declared PER-IMAGE rate — `pricing.ts`'s
   * `estimatePerImage` builds it by filtering to `bills: "per-image"` rows. It
   * can therefore only stand in for a capability the vendor bills per image.
   *
   * `recognize` is billed per TOKEN by both vendors that serve it, and all four
   * recognize rows in pricing.ts are deliberately unpriced for exactly that
   * reason. Substituting the image rate there is not a conservative guess, it is
   * a category error with a price tag: at $0.045 a call, 111 recognitions
   * exhaust the default $5 window and every generation after them is refused for
   * money that was never spent. The /library proof sheet recognises every plate
   * it shows, so that is an afternoon's work, not a pathological loop.
   *
   * `undefined` is the honest answer and budget.ts already knows what to do with
   * it: book nothing, and count it in `counters.unpriced` so the window total
   * reads as the lower bound it is. The pre-call GATE is deliberately left
   * erring high (see assertWithinBudget below) — a guard may guess, a ledger
   * may not.
   */
  const standInUsd = (): number | undefined =>
    cap === "recognize" ? undefined : estimatePendingUsd(pendingImages);
  try {
    // SPEND CEILING (lib/imaging/budget.ts). Priced with the pre-call estimate
    // and refused BEFORE any vendor is touched — once per request, not per
    // candidate in the chain. An `over-budget` throw here lands in the same
    // catch/log path as any other failure and never reroutes.
    assertWithinBudget(estimatePendingUsd(pendingImages));
    return await walk();
  } catch (e) {
    const err = e instanceof ImagingError ? e : null;
    logCall({
      cap,
      env: currentEnv(),
      ms: Date.now() - started,
      steer,
      tried: trail,
      kind: err?.kind ?? "failed",
      provider: err?.provider,
      message: err?.message ?? String(e),
    });
    throw e;
  }

  async function walk(): Promise<T> {
    const chain = orderFor(cap, steer);
    /** The first thing that went wrong. It describes the vendor we MEANT to
     *  use, which is the honest headline when the whole chain comes up empty. */
    let first: ImagingError | null = null;
    /** How many candidates the request-level constraint eliminated. */
    let rejected = 0;

    for (let i = 0; i < chain.length; i++) {
      const id = chain[i];
      const provider = PROVIDERS[id]();

      // A plan entry that cannot do the job is a bug in the table above, not a
      // runtime condition. As the FIRST choice it throws — nothing else was
      // asked for, so there is no result to hide it behind.
      if (!provider.capabilities.includes(cap)) {
        if (i === 0) throw unsupported(id, cap);
        first ??= unsupported(id, cap);
        trail.push({ provider: id, why: "unsupported" });
        continue;
      }

      // A provider that cannot honour this request is passed over even when it
      // is the preferred one — silently dropping the field would be worse.
      if (constraint && !constraint.test(provider)) {
        rejected++;
        trail.push({ provider: id, why: "constraint" });
        continue;
      }

      // No key: step over it, at ANY position, but record it. Calling it
      // instead would reach the same place by a longer road — the adapter's own
      // keyFor() throws `no-key`, which is reroutable — while spending a
      // provider construction to get there. Recording is what makes the skip
      // non-silent: an unconfigured primary is why the caller ends up on a
      // fallback, and it is the message they get if the fallback has no key
      // either.
      if (!isConfigured(id)) {
        first ??= noKey(id, KEY_VAR[id]);
        trail.push({ provider: id, why: "no-key" });
        continue;
      }

      try {
        const out = call(provider);
        if (out === undefined) throw unsupported(id, cap);
        const served = await out;
        // The re-route is kept WITH the result, not only in the log: an asset
        // outlives the process that made it.
        if (trail.length) served.provenance = { ...served.provenance, reroutedFrom: [...trail] };
        // Book the spend against the window. Prefer the figure the call actually
        // carried (vendor-reported or estimated); fall back to the pre-call
        // estimate so an unreported cost still counts toward the next ceiling.
        recordSpend({
          usd: served.provenance.costUsd ?? standInUsd(),
          cap,
          provider: served.provenance.provider,
          model: served.provenance.model,
          outcome: "served",
          // The call's OWN basis, not a re-derivation from "did a number
          // arrive". Every Google generate arrives carrying a figure that
          // pricing.ts labelled `estimated` — our arithmetic over a declared
          // rate, not a receipt — and booking it as "vendor" made a window
          // built entirely of estimates read as an invoice. Telling those two
          // apart is the whole reason SpendBasis exists.
          basis: served.provenance.costBasis === "vendor-reported" ? "vendor" : "estimate",
        });
        logCall({
          cap,
          env: currentEnv(),
          ms: Date.now() - started,
          steer,
          tried: trail,
          provider: served.provenance.provider,
          model: served.provenance.model,
          costUsd: served.provenance.costUsd,
        });
        return served;
      } catch (e) {
        const err =
          e instanceof ImagingError
            ? e
            : new ImagingError(`${id} failed unexpectedly.`, "failed", id, String(e));
        // BOOK THE FAILURE IF THE VENDOR RAN IT (added 2026-08-24).
        //
        // Spend used to be booked only on the branch above, so a call that
        // reached the vendor, was executed, and then timed out or came back
        // unusable consumed units the vendor WILL bill and booked nothing. The
        // meter therefore under-read most during an incident, which is the worst
        // shape an under-count can have.
        //
        // The judgement is per candidate, not per request, and it is made here
        // rather than in budget.ts because this is the only place that knows
        // whether the vendor was actually asked. See `billedOnFailure` for which
        // kinds count and — more importantly — which do not: `no-key`,
        // `unsupported` and the request-constraint drop-out never leave this
        // process, and every one of the three is handled by a `continue` above
        // that does not reach this catch at all.
        if (billedOnFailure(err)) {
          recordSpend({
            usd: standInUsd(),
            cap,
            provider: id,
            outcome: "failed",
            // Always an estimate: a call that failed reported no figure of its
            // own, so this is our dearest declared rate standing in for one —
            // and `undefined` where that rate is the wrong UNIT, which books
            // nothing rather than inventing a number (see standInUsd).
            basis: "estimate",
          });
        }
        first ??= err;
        trail.push({ provider: id, why: err.kind });
        if (!err.reroutable) throw err;
        // else: try the next configured vendor
      }
    }

    // Nothing served the request. Report the most specific cause we hold, and
    // the request-level constraint outranks the vendor error: "no API key for
    // google" on its own does not explain why google was the only candidate for
    // a request that carries references, and the reader is left to guess at the
    // narrowing.
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
    // The floor only fires if a PLAN row above were emptied — every other way
    // out of the loop records `first`.
    throw first ?? new ImagingError(`No provider is configured for ${cap}.`, "no-key");
  }
}

export const generate = (req: GenerateRequest): Promise<GeneratedImages> =>
  run(
    "generate",
    (p) => p.generate?.(req),
    req,
    // Style-locked generation must go to a provider that actually reads the
    // references. In dev that means the request never falls back to Leonardo —
    // deliberately: an unconditioned image in the wrong style is not a cheaper
    // success, it is a failure that looks like one.
    req.references?.length
      ? { needs: "reference images", test: (p) => Boolean(p.supportsReferences) }
      : undefined,
    // A batch of N images is priced (and gated) as N, not 1.
    req.count ?? 1,
  );

export const edit = (req: EditRequest): Promise<GeneratedImages> =>
  run("edit", (p) => p.edit?.(req), req);

export const recognize = (req: RecognizeRequest): Promise<Recognition> =>
  run("recognize", (p) => p.recognize?.(req), req);
