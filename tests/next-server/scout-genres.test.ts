// GENRES AND VENTURES IN THE NIGHTS (spark scout-vision S2 WP2) - lib/foundry/scout/{propose,genres}.ts over temp nights
// and a temp kernel: the proposal door (a genre from a kept storyboard only - never an unkept, dry or muse one, never twice,
// never a live genre's name; a channel from a publishable genre's kept piece, an album from four kept music clips, no
// game), the evidence derived from the nights (trials kept on live committed nights, the newest piece's verdict, the state
// genreStateOf derives), the taste brief's two sections, the `genre` / `venture` command, and the `venture` field on the
// seed and storyboard doors. Every store is a temp directory set below before any lib/ module loads; nothing spends.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-genres-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Genre } from "@gt/domain/genre";
import { closeProcessKernel, processKernel } from "@gt/kernel/process";
import type { Store } from "@gt/kernel/store";
import { bornGenre, bornVenture, listGenres, retireVenture } from "@gt/kernel/ventures/store";

import { runCli } from "../../pipeline/scout.mts";
import { genreEvidenceOf, genreSections, genreTaste, genreViews, genresCommand, ventureRefusal } from "../../lib/foundry/scout/genres.ts";
import { parseIdeas } from "../../lib/foundry/scout/idea.ts";
import { addProposals } from "../../lib/foundry/scout/propose.ts";
import { parseStoryboards } from "../../lib/foundry/scout/storyboard.ts";
import { addSeedBatch, seedFacets } from "../../lib/foundry/scout/seeds.ts";
import { readNight } from "../../lib/foundry/scout/store.ts";
import type { Candidate, Night, NightCommit, PieceCandidate, SeedBatch, StoryboardCandidate, TrackCandidate } from "../../lib/foundry/scout/types.ts";
import { withWing } from "../../lib/foundry/scout/wingScope.ts";

const LIVE = "2026-09-10";
const DRYN = "2026-09-11";
const OPEN = "2026-09-12";
const OPERATOR = { kind: "operator" as const, id: "op-test" };

const board = (id: string, o: Partial<StoryboardCandidate> = {}): StoryboardCandidate => ({ id, kind: "storyboard", sourceIds: [], status: "rendered", fromIdea: "2026-09-01/c-01", title: `board ${id}`, paragraph: "a lantern climbs", bullets: ["beats: one", "format: a 30 s Short", "audience: adults"], panels: ["a stair"], use: "short: a slow-reveal Short", ...o });
const piece = (id: string, genre: string, o: Partial<PieceCandidate> = {}): PieceCandidate => ({ id, kind: "piece", sourceIds: [], status: "rendered", genre, fromTrial: `${LIVE}/c-03`, title: `piece ${id}`, clips: [], ...o });
const track = (id: string, seed: string): TrackCandidate => ({ id, kind: "track", sourceIds: [], status: "rendered", sentence: "a tango", fromSeed: seed, clips: [1, 2].map((k) => ({ part: `a${k}`, path: `tracks/${id}/a${k}.mp3`, model: "v6", title: `t${k}`, clipId: `sc-${id}-${k}` })) });
const commit = (kept: string[], o: Partial<NightCommit> = {}): NightCommit => ({ at: "2026-09-13T08:00:00.000Z", by: "operator", kept, rejected: [], reasons: {}, notes: {}, dry: false, ...o });

