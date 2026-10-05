// LANE — THE HUNT'S ARITHMETIC (static, pure).
//
// The Sound lab's Hunt module (app/playground/hunt, round 4) draws a drafted
// map of variants, lets the operator select which leaves to spend on, and
// learns a lesson from the winners. Everything it decides before a click is
// pure (app/playground/hunt/model.ts), so it is driven here with no browser,
// no store and no fetch:
//
//   1. THE TREE. The drafter's node list may come rooted, root-less, or as
//      bare leaves carrying only an axis; all three normalise to columns, no
//      leaf is dropped (an orphaned parent, a cycle), and only leaves render.
//   2. THE LAYOUT. Fixed cards, lines of `perLine`, every leaf boxed once
//      inside the board, no two cards overlapping, one edge into every node.
//   3. SELECTION. Click replaces, ctrl toggles, shift ranges in board order,
//      a branch pill takes or releases its whole branch, a marquee catches
//      what it touches.
//   4. THE RENDER PLAN. Only an api leaf that is not heard and not in flight
//      spends; Suno leaves are counted by hand, a declared-not-installed lane
//      is counted as such, and the seconds total is exact to a tenth.
//   5. THE BRIEF AND THE LESSON. A leaf's generate request carries origin
//      "hunt", the hunt and node ids and the tempo/key its prompt names; an
//      SFX "loop: no" is a one-shot; the hand-written lesson's evidence comes
//      off the map and its claim starts empty.

import { test, expect } from "@playwright/test";

import {
  DIMS,
  buildTree,
  clickSelect,
  countsOf,
  evidenceOf,
  generateRequestFor,
  handLesson,
  layoutTree,
  leavesPerLine,
  lengthOf,
  loopOf,
  marqueeHits,
  marqueeSelect,
  reconcile,
  renderPlan,
  secondsOf,
  sfxAnatomy,
  toggleGroup,
  type Reach,
} from "@/app/playground/hunt/model";
import type { Hunt, HuntNode, ProviderId } from "@/lib/sound/types";

const node = (o: Partial<HuntNode> & { id: string }): HuntNode => ({
  parentId: null,
  axis: "axis",
  label: o.id,
  rationale: "",
  provider: "elevenlabs",
  technique: [],
  prompt: "",
  negative: null,
  durationS: 30,
  state: "idea",
  takeIds: [],
  winner: false,
  error: null,
  ...o,
});

/** Rooted: one idea node, two axes, five leaves. */
const ROOTED: HuntNode[] = [
  node({ id: "root", axis: "idea" }),
  node({ id: "tempo", parentId: "root", axis: "tempo" }),
  node({ id: "t1", parentId: "tempo", axis: "tempo", prompt: "underscore at 78 BPM in D minor", technique: ["single-sentence"] }),
  node({ id: "t2", parentId: "tempo", axis: "tempo", prompt: "104 bpm, A♭ major", durationS: 45 }),
  node({ id: "pal", parentId: "root", axis: "palette" }),
  node({ id: "p1", parentId: "pal", axis: "palette", provider: "suno" }),
  node({ id: "p2", parentId: "pal", axis: "palette", provider: "local" }),
  node({ id: "p3", parentId: "pal", axis: "palette", state: "rendered", takeIds: ["tk"] }),
];

const reach = (p: ProviderId): Reach => (p === "elevenlabs" ? "api" : p === "suno" ? "manual" : "none");

test("tree: rooted, root-less and bare-leaf drafts all normalise, nothing dropped", () => {
  const rooted = buildTree(ROOTED);
  expect(rooted.rootNode?.id).toBe("root");
  expect(rooted.columns.map((c) => c.id)).toEqual(["tempo", "pal"]);
  expect(rooted.leaves.map((l) => l.id)).toEqual(["t1", "t2", "p1", "p2", "p3"]);

  // Root-less: two parentless axes — no root node is invented.
  const rootless = buildTree(ROOTED.filter((n) => n.id !== "root").map((n) => (n.parentId === "root" ? { ...n, parentId: null } : n)));
  expect(rootless.rootNode).toBeNull();
  expect(rootless.columns.map((c) => c.id)).toEqual(["tempo", "pal"]);
  expect(rootless.leaves).toHaveLength(5);

  // Bare leaves: gathered into one column per axis, in first-seen order.
  const bare = buildTree([node({ id: "a", axis: "tempo" }), node({ id: "b", axis: "mood" }), node({ id: "c", axis: "tempo" })]);
  expect(bare.columns.map((c) => [c.axis, c.rows.map((r) => r.id)])).toEqual([
    ["tempo", ["a", "c"]],
    ["mood", ["b"]],
  ]);

  // An orphan (parent missing) and a self-parent are drawn at the top, not lost;
  // a nested branch becomes a group row with its leaves beneath.
  const odd = buildTree([
    node({ id: "x", parentId: "ghost", axis: "lost" }),
    node({ id: "y", parentId: "y", axis: "lost" }),
    node({ id: "br", axis: "nest" }),
    node({ id: "sub", parentId: "br", axis: "nest" }),
    node({ id: "deep", parentId: "sub", axis: "nest" }),
  ]);
  expect(odd.leaves.map((l) => l.id).sort()).toEqual(["deep", "x", "y"]);
  const nest = odd.columns.find((c) => c.id === "br")!;
  expect(nest.rows.map((r) => [r.kind, r.id, r.depth])).toEqual([
    ["group", "sub", 0],
    ["leaf", "deep", 1],
  ]);
});

