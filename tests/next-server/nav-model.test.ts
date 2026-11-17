// THE NAVIGATION TREE FROM THE ADDRESS (app/(studio)/_shell/navModel.ts; design baseline PLAN.md R5): every current
// item is the URL's, the stages hang only under compose, the kind switch only where a room reads one, and a tally is
// only what the page handed in.
import { describe, expect, it } from "vitest";

import { audioRooms, kitRooms } from "../../app/(studio)/_shell/navModel.ts";
import { KIT_GROUPS, SECTIONS as KIT_SECTIONS, sectionHref } from "../../app/(studio)/kit/sections.ts";

const cur = (xs: readonly { readonly id: string; readonly current: boolean }[] | null) => xs?.filter((x) => x.current).map((x) => x.id) ?? null;

describe("audioRooms", () => {
  it("the overview is the default room; it draws no stages and reads no kind", () => {
    const r = audioRooms({}, {});
    expect(cur(r.rooms)).toEqual(["overview"]);
    expect(r.stages).toBeNull();
    expect(r.kinds).toBeNull();
    expect(r.rooms).toHaveLength(11);
  });

  it("the rooms stand in the work's order: the overview alone, then make, refine, learn, ship", () => {
    const r = audioRooms({}, {});
    expect(r.groups.map((g) => [g.label, g.items.map((x) => x.id)])).toEqual([
      [null, ["overview"]],
      ["Make", ["compose", "cover", "hunt"]],
      ["Refine", ["arrange", "songlab", "rubric"]],
      ["Learn", ["strengths", "lessons", "batch"]],
      ["Ship", ["release"]],
    ]);
    expect(r.rooms.every((x) => /^[A-Z]/.test(x.label) && x.glyph !== undefined)).toBe(true);
  });

  it("compose (and its studio alias) draws its walk, make by default", () => {
    const r = audioRooms({ s: "studio" }, {});
    expect(cur(r.rooms)).toEqual(["compose"]);
    expect(cur(r.stages)).toEqual(["make"]);
    expect(r.kinds).toBeNull();
  });

  it("a stage link keeps the session and the release, and only the stage changes", () => {
    const r = audioRooms({ s: "studio", source: "fixture", session: "night-drive", stage: "package", r: "rel-0000000000a1" }, {});
    expect(cur(r.stages)).toEqual(["package"]);
    const release = r.stages?.find((x) => x.id === "release")?.href ?? "";
    expect(release).toContain("stage=release");
    expect(release).toContain("session=night-drive");
    expect(release).toContain("r=rel-0000000000a1");
  });

  it("a kinded room draws its kind and no stages; the kind link keeps the room", () => {
    const r = audioRooms({ s: "arrange", kind: "sfx" }, { arrange: { value: 3, label: "final" } });
    expect(cur(r.rooms)).toEqual(["arrange"]);
    expect(r.stages).toBeNull();
    expect(cur(r.kinds)).toEqual(["sfx"]);
    expect(r.kinds?.find((k) => k.id === "music")?.href).toContain("arrange");
    expect(r.rooms.find((x) => x.id === "arrange")?.tally).toEqual({ value: 3, label: "final" });
    expect(r.rooms.filter((x) => x.tally !== undefined)).toHaveLength(1);
  });
});

describe("kitRooms", () => {
  it("lists the kit's groups and nothing under them, the open one current, /kit the tokens", () => {
    const r = kitRooms("audio");
    expect(r.rooms.map((x) => x.id)).toEqual(KIT_GROUPS.map((g) => g.id));
    expect(cur(r.rooms)).toEqual(["audio"]);
    expect(r.stages).toBeNull();
    expect(r.kinds).toBeNull();
    expect(r.rooms.find((x) => x.id === "tokens")?.href).toBe("/kit");
    expect(r.rooms.find((x) => x.id === "audio")?.href).toBe("/kit/audio");
    expect(r.groups.flatMap((g) => g.items).length).toBe(KIT_GROUPS.length);
  });

  it("every section lives on a group's page, and its address is that page's anchor", () => {
    for (const s of KIT_SECTIONS) expect(KIT_GROUPS.some((g) => g.id === s.group), s.id).toBe(true);
    expect(sectionHref("songlab")).toBe("/kit/audio#songlab");
    expect(sectionHref("colour")).toBe("/kit#colour");
  });
});
