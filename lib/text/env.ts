// Which engine answers, and with whose credential.
//
// lib/imaging/env.ts's sibling, with ONE deliberate difference that is the whole
// point of this seam: imaging splits on `dev | prod`, and this splits on
// `local | cloud`.
//
// WHY THE AXIS IS DIFFERENT. Imaging's fork is a quality-and-cost decision the
// operator makes — which vendor draws better plates for the money — and dev/prod
// is a fair proxy for it. This engine's fork is not about quality at all. It is
// about whether a `claude` binary can exist in the process's world:
//
//   local  the operator's machine, or a self-managed box. The `claude` CLI
//          answers, billed to the logged-in subscription. Nothing leaves the
//          host. This is the app's default and the posture the README calls
//          local-first.
//   cloud  a managed platform, or a machine that has chosen the SaaS posture.
//          Gemini answers over a metered key. This is the ONLY posture in which
//          this app can run on Cloud Run at all.
//
// NODE_ENV is not the right proxy for that, and using it would be actively
// wrong: a production BUILD on the operator's laptop still has the binary, and
// a `next dev` inside a Cloud Run container still does not. The right proxy is
// lib/deployment.ts's posture, which asks the question directly.
//
// Keys are read lazily, per call, rather than captured at module load — a route
// handler that booted before .env.local was filled in would otherwise hold a
// stale absence for the life of the process. Same rule, same reason, as imaging.

import { canSpawnLocalBinaries } from "../deployment";
import { noKey } from "./errors";
import type { TextProviderId } from "./types";

export type TextEnv = "local" | "cloud";

/**
 * `TEXT_ENV` wins; otherwise the deployment's own posture decides.
 *
 * The explicit setting exists so an operator can rehearse the SaaS posture on a
 * machine that has the binary (`TEXT_ENV=cloud`), which is the only honest way
 * to test the cloud path before deploying it — and so a self-managed container
 * that genuinely carries the binary can insist on it (`TEXT_ENV=local`).
 *
 * A GARBAGE VALUE FALLS THROUGH TO THE POSTURE rather than defaulting to
 * `cloud`. That direction is chosen: the registry's fallback-ladder technique
 * warns that "the subtlest route to the bottom rung is a knob, not an outage",
 * and a typo'd TEXT_ENV that silently moved every call onto a metered key would
 * be exactly that — spend, quietly, from a misspelling.
 */
export function currentTextEnv(): TextEnv {
  const raw = process.env.TEXT_ENV?.trim().toLowerCase();
  if (raw === "local" || raw === "cloud") return raw;
  return canSpawnLocalBinaries() ? "local" : "cloud";
}

/**
 * The environment variable each provider's credential lives in — or `null`
 * where there is no key to hold.
 *
 * `claude-cli` is `null` and that is the most important row in this file. It
 * authenticates with the machine's logged-in subscription, so there is no key in
 * the environment, no key in a vault, and no key in a bundle. The registry's
 * subscription-auth-selection technique is what makes this a design rather than
 * an accident: the child inherits this process's environment, most tools in this
 * class PREFER a metered API key over the seat session when both are visible,
 * and so an `ANTHROPIC_API_KEY` sitting in the environment for an unrelated
 * reason would silently move every recalibration onto per-token billing. The
 * strip that prevents it lives at the single spawn door (lib/claudeCli.ts), not
 * here — but the `null` is why anyone should go and read it.
 */
export const KEY_VAR: Record<TextProviderId, string | null> = {
  "claude-cli": null,
  google: "GOOGLE_AI_API_KEY",
};

export function keyFor(provider: TextProviderId): string {
  const name = KEY_VAR[provider];
  if (!name)
    // A programming error, not a runtime condition: an adapter with no key var
    // asked for a key. Loud rather than empty-string.
    throw new Error(`${provider} authenticates without an API key; keyFor() must not be called for it.`);
  const v = process.env[name];
  if (!v || !v.trim()) throw noKey(provider, name);
  return v.trim();
}

/**
 * Is this provider usable at all right now?
 *
 * KEY-HOLDING PROVIDERS ONLY answer this from the environment. `claude-cli` has
 * no key, so "configured" cannot mean "has a credential" for it — the honest
 * answer is whether this deployment may spawn a binary at all, which
 * lib/deployment.ts owns. Whether the binary is actually installed and logged in
 * is a PROBE, not a config lookup: it costs a process spawn, so the router asks
 * it once per chain walk rather than treating it as free.
 *
 * The split matters because the two answers have different costs and different
 * remedies, and folding them would make every plan lookup spawn a process.
 */
export function isConfigured(provider: TextProviderId): boolean {
  const name = KEY_VAR[provider];
  if (!name) return canSpawnLocalBinaries();
  const v = process.env[name];
  return Boolean(v && v.trim());
}
