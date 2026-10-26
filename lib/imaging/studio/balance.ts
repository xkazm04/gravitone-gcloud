// THE TWO LEONARDO POOLS, READ APART (spark scout-vision S6) - server-only, and nothing here spends.
//
// Leonardo bills from two pools that one account's `/me` answer lists side by side: the WEB pool the
// studio draws on (`subscriptionTokens`, `paidTokens`) and the API pool Flare and the REST adapter draw
// on (`apiSubscriptionTokens`, `apiPaidTokens`). The doctor's key probe (keyProbe.ts) and Flare's own
// balance read summed every `*Tokens` field, so on 2026-10-24 the doctor showed 9530 credits while the
// API pool was 0 and every scene, style and concept of the night failed "Insufficient tokens"
// (.claude/skills/scout/LESSONS.md). Two lines, then:
//   · the API POOL is apiSubscriptionTokens + apiPaidTokens alone; an answer that carries neither
//     field falls back to the old sum, and says so - a figure that may include the web pool;
//   · the STUDIO BALANCE is what the studio page itself reports, read by driver.ts `studioRecon`,
//     which opens a tab, aborts every mutation on the wire and clicks nothing. It holds the studio
//     lock (./lock.ts) like a generate, so a doctor run never opens a second tab beside a still.
// Both are notes in the doctor, never failures: the night's stills choose their pool by
// SCOUT_REPLICA_GENERATOR, and a low balance is the operator's to read, not the doctor's to refuse.

import { probeWith, type KeyFetch, type KeyProbe } from "../keyProbe";
import type { StudioRecon } from "./driver";
import { withStudioLock } from "./lock";

/** The API pool's fields on `/me` user_details: Flare's and the REST adapter's credits. */
export const API_POOL_FIELDS = ["apiSubscriptionTokens", "apiPaidTokens"] as const;

export type ApiPool = { readonly tokens: number; readonly basis: "api" } | { readonly tokens: number; readonly basis: "sum"; readonly note: string };

/** The API pool from one `/me` user_details row; null when it carries no token field at all. */
export function leonardoApiPool(details: Readonly<Record<string, unknown>>): ApiPool | null {
  const api = API_POOL_FIELDS.map((k) => details[k]).filter((v): v is number => typeof v === "number");
  if (api.length > 0) return { tokens: api.reduce((n, v) => n + v, 0), basis: "api" };
  const all = Object.entries(details).filter(([k, v]) => /tokens$/i.test(k) && typeof v === "number");
  if (all.length === 0) return null;
  return { tokens: all.reduce((n, [, v]) => n + (v as number), 0), basis: "sum", note: `no ${API_POOL_FIELDS.join("/")} on the account answer; the sum of every token field, which may include the studio's web pool` };
}

/** The sentence a pool reads as on the doctor's line. */
export function apiPoolWords(pool: ApiPool | null): string {
  if (pool === null) return "accepted · no token field on the account answer";
  return pool.basis === "api" ? `accepted · API pool ${pool.tokens} credits` : `accepted · ${pool.tokens} credits (${pool.note})`;
}

/** LEONARDO_API_KEY against its account, read for the API pool alone (keyProbe.ts `probeLeonardo`'s call). */
export function probeLeonardoApiPool(key: string, fetchFn: KeyFetch = fetch as unknown as KeyFetch): Promise<KeyProbe> {
  return probeWith(fetchFn, "https://cloud.leonardo.ai/api/rest/v1/me", { authorization: `Bearer ${key}`, accept: "application/json" }, key, (body) => {
    try {
      const u = (JSON.parse(body) as { user_details?: Record<string, unknown>[] }).user_details?.[0] ?? {};
      return apiPoolWords(leonardoApiPool(u));
    } catch {
      return "accepted";
    }
  });
}

/** The doctor's line shape (lib/foundry/scout/doctor.ts `Check`), spelled here so this layer imports none of the scout. */
export type BalanceCheck = { readonly name: string; readonly ok: boolean; readonly found: string; readonly remedy?: string; readonly needed: false };

export type StudioBalanceInput = {
  readonly env: Readonly<Record<string, string | undefined>>;
  /** A dry night opens no tab: the balance is not read. */
  readonly dry: boolean;
  /** The read-only recon (default driver.ts `studioRecon`, under the studio lock); a test hands a fake. */
  readonly recon?: () => Promise<Pick<StudioRecon, "signedIn" | "balance">>;
};

const realRecon = (): Promise<StudioRecon> => withStudioLock(async () => (await import("./driver")).studioRecon(), { by: "leonardo-studio recon" });

/** The studio's own balance, as a note. Never spends; opens a tab only on a live night with a real driver. */
export async function studioBalanceCheck(input: StudioBalanceInput): Promise<BalanceCheck> {
  const name = "studio balance";
  if (input.env["LEONARDO_STUDIO_DRIVER"]?.trim() === "fake") return { name, ok: true, found: "fake driver (LEONARDO_STUDIO_DRIVER=fake); no balance to read", needed: false };
  if (!input.env["LEONARDO_STUDIO_CDP"]?.trim()) return { name, ok: false, found: "LEONARDO_STUDIO_CDP is unset", remedy: "the scout's stills draw on the studio by default: set LEONARDO_STUDIO_CDP and sign its Chrome profile in once", needed: false };
  if (input.dry) return { name, ok: true, found: "not read on a dry night (a read opens a studio tab)", needed: false };
  try {
    const r = await (input.recon ?? realRecon)();
    if (!r.signedIn) return { name, ok: false, found: "not signed in to leonardo", remedy: "sign the studio's Chrome profile in once", needed: false };
    if (r.balance === undefined) return { name, ok: false, found: "the studio page reported no balance while it loaded", needed: false };
    return { name, ok: r.balance > 0, found: `${r.balance} studio credits (a still at Low is 8)`, needed: false };
  } catch (e) {
    return { name, ok: false, found: `the studio could not be read: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`, needed: false };
  }
}
