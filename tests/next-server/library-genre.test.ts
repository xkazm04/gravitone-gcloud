// THE SCOUT'S GENRES AND VENTURES IN THE LIBRARY (spark scout-vision S2): the genre feed maps the kernel's heads,
// with what the nights derive about each genre, to one `genre` item per genre and one `venture` item per venture.
// A genre's media is its born-from storyboard's first panel, a venture's its first genre's; a panel that failed,
// a storyboard the nights no longer hold, a file that escapes its night: no media, the key omitted. The piece's cut
// rides the extras only once it was cut. Every root is a temp directory and the kernel is in memory.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-library-genre-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse");
  return dir;
});

import type { Genre, Venture } from "@gt/domain/genre";
import { libraryItemSchema } from "@gt/domain/libraryItem";
import { openKernel } from "@gt/kernel/kernel";
import { queryLibrary } from "@gt/kernel/library/query";
import { upsertItems } from "@gt/kernel/library/write";
import { bornGenre, bornVenture } from "@gt/kernel/ventures/store";

import type { GenreView } from "../../lib/foundry/scout/genres.ts";
import type { Candidate, Night, PieceCandidate, StoryboardCandidate } from "../../lib/foundry/scout/types.ts";
import { genreFeed, scoutFileUrl, shelveGenres } from "../../lib/library/feeds/genre.ts";

function night(id: string, candidates: readonly Candidate[], kept: readonly string[] = []): Night {
  return {
    id,
    startedAt: `${id.slice(0, 10)}T00:00:00.000Z`,
    ceilingUsd: 2,
    target: 3,
    clipCap: 0,
    dry: false,
    state: "committed",
    sources: [],
    candidates,
    jobs: [],
    committed: { at: `${id.slice(0, 10)}T08:00:00.000Z`, by: "operator", kept: [...kept], rejected: [], reasons: {}, notes: {}, dry: false },
  };
}

function storyboard(id: string, images: readonly (string | null)[] | undefined): StoryboardCandidate {
  return { id, kind: "storyboard", sourceIds: [], status: "rendered", fromIdea: "2026-10-11/c-02", title: "The meeting", paragraph: "One meeting, played straight.", bullets: ["cold open", "the rule", "the button"], panels: ["p1", "p2"], ...(images === undefined ? {} : { images }) };
}

const piece = (id: string, video?: string): PieceCandidate => ({ id, kind: "piece", sourceIds: [], status: "rendered", genre: "gn-deadpan-office", fromTrial: "2026-10-21/c-02", title: "The meeting, cut", clips: [], ...(video === undefined ? {} : { video }) });

const HEAD: Genre = {
  id: "gn-deadpan-office",
  name: "deadpan office satire",
  bornFrom: "2026-10-12/c-04",
  proposal: "2026-10-12/c-14",
  use: "a 30 s Short: one meeting that should have been an email",
  look: "painted 3D",
  grammar: ["cold open", "the rule", "the button"],
  bornAt: "2026-10-12T09:00:00.000Z",
  by: "owner",
};

const view = (over: Partial<GenreView> = {}): GenreView => ({ ...HEAD, state: "perfecting", evidence: { keptTrials: [] }, ...over });

const VENTURE: Venture = {
  id: "vn-quiet-desk",
  name: "Quiet Desk",
  kind: "channel",
  frame: { tone: "deadpan, dry", audience: "office workers", format: "a 30 s vertical Short", look: "painted 3D", genres: ["gn-deadpan-office"] },
  proposal: "2026-10-24/c-15",
  bornAt: "2026-10-24T09:00:00.000Z",
  by: "owner",
};

const resolve = (n: string, rel: string): string => {
  if (rel.includes("..")) throw new Error("escapes the night");
  return `/root/${n}/${rel}`;
};

