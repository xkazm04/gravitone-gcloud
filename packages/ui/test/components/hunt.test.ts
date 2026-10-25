// The hunt's rules (Phase 6, L65), absorbed from v1 app/playground/hunt/model.ts and its probe
// (tests/golden-path/sound-hunt.probe.spec.ts, which keeps v1's cases on the new modules): what
// this file adds is what the desk upgraded - a render in flight is not an interruption, only a
// leaf renders, the crown's keep and its undo, the audition's step, and the drawn map.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { admitCrown, buildTree, headTake, INTERRUPTED, lengthOf, reconcile, renderPlan, type AuditionTake, type HuntLeafView } from "../../src/components/audio/hunt.ts";
import { carryFrom, HuntAudition, stepTake } from "../../src/components/audio/HuntAudition.tsx";
import { HuntMap } from "../../src/components/audio/HuntMap.tsx";
import { HuntShelf } from "../../src/components/audio/HuntShelf.tsx";
import { HuntRenderBar } from "../../src/components/audio/HuntRenderBar.tsx";

const leaf = (o: Partial<HuntLeafView> & { readonly id: string }): HuntLeafView => ({
  parentId: null,
  axis: "tempo",
  label: o.id,
  rationale: "",
  provider: "elevenlabs",
  technique: [],
  prompt: `prompt ${o.id}`,
  negative: null,
  durationS: 30,
  tempoBpm: null,
  key: null,
  loop: null,
  state: "idea",
  takeIds: [],
  winner: false,
  error: null,
  ...o,
});

const MAP: readonly HuntLeafView[] = [
  leaf({ id: "root", axis: "idea", prompt: "" }),
  leaf({ id: "br", parentId: "root", prompt: "" }),
  leaf({ id: "a", parentId: "br", state: "rendered", takeIds: ["t-a"], winner: true }),
  leaf({ id: "b", parentId: "br", state: "rendered", takeIds: ["t-b0", "t-b"] }),
  leaf({ id: "c", parentId: "br", provider: "suno", state: "awaiting-return" }),
  leaf({ id: "d", parentId: "br", state: "failed", error: "elevenlabs 422: section durations sum to 71 s, expected 60 s" }),
];

const take = (id: string, over: Partial<AuditionTake> = {}): AuditionTake => ({ id, title: id, src: `/f/${id}`, peaks: [0.2, 0.8, 0.4], lengthS: 30, verdict: "unjudged", stage: null, ...over });

describe("reconcile", () => {
  test("a leaf left rendering reads interrupted - unless its render is still in flight", () => {
    const nodes = [leaf({ id: "x", state: "rendering" })];
    expect(reconcile("h", nodes, [])[0]).toMatchObject({ state: "failed", error: INTERRUPTED });
    expect(reconcile("h", nodes, [], new Set(["x"]))[0]).toMatchObject({ state: "rendering", error: null });
  });

  test("a take filed against the leaf after its page closed is attached, from this hunt only", () => {
    const nodes = [leaf({ id: "x", state: "rendering" })];
    const r = reconcile("h", nodes, [
      { id: "late", huntId: "h", nodeId: "x" },
      { id: "other", huntId: "h2", nodeId: "x" },
    ]);
    expect(r[0]).toMatchObject({ state: "rendered", takeIds: ["late"], error: null });
  });
});

describe("the tree", () => {
  const drawn = (nodes: readonly HuntLeafView[]): string[] => {
    const t = buildTree(nodes);
    return [...(t.root === null ? [] : [t.root.id]), ...t.columns.flatMap((c) => [...(c.id.startsWith("axis:") ? [] : [c.id]), ...c.rows.map((r) => r.id)])].sort();
  };

  test("a parentId cycle is cut, never dropped: every node on it and under it is drawn", () => {
    expect(drawn([leaf({ id: "p", parentId: "q" }), leaf({ id: "q", parentId: "p" })])).toEqual(["p", "q"]);
    const hung = [...MAP, leaf({ id: "u", parentId: "w" }), leaf({ id: "v", parentId: "u" }), leaf({ id: "w", parentId: "v" }), leaf({ id: "under", parentId: "v" })];
    expect(drawn(hung)).toEqual(hung.map((n) => n.id).sort());
    expect(buildTree(hung).leaves.map((l) => l.id)).toContain("under");
  });
});

