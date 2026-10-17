// THE HUNT'S DOOR ON THE AUDIO DESK (Phase 6, L65) - a map drafted from an idea, and a leaf's
// take crowned (or uncrowned), each judged against the sound store as it is now and recorded as
// ONE ledger event keyed by the operator's op id. The render is lib/sound/huntRender.ts's; the
// lesson lib/sound/lessons.ts's.
//
// Absorbed from v1 app/playground/hunt/useHunt.ts and lib/sound/hunt.ts `patchHunt`:
//   · the map is the text engine's (lib/sound/hunt.ts draftHunt: the prompt file, the schema,
//     the drop-never-repair parse, a map with no renderable leaf a 502) - unchanged;
//   · A CROWN IS A KEEP: the crowned take is kept (stage pending, so it lands on the Arrange
//     board), never over a verdict somebody gave (a rejected take stays rejected), and an uncrown
//     reaches back into the take only while it still sits pending (@gt/ui hunt.ts admitCrown).
// Upgraded:
//   · v1 held the node list in the TAB and PATCHed the whole list per gesture, so two tabs (or
//     a render loop and a crown) could overwrite each other's nodes. Each gesture here is its own
//     door that edits one node inside the store's transaction - nothing is sent whole;
//   · v1 crowned in two requests (PATCH the take, then PATCH the hunt) and said "verdict not
//     saved" when the second failed after the first had landed. Here the keep and the crown are
//     ONE store transaction;
//   · a retried draft finds the hunt it made (its id is derived from the op), so a double press
//     or a retry never pays the text engine twice.
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { appendOnce } from "@gt/kernel/ingest";
import type { Store } from "@gt/kernel/store";
import { admitCrown } from "@gt/ui/components/audio/hunt.ts";

import { draftHunt, type ReasonFn } from "./hunt.ts";
import { readHunts, SoundError, withStore } from "./store.ts";
import { patchTakeTx } from "./takes.ts";
import type { Hunt, SoundKind } from "./types.ts";

export const HUNT_DESK_OP_RE = /^[a-z0-9]{6,40}$/;
const words = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const STATUS: Readonly<Record<number, "invalid" | "not-found" | "conflict" | "refused" | "unavailable">> = { 400: "invalid", 404: "not-found", 409: "conflict", 502: "unavailable", 503: "unavailable" };

async function inStore<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SoundError) return err(STATUS[e.status] ?? "internal", e.message);
    return err("unavailable", words(e), { cause: e });
  }
}

function record(kernel: Store, opId: string, actor: Actor, type: string, huntId: string, data: Record<string, unknown>): Result<{ readonly recorded: boolean }> {
  const r = kernel.tx((t) => appendOnce(t, { actor, type, lane: "audio", key: `audio-hunt:${opId}`, subject: { kind: "hunt", id: huntId }, data }));
  if (!r.ok) return err(r.error.code, `the hunt store took it, the event log did not: ${r.error.message} - retry to record it`);
  return ok({ recorded: r.value.appended });
}

/* ── the map ────────────────────────────────────────────────────────────── */

export type DraftInput = { readonly kind: SoundKind; readonly idea: string; readonly opId: string };
export type Drafted = { readonly hunt: Hunt; readonly already: boolean; readonly recorded: boolean };

export async function draftMap(kernel: Store, input: DraftInput, actor: Actor, reason: ReasonFn, now: Date): Promise<Result<Drafted>> {
  if (!HUNT_DESK_OP_RE.test(input.opId)) return err("invalid", "a draft carries the operator's op id");
  const id = `hn-${input.opId}`;
  const had = await inStore(async () => ok((await readHunts()).hunts.find((h) => h.id === id)));
  if (!had.ok) return had;
  const made = had.value !== undefined ? ok(had.value) : await inStore(async () => ok(await draftHunt(input.kind, input.idea, reason, now, id)));
  if (!made.ok) return made;
  const h = made.value;
  const leaves = h.nodes.filter((n) => n.prompt !== "").length;
  const ev = record(kernel, input.opId, actor, "hunt.drafted", h.id, { kind: h.kind, idea: h.idea, leaves, ...(h.draftedBy === null ? {} : { draftedBy: h.draftedBy }) });
  return ev.ok ? ok({ hunt: h, already: had.value !== undefined, recorded: ev.value.recorded }) : ev;
}

/* ── the crown ──────────────────────────────────────────────────────────── */

export type CrownInput = { readonly huntId: string; readonly nodeId: string; readonly takeId: string; readonly on: boolean; readonly opId: string };
export type Crowned = { readonly huntId: string; readonly nodeId: string; readonly winner: boolean; readonly kept: boolean; readonly unkept: boolean; readonly recorded: boolean };

export async function crownLeaf(kernel: Store, input: CrownInput, actor: Actor, now: Date): Promise<Result<Crowned>> {
  if (!HUNT_DESK_OP_RE.test(input.opId)) return err("invalid", "a crown carries the operator's op id");
  const landed = await inStore(() =>
    withStore(async (tx): Promise<Result<{ kept: boolean; unkept: boolean; label: string }>> => {
      const file = await tx.get("hunts");
      const h = file.hunts.find((x) => x.id === input.huntId);
      const n = h?.nodes.find((x) => x.id === input.nodeId);
      if (h === undefined || n === undefined) return err("not-found", `no leaf ${input.nodeId} in hunt ${input.huntId}`);
      const t = (await tx.get("takes")).takes.find((x) => x.id === input.takeId);
      if (t === undefined) return err("not-found", `no take ${input.takeId}`);
      // Already so (a replayed op whose answer was lost, or a second tab): answered, not refused.
      if (n.winner === input.on) return ok({ kept: false, unkept: false, label: n.label });
      const a = admitCrown(n, t, input.on);
      if (!a.ok) return err("refused", a.reason);
      if (a.keep) await patchTakeTx(tx, t.id, { verdict: "kept" }, now);
      if (a.unkeep) await patchTakeTx(tx, t.id, { verdict: "unjudged", stage: null }, now);
      n.winner = input.on;
      tx.touch("hunts");
      return ok({ kept: a.keep, unkept: a.unkeep, label: n.label });
    }),
  );
  if (!landed.ok) return landed;
  const ev = record(kernel, input.opId, actor, input.on ? "hunt.crowned" : "hunt.uncrowned", input.huntId, { node: input.nodeId, take: input.takeId, label: landed.value.label, kept: landed.value.kept, unkept: landed.value.unkept });
  return ev.ok ? ok({ huntId: input.huntId, nodeId: input.nodeId, winner: input.on, kept: landed.value.kept, unkept: landed.value.unkept, recorded: ev.value.recorded }) : ev;
}
