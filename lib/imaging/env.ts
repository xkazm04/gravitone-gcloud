// Which vendor answers, and with whose key.
//
// The dev/prod split is the user's standing decision, and the table that
// encodes it lives in router.ts (PLAN) — this file only answers "is there a key
// for that vendor". Read the roster there; a copy here is a copy that rots.
//
// Keys are read lazily, per call, rather than captured at module load: a route
// handler that booted before .env.local was filled in would otherwise hold a
// stale absence for the life of the process.

import { noKey } from "./errors";
import { agyAvailable } from "./providers/agy";
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
  // Local provider: the "key" is the daemon's address. Set = this machine has
  // opted in; unset = the router skips it with a no-key trail entry, which is
  // exactly right on boxes that run no daemon.
  ollama: "OLLAMA_HOST",
  // No env var: there is no key to hold. Availability is
  // `canSpawnLocalBinaries()` AND a live `agy --version` presence probe
  // (providers/agy.ts#agyAvailable) — both `keyFor` and `isConfigured` below
  // special-case "agy" rather than reading this string as a variable name.
  // The entry exists so this Record stays exhaustive, and it is the clause the
  // router's no-key sentence ends with (errors.ts noKey), so it says what agy
  // needs - the kernel router's spelling of the same fact.
  agy: "the `agy` CLI, installed and authenticated (presence-probed)",
  // The Leonardo WEB STUDIO's credit pool, reached by driving a signed-in
  // Chrome profile over CDP (providers/leonardoStudio.ts). The "key" is the
  // CDP endpoint; set = this machine opted in. A separate pool from the API
  // key's (which returned 402 in 2026-10). LEONARDO_STUDIO_DRIVER=fake also
  // counts as configured: the fake needs no browser, and a probe or a dev run
  // with the fake must reach the same router path the real driver does.
  "leonardo-studio": "LEONARDO_STUDIO_CDP",
  // GPT Image 2.5 Flare over the API (providers/leonardoFlare.ts): the same key
  // and the same credit pool as Lucid Origin, a different model and adapter.
  "leonardo-flare": "LEONARDO_API_KEY",
};

const studioFake = () => process.env.LEONARDO_STUDIO_DRIVER?.trim() === "fake";

export function keyFor(provider: ProviderId): string {
  if (provider === "agy") {
    if (!agyAvailable())
      throw noKey("agy", "the `agy` CLI (not installed, not authenticated, or LOCAL_BINARIES=off)");
    return "agy-cli";
  }
  if (provider === "leonardo-studio" && studioFake()) return "fake";
  const v = process.env[KEY_VAR[provider]];
  if (!v || !v.trim()) throw noKey(provider, KEY_VAR[provider]);
  return v.trim();
}

/** Is this provider usable at all right now? The router asks before it
 *  re-routes, so a fallback never turns a real vendor error into "no key". */
export function isConfigured(provider: ProviderId): boolean {
  if (provider === "agy") return agyAvailable();
  if (provider === "leonardo-studio" && studioFake()) return true;
  const v = process.env[KEY_VAR[provider]];
  return Boolean(v && v.trim());
}
