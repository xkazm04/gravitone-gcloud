// THE SCOUT PACKET'S CLIP CELL (lib/decision/v1/sources/scoutPlan.ts): a clip rendered on this
// box reads `5s · local · free` on the Board, from the engine its candidate records; a hosted clip,
// or one written before the engine was recorded, reads its length alone. Pure: `build` over a
// night held in memory, no store opened.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { build, clipMeta, textRef, type ScoutV1 } from "../../lib/decision/v1/sources/scoutPlan.ts";
import type { Night, SceneCandidate, SceneClip } from "../../lib/foundry/scout/types.ts";

const recipe = { shot: "wide", camera: "low angle, 24mm", motion: "slow push-in", composition: "lone figure on the left third", lighting: "hard key from frame left", palette: ["teal ground"], rhythm: "long holds", durationS: 4, prompt: "a wide low shot" } as const;
const clipOf = (extra: Record<string, unknown>): SceneClip => ({ path: "scenes/c-01/clip.mp4", durationS: 5, from: "scenes/c-01/replica-1.jpg", ...extra }) as SceneClip;

function v1(clip: SceneClip): ScoutV1 {
  const scene: SceneCandidate = { id: "c-01", kind: "scene", sourceIds: ["s-01"], status: "rendered", keyframes: ["sources/s-01/k-001.jpg"], recipe, replicas: ["scenes/c-01/replica-1.jpg"], clipRequested: true, clip };
  const night: Night = { id: "2026-10-22", startedAt: "2026-10-22T00:00:00.000Z", ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "closed", stop: "target", closedAt: "2026-10-22T05:00:00.000Z", sources: [], candidates: [scene], jobs: [] };
  const media = Object.fromEntries(["sources/s-01/k-001.jpg", "scenes/c-01/replica-1.jpg", "scenes/c-01/clip.mp4"].map((f) => [f, textRef(f)]));
  return { night, styles: {}, assets: {}, media, knowledge: {}, at: { scout: "foundry-out/scout", knowledge: "knowledge", mesh: "foundry-out/mesh" } };
}

const metaOf = (clip: SceneClip): string | undefined => build(v1(clip)).cells.find((c) => c.id === "c-01/clip")?.words.meta;

describe("the clip cell's meta", () => {
  it("reads 5s · local · free for a clip rendered on this box", () => {
    expect(metaOf(clipOf({ engine: "ltx-local", usd: 0 }))).toBe("5s · local · free");
  });

  it("reads its length alone for a hosted clip, and for one recorded before the engine was", () => {
    expect(metaOf(clipOf({ engine: "hailuo", usd: 1.2 }))).toBe("5s");
    expect(clipMeta(clipOf({}))).toBe("5s");
    // A price of zero is not provenance: only the engine says the clip was made here.
    expect(clipMeta(clipOf({ usd: 0 }))).toBe("5s");
  });
});
