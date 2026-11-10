import { describe, expect, it } from "vitest";

import { destinations } from "../../app/(studio)/_shell/jump/resolve.ts";
import { SECTIONS } from "../../app/(studio)/_shell/nav.ts";

// Jump's rows (spark fable-ten, package C): a name finds its section or project, an id lands on
// the page its shape names through links.ts, and anything typed also offers its Ledger history -
// the one page that always renders - so no row is ever a dead route.

const PROJECTS = [
  { id: "prj-harbor", title: "Glass harbor noir · trailer" },
  { id: "prj-album", title: "Night shift · album" },
];
const first = (q: string) => destinations(q, SECTIONS, PROJECTS)[0];
const hrefs = (q: string) => destinations(q, SECTIONS, PROJECTS).map((d) => d.href);

describe("Jump resolves what was typed", () => {
  it("empty: the built sections in nav order, then the projects", () => {
    const rows = destinations("", SECTIONS, PROJECTS);
    expect(rows.map((r) => r.href)).toEqual([...SECTIONS.filter((s) => s.built).map((s) => s.href), "/projects/prj-harbor", "/projects/prj-album"]);
  });
  it("a section name, any case", () => {
    expect(first("libr")?.href).toBe("/library");
    expect(first("LEDGER")?.href).toBe("/ledger");
  });
  it("a project name goes to its Plan", () => {
    expect(first("harbor")).toEqual({ key: "project:prj-harbor", label: "Glass harbor noir · trailer", kind: "project", href: "/projects/prj-harbor" });
  });
  it("a packet id goes to its Board, and offers its Ledger history after", () => {
    expect(hrefs("pkt:seeds:2026-10-23-2")).toEqual(["/board/pkt%3Aseeds%3A2026-10-23-2", "/ledger?q=pkt%3Aseeds%3A2026-10-23-2"]);
    expect(first("  pkt:seeds:2026-10-23-2 ")?.kind).toBe("board");
  });
  it("a packet id pasted encoded out of a URL bar is the same packet", () => {
    expect(first("pkt%3Aseeds%3A2026-10-23-2")?.href).toBe("/board/pkt%3Aseeds%3A2026-10-23-2");
  });
  it("a kernel job id goes to its bar in Runs, keyed as Runs keys it (`kernel:<id>`)", () => {
    expect(first("job:run:2026-10-23-2")).toMatchObject({ label: "job:run:2026-10-23-2", kind: "runs", href: "/projects/runs?job=kernel%3Ajob%3Arun%3A2026-10-23-2" });
    expect(first("kernel:job:part:harbor/score")?.href).toBe("/projects/runs?job=kernel%3Ajob%3Apart%3Aharbor%2Fscore");
  });
  it("an unknown string is its Ledger query, never a guessed route", () => {
    expect(hrefs("2026-08-26-sweep-01")).toEqual(["/ledger?q=2026-08-26-sweep-01"]);
    expect(hrefs("pkt:")).toEqual(["/ledger?q=pkt%3A"]);
    expect(hrefs("job:")).toEqual(["/ledger?q=job%3A"]);
  });
  it("an unbuilt section is no destination", () => {
    const unbuilt = SECTIONS.map((s) => (s.id === "audio" ? { ...s, built: false } : s));
    expect(destinations("audio", unbuilt, []).map((d) => d.href)).toEqual(["/ledger?q=audio"]);
  });
});
