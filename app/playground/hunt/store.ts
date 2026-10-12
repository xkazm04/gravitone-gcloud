// THE HUNT, SQUARED WITH THE STORE — reconciles a stored hunt with the takes
// filed against it. The only part of the model that reads takes. Separate for
// that reason.

import type { Hunt, SoundTake } from "@/lib/sound/types";

/* ── the hunt, squared with the store ─────────────────────────────────── */

/**
 * A hunt as stored, squared with the takes that exist. A take filed against a
 * node (huntId + nodeId) that the node does not list yet — a render that
 * finished after the page that asked for it was closed — is attached. A node
 * left `rendering` with no take was interrupted; it reads as failed with that
 * reason, locally, so it can be rendered again rather than spin forever.
 */
export function reconcile(
  h: Hunt,
  takes: readonly Pick<SoundTake, "id" | "huntId" | "nodeId">[],
): Hunt {
  const mine = takes.filter((t) => t.huntId === h.id);
  if (!mine.length && !h.nodes.some((n) => n.state === "rendering")) return h;
  const nodes = h.nodes.map((n) => {
    const found = mine.filter((t) => t.nodeId === n.id).map((t) => t.id);
    const ids = [
      ...n.takeIds,
      ...found.filter((id) => !n.takeIds.includes(id)),
    ];
    if (ids.length && n.state !== "rendered")
      return { ...n, takeIds: ids, state: "rendered" as const, error: null };
    if (!ids.length && n.state === "rendering")
      return {
        ...n,
        state: "failed" as const,
        error: "interrupted before a take came back",
      };
    return ids.length !== n.takeIds.length ? { ...n, takeIds: ids } : n;
  });
  return { ...h, nodes };
}