function night(id: string, candidates: Candidate[], o: Partial<Night> = {}): Night {
  return { id, startedAt: `${id}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "committed", stop: "target", sources: [], candidates, jobs: [], ...o };
}

function write(n: Night, root = "scout"): void {
  const dir = path.join(ROOT, root, n.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(n));
}

function writeBatch(b: SeedBatch): void {
  const dir = path.join(ROOT, "scout", "seeds", b.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "batch.json"), JSON.stringify(b));
}

let store: Store;
let channelGenre: Genre;

beforeAll(() => {
  mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
  writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }));
  const k = processKernel(path.join(ROOT, "kernel.sqlite"));
  if (!k.ok) throw k.error;
  store = k.value.store;
  // A genre born earlier, made publishable below by its kept piece on the live night.
  const g = store.tx((t) => bornGenre(t, { name: "Deadpan office satire", bornFrom: `${LIVE}/c-01`, proposal: "2026-09-01/c-09", use: "short: a deadpan Short", look: "painted 3D", grammar: ["the set-up", "the turn"] }, OPERATOR));
  if (!g.ok) throw g.error;
  channelGenre = g.value;
  writeBatch({ id: "2026-09-01", createdAt: "2026-09-01T00:00:00.000Z", dry: false, seeds: ["sd-001", "sd-002"].map((id) => ({ id, sentence: `song ${id}`, genre: "tango", subgenre: "nuevo", type: "music video", audience: "adult", format: "video" })), committed: { at: "2026-09-02T00:00:00.000Z", by: "operator", kept: ["sd-001", "sd-002"], rejected: [], reasons: {}, notes: {}, dry: false } });
  write(
    night(
      LIVE,
      [board("c-01"), board("c-02"), board("c-03", { genre: channelGenre.id }), track("c-04", "2026-09-01/sd-001"), track("c-05", "2026-09-01/sd-002"), piece("c-06", channelGenre.id), board("c-07", { use: undefined })],
      { committed: commit(["c-01/words", "c-01/panel-1", "c-03/words", "c-04/a1", "c-04/a2", "c-05/a1", "c-05/a2", "c-06/video", "c-07/words"], { rejected: ["c-02/words"] }) },
    ),
  );
  write(night(DRYN, [board("c-01")], { dry: true, committed: commit(["c-01/words"], { dry: true }) }));
  write(night(OPEN, [], { state: "open" }));
  write(night(OPEN, [], { state: "open" }), "scout-muse");
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const genreBrief = (o: Record<string, unknown> = {}) => ({ kind: "genre", name: "Quiet one-light mysteries", fromStoryboard: `${LIVE}/c-01`, look: "amber against slate", grammar: ["the light moves", "the chase", "the reveal"], ...o });
const frame = (genres: string[]) => ({ tone: "deadpan", audience: "adults", format: "a 30 s vertical Short", look: "painted 3D", genres });

describe("the proposal door - a genre", () => {
  it("refuses an unkept, a dry, an unjudged storyboard and the muse wing, naming the brief's place", async () => {
    expect(await addProposals(OPEN, [genreBrief({ fromStoryboard: `${LIVE}/c-02` })], { store })).toMatchObject({ ok: false, error: { code: "refused", message: expect.stringMatching(/^proposal 1: fromStoryboard: 2026-09-10\/c-02 is rejected/) } });
    expect(await addProposals(OPEN, [genreBrief({ fromStoryboard: `${DRYN}/c-01` })], { store })).toMatchObject({ ok: false, error: { message: expect.stringContaining("is a dry night's") } });
    expect(await addProposals(OPEN, [genreBrief(), genreBrief({ name: "x", fromStoryboard: `${LIVE}/c-09` })], { store })).toMatchObject({ ok: false, error: { message: "proposal 2: fromStoryboard: night 2026-09-10 has no storyboard c-09" } });
    expect(await withWing("muse", () => addProposals(OPEN, [genreBrief()], { store }))).toMatchObject({ ok: false, error: { message: "the muse wing proposes no genre or venture" } });
    expect(await addProposals(OPEN, [genreBrief({ name: "deadpan  OFFICE satire" })], { store })).toMatchObject({ ok: false, error: { message: `proposal 1: name: "deadpan  OFFICE satire" is live genre ${channelGenre.id}'s` } });
    expect(await addProposals(OPEN, [genreBrief({ fromStoryboard: `${LIVE}/c-07` })], { store })).toMatchObject({ ok: false, error: { message: expect.stringContaining("proposal 1: use: storyboard 2026-09-10/c-07 states none") } });
    expect((await readNight(OPEN)).candidates).toEqual([]);
  });

  it("accepts a kept storyboard: words only, rendered, its kept cells as basedOn and the storyboard's use; then refuses it twice", async () => {
    const r = await addProposals(OPEN, [genreBrief()], { store });
    expect(r).toMatchObject({ ok: true });
    const made = (await readNight(OPEN)).candidates;
    expect(made).toEqual([
      { id: "c-01", kind: "genre", sourceIds: [], status: "rendered", name: "Quiet one-light mysteries", fromStoryboard: `${LIVE}/c-01`, look: "amber against slate", grammar: ["the light moves", "the chase", "the reveal"], basedOn: [`${LIVE}/c-01/words`, `${LIVE}/c-01/panel-1`], use: "short: a slow-reveal Short" },
    ]);
    expect(await addProposals(OPEN, [genreBrief({ name: "Another name" })], { store })).toMatchObject({ ok: false, error: { message: `proposal 1: fromStoryboard: ${LIVE}/c-01 already has genre proposal ${OPEN}/c-01 (open)` } });
  });

  it("refuses a closed night", async () => {
    write(night("2026-09-14", [], { state: "closed" }));
    expect(await addProposals("2026-09-14", [genreBrief({ fromStoryboard: `${LIVE}/c-03` })], { store })).toMatchObject({ ok: false, error: { message: "night 2026-09-14 is closed; it takes no more proposals" } });
  });
});

