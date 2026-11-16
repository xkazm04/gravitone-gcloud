// WHAT A COVER'S RIGHTS COMPUTE TO (spark track-mirror-studio WP2): lib/sound/cover/rights.ts is the one place, and
// it never answers publishable - the takes come from CC BY-NC weights whatever the source's declaration.
import { describe, expect, it } from "vitest";

import { COVER_RIGHTS } from "@gt/domain/cover";

import { coverRights, exportWarning, YUE2_WEIGHTS } from "../../lib/sound/cover/rights.ts";

describe("coverRights", () => {
  it("never answers publishable, for any declaration, with or without a holder and a note", () => {
    for (const r of COVER_RIGHTS) {
      for (const [holder, note] of [[undefined, undefined], ["Label Co", "sync licence 2026-11"]] as const) {
        const out = coverRights(r, holder, note);
        expect(out.use, r).not.toBe("publishable");
        expect(out.note).toContain(YUE2_WEIGHTS);
        if (note !== undefined) expect(out.note).toContain(note);
        if (holder === undefined) expect(out).not.toHaveProperty("holder");
        else expect(out.holder).toBe(holder);
      }
    }
  });

  it("an uncleared third-party song is reference-only; a declared one is unknown", () => {
    expect(coverRights("third-party-uncleared").use).toBe("reference-only");
    expect(coverRights("own").use).toBe("unknown");
    expect(coverRights("licensed").use).toBe("unknown");
  });
});

describe("exportWarning", () => {
  it("is stated only for an uncleared song", () => {
    expect(exportWarning("third-party-uncleared")).toContain(YUE2_WEIGHTS);
    expect(exportWarning("own")).toBeUndefined();
    expect(exportWarning("licensed")).toBeUndefined();
  });
});
