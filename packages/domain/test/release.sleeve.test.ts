import { describe, expect, it } from "vitest";

import { parseSleeveRequest, SLEEVE_TAKES_MAX, sleeveCheck, type SleeveAsk } from "../src/release.sleeve.ts";

// The sleeve takes' ask and request (spark studio-to-release WP3), pure: an empty prompt is refused, the count is held
// to 1..SLEEVE_TAKES_MAX, and a priced provider is refused under GRAVITONE_DRY_ONLY while Codex runs dry there. The
// bound launch is tests/next-server/release-sleeve.test.ts.

const ask = (o: Partial<SleeveAsk> = {}): SleeveAsk => ({ releaseId: "rel-0000000000a1", prompt: "Rain on marble steps at night", provider: "codex", takes: 4, ...o });

describe("sleeveCheck", () => {
  it("refuses an empty or blank prompt in words, and trims a kept one", () => {
    for (const prompt of ["", "   \n "]) {
      const r = sleeveCheck(ask({ prompt }), { dryOnly: false });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toBe("sleeve takes need a prompt");
    }
    const kept = sleeveCheck(ask({ prompt: "  a lyre of light  " }), { dryOnly: false });
    expect(kept.ok && kept.value.prompt).toBe("a lyre of light");
  });

  it("holds the count to 1..max", () => {
    expect(sleeveCheck(ask({ takes: 0 }), { dryOnly: false }).ok).toBe(false);
    expect(sleeveCheck(ask({ takes: SLEEVE_TAKES_MAX + 1 }), { dryOnly: false }).ok).toBe(false);
    expect(sleeveCheck(ask({ takes: 1 }), { dryOnly: false }).ok).toBe(true);
    expect(sleeveCheck(ask({ takes: SLEEVE_TAKES_MAX }), { dryOnly: false }).ok).toBe(true);
  });

  it("refuses Leonardo under dry-only, keeps Codex there, and lets Leonardo through a live box", () => {
    const r = sleeveCheck(ask({ provider: "leonardo" }), { dryOnly: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("refused");
      expect(r.error.message).toContain("GRAVITONE_DRY_ONLY=1 refuses a priced run");
    }
    expect(sleeveCheck(ask({ provider: "codex" }), { dryOnly: true }).ok).toBe(true);
    expect(sleeveCheck(ask({ provider: "leonardo" }), { dryOnly: false }).ok).toBe(true);
  });
});

describe("the sleeve request", () => {
  const base = { releaseId: "rel-0000000000a1", prompt: "a lyre of light", provider: "leonardo", takes: 4, estimates: { take: { seconds: 20, usd: 0.0154 } }, by: "op" };
  it("takes a checked request and refuses a blank prompt, a release id that is not one, and an unknown provider", () => {
    expect(parseSleeveRequest(base).ok).toBe(true);
    expect(parseSleeveRequest({ ...base, prompt: "  " }).ok).toBe(false);
    expect(parseSleeveRequest({ ...base, releaseId: "rel-1" }).ok).toBe(false);
    expect(parseSleeveRequest({ ...base, provider: "google" }).ok).toBe(false);
  });
});
