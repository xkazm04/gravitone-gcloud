// Which vendor answers, and with whose key.
//
// The dev/prod split is the user's standing decision, encoded once here:
//
//   dev   Leonardo generates (credits already bought), Qwen recognises.
//   prod  Google does everything — one vendor, one style-lock mechanism, and
//         the reference-image window the production style block is tuned for.
//
// Keys are read lazily, per call, rather than captured at module load: a route
// handler that booted before .env.local was filled in would otherwise hold a
// stale absence for the life of the process.

import { noKey } from "./errors";
import type { ProviderId } from "./types";

export type ImagingEnv = "dev" | "prod";

/** `IMAGING_ENV` wins; otherwise dev unless this is a production build. */
export function currentEnv(): ImagingEnv {
  const raw = process.env.IMAGING_ENV?.toLowerCase();
  if (raw === "dev" || raw === "prod") return raw;
  return process.env.NODE_ENV === "production" ? "prod" : "dev";
}

export const KEY_VAR: Record<ProviderId, string> = {
  leonardo: "LEONARDO_API_KEY",
  qwen: "QWEN_API_KEY",
  google: "GOOGLE_AI_API_KEY",
};

export function keyFor(provider: ProviderId): string {
  const v = process.env[KEY_VAR[provider]];
  if (!v || !v.trim()) throw noKey(provider, KEY_VAR[provider]);
  return v.trim();
}

/** Is this provider usable at all right now? The router asks before it
 *  re-routes, so a fallback never turns a real vendor error into "no key". */
export function isConfigured(provider: ProviderId): boolean {
  const v = process.env[KEY_VAR[provider]];
  return Boolean(v && v.trim());
}
