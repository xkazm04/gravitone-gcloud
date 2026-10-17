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
