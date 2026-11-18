import { describe, expect, it } from "vitest";

import { declaredFrames, lintFilm, notesMarkdown } from "../src/reel/brief.ts";
import { nextReelJobN, parseReelJobId, parseReelJobRequest, reelJobId, reelJobPlan, spreadFrames } from "../src/reel/define.ts";

// The four reel jobs' pure halves (spark reel-studio WP2): the ids a launch counts, the request door, the plan as the
// missing outputs, the frames stills are drawn at, the redo notes in time order and the film's check. The bound jobs
// are tests/next-server/reel-jobs.test.ts.

const seat = { seconds: 880, usd: null, unpricedReason: "the operator's seat" };
const local = { seconds: 10, usd: 0 };

describe("reel job ids", () => {
  it("count launches per kind per reel", () => {
    const ids = [reelJobId("reel-render", "strait", 1), reelJobId("reel-render", "strait", 2), reelJobId("reel-data", "strait", 5), reelJobId("reel-render", "other", 9)];
    expect(nextReelJobN("reel-render", "strait", ids)).toBe(3);
    expect(nextReelJobN("reel-author", "strait", ids)).toBe(1);
    expect(parseReelJobId("job:reel-render:strait:2")).toEqual({ kind: "reel-render", slug: "strait", n: 2 });
    expect(parseReelJobId("job:reel-render:strait:0")).toBeUndefined();
    expect(parseReelJobId("job:scout-reels:strait:1")).toBeUndefined();
  });
});

describe("the reel job request", () => {
  const render = { slug: "strait", kind: "reel-render", estimates: { stills: local, "render:desktop": local, "render:phone": local, thumbs: local }, by: "op" };

  it("plans the missing steps in order, and a seat step as unpriced credit", () => {
    const r = parseReelJobRequest(render);
    if (!r.ok) throw r.error;
    const booked = new Map([["render:desktop", { step: "render:desktop", value: {}, at: "x" }]]);
    expect(reelJobPlan(r.value, booked).map((s) => s.name)).toEqual(["stills", "render:phone", "thumbs"]);
    const d = parseReelJobRequest({ slug: "strait", kind: "reel-data", estimates: { data: seat }, by: "op", note: "use monthly data" });
    if (!d.ok) throw d.error;
    expect(reelJobPlan(d.value, new Map())[0]?.credit).toBe("the operator's seat");
  });

  it("refuses a request missing a step's estimate, or a note on the wrong kind", () => {
    expect(parseReelJobRequest({ ...render, estimates: { stills: local } }).ok).toBe(false);
    expect(parseReelJobRequest({ ...render, note: "x" }).ok).toBe(false);
    expect(parseReelJobRequest({ ...render, notes: [{ t: 1, reasons: [], text: "x" }] }).ok).toBe(false);
  });
});

describe("frames and notes", () => {
  it("spreads stills across the film, first and last included", () => {
    expect(spreadFrames(3000, 8)).toEqual([0, 428, 857, 1285, 1714, 2142, 2571, 2999]);
    expect(spreadFrames(1, 8)).toEqual([0]);
  });

  it("hands the redo pins in time order", () => {
    const md = notesMarkdown([{ t: 75.5, reasons: ["legibility"], text: "names too small" }, { t: 3, reasons: [], text: "hook lands late" }], "calmer");
    expect(md.indexOf("0:03.0")).toBeLessThan(md.indexOf("1:15.5"));
    expect(md).toContain("[legibility]: names too small");
    expect(md).toContain("calmer");
  });
});

describe("the film's check", () => {
  const mod = { name: "reel.js", text: "window.REEL = {}; window.renderFrameAt = () => {}; window.REEL_READY = true;" };
  const page = (name: string) => ({ name, text: `<script type="module" src="./reel.js"></script>` });

  it("passes two pages on one module at a length inside the band", () => {
    expect(lintFilm([page("reel.html"), page("reel-desktop.html"), mod], declaredFrames({ frames: 2400 }))).toEqual([]);
  });

  it("names a missing page, the clock, a remote load and a length outside 60-120 s", () => {
    const bad = { name: "reel.js", text: `${mod.text} const x = Math.random(); import("https://cdn.example/three.js");` };
    const f = lintFilm([page("reel.html"), bad], declaredFrames({ frames: 900 }));
    expect(f.some((x) => x.startsWith("reel-desktop.html is missing"))).toBe(true);
    expect(f.some((x) => x.includes("Math.random"))).toBe(true);
    expect(f.some((x) => x.includes("another origin"))).toBe(true);
    expect(f.some((x) => x.includes("1800 to 3600 frames"))).toBe(true);
  });
});