test("layout: every leaf boxed once, inside the board, none overlapping, an edge into each", () => {
  const tree = buildTree(ROOTED);
  for (const per of [1, 2, 3, 6]) {
    const l = layoutTree(tree, per);
    const leafBoxes = l.columns.flatMap((c) => c.rows.filter((r) => r.kind === "leaf"));
    expect(leafBoxes.map((b) => b.id).sort()).toEqual(tree.leaves.map((x) => x.id).sort());
    const all = [l.root, ...l.columns.map((c) => c.header), ...leafBoxes.map((b) => b.box)];
    for (const b of all) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(l.width + 0.001);
      expect(b.y + b.h).toBeLessThanOrEqual(l.height + 0.001);
    }
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlap, `boxes ${i} and ${j} overlap at perLine ${per}`).toBe(false);
      }
    // A line never holds more than perLine leaves.
    for (const c of l.columns) {
      const ys = new Map<number, number>();
      for (const r of c.rows) if (r.kind === "leaf") ys.set(r.box.y, (ys.get(r.box.y) ?? 0) + 1);
      for (const n of ys.values()) expect(n).toBeLessThanOrEqual(per);
    }
    const into = new Set(l.edges.map((e) => e.to));
    for (const leaf of tree.leaves) expect(into.has(leaf.id)).toBe(true);
    for (const c of tree.columns) expect(into.has(c.id)).toBe(true);
  }
  // The viewport decides only how many leaves a line holds.
  expect(leavesPerLine(0)).toBe(1);
  expect(leavesPerLine(100000)).toBe(6);
  const w3 = layoutTree(tree, 3).width;
  expect(leavesPerLine(w3)).toBe(3);
  expect(leavesPerLine(w3 - 1)).toBe(2);
  expect(DIMS.leafW).toBeGreaterThan(0);
});

test("selection: click replaces, ctrl toggles, shift ranges, branch toggles, marquee catches", () => {
  const order = ["a", "b", "c", "d", "e"];
  let s = clickSelect({ ids: [], anchor: null }, order, "b");
  expect(s).toEqual({ ids: ["b"], anchor: "b" });
  s = clickSelect(s, order, "d", { toggle: true });
  expect(s.ids).toEqual(["b", "d"]);
  s = clickSelect(s, order, "b", { toggle: true });
  expect(s.ids).toEqual(["d"]);
  s = clickSelect({ ids: ["a"], anchor: "b" }, order, "d", { shift: true });
  expect(s.ids).toEqual(["a", "b", "c", "d"]);
  expect(clickSelect(s, order, "zzz")).toBe(s);

  let g = toggleGroup({ ids: ["a"], anchor: "a" }, order, ["c", "d"]);
  expect(g.ids).toEqual(["a", "c", "d"]);
  g = toggleGroup(g, order, ["c", "d"]);
  expect(g.ids).toEqual(["a"]);

  const boxes = [
    { id: "a", box: { x: 0, y: 0, w: 10, h: 10 } },
    { id: "b", box: { x: 20, y: 0, w: 10, h: 10 } },
    { id: "c", box: { x: 0, y: 20, w: 10, h: 10 } },
  ];
  // A rectangle dragged up-and-left reads the same as one dragged down-and-right.
  expect(marqueeHits({ x: 25, y: 5, w: -20, h: 20 }, boxes)).toEqual(["a", "b", "c"]);
  expect(marqueeHits({ x: 15, y: 0, w: 2, h: 40 }, boxes)).toEqual([]);
  expect(marqueeSelect({ ids: ["e"], anchor: "e" }, order, ["c", "a"], true).ids).toEqual(["a", "c", "e"]);
  expect(marqueeSelect({ ids: ["e"], anchor: "e" }, order, ["c"], false).ids).toEqual(["c"]);
});

