import { describe, expect, it } from "vitest";

import { MUSE_REQUEST_MAX, parseIdeasRequest, SCOUT_REQUEST_MAX } from "../src/scout-ideas/define.ts";

// The ideas request's door (spark scout-muse WP2; spark scout-vision S3): each idea carries its aspect and its own
// studio quality (a character, or an idea that casts one, draws at low); a legacy muse-wing request named its wing
// and one batch-wide quality and may draw up to 50, and still parses; a scout request reads exactly as before and
// stays at 40. The bound job is tests/next-server/scout-muse-idea.test.ts and scout-characters.test.ts.

const estimates = { idea: { seconds: 45, usd: null, unpricedReason: "studio credits, prepaid" } };
const ideas = (n: number, aspect?: string) => Array.from({ length: n }, (_, i) => ({ candidateId: `c-${String(i + 1).padStart(2, "0")}`, prompt: "p", ...(aspect === undefined ? {} : { aspect }) }));
const at = (raw: unknown): string => {
  const r = parseIdeasRequest(raw);
  return r.ok ? "ok" : r.error.message;
};

describe("the ideas request", () => {
  it("reads a scout request with no wing, quality or aspect, as it was written before the wings", () => {
    const r = parseIdeasRequest({ nightId: "2026-10-23", ideas: ideas(3), estimates, by: "op" });
    expect(r.ok && r.value).toEqual({ nightId: "2026-10-23", ideas: ideas(3), estimates, by: "op" });
  });

  it("caps a scout request at 40 and a muse request at 50", () => {
    expect(at({ nightId: "n", ideas: ideas(SCOUT_REQUEST_MAX), estimates, by: "op" })).toBe("ok");
    expect(at({ nightId: "n", ideas: ideas(SCOUT_REQUEST_MAX + 1), estimates, by: "op" })).toBe("ideas request: ideas: a scout-wing request draws at most 40 ideas");
    expect(at({ nightId: "n", wing: "muse", ideas: ideas(MUSE_REQUEST_MAX), estimates, by: "op" })).toBe("ok");
    expect(at({ nightId: "n", wing: "muse", ideas: ideas(MUSE_REQUEST_MAX + 1), estimates, by: "op" })).toMatch(/^ideas request: ideas: /);
  });

  it("carries each idea's own quality beside the next one's default, and refuses a quality it does not know", () => {
    const asks = [{ candidateId: "c-01", prompt: "p" }, { candidateId: "c-02", prompt: "p", aspect: "9:16", quality: "low" }];
    const r = parseIdeasRequest({ nightId: "n", ideas: asks, estimates, by: "op" });
    expect(r.ok && r.value.ideas.map((i) => i.quality)).toEqual([undefined, "low"]);
    expect(r.ok && "wing" in r.value).toBe(false);
    expect(at({ nightId: "n", ideas: [{ candidateId: "c-01", prompt: "p", quality: "high" }], estimates, by: "op" })).toMatch(/^ideas request: ideas\.0\.quality: /);
  });

  it("carries a legacy muse request's wing, quality and aspects; refuses a wing, quality or aspect it does not know", () => {
    const r = parseIdeasRequest({ nightId: "n", wing: "muse", quality: "low", ideas: ideas(2, "4:5"), estimates, by: "op" });
    expect(r.ok && [r.value.wing, r.value.quality, r.value.ideas.map((i) => i.aspect)]).toEqual(["muse", "low", ["4:5", "4:5"]]);
    expect(at({ nightId: "n", wing: "scout", ideas: ideas(1), estimates, by: "op" })).toMatch(/^ideas request: wing: /);
    expect(at({ nightId: "n", quality: "high", ideas: ideas(1), estimates, by: "op" })).toMatch(/^ideas request: quality: /);
    expect(at({ nightId: "n", ideas: ideas(1, "2:3"), estimates, by: "op" })).toMatch(/^ideas request: ideas\.0\.aspect: /);
  });
});