describe("shelveGenres - the pure mapping", () => {
  const nights = [night("2026-10-12", [storyboard("c-04", ["storyboards/c-04/panel-1.png", "storyboards/c-04/panel-2.png"])]), night("2026-10-23", [piece("c-11", "pieces/c-11/piece.mp4")])];

  it("a publishable genre: its ladder state, the shared word, its panel as media, its kept piece's cut, its venture named", () => {
    const g = view({ state: "publishable", ventureId: VENTURE.id, evidence: { keptTrials: ["2026-10-14/c-06", "2026-10-16/c-03", "2026-10-19/c-07", "2026-10-21/c-02"], piece: { ref: "2026-10-23/c-11", verdict: "kept" } } });
    const r = shelveGenres([g], [VENTURE], nights, resolve, "real");
    expect(r.skipped).toEqual([]);
    const [genre, venture] = r.items;
    expect(genre?.item).toMatchObject({ kind: "genre", id: "genre:gn-deadpan-office", title: HEAD.name, state: "ratified", origin: "scout", source: "real", vocabulary: { ladder: "publishable", venture: VENTURE.id, ventureName: VENTURE.name }, at: HEAD.bornAt });
    expect(genre?.meta).toBe("publishable · 4/4 trials");
    expect(genre?.file).toEqual({ abs: "/root/2026-10-12/storyboards/c-04/panel-1.png", mime: "image/png" });
    expect(genre?.extras.genre).toMatchObject({ piece: { ref: "2026-10-23/c-11", verdict: "kept", video: scoutFileUrl("2026-10-23", "pieces/c-11/piece.mp4") }, bornFrom: { ref: HEAD.bornFrom, image: scoutFileUrl("2026-10-12", "storyboards/c-04/panel-1.png") }, venture: { id: VENTURE.id, name: VENTURE.name } });
    expect(venture?.item).toMatchObject({ kind: "venture", id: "venture:vn-quiet-desk", state: "ratified", vocabulary: { type: "channel" }, lineage: [{ kind: "candidate", id: VENTURE.proposal }] });
    expect(venture?.file).toEqual(genre?.file);
    expect(venture?.extras.venture?.genres).toEqual([{ id: HEAD.id, name: HEAD.name }]);
    expect(venture?.meta).toBe("channel · 1 genre");
    for (const i of r.items) expect(libraryItemSchema.safeParse(i.item).success, i.item.id).toBe(true);
  });

  it("omits what is not there: no venture, no piece, no panel, no retirement - the keys absent, never null", () => {
    const r = shelveGenres([view()], [], [night("2026-10-12", [storyboard("c-04", [null, "storyboards/c-04/panel-2.png"])])], resolve, "fixture");
    const g = r.items[0];
    expect(g?.item.state).toBe("candidate");
    expect(g?.item.vocabulary).toEqual({ ladder: "perfecting" });
    expect(g).not.toHaveProperty("file");
    for (const k of ["piece", "venture", "retiredAt"]) expect(g?.extras.genre).not.toHaveProperty(k);
    expect(g?.extras.genre?.bornFrom).toEqual({ ref: HEAD.bornFrom });
  });

  it("a piece not yet cut carries its verdict and no video; a storyboard the nights lost leaves no media", () => {
    const r = shelveGenres([view({ evidence: { keptTrials: [], piece: { ref: "2026-10-23/c-11", verdict: "open" } } })], [], [night("2026-10-23", [piece("c-11")])], resolve, "real");
    expect(r.items[0]?.extras.genre?.piece).toEqual({ ref: "2026-10-23/c-11", verdict: "open" });
    expect(r.items[0]).not.toHaveProperty("file");
  });

  it("a retired genre is rejected on the shared word and keeps its retirement; a retired venture likewise", () => {
    const at = "2026-10-25T10:00:00.000Z";
    const r = shelveGenres([view({ state: "retired", retiredAt: at })], [{ ...VENTURE, retiredAt: at }], nights, resolve, "real");
    expect(r.items.map((i) => i.item.state)).toEqual(["rejected", "rejected"]);
    expect(r.items[0]?.extras.genre?.retiredAt).toBe(at);
    expect(r.items[1]?.extras.venture?.retiredAt).toBe(at);
  });

  it("a panel that escapes its night is skipped with its reason, and the genre still shelves without media", () => {
    const r = shelveGenres([view()], [], [night("2026-10-12", [storyboard("c-04", ["../../etc/passwd.png"])])], resolve, "real");
    expect(r.skipped).toEqual([{ id: HEAD.id, reason: "../../etc/passwd.png: escapes the night" }]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).not.toHaveProperty("file");
  });
});

describe("the genre feed over a kernel and a scout root", () => {
  beforeAll(() => {
    const dir = path.join(ROOT, "scout", "2026-10-12");
    mkdirSync(path.join(dir, "storyboards", "c-04"), { recursive: true });
    writeFileSync(path.join(dir, "storyboards", "c-04", "panel-1.png"), "png");
    writeFileSync(path.join(dir, "night.json"), JSON.stringify(night("2026-10-12", [storyboard("c-04", ["storyboards/c-04/panel-1.png"])], ["c-04/words"])));
  });
  afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

  it("reads the heads, says when there is no store, and writes items the Library indexes", async () => {
    expect((await genreFeed.read({ universe: "fixture" })).skipped).toEqual([{ id: "genre", reason: "no kernel store in this sync" }]);
    const k = openKernel(":memory:");
    if (!k.ok) throw k.error;
    try {
      const s = k.value.store;
      const op = { kind: "operator" as const, id: "owner" };
      const g = s.tx((t) => bornGenre(t, { name: HEAD.name, bornFrom: HEAD.bornFrom, proposal: HEAD.proposal, use: HEAD.use, look: HEAD.look, grammar: HEAD.grammar }, op));
      if (!g.ok) throw g.error;
      const v = s.tx((t) => bornVenture(t, { name: VENTURE.name, kind: "channel", frame: { ...VENTURE.frame, genres: [g.value.id] }, proposal: VENTURE.proposal }, op));
      if (!v.ok) throw v.error;
      const r = await genreFeed.read({ universe: "real", store: s });
      expect(r.skipped).toEqual([]);
      expect(r.items.map((i) => i.item.id)).toEqual([`genre:${g.value.id}`, `venture:${v.value.id}`]);
      expect(r.items[0]?.file?.abs).toBe(path.join(ROOT, "scout", "2026-10-12", "storyboards", "c-04", "panel-1.png"));
      expect(r.items[0]?.item.vocabulary).toEqual({ ladder: "perfecting", venture: v.value.id, ventureName: VENTURE.name });
      const up = upsertItems(s, r.items.map((i) => ({ item: i.item, meta: i.meta, extras: i.extras, feed: "genre" })), { styleOf: () => undefined });
      expect(up.ok).toBe(true);
      const page = queryLibrary(s, { kind: "venture", limit: 10 });
      expect(page.ok && page.value.items.map((x) => x.title)).toEqual([VENTURE.name]);
    } finally {
      k.value.close();
    }
  });
});
