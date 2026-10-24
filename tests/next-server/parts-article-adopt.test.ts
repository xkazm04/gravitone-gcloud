import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ok, type Result } from "@gt/domain/errors";
import type { PartView } from "@gt/domain/partView";
import { blobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { listAdoptable, readAdoptable } from "../../lib/articles/adoptable.ts";
import { explainerSectionsOf, sectionsOf } from "../../lib/articles/sections.ts";
import { sectionsOf as boardSectionsOf } from "../../lib/decision/v1/sources/article.ts";
import { makeRealPart } from "../../app/(studio)/projects/[id]/_part/real.ts";
import { loadPart, opPart, resetParts, undoPart } from "../../app/(studio)/projects/[id]/_part/fixture.ts";

// AN EXPLAINER ADOPTS A FINISHED ARTICLE - the posts this machine holds (final article runs and the
// registry's publications, lib/articles/adoptable.ts), the explainer's cut of a post
// (lib/articles/sections.ts), and the `article-adopt` op on both sides: the real side reads the
// post before its transaction and logs its address and digest, never its text; undo appends the
// prior record; an id that names no final post is refused with a sentence.

const dirs: string[] = [];
const temp = (prefix: string): string => {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const ENV = ["ARTICLES_STORE_DIR", "AI_REGISTRY_DIR"] as const;
const saved = new Map<string, string | undefined>(ENV.map((k) => [k, process.env[k]]));
afterAll(() => {
  for (const [k, v] of saved) if (v === undefined) delete process.env[k];
  else process.env[k] = v;
});

const POST = `# The landed post

*A subtitle the writer gave it.*

An opening paragraph before any heading.

## Why it matters

Because it does.

\`\`\`md
## not a heading
still the fence
\`\`\`

## Why it matters

Said again, differently.

## ???

A heading that slugs to nothing.

## Sources

1. A source.
`;

const put = (file: string, text: string): void => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};

/** A store with one landed run and one at the gate; a registry with one publication. */
function seed(): { store: string; registry: string } {
  const store = temp("gt-adopt-runs-");
  const registry = temp("gt-adopt-reg-");
  const run = (id: string, status: string): void => {
    put(path.join(store, id, "run.json"), JSON.stringify({ id, status, createdAt: `${id.slice(0, 10)}T10:00:00Z`, updatedAt: `${id.slice(0, 10)}T10:00:00Z`, topic: { kind: "free", text: id }, steps: [] }));
    put(path.join(store, id, "post", "post.md"), POST);
    put(path.join(store, id, "post", "meta.json"), JSON.stringify({ title: `${id} title`, subtitle: "", tags: [] }));
  };
  run("2026-10-20-landed", "landed");
  run("2026-10-21-at-gate", "awaiting-approval");
  put(path.join(registry, "recipes", "index.json"), "{}");
  mkdirSync(path.join(registry, "knowledge"), { recursive: true });
  put(path.join(registry, "publications", "the-published-one", "post.md"), "# The published one\n\nIts opening.\n\n## A section\n\nIts body.\n");
  put(path.join(registry, "publications", "the-published-one", "publication.json"), JSON.stringify({ schema: "publication/1", title: "The published one", status: "approved" }));
  return { store, registry };
}

beforeAll(() => {
  const s = seed();
  process.env["ARTICLES_STORE_DIR"] = s.store;
  process.env["AI_REGISTRY_DIR"] = s.registry;
});

describe("the posts this machine may adopt", () => {
  it("lists the landed run and the publication, never a run still at the gate", async () => {
    const list = await listAdoptable();
    expect(list.map((p) => [p.source, p.id, p.status])).toEqual([
      ["run", "2026-10-20-landed", "landed"],
      ["publication", "the-published-one", "approved"],
    ]);
    expect(list[0]).toMatchObject({ title: "2026-10-20-landed title", sections: 4 });
    expect(list[1]).toMatchObject({ title: "The published one", sections: 2, words: 4 });
  });

  it("refuses to read a run at the gate, and an unknown id, each with its sentence", async () => {
    await expect(readAdoptable("run", "2026-10-21-at-gate")).rejects.toThrow("article run 2026-10-21-at-gate is awaiting-approval; only an approved post is adopted");
    await expect(readAdoptable("publication", "no-such-post")).rejects.toThrow("no publication no-such-post");
    await expect(readAdoptable("run", "../escape")).rejects.toThrow('not a run id: "../escape"');
  });

  it("a machine with no store and no registry has nothing to adopt, and says so by an empty list", async () => {
    const was = { s: process.env["ARTICLES_STORE_DIR"], r: process.env["AI_REGISTRY_DIR"] };
    process.env["ARTICLES_STORE_DIR"] = path.join(temp("gt-adopt-none-"), "absent");
    process.env["AI_REGISTRY_DIR"] = temp("gt-adopt-noreg-");
    try {
      expect(await listAdoptable()).toEqual([]);
    } finally {
      process.env["ARTICLES_STORE_DIR"] = was.s;
      process.env["AI_REGISTRY_DIR"] = was.r;
    }
  });
});

describe("the explainer's cut of a post", () => {
  it("is Opening plus the real headings: a fence keeps its `## `, a repeat is suffixed, Sources is dropped", () => {
    const cut = explainerSectionsOf(POST);
    expect(cut.map((x) => [x.id, x.heading])).toEqual([
      ["opening", "Opening"],
      ["why-it-matters", "Why it matters"],
      ["why-it-matters-2", "Why it matters"],
      ["s4", "???"],
    ]);
    expect(cut[0]?.body).toBe("*A subtitle the writer gave it.*\n\nAn opening paragraph before any heading.");
    expect(cut[1]?.body).toBe("Because it does.\n\n```md\n## not a heading\nstill the fence\n```");
  });

  it("names a later `## Opening` apart from the opening, and keeps a post with no opening", () => {
    expect(explainerSectionsOf("# T\n\n## Opening\n\nx").map((x) => x.id)).toEqual(["opening"]);
    expect(explainerSectionsOf("# T\n\nlead\n\n## Opening\n\nx").map((x) => x.id)).toEqual(["opening", "opening-2"]);
    expect(explainerSectionsOf("~~~\n## fenced\n~~~\n").map((x) => [x.id, x.body])).toEqual([["opening", "~~~\n## fenced\n~~~"]]);
  });

  it("the Board's cut is the same function it always was, read from its new home", () => {
    expect(boardSectionsOf).toBe(sectionsOf);
    expect(sectionsOf(POST).map((x) => x.id)).toEqual(["Opening", "Why it matters", "not a heading", "Why it matters (2)", "???", "Sources"]);
  });
});

/* ── the op on the real side ──────────────────────────────────────────────── */

let open: Kernel[] = [];
afterEach(() => {
  for (const k of open) k.close();
  open = [];
});
const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-10-24T09:00:00Z");

function universe(id: string): { store: Store; port: ReturnType<typeof makeRealPart> } {
  const dir = temp("gt-adopt-k-");
  const k = openKernel(path.join(dir, "k.sqlite"));
  if (!k.ok) throw k.error;
  open.push(k.value);
  const store = k.value.store;
  const c = compose(store, { recipe: "explainer" }, OP, { id });
  if (!c.ok) throw c.error;
  return { store, port: makeRealPart({ store: () => ok(store), now: () => NOW, gates: { store: () => ok(store), blobs: () => blobStore(path.join(dir, "blobs")), now: () => NOW } }) };
}

async function must<T>(p: Result<T> | Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}
type Outcome = { kind: "applied"; view: PartView } | { kind: "conflict"; current: PartView };
async function applied(r: Result<Outcome> | Promise<Result<Outcome>>): Promise<PartView> {
  const o = await must(r);
  if (o.kind !== "applied") throw new Error("expected applied, got conflict");
  return o.view;
}
const article = (v: PartView) => (v.kind === "article" ? v.data : null);

describe("article-adopt on the real side", () => {
  it("adopts a landed run's sections and names it; the log keeps the address and digest; undo restores", async () => {
    const { store, port } = universe("x1");
    const empty = await must(port.loadPart({ projectId: "x1", key: "article" }));
    expect(article(empty)?.adoptable.map((p) => p.id)).toEqual(["2026-10-20-landed", "the-published-one"]);
    expect(article(empty)).toMatchObject({ title: null, sections: [] });
    expect(article(empty)?.from).toBeUndefined();

    const pub = await applied(port.opPart({ projectId: "x1", key: "article", baseRev: empty.rev, op: { op: "article-adopt", source: "publication", id: "the-published-one" } }));
    expect(article(pub)).toMatchObject({ title: "The published one", sections: [{ id: "opening" }, { id: "a-section" }], from: { source: "publication", id: "the-published-one" } });

    const runAdopt = await applied(port.opPart({ projectId: "x1", key: "article", baseRev: pub.rev, op: { op: "article-adopt", source: "run", id: "2026-10-20-landed" } }));
    const d = article(runAdopt);
    expect(d?.title).toBe("2026-10-20-landed title");
    expect(d?.sections.map((x) => x.id)).toEqual(["opening", "why-it-matters", "why-it-matters-2", "s4"]);
    expect(d?.steps).toEqual([]);
    expect(d?.from).toMatchObject({ source: "run", id: "2026-10-20-landed" });
    expect(d?.from?.sha).toMatch(/^[0-9a-f]{64}$/);
    expect(runAdopt.verdict).toEqual({ state: "ready", codes: [{ code: "article-written", text: `4 sections · ${d?.words} words` }] });

    // The ARTICLE record holds the sections' markdown and `from`.
    const rec = await must(store.read((r) => r.get("SELECT data FROM part_records WHERE project_id = ? AND key = 'article'", "x1")));
    const data = JSON.parse(String(rec?.["data"])) as { sections: { id: string; body: string }[]; from: unknown };
    expect(data.sections[1]?.body).toContain("## not a heading");
    expect(data.from).toEqual(d?.from);

    // The op log row holds the op, the address and the digest - not the post it adopted.
    const rows = await must(store.read((r) => r.all("SELECT op, writes FROM part_ops WHERE project_id = ? AND part_id = ? ORDER BY n", "x1", "x1/article")));
    const last = rows[rows.length - 1];
    expect(JSON.parse(String(last?.["op"]))).toEqual({ op: "article-adopt", source: "run", id: "2026-10-20-landed", postSha: d?.from?.sha });
    expect(String(last?.["op"])).not.toContain("Because it does");
    expect(String(last?.["writes"])).not.toContain("Because it does");

    const back = await applied(port.undoPart({ projectId: "x1", key: "article", baseRev: runAdopt.rev }));
    expect(article(back)).toMatchObject({ title: "The published one", from: { source: "publication", id: "the-published-one" } });
    expect(article(back)?.adoptable).toHaveLength(2);
  });

  it("refuses an id that names no final post, with a sentence, and writes nothing", async () => {
    const { port } = universe("x2");
    const v = await must(port.loadPart({ projectId: "x2", key: "article" }));
    const gate = await port.opPart({ projectId: "x2", key: "article", baseRev: v.rev, op: { op: "article-adopt", source: "run", id: "2026-10-21-at-gate" } });
    expect(gate.ok ? "" : [gate.error.code, gate.error.message]).toEqual(["refused", "article run 2026-10-21-at-gate is awaiting-approval; only an approved post is adopted"]);
    const unknown = await port.opPart({ projectId: "x2", key: "article", baseRev: v.rev, op: { op: "article-adopt", source: "run", id: "2026-01-01-nothing" } });
    expect(unknown.ok ? "" : [unknown.error.code, unknown.error.message]).toEqual(["invalid", "no article run 2026-01-01-nothing"]);
    expect((await must(port.loadPart({ projectId: "x2", key: "article" }))).rev).toBe(v.rev);
  });

  it("an adopt on another part is refused by that part's kind", async () => {
    const { port } = universe("x3");
    const v = await must(port.loadPart({ projectId: "x3", key: "strips" }));
    const r = await port.opPart({ projectId: "x3", key: "strips", baseRev: v.rev, op: { op: "article-adopt", source: "publication", id: "the-published-one" } });
    expect(r.ok ? "" : r.error.message).toBe("article-adopt is not a strips op");
  });
});

/* ── the fixture side: the same op over its stand-in posts ───────────────── */

describe("article-adopt on the fixture side", () => {
  beforeEach(() => resetParts());
  it("lists two stand-in posts, adopts one through the same cutter, and undoes it", async () => {
    const id = "provider-routing-explainer";
    const v = await must(loadPart(id, "article", NOW));
    const d = article(v);
    expect(d?.adoptable.map((p) => [p.source, p.sections])).toEqual([
      ["run", 4],
      ["publication", 3],
    ]);
    const pick = d?.adoptable[0];
    if (pick === undefined) throw new Error("no stand-in post");
    const a = await applied(opPart(id, "article", v.rev, { op: "article-adopt", source: pick.source, id: pick.id }, NOW));
    expect(article(a)?.sections.map((x) => x.id)).toEqual(["opening", "what-a-route-is", "when-a-provider-refuses", "what-it-costs"]);
    expect(article(a)?.from).toMatchObject({ source: "run", id: pick.id });
    expect(a.ops[0]?.label).toBe(`adopt ${pick.id}`);
    const again = await opPart(id, "article", a.rev, { op: "article-adopt", source: pick.source, id: pick.id }, NOW);
    expect(again.ok ? "" : again.error.message).toBe(`article run ${pick.id} is adopted already`);
    const unknown = await opPart(id, "article", a.rev, { op: "article-adopt", source: "publication", id: "nope" }, NOW);
    expect(unknown.ok ? "" : unknown.error.message).toBe("no publication nope to adopt");
    const back = await must(undoPart(id, "article", a.rev, NOW));
    expect(back.kind === "applied" ? article(back.view) : null).toMatchObject({ title: null, sections: [] });
  });
});
