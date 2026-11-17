// THE CATALOG'S READING (spark studio-to-release WP1, app/(studio)/audio/_release/catalog/catalog.ts): a release
// stands where its own status puts it once scheduled or published, and before that is ready exactly when nothing
// blocks it; every card opens into the studio's package stage in the session it was born in (none: the studio with
// no session), on the side the catalog was read from.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ReleaseRecord } from "@gt/domain/release.record";

import { fixturePort } from "../../app/(studio)/audio/_release/_port/fixture.ts";
import { catalogOf, standingOf } from "../../app/(studio)/audio/_release/catalog/catalog.ts";
import { parseStudioUrl } from "../../app/(studio)/audio/studio/url.ts";

const records = async (): Promise<readonly ReleaseRecord[]> => (await fixturePort.read()).records;

describe("the catalog", () => {
  it("puts each fixture release in its column: the blocked single a draft, the EP ready, the album scheduled", async () => {
    const rs = await records();
    const cols = catalogOf(rs, "fixture");
    expect(Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v.map((c) => c.id)]))).toEqual({
      draft: ["rel-0000000000a1"],
      ready: ["rel-0000000000b2"],
      scheduled: ["rel-0000000000c3"],
      published: [],
    });
    expect(cols.draft[0]).toMatchObject({ title: "Dancing in the Static", kind: "single", tracks: 1, pending: 4 });
    expect(cols.draft[0]?.blocks).toBeGreaterThan(0);
  });

  it("reads ready from the problems, not from the stored status", async () => {
    const [single, ep] = await records();
    if (single === undefined || ep === undefined) throw new Error("fixture lost a release");
    expect(standingOf({ ...ep, release: { ...ep.release, status: "draft" } })).toBe("ready");
    expect(standingOf({ ...single, release: { ...single.release, status: "ready" } })).toBe("draft");
    expect(standingOf({ ...single, release: { ...single.release, status: "published" } })).toBe("published");
  });

  it("opens a card into the studio's package stage, in its session, on its side", async () => {
    const rs = await records();
    const fixture = catalogOf(rs, "fixture");
    const single = fixture.draft[0]?.href ?? "";
    expect(single).toBe("/audio?s=studio&session=night-drive&source=fixture&stage=package&r=rel-0000000000a1");
    const q = Object.fromEntries(new URLSearchParams(single.split("?")[1]));
    expect(parseStudioUrl(q)).toMatchObject({ session: "night-drive", source: "fixture", stage: "package", release: "rel-0000000000a1" });
    const real = catalogOf(rs, "real");
    expect(real.ready[0]?.href).toBe("/audio?s=studio&stage=package&r=rel-0000000000b2");
  });
});
