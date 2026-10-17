// LANE — THE HUNT'S ARITHMETIC (static, pure).
//
// The Hunt (v1 app/playground/hunt, round 4; on the audio desk since Phase 6
// L65) draws a drafted map of variants, lets the operator select which leaves
// to spend on, and learns a lesson from the winners. Everything it decides
// before a click is pure (@gt/ui audio/hunt.ts and audio/lesson.ts; the brief a
// leaf sends is lib/sound/huntRender.ts), so it is driven here with no browser,
// no store and no fetch:
//
//   1. THE TREE. The drafter's node list may come rooted, root-less, or as
//      bare leaves carrying only an axis; all three normalise to columns, no
//      leaf is dropped (an orphaned parent, a cycle), and only leaves render.
//   2. (v1's canvas layout - boxes, edges, the marquee - went with the canvas:
//      the desk's map is columns in CSS and has no geometry to test.)
//   3. SELECTION. Click replaces, ctrl toggles, shift ranges in board order,
//      a branch pill takes or releases its whole branch.
//   4. THE RENDER PLAN. Only an api leaf that is not heard and not in flight
//      spends; Suno leaves are counted by hand, a declared-not-installed lane
//      is counted as such, and the seconds total is exact to a tenth.
//   5. THE BRIEF AND THE LESSON. A leaf's generate request carries origin
//      "hunt", the hunt and node ids and the tempo/key its prompt names; an
//      SFX "loop: no" is a one-shot; the hand-written lesson's evidence comes
//      off the map and its claim starts empty.

import { test, expect } from "@playwright/test";

import { buildTree, clickSelect, countsOf, lengthOf, loopOf, reconcile, renderPlan, secondsOf, sfxAnatomy, toggleGroup, type Reach } from "@gt/ui/components/audio/hunt.ts";
import { evidenceOf, handLesson } from "@gt/ui/components/audio/lesson.ts";
import { generateRequestFor } from "@/lib/sound/huntRender";
import type { Hunt, HuntNode } from "@/lib/sound/types";

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
  loop: null,
  terms: { genre: [], mood: [], instrument: [], sfxCategory: null },
  tempoBpm: null,
  key: null,
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
  node({
    id: "t1",
    parentId: "tempo",
    axis: "tempo",
    prompt: "underscore at 78 BPM in D minor",
    technique: ["single-sentence"],
    tempoBpm: 78,
    key: "D minor",
    terms: { genre: ["underscore"], mood: ["tense"], instrument: ["cello"], sfxCategory: null },
  }),
  node({ id: "t2", parentId: "tempo", axis: "tempo", prompt: "104 bpm, A♭ major", durationS: 45, tempoBpm: 104, key: "Ab major" }),
  node({ id: "pal", parentId: "root", axis: "palette" }),
  node({ id: "p1", parentId: "pal", axis: "palette", provider: "suno" }),
  node({ id: "p2", parentId: "pal", axis: "palette", provider: "local" }),
  node({ id: "p3", parentId: "pal", axis: "palette", state: "rendered", takeIds: ["tk"] }),
];

const reach = (p: string): Reach => (p === "elevenlabs" ? "render" : p === "suno" ? "hand" : "none");

