import { describe, expect, it } from "vitest";

import { v1BoardTarget } from "../../app/(studio)/board/redirect.ts";

// v1's Board addresses (lib/board/url.ts `?src=&st=&i=`) go where their work is now: an item
// to the packet its run became, a source to its lane on the Floor, anything else to the Floor.
describe("a v1 Board address", () => {
  it("an item opens the packet its run became", () => {
    expect(v1BoardTarget({ src: "cull", i: "cull:2026-10-13-rooftop::sc0/haze--ref--s0" })).toBe("/board/pkt%3Aforge%3A2026-10-13-rooftop");
    expect(v1BoardTarget({ i: "dojo:2026-10-14-rim::rim" })).toBe("/board/pkt%3Adojo%3A2026-10-14-rim");
    expect(v1BoardTarget({ i: "extract:moodboard::look-3" })).toBe("/board/pkt%3Aextract%3Amoodboard");
    expect(v1BoardTarget({ i: "articles:run_42" })).toBe("/board/pkt%3Aarticle%3Arun_42");
    expect(v1BoardTarget({ src: "cull", item: "cull:r1::c" })).toBe("/board/pkt%3Aforge%3Ar1");
  });

  it("a source alone opens its lane; the research triage and the unknown open the Floor", () => {
    expect(v1BoardTarget({ src: "articles" })).toBe("/floor?lane=article");
    expect(v1BoardTarget({ src: "publish" })).toBe("/floor?cal=1");
    expect(v1BoardTarget({ src: "triage", i: "triage:scope::x" })).toBe("/floor");
    expect(v1BoardTarget({ i: "cull:no-separator" })).toBe("/floor");
    expect(v1BoardTarget({})).toBe("/floor");
  });

  // v1's Board sources, as lib/board/sources/ held them at the cutover (ed151a11^, less the two
  // helper modules projects.ts and foundryErrors.ts): each lands where its work waits now.
  it("every v1 source alone opens its lane", () => {
    const lanes: Readonly<Record<string, string>> = {
      cull: "/floor?lane=image",
      extract: "/floor?lane=image",
      dojo: "/floor?lane=image",
      proof: "/floor?lane=image",
      adoption: "/floor?lane=image",
      alternative: "/floor?lane=image",
      articles: "/floor?lane=article",
      audio: "/floor?lane=audio",
      publish: "/floor?cal=1",
      triage: "/floor",
    };
    for (const [src, to] of Object.entries(lanes)) expect([src, v1BoardTarget({ src })]).toEqual([src, to]);
  });
});
