import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { LINEAGE_GROUPS } from "@gt/kernel/library/core";
import type { LibraryCard } from "@gt/ui/components/library/LibraryTile.tsx";

import { libraryFor, runsJobFor, subjectLink } from "../../app/(studio)/_shell/links.ts";
import { reread } from "../../app/(studio)/library/_library/blocks.ts";
import { LINEAGE_FILTERS, parseUrl, queryOf, toSearch } from "../../app/(studio)/library/_library/url.ts";
import { fixtureDetail, fixtureMadeBy, fixtureQuery } from "../../app/(studio)/library/_port/fixture.ts";
import { buildCorpus } from "../../app/(studio)/library/_port/fixtureCorpus.ts";
import { CUT_JOBS } from "../../app/(studio)/library/_port/fixtureData.ts";

// LINEAGE BOTH WAYS (spark fable-ten, package D): a job is linked to Runs by the key Runs selects
// bars with, "what this job made" is the Library's own facet grammar, and a door is drawn only to
// a target that exists - a job the fixture's Runs holds, a filter that holds items.

const params = (href: string): Record<string, string | string[]> => {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of new URL(href, "http://x").searchParams) {
    const have = out[k];
    out[k] = have === undefined ? v : [...(Array.isArray(have) ? have : [have]), v];
  }
  return out;
};

describe("a job links to its bar in Runs, keyed as Runs keys it", () => {
  it("a kernel job (no key on its event) is `kernel:<id>`", () => {
    expect(subjectLink({ subject: { kind: "job", id: "job:run:r-1" }, data: {} }).href).toBe("/projects/runs?job=kernel%3Ajob%3Arun%3Ar-1");
  });
  it("a v1 queue's job is keyed under the source that keyed its event", () => {
    expect(subjectLink({ subject: { kind: "job", id: "j-77" }, key: "suno:j-77:start.1", data: {} }).href).toBe("/projects/runs?job=suno%3Aj-77");
    expect(subjectLink({ subject: { kind: "job", id: "j-9" }, key: "mv:j-9:end.2.done", data: {} }).href).toBe("/projects/runs?job=mv%3Aj-9");
  });
  it("an id that already carries its source is not given it twice", () => {
    expect(runsJobFor("kernel:job:part:p:cut")).toBe("/projects/runs?job=kernel%3Ajob%3Apart%3Ap%3Acut");
    expect(runsJobFor("job:part:p:cut")).toBe(runsJobFor("kernel:job:part:p:cut"));
  });
});

describe("what a job or a run made is the Library's own facet grammar", () => {
  it("round-trips through the Library's address, for any kind", () => {
    for (const [group, value] of [["job", "job:part:glass-harbor-trailer:cut"], ["run", "2026-10-23-2"]] as const) {
      const u = parseUrl(params(libraryFor(group, value)));
      expect(u.f).toEqual({ [group]: [value] });
      expect(`/library?${toSearch(u)}`).toBe(libraryFor(group, value));
      expect(parseUrl({ ...params(libraryFor(group, value)), kind: "video" }).f).toEqual({ [group]: [value] });
    }
  });
  it("the client's lineage filters are the kernel's lineage groups", () => {
    expect(LINEAGE_FILTERS).toEqual(LINEAGE_GROUPS);
  });
  it("returns the job's items on the fixture side, and the count the door is drawn from", () => {
    const job = CUT_JOBS["prj-glass-harbor"] ?? "";
    const made = buildCorpus().filter((x) => x.raw.lineage?.some((l) => l.kind === "job" && l.id === job)).map((x) => x.raw.id);
    expect(made.length).toBeGreaterThan(0);
    const page = fixtureQuery(queryOf(parseUrl(params(libraryFor("job", job))), 0, 200));
    if (!page.ok) throw page.error;
    expect(page.value.items.map((r) => r.id).sort()).toEqual([...made].sort());
    expect(page.value.kindCounts.all).toBe(made.length);
    expect(fixtureMadeBy("job", job)).toBe(made.length);
  });
  it("a job that made nothing counts zero, so it gets no door", () => {
    expect(fixtureMadeBy("job", "job:part:why-bitcoin:script")).toBe(0);
  });
});

describe("a cut's job in its detail", () => {
  const firstOf = (project: string): string => buildCorpus().find((x) => x.raw.kind === "video" && x.f["project"]?.includes(project))?.raw.id ?? "";
  it("links to Runs while the fixture's Runs holds the job", () => {
    const d = fixtureDetail(firstOf("prj-glass-harbor"));
    if (!d.ok) throw d.error;
    expect(d.value.lineage[0]).toMatchObject({ role: "job", href: runsJobFor(CUT_JOBS["prj-glass-harbor"] ?? "") });
  });
  it("is text when no Runs holds it", () => {
    const d = fixtureDetail(firstOf("prj-signal-room"));
    if (!d.ok) throw d.error;
    expect(d.value.lineage[0]?.role).toBe("job");
    expect(d.value.lineage[0]?.href).toBeUndefined();
  });
});

describe("a re-read of the same result", () => {
  const card = (id: string): LibraryCard => ({ id, kind: "image", title: id, meta: "", state: "unjudged", source: "fixture", date: null, face: { kind: "designed", lead: "img", name: id, tail: "" }, chips: [] });
  const rows = new Map([
    [0, [card("a")]],
    [1, [card("b")]],
  ]);
  it("keeps the later blocks while the total stands (an act moved a mark)", () => {
    expect([...reread(rows, [card("a2")], false).keys()]).toEqual([0, 1]);
  });
  it("drops them when the total moved (rows landed, every later block shifted)", () => {
    const next = reread(rows, [card("new"), card("a")], true);
    expect([...next.keys()]).toEqual([0]);
    expect(next.get(0)?.map((c) => c.id)).toEqual(["new", "a"]);
  });
});