describe("a length", () => {
  test("one spelling either side of ten seconds: the tenth is taken before the threshold", () => {
    expect([9.94, 9.96, 10, 10.4].map(lengthOf)).toEqual(["9.9s", "0:10", "0:10", "0:10"]);
  });
});

describe("render plan", () => {
  test("only a leaf renders: a selected branch or root is never a unit", () => {
    const plan = renderPlan(MAP, ["root", "br", "d"], () => "render");
    expect(plan.render.map((n) => n.id)).toEqual(["d"]);
    expect(plan.seconds).toBe(30);
  });

  test("heard leaves are settled, a Suno leaf goes by hand", () => {
    const plan = renderPlan(MAP, ["a", "b", "c"], (p) => (p === "suno" ? "hand" : "render"));
    expect(plan.render).toEqual([]);
    expect(plan.settled.map((n) => n.id)).toEqual(["a", "b"]);
    expect(plan.byHand.map((n) => n.id)).toEqual(["c"]);
  });
});

describe("the crown", () => {
  const a = MAP.find((n) => n.id === "a") ?? leaf({ id: "a" });
  const b = MAP.find((n) => n.id === "b") ?? leaf({ id: "b" });

  test("a crown keeps an unjudged take and leaves a kept one as it is", () => {
    expect(admitCrown(b, { id: "t-b", verdict: "unjudged", stage: null }, true)).toEqual({ ok: true, keep: true, unkeep: false });
    expect(admitCrown(b, { id: "t-b", verdict: "kept", stage: "pending" }, true)).toEqual({ ok: true, keep: false, unkeep: false });
  });

  test("a crown never overrules a rejection, and names only the leaf's own takes", () => {
    const r = admitCrown(b, { id: "t-b", verdict: "rejected", stage: null }, true);
    expect(r.ok).toBe(false);
    expect(admitCrown(b, { id: "t-a", verdict: "unjudged", stage: null }, true).ok).toBe(false);
  });

  test("an uncrown reaches back only while the take still sits pending", () => {
    expect(admitCrown(a, { id: "t-a", verdict: "kept", stage: "pending" }, false)).toEqual({ ok: true, keep: false, unkeep: true });
    expect(admitCrown(a, { id: "t-a", verdict: "kept", stage: "remaster" }, false)).toEqual({ ok: true, keep: false, unkeep: false });
    expect(admitCrown(b, { id: "t-b", verdict: "kept", stage: "pending" }, false).ok).toBe(false);
  });
});

describe("the audition", () => {
  const heard = buildTree(MAP).leaves.filter((l) => l.state === "rendered");

  test("a leaf plays its newest take", () => {
    expect(headTake(heard[1] ?? leaf({ id: "z" }))).toBe("t-b");
  });

  const takes = { "t-a": take("t-a"), "t-b": take("t-b") };

  test("← and → step through the heard takes in board order, wrapping", () => {
    expect(stepTake(heard, null, 1, takes)).toBe("t-a");
    expect(stepTake(heard, null, -1, takes)).toBe("t-b");
    expect(stepTake(heard, "t-a", 1, takes)).toBe("t-b");
    expect(stepTake(heard, "t-b", 1, takes)).toBe("t-a");
    expect(stepTake([], null, 1, takes)).toBeUndefined();
  });

  test("a step passes over a take that cannot play, in both directions", () => {
    const three = buildTree([...MAP, leaf({ id: "e", parentId: "br", state: "rendered", takeIds: ["t-e"] })]).leaves.filter((l) => l.state === "rendered");
    const takes = { "t-a": take("t-a", { src: null }), "t-b": take("t-b"), "t-e": take("t-e") };
    expect(stepTake(three, "t-b", 1, takes)).toBe("t-e");
    expect(stepTake(three, "t-e", 1, takes)).toBe("t-b");
    expect(stepTake(three, "t-b", -1, takes)).toBe("t-e");
    expect(stepTake(three, null, 1, takes)).toBe("t-b");
    expect(stepTake(three, null, -1, takes)).toBe("t-e");
    const gone = { "t-b": take("t-b") };
    expect(stepTake(heard, "t-b", 1, gone)).toBe("t-b");
    expect(stepTake(heard, null, 1, { "t-a": take("t-a", { src: null }) })).toBeUndefined();
  });
});

