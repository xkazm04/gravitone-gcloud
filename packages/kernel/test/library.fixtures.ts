import type { Result } from "@gt/domain/errors";
import type { Event } from "@gt/domain/event";
import { queryEvents } from "../src/events-query.ts";
import type { Store } from "../src/store.ts";

/** Every event in the store, oldest first. */
export function events(s: Store): Result<readonly Event[]> {
  const p = queryEvents(s, { order: "asc", limit: 1000 });
  return p.ok ? { ok: true, value: p.value.events } : p;
}
