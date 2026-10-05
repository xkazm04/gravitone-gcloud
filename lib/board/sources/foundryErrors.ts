// How a foundry seam's failure becomes a SOURCE STATE rather than a crash.
//
// app/foundry/foundryClient.ts `call` raises FoundryRequestError with status 0
// for "the studio could not be reached" and the route's own `detail` for the
// rest. For the Board, a route that cannot answer at all (network, 404, an
// access refusal) means the source is unavailable here; anything else is a real
// error and keeps its words.

import { FoundryRequestError } from "@/app/foundry/foundryClient";

import { SourceUnavailable } from "../source";

export function asSourceError(e: unknown): Error {
  if (e instanceof FoundryRequestError && (e.status === 0 || e.status === 401 || e.status === 403 || e.status === 404))
    return new SourceUnavailable(e.message);
  return e instanceof Error ? e : new Error(String(e));
}

/** Run a read, translating its failure. */
export async function read<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw asSourceError(e);
  }
}

export const pct = (x: number | null | undefined): string => (typeof x === "number" ? `${Math.round(x * 100)}%` : "—");
