// THE TRIAL'S VERDICT: prereg + results in, one of upheld / challenged / null / void out.
// Pure. The rule is the contract (lib/articles/types.ts `TrialVerdict`), stated once here:
//
//   void        a control did not hold, or an arm has fewer than `n` observations
//               (measurement-honesty/control-failure-is-not-a-datum-state; minimum-sample-floors)
//   band        minEffect.value, or minEffect.value x |golden mean| when relative
//   eligible    an arm clears every threshold
//   challenged  the alternative is eligible AND delta > band
//   upheld      the golden arm is eligible AND (delta < -band OR the alternative is not eligible)
//   null        anything else
//
// delta = alternative mean - golden mean, sign-flipped when the metric's direction is
// "lower", so a positive delta always favours the alternative. `deltaCi95` is a seeded
// bootstrap (fixed seed, 2000 resamples): reported, never decisive.

import { ArticleError } from "../store";
import type { TrialPrereg, TrialResults, TrialVerdict } from "../types";

const notYet = (what: string): never => {
  throw new ArticleError(`${what} is not implemented yet`, 501, "not-implemented");
};

/** A prereg.json as parsed JSON -> a TrialPrereg, or an ArticleError 400 `bad-prereg` naming every problem. */
export function validatePrereg(raw: unknown): TrialPrereg {
  void raw;
  return notYet("validatePrereg");
}

/** A results.json as parsed JSON -> TrialResults matching the prereg's arms, metric guards and
 *  controls, or an ArticleError 400 `bad-results` naming every problem. */
export function validateResults(raw: unknown, prereg: TrialPrereg): TrialResults {
  void raw;
  void prereg;
  return notYet("validateResults");
}

export function computeVerdict(prereg: TrialPrereg, results: TrialResults, now: Date = new Date()): TrialVerdict {
  void prereg;
  void results;
  void now;
  return notYet("computeVerdict");
}
