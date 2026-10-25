import { describe, expect, it } from "vitest";

import { NAV_TOOLS, arrived, hereOf, sectionHref, studioPath } from "../../app/(studio)/_shell/agentNav.ts";
import { SECTIONS, sectionOf } from "../../app/(studio)/_shell/nav.ts";

describe("the studio's in-page navigation tools (athena page bridge)", () => {
  it("declares every tool reversible with no side effects, so Athena's gate classifies it AUTO", () => {
    expect(NAV_TOOLS.map((t) => t.name)).toEqual(["where_am_i", "go_to", "open"]);
    for (const t of NAV_TOOLS) expect(t.athena).toEqual({ reversible: true, side_effects: "none" });
    expect(NAV_TOOLS.find((t) => t.name === "where_am_i")?.annotations.readOnlyHint).toBe(true);
  });

  it("go_to names exactly the built sections, and each resolves to its address", () => {
    const go = NAV_TOOLS.find((t) => t.name === "go_to");
    const ids = SECTIONS.filter((s) => s.built).map((s) => s.id);
    expect((go?.inputSchema["properties"] as { section: { enum: string[] } }).section.enum).toEqual(ids);
    expect(sectionHref("runs")).toBe("/projects/runs");
    expect(sectionHref("nowhere")).toBeUndefined();
  });

  it("open admits studio addresses and the mcp door's view links", () => {
    for (const p of ["/floor", "/projects/pj_1", "/projects/runs?job=job_9", "/board/pkt:spend:2026-10-24", "/board/pkt%3Ascout%3A2026-10-23", "/library?sel=lib_3", "/ledger?ev=42"]) {
      expect(studioPath(p)).toEqual({ ok: true, path: p });
    }
  });

  it("open refuses another origin, a protocol, a path outside every section, and a non-string", () => {
    for (const p of ["//evil.example/floor", "https://evil.example/floor", "javascript:alert(1)", "/api/mcp", "/settings", "floor", "/floor\n", "/floor?x=<b>"]) {
      expect(studioPath(p).ok).toBe(false);
    }
    expect(studioPath(42).ok).toBe(false);
  });

  it("open refuses a dot segment, which the browser resolves out of the section the guard read", () => {
    // Each passes the section / Board test as written and lands on /api/... once the URL is resolved.
    for (const p of ["/projects/../api/session", "/projects/%2e%2e/api/session", "/kit/.%2E/api/mcp", "/board/pkt:a:b/../../api/mcp", "/floor/./x", "/ledger/..?ev=1"]) {
      expect(studioPath(p).ok, p).toBe(false);
    }
    expect(studioPath(`/floor?${"a".repeat(400)}`).ok).toBe(false);
  });

  it("sectionOf: the longest section on a segment boundary, and the scout's Board packets are Scout's", () => {
    expect(sectionOf("/projects/runs")).toBe("runs");
    expect(sectionOf("/projects/runs/x")).toBe("runs");
    expect(sectionOf("/projects/pj_1")).toBe("projects");
    // A prefix that is not a whole segment is not the section (the header's aria-current, open's guard).
    expect(sectionOf("/projectsx")).toBeNull();
    expect(sectionOf("/floorplan")).toBeNull();
    expect(sectionOf("/board/pkt:scout:2026-10-23")).toBe("scout");
    expect(sectionOf("/board/pkt%3Aseeds%3Ab1")).toBe("scout");
    expect(sectionOf("/board/pkt:forge:r1")).toBeNull();
    expect(sectionOf("/")).toBeNull();
  });

  it("answers the section an address is in", () => {
    expect(hereOf("/projects/runs?job=j", "Runs", null)).toEqual({ path: "/projects/runs?job=j", section: "runs", heading: null, title: "Runs" });
  });

  it("counts a page's own added query as arrived, never another path or a changed value", () => {
    expect(arrived("/ledger", "/ledger?ev=34")).toBe(true);
    expect(arrived("/projects/runs?job=j1", "/projects/runs?job=j1&zoom=day")).toBe(true);
    expect(arrived("/projects/runs?job=j1", "/projects/runs?job=j2")).toBe(false);
    expect(arrived("/library", "/ledger")).toBe(false);
  });
});