describe("the proposal door - a venture", () => {
  it("births a channel only from a publishable genre whose kept piece it stands on", async () => {
    const bad = await addProposals(OPEN, [{ kind: "venture", name: "Desk Drama", ventureKind: "channel", frame: frame([channelGenre.id]), basedOn: [`${LIVE}/c-03/words`] }], { store });
    expect(bad).toMatchObject({ ok: false, error: { message: `proposal 1: basedOn: a channel of ${channelGenre.id} stands on its kept piece ${LIVE}/c-06/video` } });
    expect(await addProposals(OPEN, [{ kind: "venture", name: "Desk Drama", ventureKind: "channel", frame: frame([]), basedOn: [`${LIVE}/c-06/video`] }], { store })).toMatchObject({ ok: false, error: { message: "proposal 1: frame.genres: a channel is born from at least one publishable genre" } });
    expect(await addProposals(OPEN, [{ kind: "venture", name: "Desk Drama", ventureKind: "channel", frame: frame([channelGenre.id]), basedOn: [`${LIVE}/c-02/words`] }], { store })).toMatchObject({ ok: false, error: { message: `proposal 1: basedOn 1 "${LIVE}/c-02/words": night ${LIVE} rejected c-02/words; a venture stands only on a kept cell` } });
    const ok = await addProposals(OPEN, [{ kind: "venture", name: "Desk Drama", ventureKind: "channel", frame: frame([channelGenre.id]), basedOn: [`${LIVE}/c-06/video`], use: "a channel of deadpan Shorts" }], { store });
    expect(ok).toMatchObject({ ok: true, value: [{ kind: "venture", ventureKind: "channel", status: "rendered", frame: frame([channelGenre.id]), basedOn: [`${LIVE}/c-06/video`], use: "a channel of deadpan Shorts" }] });
  });

  it("an album stands on four kept clips of music seeds sharing a genre; a game is refused", async () => {
    const clips = [`${LIVE}/c-04/a1`, `${LIVE}/c-04/a2`, `${LIVE}/c-05/a1`];
    expect(await addProposals(OPEN, [{ kind: "venture", name: "Coat Rack Tangos", ventureKind: "album", frame: frame([]), basedOn: clips }], { store })).toMatchObject({ ok: false, error: { message: expect.stringContaining("an album stands on 4 kept track clips of music seeds sharing a genre (<night>/<c-id>/aN); this one names 3") } });
    expect(await addProposals(OPEN, [{ kind: "venture", name: "Coat Rack Tangos", ventureKind: "album", frame: frame([]), basedOn: [...clips, `${LIVE}/c-05/a2`] }], { store })).toMatchObject({ ok: true, value: [{ kind: "venture", ventureKind: "album" }] });
    expect(await addProposals(OPEN, [{ kind: "venture", name: "Salvage", ventureKind: "game", frame: frame([]), basedOn: clips }], { store })).toMatchObject({ ok: false, error: { message: "proposal 1: ventureKind: a game venture is not born yet (S4); a proposal births a channel or album" } });
  });
});

