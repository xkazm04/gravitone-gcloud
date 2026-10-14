// WHEN `evict("identity")` RUNS: the trigger table, as one pure function.
//
// Kept verbatim in meaning from v1 lib/identityEviction.ts `transitionFor`, whose
// header enumerates the triggers (sign-out, expiry, revocation, a sign-out in another
// tab, a direct account switch) and the one deliberate EXCLUSION, recorded as an
// exclusion because the next maintainer will be tempted to add it "in the safe
// direction":
//
//   A PLAIN CREDENTIAL REFRESH IS NOT AN IDENTITY FLIP. The bearer changes; the user
//   does not. Evicting on refresh turns routine background maintenance into a
//   periodic wipe of the user's own work on a schedule nobody would connect back to
//   the refresh interval. Identity is compared by DURABLE id (uid), never by display
//   name or email: those change without the person changing, and a reclaimed address
//   stays equal while pointing at somebody else.
//
// The REASON is carried so a surface can say which happened: a person who signed out
// asked for this; a person whose session ended asked for nothing, and treating the
// two alike is the "randomly logged out" report (client-state identity-scoped-eviction).
// The local wipe never waits on the network: the caller evicts on both outcomes of a
// remote sign-out.

export type FlipReason = "signed-out" | "session-ended" | "account-switched";

/**
 * Classify an identity transition. `null` means NOT a flip - do not evict:
 *   · was === now, which includes a credential refresh (the exclusion above);
 *   · was === null, the first sign-in: nothing was held, and wiping here would delete
 *     the work of the account that is signing IN.
 * `deliberate` is true when this tab's own sign-out started it.
 */
export function identityFlip(was: string | null, now: string | null, deliberate = false): FlipReason | null {
  if (was === null || was === "") return null;
  if (was === now) return null;
  if (now === null || now === "") return deliberate ? "signed-out" : "session-ended";
  return "account-switched";
}
