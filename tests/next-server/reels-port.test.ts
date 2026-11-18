// spark reel-studio WP3: the /reels fixture universe covers every film stage, a row is its detail cut down, the
// review's pin arithmetic (time order, neighbours, marks) and the context column's walk.
import { describe, expect, it } from "vitest";

import { FILM_STAGES } from "../../lib/reel/film.ts";
import { fixtureReels, rowOf } from "../../app/(studio)/reels/_port/fixture.ts";
import { FIXTURE_REELS } from "../../app/(studio)/reels/_port/fixtureData.ts";
import { lengths, mb, sizes, verdictLook } from "../../app/(studio)/reels/_overview/facts.ts";
import { reelsRooms } from "../../app/(studio)/reels/_overview/rooms.ts";
import { marksOf, neighbour, pinnable } from "../../app/(studio)/reels/_review/pins.ts";

describe("/reels fixture side", () => {
  it("holds a reel at every film stage", () => {
    expect(new Set(FIXTURE_REELS.map((r) => r.stage))).toEqual(new Set(FILM_STAGES));
  });

  it("lists rows and finds a reel by slug, and nothing for an unknown one", async () => {
    const rows = await fixtureReels.listReels();
    expect(rows.map((r) => r.slug)).toEqual(FIXTURE_REELS.map((r) => r.slug));
    expect((await fixtureReels.reel("towers-of-light"))?.title).toBe("Towers of Light");
    expect(await fixtureReels.reel("nope")).toBeUndefined();
  });

  it("a row carries no detail-only field and omits what is absent", () => {
    const idea = FIXTURE_REELS.find((r) => r.stage === "idea");
    if (idea === undefined) throw new Error("no idea reel");
    const row = rowOf(idea);
    expect(Object.keys(row)).not.toContain("media");
    expect(Object.keys(row)).not.toContain("seconds");
    expect(row.strip).toEqual([]);
  });

  it("a film to judge or release carries the sha its verdict must be of", () => {
    for (const r of FIXTURE_REELS.filter((x) => x.stage === "review" || x.stage === "release")) {
      const key = r.stage === "review" ? "film" : "release";
      expect(r.subjectSha?.[key], r.slug).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("/reels figures", () => {
  it("spells lengths and sizes desktop first, and nothing before a render", () => {
    expect(lengths({ seconds: { desktop: 96, phone: 48 } })).toBe("1:36 · 48 s");
    expect(lengths({})).toBeUndefined();
    expect(sizes({ bytes: { desktop: 49_310_220, phone: 235_565_629 } })).toBe("49.3 MB · 236 MB");
    expect(mb(1_200_000_000)).toBe("1.2 GB");
    expect(verdictLook({ stop: "film", verdict: "reject", at: "x" })).toEqual({ label: "film redo", tone: "rose" });
  });
});

describe("the review's pins", () => {
  const pins = [
    { t: 5.1, reasons: ["accuracy"], text: "" },
    { t: 1.2, reasons: [], text: "small" },
    { t: 3.4, reasons: ["motion"], text: "fast" },
  ];

  it("walks to the neighbour of the playhead, in time order", () => {
    expect(neighbour(pins, 0, 1)?.t).toBe(1.2);
    expect(neighbour(pins, 1.2, 1)?.t).toBe(3.4);
    expect(neighbour(pins, 3.4, -1)?.t).toBe(1.2);
    expect(neighbour(pins, 5.1, 1)).toBeUndefined();
  });

  it("draws a mark per pin at its share of the film, none without a length", () => {
    expect(marksOf(pins, 10).map((m) => Math.round(m.at * 100) / 100)).toEqual([0.12, 0.34, 0.51]);
    expect(marksOf(pins, 10)[2]?.label).toBe("note at 0:05: accuracy");
    expect(marksOf(pins, 0)).toEqual([]);
  });

  it("a pin needs a reason or words", () => {
    expect(pinnable([], "  ")).toBe(false);
    expect(pinnable(["look"], "")).toBe(true);
    expect(pinnable([], "hold it")).toBe(true);
  });
});

describe("the reels' column", () => {
  it("lights the reel's stage in its walk; a redo sits at authoring", () => {
    const at = (stage: (typeof FILM_STAGES)[number]) => reelsRooms({ slug: "s", title: "S", stage }).stages?.find((s) => s.current)?.id;
    expect(at("review")).toBe("review");
    expect(at("redo")).toBe("authoring");
    expect(at("dropped")).toBe("review");
    expect(reelsRooms("all").stages).toBeNull();
  });
});