describe("the audition carries the brief", () => {
  const asked = leaf({ id: "q", state: "rendered", takeIds: ["t-q"], durationS: 30, tempoBpm: 78, key: "D minor", loop: true });
  const plain = leaf({ id: "p", state: "rendered", takeIds: ["t-p"], durationS: 45 });
  const html = renderToStaticMarkup(h(HuntAudition, { heard: [asked, plain], takes: { "t-q": take("t-q", { lengthS: 28.4 }), "t-p": take("t-p") }, playing: null, crowning: new Set<string>(), onPlay: () => undefined, onCrown: () => undefined }));
  const card = (id: string): string => html.split(/(?=<div class="[^"]*" role="group" aria-label=")/).find((part) => part.includes(`aria-label="${id}"`)) ?? "";

  test("each take draws what its leaf asked for beside the length it measured: length, bpm, key, loop", () => {
    const q = card("q");
    expect(q).toMatch(/length<b[^>]*>0:30</);
    expect(q).toMatch(/bpm<b[^>]*>78</);
    expect(q).toMatch(/key<b[^>]*>D minor</);
    expect(q).toContain(">loop<");
    expect(q).toMatch(/heard<b[^>]*>0:28</);
  });

  test("a leaf that asked for no tempo, key or loop draws only its length", () => {
    const p = card("p");
    expect(p).toMatch(/length<b[^>]*>0:45</);
    expect(p).not.toMatch(/bpm|key<|loop/);
  });
});

describe("one playhead (L72)", () => {
  test("a step carries the playing take's second only while linked and only onto another take", () => {
    expect(carryFrom(true, "t-a", "t-b", 12.5)).toBe(12.5);
    expect(carryFrom(false, "t-a", "t-b", 12.5)).toBe(0);
    expect(carryFrom(true, null, "t-b", 12.5)).toBe(0);
    expect(carryFrom(true, "t-b", "t-b", 12.5)).toBe(0);
    expect(carryFrom(true, "t-a", "t-b", Number.NaN)).toBe(0);
  });
});

