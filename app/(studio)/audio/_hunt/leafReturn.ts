import "server-only";

// A SUNO LEAF'S FILE, BACK ON ITS MAP (Phase 6, L72; L65's gap). A Suno leaf goes by hand: the
// operator copies its prompt into Suno and brings the file home. v1 app/playground/hunt/useHunt.ts
// `fileReturn` uploaded the take (POST /api/sound/takes) and then PATCHed the hunt's whole node
// list in a second request - a return could land as a take nobody's leaf pointed at. Here the take
// is filed, the leaf points at it (heard, its error cleared) and one `hunt.returned` event is
// recorded, keyed by the operator's op id: a retried upload finds the take it filed and appends
// nothing twice. What the leaf asked for travels with the take (its terms, tempo, key, loop), so
// the ledger counts a returned leaf along the same terms as a rendered one - v1's own reason.
//
// The bytes come through ../hunt-return/route.ts (a route, not an action: a WAV is tens of MB).
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { appendOnce } from "@gt/kernel/ingest";
import type { Store } from "@gt/kernel/store";
import { loopOf } from "@gt/ui/components/audio/hunt.ts";

import { HUNT_OP_RE } from "../../../../lib/sound/huntRender.ts";
import { readHunts, SoundError, withStore } from "../../../../lib/sound/store.ts";
import { createTake, type IncomingFile } from "../../../../lib/sound/takes.ts";
import type { Hunt, HuntNode, SoundTake } from "../../../../lib/sound/types.ts";

export type LeafReturnInput = { readonly huntId: string; readonly nodeId: string; readonly opId: string; readonly file: IncomingFile };
export type LeafReturned = { readonly take: SoundTake; readonly created: boolean; readonly recorded: boolean };

const STATUS: Readonly<Record<number, "invalid" | "not-found" | "conflict">> = { 400: "invalid", 404: "not-found", 409: "conflict", 413: "invalid" };

async function guarded<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SoundError) return err(STATUS[e.status] ?? "unavailable", e.message);
    return err("unavailable", e instanceof Error ? e.message : String(e), { cause: e });
  }
}

/** Why `node` takes no file back, or null when it does: a leaf on the map, sent by hand to Suno. */
export function returnProblem(hunt: Hunt, node: HuntNode | undefined, nodeId: string): string | null {
  if (node === undefined || node.prompt === "" || hunt.nodes.some((n) => n.parentId === node.id)) return `${nodeId} is not a leaf of this hunt`;
  if (node.provider === "elevenlabs") return `${node.label} renders through the receipt; a file comes back only for a leaf sent to Suno by hand`;
  if (node.provider !== "suno") return `${node.label} is a ${node.provider} leaf; a file comes back only for a leaf sent to Suno`;
  return null;
}

export async function fileLeafReturn(kernel: Store, input: LeafReturnInput, actor: Actor, now: Date): Promise<Result<LeafReturned>> {
  if (!HUNT_OP_RE.test(input.opId)) return err("invalid", "a return carries the operator's op id");
  const read = await guarded(async () => ok((await readHunts()).hunts.find((h) => h.id === input.huntId)));
  if (!read.ok) return read;
  const hunt = read.value;
  if (hunt === undefined) return err("not-found", `no hunt ${input.huntId}`);
  const node = hunt.nodes.find((n) => n.id === input.nodeId);
  const problem = returnProblem(hunt, node, input.nodeId);
  if (problem !== null || node === undefined) return err("refused", problem ?? `${input.nodeId} is not a leaf of this hunt`);
  const made = await guarded(async () =>
    ok(
      await createTake(
        {
          id: `hr-${input.opId}`,
          kind: hunt.kind,
          title: node.label,
          provider: "suno",
          op: "manual",
          origin: "suno-return",
          technique: [...node.technique],
          prompt: node.prompt,
          negative: node.negative,
          terms: { genre: [...node.terms.genre], mood: [...node.terms.mood], instrument: [...node.terms.instrument], sfxCategory: node.terms.sfxCategory },
          tempoBpm: hunt.kind === "sfx" ? null : node.tempoBpm,
          key: hunt.kind === "sfx" ? null : node.key,
          loop: hunt.kind === "sfx" ? loopOf(node) : null,
          huntId: hunt.id,
          nodeId: node.id,
        },
        input.file,
        now,
      ),
    ),
  );
  if (!made.ok) return made;
  const take = made.value.take;
  // The take may be another leaf's (an op id replayed against a different leaf): never re-point it.
  if (take.huntId !== hunt.id || take.nodeId !== node.id) return err("conflict", `op ${input.opId} already filed ${take.id} for another leaf`);
  const linked = await guarded(() =>
    withStore(async (tx): Promise<Result<true>> => {
      const n = (await tx.get("hunts")).hunts.find((h) => h.id === hunt.id)?.nodes.find((x) => x.id === node.id);
      if (n === undefined) return err("not-found", `leaf ${node.id} left hunt ${hunt.id} while its file came back`);
      if (n.takeIds.includes(take.id) && n.state === "rendered") return ok(true);
      n.takeIds = [...n.takeIds.filter((x) => x !== take.id), take.id];
      n.state = "rendered";
      n.error = null;
      tx.touch("hunts");
      return ok(true);
    }),
  );
  if (!linked.ok) return err(linked.error.code, `the take is filed (${take.id}); the leaf did not take it: ${linked.error.message} - return it again`);
  const ev = kernel.tx((t) => appendOnce(t, { actor, type: "hunt.returned", lane: "audio", key: `audio-hunt:${input.opId}`, subject: { kind: "hunt", id: hunt.id }, data: { node: node.id, take: take.id, label: node.label, file: input.file.name } }));
  if (!ev.ok) return err(ev.error.code, `the leaf took its file, the event log did not: ${ev.error.message} - return it again to record it`);
  return ok({ take, created: made.value.created, recorded: ev.value.appended });
}