describe("the evidence and the views", () => {
  const G = "gn-quiet";
  const head: Genre = { id: G, name: "quiet", bornFrom: "x", proposal: "y", use: "u", look: "l", grammar: ["a"], bornAt: "2026-09-01T00:00:00.000Z", by: "operator:op" };
  const trials = (n: string, ids: string[], o: Partial<Night> = {}, k: Partial<NightCommit> = {}): Night => night(n, ids.map((id) => board(id, { genre: G })), { committed: commit(ids.map((id) => `${id}/words`), k), ...o });

  it("counts a trial only when kept on a live committed night, oldest first", () => {
    const nights = [
      trials("2026-09-03", ["c-01", "c-02"]),
      trials("2026-09-02", ["c-01"]),
      trials("2026-09-04", ["c-01"], { dry: true }, { dry: true }),
      night("2026-09-05", [board("c-01", { genre: G })], { state: "closed" }),
      trials("2026-09-06", ["c-01"], {}, { open: ["c-01/words"] }),
      night("2026-09-07", [board("c-01", { genre: "gn-other" })], { committed: commit(["c-01/words"]) }),
    ];
    expect(genreEvidenceOf(nights, G)).toEqual({ keptTrials: ["2026-09-02/c-01", "2026-09-03/c-01", "2026-09-03/c-02"] });
    expect(genreViews(nights, [head])[0]?.state).toBe("perfecting");
  });

  it("maps the newest piece's verdict, and the state follows genreStateOf", () => {
    const four = [trials("2026-09-02", ["c-01", "c-02", "c-03", "c-04"])];
    expect(genreViews(four, [head])[0]?.state).toBe("piece-due");
    const open = [...four, night("2026-09-08", [piece("c-01", G)], { state: "closed" })];
    expect(genreEvidenceOf(open, G).piece).toEqual({ ref: "2026-09-08/c-01", verdict: "open" });
    const rejected = [...four, night("2026-09-08", [piece("c-01", G)], { committed: commit([], { rejected: ["c-01/video"] }) })];
    expect(genreEvidenceOf(rejected, G).piece).toEqual({ ref: "2026-09-08/c-01", verdict: "rejected" });
    expect(genreViews(rejected, [head])[0]?.state).toBe("piece-due");
    // The newest wins over an older rejection; a failed piece and a dry night's are no evidence.
    const kept = [...rejected, night("2026-09-09", [piece("c-01", G), piece("c-02", G, { status: "failed" })], { committed: commit(["c-01/video"]) }), night("2026-09-10", [piece("c-01", G)], { dry: true, committed: commit([], { dry: true }) })];
    expect(genreEvidenceOf(kept, G).piece).toEqual({ ref: "2026-09-09/c-01", verdict: "kept" });
    expect(genreViews(kept, [head])[0]?.state).toBe("publishable");
    expect(genreViews(kept, [{ ...head, retiredAt: "2026-09-11T00:00:00.000Z" }])[0]?.state).toBe("retired");
  });

  it("writes the taste brief's ## Genre ladder and ## Ventures, live heads only", () => {
    const views = genreViews([trials("2026-09-02", ["c-01", "c-02"])], [head, { ...head, id: "gn-old", retiredAt: "2026-09-03T00:00:00.000Z" }]);
    const ventures = [
      { id: "vn-desk", name: "Desk Drama", kind: "channel" as const, frame: frame([G]), proposal: "p", bornAt: "t", by: "b" },
      { id: "vn-gone", name: "Gone", kind: "album" as const, frame: frame([]), proposal: "q", bornAt: "t", by: "b", retiredAt: "t2" },
    ];
    expect(genreSections(views, ventures)).toEqual([
      "## Genre ladder",
      "",
      "- gn-quiet · quiet · perfecting · kept trials 2/4 · next: trials",
      "",
      "## Ventures",
      "",
      "- vn-desk · channel · Desk Drama · a 30 s vertical Short · deadpan · adults · painted 3D · gn-quiet",
      "",
    ]);
    expect(genreSections([], [])).toEqual(["## Genre ladder", "", "- none", "", "## Ventures", "", "- none", ""]);
    // Over the kernel: the publishable genre born above, its next step a channel.
    expect(genreTaste(store, [])).toContain(`- ${channelGenre.id} · Deadpan office satire · perfecting · kept trials 0/4 · next: trials`);
  });
});

describe("the genre and venture command", () => {
  it("lists the genres with their state from the scout nights, and the ventures", async () => {
    const r = await genresCommand("genre", ["list"], { store, actor: OPERATOR });
    expect(r.code).toBe(0);
    expect(r.lines.find((l) => l.startsWith(channelGenre.id))).toMatch(/publishable\s+1\/4\s+Deadpan office satire$/);
    expect(await genresCommand("venture", ["list"], { store, actor: OPERATOR })).toEqual({ code: 0, lines: ["no ventures yet"], doc: { ok: true, ventures: [] } });
    expect((await genresCommand("genre", ["dance"], { store, actor: OPERATOR })).code).toBe(2);
  });

  it("retires as the operator only; an unknown id exits 1 with a sentence", async () => {
    expect(await genresCommand("genre", ["retire", "gn-nobody"], { store, actor: OPERATOR })).toMatchObject({ code: 1, lines: ["no genre gn-nobody: `scout.mts genre list` lists them"] });
    const agent = { kind: "agent", id: "night" } as unknown as typeof OPERATOR;
    expect(await genresCommand("genre", ["retire", channelGenre.id], { store, actor: agent })).toMatchObject({ code: 1, lines: [`retiring genre ${channelGenre.id} is the operator's act; agent night cannot`] });
    const g = store.tx((t) => bornGenre(t, { name: "To retire", bornFrom: `${LIVE}/c-01`, proposal: "2026-09-01/c-08", use: "u", look: "l", grammar: ["a"] }, OPERATOR));
    if (!g.ok) throw g.error;
    expect(await genresCommand("genre", ["retire", g.value.id], { store, actor: OPERATOR })).toMatchObject({ code: 0, lines: [`genre ${g.value.id} retired · To retire`] });
    expect(store.read((x) => listGenres(x).find((y) => y.id === g.value.id)?.retiredAt)).toMatchObject({ ok: true, value: expect.any(String) });
    expect((await genresCommand("genre", ["retire", g.value.id], { store, actor: OPERATOR })).code).toBe(1);
  });
});