test("tree: rooted, root-less and bare-leaf drafts all normalise, nothing dropped", () => {
  const rooted = buildTree(ROOTED);
  expect(rooted.root?.id).toBe("root");
  expect(rooted.columns.map((c) => c.id)).toEqual(["tempo", "pal"]);
  expect(rooted.leaves.map((l) => l.id)).toEqual(["t1", "t2", "p1", "p2", "p3"]);

  // Root-less: two parentless axes — no root node is invented.
  const rootless = buildTree(ROOTED.filter((n) => n.id !== "root").map((n) => (n.parentId === "root" ? { ...n, parentId: null } : n)));
  expect(rootless.root).toBeNull();
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

test("selection: click replaces, ctrl toggles, shift ranges, branch toggles", () => {
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
  // The node's FIELDS are the request, never its prompt text: terms travel
  // verbatim, and a prompt naming a tempo the node does not carry sends none
  // (an old hunt read with null defaults).
  expect(req.terms).toEqual({ genre: ["underscore"], mood: ["tense"], instrument: ["cello"], sfxCategory: null });
  expect(req.promptInfluence, "a hunt varies the brief, not the knob").toBe(null);
  const unfielded = node({ id: "old", prompt: "lofi at 90 BPM in C major" });
  expect(generateRequestFor(hunt, unfielded)).toMatchObject({ tempoBpm: null, key: null, terms: { genre: [], mood: [], instrument: [], sfxCategory: null } });

  const tap = node({ id: "tap", prompt: "event: confirm tap; material: thin glass; attack: sharp; space: close, dry; duration: 0.6s; loop: no" });
  const hum = node({ id: "hum", prompt: "event: hum; loop: yes", durationS: 8 });
  expect(sfxAnatomy(tap.prompt).map((a) => a.part)).toEqual(["event", "material", "attack", "space", "duration", "loop"]);
  expect(sfxAnatomy("a soft blip").length).toBe(0);
  expect(loopOf(tap)).toBe(false);
  expect(loopOf(hum)).toBe(true);
  expect(loopOf(node({ id: "x", technique: ["loop-seam-acceptance"] }))).toBe(true);
  const sfxReq = generateRequestFor({ id: "h2", kind: "sfx" }, tap);
  expect(sfxReq).toMatchObject({ op: "sfx", loop: false, tempoBpm: null, key: null });
  // The node's own loop flag outranks the prompt's words; an sfx request
  // never carries a tempo or key even if the node somehow does.
  const flagged = node({ id: "fl", prompt: "event: hum; loop: no", loop: true, tempoBpm: 120, key: "C major", terms: { genre: [], mood: [], instrument: [], sfxCategory: "ambiences" } });
  expect(loopOf(flagged)).toBe(true);
  expect(generateRequestFor({ id: "h2", kind: "sfx" }, flagged)).toMatchObject({
    loop: true,
    tempoBpm: null,
    key: null,
    terms: { sfxCategory: "ambiences" },
  });

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
  const r = reconcile(stored.id, stored.nodes, [{ id: "late", huntId: "h1", nodeId: "a" }]);
  expect(r[0]).toMatchObject({ state: "rendered", takeIds: ["late"] });
  expect(r[1]).toMatchObject({ state: "failed" });
  expect(reconcile(stored.id, [node({ id: "z" })], [])).toEqual([node({ id: "z" })]);

  const judged: Hunt = {
    ...stored,
    nodes: [
      node({ id: "ax" }),
      node({ id: "w", parentId: "ax", axis: "tempo", state: "rendered", takeIds: ["t-old", "t-w"], winner: true, technique: ["section-plan-as-the-brief"] }),
      node({ id: "l", parentId: "ax", axis: "tempo", state: "rendered", takeIds: ["t-l"], technique: ["section-plan-as-the-brief", "tag-list"] }),
      node({ id: "u", parentId: "ax", axis: "tempo" }),
    ],
  };
  const ev = evidenceOf(judged.nodes);
  expect(ev.heard.map((n) => n.id)).toEqual(["w", "l"]);
  expect(ev.axes).toEqual([{ axis: "tempo", n: 1 }]);
  expect(ev.techniques).toEqual([{ technique: "section-plan-as-the-brief", won: 1, lost: 1 }]);
  expect(ev.takeIds).toEqual(["t-w"]);
  const hand = handLesson(judged);
  expect(hand).toMatchObject({ source: "hunt", huntId: "h1", claim: "", provider: "elevenlabs", technique: ["section-plan-as-the-brief"] });
  expect(hand.evidence).toEqual({ n: 2, keepRate: 0.5, meanScore: null, takeIds: ["t-w"] });
  expect(countsOf(judged.nodes)).toEqual({ leaves: 3, rendered: 2, awaiting: 0, failed: 0, winners: 1 });
});
