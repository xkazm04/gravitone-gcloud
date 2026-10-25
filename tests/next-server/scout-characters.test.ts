// CHARACTERS AT THE DOORS (spark scout-vision S3 WP1) - the muse rules moved from the wing to the brief. Pure first:
// keptCharacters over a scout root and the muse ARCHIVE whose night ids collide; the card rules by audience and app;
// a cast checked against kept characters, its identity blocks at the head of the prompt, a kids character never cast
// into adult work; a cited source of tonight only; the character seed's facet and its Board body; the repeat guard
// over both roots. Then end to end on a live scout night over the fake studio: per-idea quality and aspect, the eye
// keyed on target/cast (never a wing) with the parody clause and the kids line, and no pixel of a source reaching the
// studio. Every store is a temp directory set below before any lib/ module loads; fetch throws.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-characters-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  process.env["SPEND_STORE"] = "memory";
  process.env["IMAGING_ENV"] = "dev";
  process.env["LOCAL_BINARIES"] = "off";
  for (const k of ["LEONARDO_API_KEY", "GOOGLE_AI_API_KEY", "OLLAMA_HOST", "LEONARDO_STUDIO_CDP"]) delete process.env[k];
  return dir;
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeProcessKernel } from "@gt/kernel/process";

import { runCli, type CliPorts } from "../../pipeline/scout.mts";
import { body } from "../../lib/decision/v1/sources/seeds.ts";
import { identityBlock, keptCharacters, type RootedNight } from "../../lib/foundry/scout/characters.ts";
import { checkCharacters, checkIdeaSeeds, parseIdeas, type IdeaBrief } from "../../lib/foundry/scout/idea.ts";
import { repeatRefusal } from "../../lib/foundry/scout/ideaRepeat.ts";
import { PARODY_CLAUSE } from "../../lib/foundry/scout/judge.ts";
import type { CharacterCard } from "../../lib/foundry/scout/muse.ts";
import { checkSeedBatch, seedFacets } from "../../lib/foundry/scout/seeds.ts";
import { mutateNight, readNight } from "../../lib/foundry/scout/store.ts";
import type { Candidate, IdeaCandidate, Night, Seed, SeedBatch } from "../../lib/foundry/scout/types.ts";
import { __resetBudget } from "../../lib/imaging/budget.ts";
import { FAKE_LEONARDO_STUDIO, resetFakeLeonardoStudio } from "../../lib/imaging/providers/leonardoStudio.ts";
import { generate } from "../../lib/imaging/router.ts";
import type { GenerateRequest, Recognition, RecognizeRequest } from "../../lib/imaging/types.ts";

const DRY = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
const LIVE = (() => {
  const { GRAVITONE_DRY_ONLY: _pin, ...rest } = process.env;
  return rest;
})();

beforeEach(() => {
  resetFakeLeonardoStudio();
  __resetBudget();
  process.env["LEONARDO_STUDIO_DRIVER"] = "fake";
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`unexpected fetch ${String(input)}`);
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  closeProcessKernel();
});
afterAll(() => {
  delete process.env["LEONARDO_STUDIO_DRIVER"];
  rmSync(ROOT, { recursive: true, force: true });
});

/* ── the world ─────────────────────────────────────────────────────────────── */

const MARA: CharacterCard = { name: "Mara Veil", age: 34, look: "auburn bob, grey eyes, freckles, long camel trench coat", personality: "dry wit, never hurries" };
const BRASS: CharacterCard = { name: "Captain Brass", age: 45, look: "brass-buttoned greatcoat, white mutton-chop whiskers, one gold tooth", personality: "booming, kind to cabin boys", kind: "parody", origin: "the moustached airship captain of a 1930s newspaper strip", render: "stylised", audience: "adult" };
const PIP: CharacterCard = { name: "Pip Lantern", age: 9, look: "round glasses, yellow raincoat, a jar of fireflies", personality: "asks one more question", kind: "original", render: "stylised", audience: "kids" };