describe("the venture field", () => {
  it("refuses an unknown venture at the door, and a seed carries a live one in its facets", async () => {
    expect(ventureRefusal("vn-nobody", store)).toBe("no venture vn-nobody");
    const brief = { sentence: "A tango for two coats.", genre: "music", subgenre: "tango", type: "animated short", audience: "adult", format: "short" };
    expect(await addSeedBatch([{ ...brief, venture: "vn-nobody" }], { dry: false, store })).toMatchObject({ ok: false, error: { code: "refused", message: "seed 1: venture: no venture vn-nobody" } });
    expect(seedFacets({ ...brief, audience: "adult", format: "short", venture: "vn-desk" })).toBe("adult · music › tango · animated short · short · venture: vn-desk");
    expect(seedFacets({ ...brief, audience: "adult", format: "short" })).toBe("adult · music › tango · animated short · short");
    const v = store.tx((t) => bornVenture(t, { name: "Coat Rack Records", kind: "album", frame: frame([]), proposal: "2026-09-01/c-07" }, OPERATOR));
    if (!v.ok) throw v.error;
    expect(ventureRefusal(v.value.id, store)).toBeUndefined();
    const made = await addSeedBatch([{ ...brief, venture: v.value.id }], { dry: false, store });
    expect(made).toMatchObject({ ok: true, value: { seeds: [{ id: "sd-001", venture: v.value.id }] } });
    const r = store.tx((t) => retireVenture(t, v.value.id, OPERATOR));
    if (!r.ok) throw r.error;
    expect(ventureRefusal(v.value.id, store)).toMatch(new RegExp(`^venture ${v.value.id} was retired \\d{4}-\\d{2}-\\d{2}$`));
  });

  it("the idea and storyboard doors take a venture id, and only one", () => {
    const sb = { fromIdea: "2026-09-01/c-01", title: "t", paragraph: "p", bullets: ["a", "b", "c"], panels: ["a stair"] };
    expect(parseStoryboards([{ ...sb, venture: "vn-desk" }])).toMatchObject({ ok: true, value: [{ venture: "vn-desk" }] });
    expect(parseStoryboards([{ ...sb, venture: "desk" }])).toMatchObject({ ok: false, error: { message: expect.stringContaining("a venture id vn-...") } });
    const idea = { title: "t", target: "scene", genre: "g", prompt: "a lantern on a stair", anchor: { kind: "free", ref: "" }, app: "short", appTarget: "a cold open", aim: "see whether one light carries it" };
    expect(parseIdeas([{ ...idea, venture: "vn-desk" }], "scout")).toMatchObject({ ok: true, value: [{ venture: "vn-desk" }] });
    expect(parseIdeas([idea], "scout")).toMatchObject({ ok: true, value: [expect.not.objectContaining({ venture: expect.anything() })] });
  });
});

describe("the night's taste brief", () => {
  // Last: the CLI closes the process kernel this file shares.
  it("`open` writes ## Genre ladder and ## Ventures into taste.md, from the kernel the CLI opens", async () => {
    const lines: string[] = [];
    const code = await runCli(["open", "--json"], { env: { ...process.env, GRAVITONE_DRY_ONLY: "1" }, out: (s) => lines.push(s), err: () => undefined });
    expect(code).toBe(0);
    const doc = JSON.parse(lines.join("\n")) as { taste: string };
    const taste = readFileSync(doc.taste, "utf8");
    expect(taste).toContain(`## Genre ladder\n\n- ${channelGenre.id} · Deadpan office satire · publishable · kept trials 1/4 · next: a channel venture\n`);
    expect(taste).toContain("## Ventures\n");
  });
});