describe("drawn", () => {
  const props = {
    nodes: MAP,
    takes: { "t-a": take("t-a", { verdict: "kept", stage: "pending" }), "t-b": take("t-b") },
    selection: { ids: ["d"], anchor: "d" },
    reach: { elevenlabs: "render", suno: "hand", local: "none" } as const,
    playing: null,
    crowning: new Set<string>(),
    onPick: () => undefined,
    onBranch: () => undefined,
    onPlay: () => undefined,
    onCrown: () => undefined,
    onCopy: () => undefined,
    returning: new Set<string>(),
    onReturn: () => undefined,
  };

  test("the map draws a heard leaf's play and crown, a failure's words, a Suno leaf's copy", () => {
    const html = renderToStaticMarkup(h(HuntMap, props));
    expect(html).toContain('aria-label="play b"');
    expect(html).toContain(">Uncrown<");
    expect(html).toContain(">Crown<");
    expect(html).toContain("elevenlabs 422: section durations sum to 71 s, expected 60 s");
    expect(html).toContain(">Copy prompt<");
    // A Suno leaf takes its file back on its own card (L72); an ElevenLabs leaf never does.
    expect(html).toContain('aria-label="return the Suno file for c"');
    expect(html.match(/return the Suno file for/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*><span[^>]*><\/span><span[^>]*>d</);
  });

  test("each leaf's Crown and Copy prompt, on the map and in the audition, sit in a group named for the leaf", () => {
    const acts = (html: string): [string, string[]][] =>
      html.split(/(?=role="group" aria-label=")/).flatMap((part) => {
        const name = /^role="group" aria-label="([^"]*)"/.exec(part)?.[1];
        return name === undefined ? [] : [[name, [...part.matchAll(/>(Crown|Uncrown|Copy prompt)</g)].map((m) => m[1] ?? "")]];
      });
    expect(acts(renderToStaticMarkup(h(HuntMap, props)))).toEqual([["hunt map", []], ["a", ["Uncrown"]], ["b", ["Crown"]], ["c", ["Copy prompt"]], ["d", []]]);
    const heard = buildTree(MAP).leaves.filter((l) => l.state === "rendered");
    const aud = renderToStaticMarkup(h(HuntAudition, { heard, takes: props.takes, playing: null, crowning: new Set<string>(), onPlay: () => undefined, onCrown: () => undefined }));
    expect(acts(aud)).toEqual([["audition", []], ["a", ["Uncrown"]], ["b", ["Crown"]]]);
  });

  test("the render bar counts the seconds and disarms with nothing to render", () => {
    const none = renderToStaticMarkup(h(HuntRenderBar, { plan: renderPlan(MAP, ["a"], () => "render"), picked: 1, busy: false, liveBlock: null, onRender: () => undefined, onClear: () => undefined }));
    expect(none.match(/aria-disabled="true"/g)?.length).toBe(1);
    const one = renderToStaticMarkup(h(HuntRenderBar, { plan: renderPlan(MAP, ["d"], () => "render"), picked: 1, busy: false, liveBlock: "no ELEVENLABS key", onRender: () => undefined, onClear: () => undefined }));
    expect(one).not.toContain('aria-disabled="true"');
    expect(one).toContain("live off: no ELEVENLABS key");
  });

  test("the render bar counts a leaf in flight as rendering, not as heard", () => {
    const nodes = [...MAP, leaf({ id: "busy", parentId: "br", state: "rendering" })];
    const bar = (ids: readonly string[]): string => renderToStaticMarkup(h(HuntRenderBar, { plan: renderPlan(nodes, ids, () => "render"), picked: ids.length, busy: false, liveBlock: null, onRender: () => undefined, onClear: () => undefined }));
    const busy = bar(["busy"]);
    expect(busy).not.toMatch(/>heard<b/);
    expect(busy).toMatch(/>rendering<b[^>]*>1<\/b>/);
    const both = bar(["a", "b", "busy"]);
    expect(both).toMatch(/>heard<b[^>]*>2<\/b>/);
    expect(both).toMatch(/>rendering<b[^>]*>1<\/b>/);
  });

  test("a shelf card names its hunt in words beside the pips", () => {
    const html = renderToStaticMarkup(h(HuntShelf, { hunts: [{ id: "h1", idea: "a vault bed", createdAt: "2026-10-01T00:00:00Z", counts: { leaves: 4, rendered: 2, awaiting: 1, failed: 1, winners: 1 }, lessonId: null, mini: [{ axis: "tempo", leaves: [{ state: "rendered", winner: true }] }] }], open: "h1", hrefOf: (id) => `/audio?s=hunt&h=${id}` }));
    // The meta under the pips is aria-hidden, so the name carries every count it draws.
    expect(html).toContain('aria-label="a vault bed · 2 of 4 heard · 1 crowned · 1 failed"');
    expect(html).toContain('aria-current="page"');
  });
});
