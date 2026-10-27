// The direction pass is a PROPOSAL, not a write. These cases pin the pure core
// (direction/plan.ts): what a pass would change is computed as typed ops, a
// human-touched layer is a conflict whose default is keep, a partial accept
// leaves every other frame byte-identical, and a checkpoint reverts exactly.
import { test, expect } from "@playwright/test";
import {
  acceptProposal,
  applyOps,
  planFromSpecs,
  revertPass,
  revertRow,
} from "@/lib/frames/directionPlan";
import { isStalePlate, type Frame } from "@/lib/frames/frames";
import type { SceneSpec } from "@/lib/frames/sceneSpec";
import { addDirectionSpend, landDirection } from "@/lib/frames/direction";

const frame = (n: number, over: Partial<Frame> = {}): Frame =>
  ({
    id: `fr-${n}`,
    at: `0:0${n}`,
    atS: n,
    kind: "evidence",
    title: `beat ${n}`,
    line: "",
    plate: { state: "ready", subject: "A", renderedSubject: "A", src: "x.png" },
    clip: { status: "not-started", motion: "" },
    elements: [{ id: `e-${n}-0`, kind: "arrow", label: "old", x: 1, y: 2, w: 3, h: 4, by: "seed" }],
    texts: [{ id: `t-${n}-0`, role: "figure", value: "42", x: 6, y: 40, factId: "f-ath", by: "human" }],
    ...over,
  }) as Frame;

const spec = (n: number, over: Partial<SceneSpec> = {}): SceneSpec => ({
  beatAt: `0:0${n}`,
  subject: "B: a wide field of small blocks drifting",
  motion: "the cluster slides out",
  rationale: "new",
  elements: [{ kind: "bar", label: "new", x: 50, y: 50, w: 10, h: 10 }],
  texts: [{ role: "figure", value: "99", x: 7, y: 41 }],
  ...over,
});

const cut = () => [frame(1), frame(2), frame(3), frame(4)];
const snap = (fs: Frame[]) => JSON.stringify(fs);

test("direction-proposal: planning writes nothing", () => {
  const fs = cut();
  const before = snap(fs);
  planFromSpecs(fs, [spec(1), spec(3)]);
  expect(snap(fs)).toBe(before);
});

test("direction-proposal: a human-bound factId survives a spec that omits it", () => {
  const fs = cut();
  const p = planFromSpecs(fs, [spec(2)]);
  const out = acceptProposal(fs, p, "all").frames;
  const fig = out[1].texts.find((t) => t.role === "figure")!;
  expect(fig.factId).toBe("f-ath");
  expect(p.units[0].conflicts.length).toBeGreaterThan(0);
});

test("direction-proposal: accepting row 3 only leaves every other frame byte-identical", () => {
  const fs = cut();
  const p = planFromSpecs(fs, [spec(1), spec(2), spec(3), spec(4)]);
  const out = acceptProposal(fs, p, new Set(["0:03"])).frames;
  for (const i of [0, 1, 3]) expect(JSON.stringify(out[i])).toBe(JSON.stringify(fs[i]));
  expect(out[2].plate.subject).toBe("B: a wide field of small blocks drifting");
  expect(out[2].rationale).toBe("new");
});

test("direction-proposal: a moved element is a conflict and the default apply keeps it", () => {
  const fs = cut();
  fs[0].elements[0] = { ...fs[0].elements[0], x: 77, by: "human" };
  const p = planFromSpecs(fs, [spec(1)]);
  expect(p.units[0].conflicts.some((c) => c.layer === "element")).toBe(true);
  const out = applyOps(fs[0], p.units[0].ops, "keep");
  expect(out.elements.find((e) => e.id === "e-1-0")?.x).toBe(77);
  expect(out.elements.some((e) => e.label === "new")).toBe(true);
  // Overwrite is the explicit opt-in.
  const over = applyOps(fs[0], p.units[0].ops, "overwrite");
  expect(over.elements.some((e) => e.id === "e-1-0")).toBe(false);
});

test("direction-proposal: revert last pass restores the pre-accept cut exactly; per-row revert too", () => {
  const fs = cut();
  const p = planFromSpecs(fs, [spec(1), spec(2), spec(3)]);
  const { frames, checkpoint } = acceptProposal(fs, p, "all");
  expect(snap(frames)).not.toBe(snap(fs));
  expect(snap(revertPass(frames, checkpoint))).toBe(snap(fs));
  const one = snap(revertRow(frames, checkpoint, "0:02"));
  expect(JSON.stringify(JSON.parse(one)[1])).toBe(JSON.stringify(fs[1]));
  expect(JSON.parse(one)[0].rationale).toBe("new");
});

test("direction-proposal: a re-subjected plate is stale", () => {
  const fs = cut();
  const p = planFromSpecs(fs, [spec(1)]);
  const out = acceptProposal(fs, p, "all").frames[0];
  expect(out.plate.renderedSubject).toBe("A");
  expect(out.plate.subject).toBe("B: a wide field of small blocks drifting");
  expect(isStalePlate(out)).toBe(true);
  expect(isStalePlate(fs[1])).toBe(false);
});

/* ── landing a settled pass (lib/frames/direction.ts) ── */

const scene = (at: string, over: Record<string, unknown> = {}) => ({
  beatAt: at,
  subject: "a wide field of small blocks, one cluster drifting away",
  motion: "the cluster slides out to the right",
  rationale: "r",
  elements: [],
  texts: [],
  ...over,
});

test("direction-landing: findings go to their rows, an invented beat to the summary, and the summary says proposed", () => {
  // 0:01 and 0:02 land, 0:03 is refused (a figure citing nothing), 0:04 never
  // arrives, and "9:99" is a beat the engine made up.
  const raw = JSON.stringify({
    scenes: [scene("0:01"), scene("0:02"), scene("0:03", { texts: [{ role: "figure", value: "9", x: 1, y: 1 }] }), scene("9:99")],
  });
  const landing = landDirection(raw, cut(), []);
  expect(landing.specs.map((x) => x.beatAt)).toEqual(["0:01", "0:02"]);
  expect(Object.keys(landing.rejections).sort()).toEqual(["0:03", "0:04"]);
  expect(landing.rejections["0:04"]).toBe("The pass returned no scene for this beat.");
  expect(landing.notice).toBe(
    '2 of 4 beats directed · 1 rejected · 1 with no scene returned. The reasons are on those rows; every other beat is in the proposal. The engine also invented "9:99".',
  );
  // A whole pass has no summary at all.
  expect(landDirection(JSON.stringify({ scenes: cut().map((f) => scene(f.at)) }), cut(), []).notice).toBeNull();
  // Nothing usable: nothing was proposed, and the invented beat is still named once.
  expect(landDirection(JSON.stringify({ scenes: [scene("9:99")] }), cut(), []).notice).toBe(
    '0 of 4 beats directed · 4 with no scene returned. Nothing was proposed. The engine also invented "9:99".',
  );
});

test("direction-landing: an unpriced pass is counted, never read as free", () => {
  const one = addDirectionSpend(null, { costUsd: 0.4, durationMs: 1200 }, 10);
  expect(one).toEqual({ runs: 1, costUsd: 0.4, unpriced: 0, lastMs: 1200, lastAt: 10 });
  const two = addDirectionSpend(one, { costUsd: Number.NaN }, 20);
  expect(two).toEqual({ runs: 2, costUsd: 0.4, unpriced: 1, lastMs: undefined, lastAt: 20 });
  expect(addDirectionSpend(two, undefined, 30).unpriced).toBe(2);
});