test("render plan: only unheard api leaves spend; suno by hand, local unreachable, seconds exact", () => {
  const nodes = [
    ...ROOTED,
    node({ id: "busy", state: "rendering" }),
    node({ id: "bad", state: "failed", error: "vendor refused", durationS: 0.6 }),
  ];
  const plan = renderPlan(nodes, ["t1", "t2", "p1", "p2", "p3", "busy", "bad", "nope"], reach);
  expect(plan.render.map((n) => n.id)).toEqual(["t1", "t2", "bad"]);
  expect(plan.byHand.map((n) => n.id)).toEqual(["p1"]);
  expect(plan.unreachable.map((n) => n.id)).toEqual(["p2"]);
  expect(plan.settled.map((n) => n.id)).toEqual(["p3", "busy"]);
  expect(plan.seconds).toBe(75.6);
  expect(renderPlan(nodes, [], reach).seconds).toBe(0);
  // A withheld api engine (reach "none") renders nothing.
  expect(renderPlan(nodes, ["t1"], () => "none").render).toEqual([]);
  expect(secondsOf([{ durationS: 0.5 }, { durationS: 0.6 }, { durationS: NaN }, { durationS: -3 }])).toBe(1.1);
  expect(lengthOf(0.6)).toBe("0.6s");
  expect(lengthOf(75)).toBe("1:15");
  expect(lengthOf(0)).toBe("–");
});

test("brief and lesson: the request a leaf makes, sfx anatomy, loop, reconcile, evidence", () => {
  const hunt = { id: "h1", kind: "music" as const };
  const req = generateRequestFor(hunt, ROOTED[2]);
  expect(req).toMatchObject({
    kind: "music",
    provider: "elevenlabs",
    op: "compose",
    origin: "hunt",
    huntId: "h1",
    nodeId: "t1",
    tempoBpm: 78,
    key: "D minor",
    loop: null,
    durationS: 30,
    technique: ["single-sentence"],
    title: "t1",
  });
  expect(generateRequestFor(hunt, ROOTED[3]).key).toBe("Ab major");

  const tap = node({ id: "tap", prompt: "event: confirm tap; material: thin glass; attack: sharp; space: close, dry; duration: 0.6s; loop: no" });
  const hum = node({ id: "hum", prompt: "event: hum; loop: yes", durationS: 8 });
  expect(sfxAnatomy(tap.prompt).map((a) => a.part)).toEqual(["event", "material", "attack", "space", "duration", "loop"]);
  expect(sfxAnatomy("a soft blip").length).toBe(0);
  expect(loopOf(tap)).toBe(false);
  expect(loopOf(hum)).toBe(true);
  expect(loopOf(node({ id: "x", technique: ["loop-seam-acceptance"] }))).toBe(true);
  const sfxReq = generateRequestFor({ id: "h2", kind: "sfx" }, tap);
  expect(sfxReq).toMatchObject({ op: "sfx", loop: false, tempoBpm: null, key: null });

  // A take filed against a node the list has not caught up with is attached;
  // a node stuck "rendering" with no take reads as interrupted.
  const stored: Hunt = {
    id: "h1",
    kind: "music",
    idea: "i",
    createdAt: "2026-10-05T00:00:00Z",
    draftedBy: null,
    lessonId: null,
    nodes: [node({ id: "a", state: "rendering" }), node({ id: "b", state: "rendering" })],
  };
  const r = reconcile(stored, [{ id: "late", huntId: "h1", nodeId: "a" }]);
  expect(r.nodes[0]).toMatchObject({ state: "rendered", takeIds: ["late"] });
  expect(r.nodes[1]).toMatchObject({ state: "failed" });
  expect(reconcile({ ...stored, nodes: [node({ id: "z" })] }, [])).toEqual({ ...stored, nodes: [node({ id: "z" })] });

  const judged: Hunt = {
    ...stored,
    nodes: [
      node({ id: "ax" }),
      node({ id: "w", parentId: "ax", axis: "tempo", state: "rendered", takeIds: ["t-old", "t-w"], winner: true, technique: ["section-plan-as-the-brief"] }),
      node({ id: "l", parentId: "ax", axis: "tempo", state: "rendered", takeIds: ["t-l"], technique: ["section-plan-as-the-brief", "tag-list"] }),
      node({ id: "u", parentId: "ax", axis: "tempo" }),
    ],
  };
  const ev = evidenceOf(judged);
  expect(ev.heard.map((n) => n.id)).toEqual(["w", "l"]);
  expect(ev.axes).toEqual([{ axis: "tempo", n: 1 }]);
  expect(ev.techniques).toEqual([{ technique: "section-plan-as-the-brief", won: 1, lost: 1 }]);
  expect(ev.takeIds).toEqual(["t-w"]);
  const hand = handLesson(judged);
  expect(hand).toMatchObject({ source: "hunt", huntId: "h1", claim: "", provider: "elevenlabs", technique: ["section-plan-as-the-brief"] });
  expect(hand.evidence).toEqual({ n: 2, keepRate: 0.5, meanScore: null, takeIds: ["t-w"] });
  expect(countsOf(judged)).toEqual({ leaves: 3, rendered: 2, awaiting: 0, failed: 0, winners: 1 });
});
