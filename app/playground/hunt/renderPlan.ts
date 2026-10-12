// THE RENDER PLAN — what "render the selection" will do: which leaves render,
// which go by hand, which are unreachable, which are already settled, and the
// seconds of audio the render will request. Separate because it reads the
// provider reach, not the board.

import type { HuntNode, ProviderId } from "@/lib/sound/types";

/* ── the render plan ───────────────────────────────────────────────────── */

/** How a provider is reached in this deployment (app/playground/engines.ts#Transport). */
export type Reach = "api" | "manual" | "none";

export interface RenderPlan {
  /** ElevenLabs leaves that will be rendered, in board order. */
  render: HuntNode[];
  /** Suno leaves — a manual round trip each, not a render. */
  byHand: HuntNode[];
  /** Leaves whose engine is declared but not installed, or withheld here. */
  unreachable: HuntNode[];
  /** Selected leaves that already have a take, or are rendering now. */
  settled: HuntNode[];
  /** Seconds of audio the render will request — the one exact link of the price. */
  seconds: number;
}

/**
 * What "render the selection" will actually do. Only an `api` leaf in state
 * `idea` or `failed` spends; a rendered leaf is not rendered twice by a
 * selection (re-rendering is a deliberate act on the leaf itself), and a
 * leaf already in flight is not queued again.
 */
export function renderPlan(
  nodes: readonly HuntNode[],
  selected: readonly string[],
  reach: (p: ProviderId) => Reach,
): RenderPlan {
  const plan: RenderPlan = {
    render: [],
    byHand: [],
    unreachable: [],
    settled: [],
    seconds: 0,
  };
  const want = new Set(selected);
  for (const n of nodes) {
    if (!want.has(n.id)) continue;
    const r = reach(n.provider);
    if (n.state === "rendered" || n.state === "rendering") plan.settled.push(n);
    else if (r === "manual") plan.byHand.push(n);
    else if (r === "none") plan.unreachable.push(n);
    else plan.render.push(n);
  }
  plan.seconds = secondsOf(plan.render);
  return plan;
}

/** Total seconds of audio, to a tenth — an SFX leaf can be half a second. */
export const secondsOf = (nodes: readonly Pick<HuntNode, "durationS">[]) =>
  Math.round(
    nodes.reduce(
      (a, n) =>
        a + (Number.isFinite(n.durationS) && n.durationS > 0 ? n.durationS : 0),
      0,
    ) * 10,
  ) / 10;