const idea = (id: string, over: Partial<IdeaCandidate>): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: id, target: "character", prompt: "p", anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png`, ...over });
const sheet = (id: string, character: string): Candidate => ({ id, kind: "sheet", sourceIds: [], status: "rendered", character, name: character, fromPortrait: "x/c-01", image: `sheets/${id}.png` });
function night(id: string, candidates: Candidate[], o: { kept?: string[]; rejected?: string[]; at?: string; dry?: boolean; open?: string[]; state?: Night["state"] } = {}): Night {
  const decided = o.kept !== undefined || o.rejected !== undefined;
  return {
    id,
    startedAt: `${id.slice(0, 10)}T00:00:00.000Z`,
    ceilingUsd: 15,
    target: 20,
    clipCap: 0,
    dry: false,
    state: o.state ?? (decided ? "committed" : "closed"),
    sources: [],
    candidates,
    jobs: [],
    ...(decided ? { committed: { at: o.at ?? `${id.slice(0, 10)}T08:00:00.000Z`, by: "operator", kept: o.kept ?? [], rejected: o.rejected ?? [], reasons: {}, notes: {}, dry: o.dry ?? false, ...(o.open === undefined ? {} : { open: o.open }) } } : {}),
  };
}

const NIGHT = "2026-09-10";
const scoutNight = night(NIGHT, [idea("c-02", { card: MARA, image: "ideas/c-02.png" }), sheet("c-03", "mara veil"), sheet("c-04", "mara veil"), idea("c-05", { card: BRASS }), idea("c-06", { card: PIP })], { kept: ["c-02/board", "c-03/sheet", "c-05/board", "c-06/board"], rejected: ["c-04/sheet"], at: "2026-09-11T08:00:00.000Z" });
// The SAME night id in the archive: committed a day earlier, Mara's older card (another spelling of her name), and Ines.
const archiveNight = night(NIGHT, [idea("c-01", { card: { ...MARA, name: "mara  VEIL", look: "older look" } }), idea("c-02", { card: { ...MARA, name: "Ines Roca" } }), idea("c-03", { card: { ...MARA, name: "Tove Lind" } }), sheet("c-04", "ines roca")], { kept: ["c-01/board", "c-02/board", "c-04/sheet"], rejected: ["c-03/board"], at: "2026-09-10T08:00:00.000Z" });
const ROOTED: RootedNight[] = [
  { root: "scout", night: scoutNight },
  { root: "archive", night: archiveNight },
  // Never shelved: a dry record, a night still open on the Weir, a kept cell left open.
  { root: "scout", night: night("2026-09-12", [idea("c-01", { card: { ...MARA, name: "Dry Dora" } })], { kept: ["c-01/board"], dry: true }) },
  { root: "scout", night: night("2026-09-13", [idea("c-01", { card: { ...MARA, name: "Open Olga" } })], { kept: ["c-01/board"], open: ["c-01/board"] }) },
  { root: "scout", night: night("2026-09-14", [idea("c-01", { card: { ...MARA, name: "Closed Cleo" } })], { kept: ["c-01/board"], state: "closed" }) },
];

describe("keptCharacters", () => {
  it("groups by folded name over both roots keyed (root, id): newest card and portrait, newest kept scout sheet, keptOn oldest first", () => {
    const kc = keptCharacters(ROOTED);
    expect(kc.map((k) => k.key)).toEqual(["mara veil", "ines roca", "captain brass", "pip lantern"]);
    const [mara, ines] = kc;
    expect(mara?.card).toEqual(MARA);
    expect(mara?.portrait).toEqual({ ref: `${NIGHT}/c-02`, root: "scout", night: NIGHT, file: "ideas/c-02.png" });
    expect(mara?.keptOn).toEqual([`muse:${NIGHT}/c-01`, `${NIGHT}/c-02`]);
    // The kept sheet, not the rejected one beside it.
    expect(mara?.sheet).toEqual({ ref: `${NIGHT}/c-03`, night: NIGHT, file: "sheets/c-03.png" });
    expect(ines?.portrait).toEqual({ ref: `muse:${NIGHT}/c-02`, root: "archive", night: NIGHT, file: "ideas/c-02.png" });
    // A sheet in the archive is never her reference: sheets are drawn on scout nights only.
    expect(ines).not.toHaveProperty("sheet");
  });
});

describe("the repeat guard over both roots", () => {
  const ask = (name: string, look: string) => ({ target: "character", card: { name }, look });
  it("refuses a name drawn on an archive night, naming it muse:<night>; a kept one comes again", () => {
    expect(repeatRefusal([ask("tove lind", "new-look")], ROOTED)).toBe(`idea 1: card tove lind already drawn in muse:${NIGHT}/c-03 (rejected)`);
    expect(repeatRefusal([ask("Ines Roca", "new-look")], ROOTED)).toBeUndefined();
    expect(repeatRefusal([{ target: "scene" }], ROOTED)).toBeUndefined();
  });
});

/* ── the door ──────────────────────────────────────────────────────────────── */

const seedOf = (id: string, audience: Seed["audience"], o: Partial<Seed> = {}): Seed => ({ id, sentence: `seed ${id}`, genre: "romance", subgenre: "slow burn", type: "character", audience, format: "short", ...o });
const BATCH = "2026-09-01";
const SEEDS: Seed[] = [
  seedOf("sd-001", "adult", { character: { for: "dating-sim", cast: "one" } }),
  seedOf("sd-002", "adult", { character: { for: "videogame", cast: "ensemble" } }),
  seedOf("sd-003", "kids", { character: { for: "short", cast: "one" } }),
  seedOf("sd-004", "family", { character: { for: "genre-video", cast: "parody" } }),
  seedOf("sd-005", "adult", { type: "animated short", genre: "mystery" }),
  seedOf("sd-006", "kids", { type: "animated short", genre: "nature" }),
];
const BATCHES: SeedBatch[] = [{ id: BATCH, createdAt: `${BATCH}T00:00:00.000Z`, dry: false, seeds: SEEDS, committed: { at: `${BATCH}T08:00:00.000Z`, by: "operator", kept: SEEDS.map((s) => s.id), rejected: [], reasons: {}, notes: {}, dry: false } }];
const DATING = `${BATCH}/sd-001`;
const GAME = `${BATCH}/sd-002`;
const KIDS = `${BATCH}/sd-003`;
const FAMILY = `${BATCH}/sd-004`;
const ADULT_SHORT = `${BATCH}/sd-005`;
const KIDS_SHORT = `${BATCH}/sd-006`;

const brief = (title: string, o: Record<string, unknown> = {}) => ({ title, target: "scene", genre: "animated short", prompt: `${title}, gouache thumbnail, wide frame.`, anchor: { kind: "free", ref: "" }, app: "short", appTarget: "a cold open", aim: "see whether one held light carries a reveal", seed: ADULT_SHORT, ...o });
const character = (card: Partial<CharacterCard>, o: Record<string, unknown> = {}) => {
  const c = { ...MARA, ...card };
  return brief(c.name, { target: "character", card: c, look: "painterly-noir", prompt: `${c.name}, aged ${c.age}, ${c.look}, three-quarter portrait.`, seed: DATING, ...o });
};
const TONIGHT = { id: "2026-09-20", sources: [{ id: "s-01" }] } as unknown as Night;
const world = { batches: BATCHES, kept: keptCharacters(ROOTED), night: TONIGHT };
const door = (raw: unknown): ReturnType<typeof checkCharacters> => {
  const p = parseIdeas(raw);
  return p.ok ? checkCharacters(p.value, world) : p;
};
const says = (raw: unknown): string => {
  const r = door(raw);
  return r.ok ? "ok" : r.error.message;
};
const first = (raw: unknown): IdeaBrief | undefined => {
  const r = door(raw);
  return r.ok ? r.value[0] : undefined;
};

describe("the card rules by audience and app", () => {
  it("adult: 24 refused, 25 kept; 51 refused only for a companion app; the stored card takes the seed's audience and 9:16", () => {
    expect(says([character({ age: 24 })])).toBe("idea 1: card.age: an adult-audience character is 25 or older; 24 is under");
    expect(says([character({ age: 25 })])).toBe("ok");
    expect(says([character({ age: 51 })])).toBe("idea 1: card.age: a dating-sim character is 50 or younger; 51 is over");
    expect(says([character({ age: 51 }, { seed: GAME })])).toBe("ok");
    expect(first([character({})])).toMatchObject({ card: { ...MARA, audience: "adult" }, aspect: "9:16" });
    expect(says([character({ audience: "kids" })])).toBe("idea 1: card.audience: her seed is for adult, not kids");
  });

  it("kids and family: any age, under 18 drawn stylised - then a youth word passes; an adult brief's youth word is refused", () => {
    expect(says([character({ ...PIP, render: "photoreal" }, { seed: KIDS })])).toBe('idea 1: card.render: a character aged 9 is under 18: drawn stylised, never photoreal');
    const { render: _r, ...unstated } = PIP;
    expect(says([character(unstated, { seed: KIDS })])).toBe("idea 1: card.render: a character aged 9 is under 18: drawn stylised, never unstated");
    expect(says([character(PIP, { seed: KIDS, title: "Pip, the kid who counts fireflies" })])).toBe("ok");
    expect(says([character({ ...PIP, age: 80, render: "photoreal", audience: "family" }, { seed: FAMILY })])).toBe("ok");
    expect(says([character({}, { title: "Mara, the teen detective" })])).toBe('idea 1: title: "teen" is a youth word; only a stylised kids or family character under 18 takes one');
  });

  it("refuses an explicit word for every audience, a parody without its original, an original with one, and a prompt's other age", () => {
    expect(says([character({}, { appTarget: "an NSFW pin-up" })])).toBe('idea 1: appTarget: "NSFW" is a nudity or sexual word; every brief is SFW');
    expect(says([character(PIP, { seed: KIDS, prompt: "Pip Lantern, aged 9, naked feet in a puddle." })])).toBe('idea 1: prompt: "naked" is a nudity or sexual word; every brief is SFW');
    const { origin: _o, ...noOrigin } = BRASS;
    expect(says([character(noOrigin)])).toBe("idea 1: card.origin: a parody names its original in words");
    expect(says([character({ origin: "a 1980s platform game" })])).toBe("idea 1: card.origin: only a parody names an original");
    expect(says([character(BRASS)])).toBe("ok");
    expect(says([character({}, { prompt: "Mara Veil, aged 31, auburn bob." })])).toBe("idea 1: prompt: \"aged 31\" is not her card's age, 34");
    expect(says([character({}, { prompt: "Mara Veil in a trench coat." })])).toBe('idea 1: prompt: states no age; a character prompt says "aged 34", her card\'s age');
    // A brief that draws nobody reads none of it.
    expect(says([brief("A teen band on a stage aged 12")])).toBe("ok");
  });
});

describe("cast and source", () => {
  it("casts kept characters by name: each identity block verbatim at the prompt's head, then the brief's words", () => {
    const b = first([brief("Two strangers share an umbrella", { cast: ["mara VEIL", "Captain Brass"] })]);
    expect(b?.cast).toEqual(["Mara Veil", "Captain Brass"]);
    expect(b?.prompt).toBe(`${identityBlock(MARA)} ${identityBlock(BRASS)} Two strangers share an umbrella, gouache thumbnail, wide frame.`);
    expect(b).not.toHaveProperty("aspect");
  });

  it("refuses a cast name that is no kept character, a name twice, a stated age no cast member has, and a kids character in adult work", () => {
    expect(says([brief("x", { cast: ["Tove Lind"] })])).toBe("idea 1: cast: Tove Lind is not a kept character (kept: Mara Veil, Ines Roca, Captain Brass, Pip Lantern)");
    expect(says([brief("x", { cast: ["Mara Veil", "mara veil"] })])).toBe("idea 1: cast: mara veil is cast twice");
    expect(says([brief("x", { cast: ["Mara Veil"], prompt: "Mara at the bar, a woman aged 22 beside her." })])).toBe('idea 1: prompt: "aged 22" is no cast member\'s age (34)');
    expect(says([brief("x", { cast: ["Pip Lantern"] })])).toBe("idea 1: cast: Pip Lantern is a kids character; never cast into adult work");
    expect(says([brief("x", { cast: ["Pip Lantern"], seed: undefined })])).toBe("idea 1: cast: Pip Lantern is a kids character; never cast into unseeded work");
    expect(says([brief("x", { cast: ["Mara Veil", "Ines Roca", "Captain Brass", "Pip Lantern"] })])).toMatch(/^idea 1: cast: /);
    expect(says([brief("Pip and the fireflies", { cast: ["Pip Lantern"], seed: KIDS_SHORT })])).toBe("ok");
  });

  it("a source is one of tonight's, carried in words", () => {
    expect(says([character({}, { source: "s-02" })])).toBe("idea 1: source: s-02 is not a source of night 2026-09-20");
    expect(first([character({}, { source: "s-01" })])).toMatchObject({ source: "s-01" });
  });
});

/* ── seeds ─────────────────────────────────────────────────────────────────── */

describe("the character seed", () => {
  const raw = { sentence: "A lighthouse keeper who answers in tide tables.", genre: "romance", subgenre: "slow burn", type: "character", audience: "adult", format: "short" };
  it("is required on type character and refused on any other; its facet prints and its Board body grows only when present", async () => {
    expect(await checkSeedBatch([raw], [])).toMatchObject({ ok: false, error: { message: "seed 1: character: a character seed gives what its characters are for {for, cast}" } });
    expect(await checkSeedBatch([{ ...raw, type: "animated short", character: { for: "dating-sim", cast: "one" } }], [])).toMatchObject({ ok: false, error: { message: "seed 1: character: only a character seed takes character; this one is a animated short" } });
    expect((await checkSeedBatch([{ ...raw, character: { for: "dating-sim", cast: "one", extra: 1 } }], [])).ok).toBe(false);
    const ok = await checkSeedBatch([{ ...raw, character: { for: "dating-sim", cast: "one" } }], []);
    expect(ok.ok && ok.value[0]?.character).toEqual({ for: "dating-sim", cast: "one" });
    const s = SEEDS[0] as Seed;
    expect(seedFacets(s)).toBe("adult · romance › slow burn · character · short · for dating-sim · cast one");
    const plain = SEEDS[4] as Seed;
    expect(body(plain)).toBe([plain.sentence, plain.audience, plain.genre, plain.subgenre, plain.type, plain.format, ""].join("\n"));
    expect(body(s)).toBe(`${[s.sentence, s.audience, s.genre, s.subgenre, s.type, s.format, ""].join("\n")}\nfor dating-sim · cast one`);
  });

  it("a character idea grows from a kept character seed: none, or another kind, is refused", async () => {
    writeJson(path.join(ROOT, "scout", "seeds", BATCH, "batch.json"), BATCHES[0]);
    const p = parseIdeas([character({}, { seed: undefined })]);
    expect(p.ok && (await checkIdeaSeeds(p.value))).toMatchObject({ ok: false, error: { message: "idea 1: names no seed; a character idea grows from a kept character seed (seed: <batch>/sd-NNN)" } });
    const q = parseIdeas([character({}, { seed: ADULT_SHORT })]);
    expect(q.ok && (await checkIdeaSeeds(q.value))).toMatchObject({ ok: false, error: { message: `idea 1: seed: ${ADULT_SHORT} is a animated short seed; a character idea grows from a character seed` } });
    const r = parseIdeas([character({})]);
    expect(r.ok && (await checkIdeaSeeds(r.value))).toEqual({ ok: true, value: undefined });
  });
});

/* ── end to end ────────────────────────────────────────────────────────────── */

function writeJson(p: string, v: unknown): void {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v), "utf8");
}

async function cli(argv: string[], o: { env?: Record<string, string | undefined>; ports?: CliPorts } = {}): Promise<{ code: number; err: string; doc: Record<string, unknown> }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: o.env ?? DRY, out: (s) => out.push(s), err: (s) => err.push(s), ...(o.ports === undefined ? {} : { ports: o.ports }) });
  let doc: Record<string, unknown> = {};
  try {
    doc = JSON.parse(out.join("\n")) as Record<string, unknown>;
  } catch {
    /* not a --json call */
  }
  return { code, err: err.join("\n"), doc };
}

let seq = 0;
function input(v: unknown): string {
  const p = path.join(ROOT, `in-${++seq}.json`);
  writeFileSync(p, JSON.stringify(v), "utf8");
  return p;
}

const eye = (json: Record<string, unknown>) => async (): Promise<Recognition> => ({ text: "", json, provenance: { provider: "ollama", model: "eye", modelBasis: "requested", durationMs: 1 } });
const read = (o: Record<string, unknown> = {}) => ({ adult: "yes", apparentAge: 33, clothing: "covered", realPerson: "no", hands: "ok", notes: "painterly", ...o });

describe("a scout night draws characters", () => {
  it("live on the fake studio: low quality and the eye for a character or a cast only, the parody clause, the kids line, no source pixel", async () => {
    writeJson(path.join(ROOT, "scout", "seeds", BATCH, "batch.json"), BATCHES[0]);
    writeJson(path.join(ROOT, "scout", NIGHT, "night.json"), scoutNight);
    writeJson(path.join(ROOT, "scout-muse", NIGHT, "night.json"), archiveNight);
    const opened = await cli(["open", "--json", "--live"], { env: LIVE });
    expect(opened.code, opened.err).toBe(0);
    const id = String(opened.doc["night"]);
    await mutateNight(id, (n) => ({ ...n, sources: [{ id: "s-01", url: "https://www.youtube.com/watch?v=fixture", kind: "video", title: "A dating-sim's opening", why: "a first-meeting card done in one light", found: "search", rights: "reference-only", status: "ingested", files: ["sources/s-01/k-001.jpg"] }] }));

    // A name the archive rejected is refused - the night ids collide and the guard reads both roots.
    const repeat = await cli(["ideas", id, "--json", input([character({ name: "Tove Lind" })])], { env: LIVE });
    expect(repeat.err).toBe(`idea 1: card Tove Lind already drawn in muse:${NIGHT}/c-03 (rejected)`);

    const seen: GenerateRequest[] = [];
    const asked: RecognizeRequest[] = [];
    const answers = [eye(read()), eye(read()), eye(read({ adult: "no", apparentAge: 9 }))];
    const ports: CliPorts = {
      ideas: {
        generate: async (req) => {
          seen.push(req);
          return generate(req);
        },
        recognize: async (r) => {
          asked.push(r);
          const next = answers.shift();
          if (next === undefined) throw new Error("the eye was asked more often than the batch draws someone");
          return next();
        },
      },
    };
    const batch = [
      brief("Lantern fishers at low tide"),
      character({ name: "Ines Vale" }, { source: "s-01", look: "painterly-ines" }),
      brief("The captain salutes the rain", { cast: ["Captain Brass"] }),
      brief("Pip counts the fireflies", { cast: ["Pip Lantern"], seed: KIDS_SHORT }),
    ];
    const r = await cli(["ideas", id, "--json", input(batch)], { env: LIVE, ports });
    expect(r.code, r.err).toBe(0);
    expect(r.doc["jobId"]).toBe(`job:scout-ideas:${id}:c-01`);
    expect(seen.map((g) => [g.aspect, g.quality])).toEqual([
      ["16:9", undefined],
      ["9:16", "low"],
      ["16:9", "low"],
      ["16:9", "low"],
    ]);
    // Words only: no request to the studio carries a picture.
    for (const g of seen) expect(Object.keys(g).sort()).toEqual(["aspect", "count", "prefer", "prompt", ...(g.quality === undefined ? [] : ["quality"])].sort());
    expect(seen[2]?.prompt.startsWith(identityBlock(BRASS))).toBe(true);
    expect(asked.map((a) => a.instruction.includes(PARODY_CLAUSE))).toEqual([false, true, false]);

    const ideas = (await readNight(id)).candidates.filter((c): c is IdeaCandidate => c.kind === "idea");
    expect(ideas.map((c) => [c.status, c.judge === undefined])).toEqual([
      ["rendered", true],
      ["rendered", false],
      ["rendered", false],
      // A kids character's still reads as a child and is kept: the adult read stands down, nudity and likeness do not.
      ["rendered", false],
    ]);
    expect(ideas[1]).toMatchObject({ source: "s-01", sourceIds: [], card: { name: "Ines Vale", audience: "adult" }, fromSeed: DATING });
    expect(ideas[2]?.cast).toEqual(["Captain Brass"]);
    expect(FAKE_LEONARDO_STUDIO.calls).toHaveLength(4);
  }, 60_000); // a night's ideas job: ~1 s alone, past vitest's 5 s default under the pre-push gate's load
});
