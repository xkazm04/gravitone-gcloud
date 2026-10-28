// THE MUSE LINE, ON A SCOUT NIGHT (spark scout-muse WP2; re-pointed by spark scout-vision S3, when the muse rules moved
// from the WING to the BRIEF) - `pipeline/scout.mts ideas` end to end, every store a temp directory set below before
// any lib/ module loads: a character idea on any night (her card, her stated age, the refused words) beside briefs that
// draw nobody and read none of it; the eye's judge over a fake recognize; and the scout-ideas job of a scout night -
// its bare job id, a character drawn 9:16 at quality low and judged before it is written, a failing still never kept,
// the idea that draws nobody drawn at the studio's default and never judged. No vendor, no browser, no network: the
// fake studio records, the eye is scripted, and fetch throws. The card rules by audience and app, the cast and the
// source are tests/next-server/scout-characters.test.ts.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-muse-idea-"));
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

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeProcessKernel } from "@gt/kernel/process";

import { runCli, type CliPorts } from "../../pipeline/scout.mts";
import { checkCharacters, parseIdeas } from "../../lib/foundry/scout/idea.ts";
import { judgeInstruction, judgeStill, JUDGE_INSTRUCTION, PARODY_CLAUSE, STAND_JUDGE } from "../../lib/foundry/scout/judge.ts";
import { judgeFailure, type MuseJudge } from "../../lib/foundry/scout/muse.ts";
import { readNight, resolveInNight } from "../../lib/foundry/scout/store.ts";
import type { IdeaCandidate, Seed, SeedBatch } from "../../lib/foundry/scout/types.ts";
import { __resetBudget } from "../../lib/imaging/budget.ts";
import { FAKE_LEONARDO_STUDIO, resetFakeLeonardoStudio } from "../../lib/imaging/providers/leonardoStudio.ts";
import { generate } from "../../lib/imaging/router.ts";
import type { GenerateRequest, Recognition, RecognizeRequest } from "../../lib/imaging/types.ts";

const DRY = { ...process.env, GRAVITONE_DRY_ONLY: "1" };
const LIVE = (() => {
  const { GRAVITONE_DRY_ONLY: _pin, ...rest } = process.env;
  return rest;
})();

// One kept character seed (an adult roleplay cast of one) and one kept seed of another kind: once a seed is kept,
// every brief grows from one, and a character from the first.
const BATCH = "2026-09-01";
const SEEDS: Seed[] = [
  { id: "sd-001", sentence: "A cartographer who flirts in map projections.", genre: "romance", subgenre: "slow burn", type: "character", audience: "adult", format: "short", character: { for: "roleplay", cast: "one" } },
  { id: "sd-002", sentence: "A harbour at dusk told in five flat tones.", genre: "mood piece", subgenre: "harbour", type: "animated short", audience: "adult", format: "short" },
];
const SEED_BATCH: SeedBatch = { id: BATCH, createdAt: `${BATCH}T00:00:00.000Z`, dry: false, seeds: SEEDS, committed: { at: `${BATCH}T08:00:00.000Z`, by: "operator", kept: ["sd-001", "sd-002"], rejected: [], reasons: {}, notes: {}, dry: false } };
const CHARACTER_SEED = `${BATCH}/sd-001`;
const OTHER_SEED = `${BATCH}/sd-002`;

beforeAll(() => {
  const p = path.join(ROOT, "scout", "seeds", BATCH, "batch.json");
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(SEED_BATCH), "utf8");
});
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
function batch(body: unknown): string {
  const p = path.join(ROOT, `ideas-${++seq}.json`);
  writeFileSync(p, JSON.stringify(body), "utf8");
  return p;
}

const CARD = { name: "Mara Veil", age: 34, look: "auburn bob, grey eyes, freckles, long camel trench coat", personality: "dry wit, never hurries" };
const brief = (title: string, o: Record<string, unknown> = {}) => ({
  title,
  target: "style",
  genre: "character poster",
  prompt: `A poster of a woman aged 34, ${title.toLowerCase()}, painterly finish, three-quarter view, soft rim light.`,
  anchor: { kind: "watch", ref: "- look: painterly portraits" },
  app: "roleplay",
  appTarget: "avatar portrait for a companion",
  aim: "extract a new artstyle: painterly finish",
  look: "painterly-noir",
  seed: OTHER_SEED,
  ...o,
});
const character = (name: string, o: Record<string, unknown> = {}) => brief(name, { target: "character", card: { ...CARD, name }, seed: CHARACTER_SEED, prompt: `${name}, aged 34, auburn bob, grey eyes, freckles, long camel trench coat, photoreal portrait.`, ...o });
const IDEAS = [brief("Gouache noir detective"), brief("Rain-lit station farewell", { target: "scene", prompt: "Two women share an umbrella on a rain-lit platform, anime cel shading, wide frame." }), character("Mara Veil")];
// The live night draws a character the dry night did not: the repeat guard (lib/foundry/scout/ideaRepeat.ts) refuses a card or look drawn on an earlier night.
const LIVE_IDEAS = [IDEAS[0], character("Ines Roca", { look: "painterly-ines" }), character("Tove Lind", { look: "painterly-tove" }), character("Asta Moor", { look: "painterly-asta" })];

const WORLD = { batches: [SEED_BATCH], kept: [], night: { id: "2026-09-20", sources: [] } };
const refusal = (raw: unknown): string => {
  const p = parseIdeas(raw);
  const r = p.ok ? checkCharacters(p.value, WORLD) : p;
  return r.ok ? "ok" : r.error.message;
};
const at2 = (o: Record<string, unknown>, k = 2): string => refusal([IDEAS[0], ...Array<unknown>(k - 2).fill(IDEAS[0]), character("Mara Veil", o)]);

describe("the character door on any night", () => {
  it("accepts style, scene and character in one batch: a character draws 9:16 unless it names its aspect, the rest 16:9, and she carries her card", () => {
    const r = parseIdeas([...IDEAS, character("Ines Roca", { aspect: "16:9" })]);
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((b) => [b.target, b.aspect])).toEqual([
      ["style", undefined],
      ["scene", undefined],
      ["character", "9:16"],
      ["character", undefined],
    ]);
    expect(r.value[2]?.card).toEqual(CARD);
  });

  it("refuses a character without her card, a card on any other idea, a studio aspect it does not draw, and her age off her seed's rules", () => {
    expect(at2({ card: undefined })).toBe("idea 2: card: a character idea carries her card {name, age, look, personality}");
    expect(refusal([brief("x", { card: CARD })])).toBe("idea 1: card: only a character idea carries a card");
    // The studio's page offers 16:9, 1:1 and 9:16 only (read 2026-10-23): a 4:5 brief would fail at the radio.
    expect(at2({ aspect: "4:5" })).toBe("idea 2: aspect: the studio draws 16:9, 1:1, 9:16; it has no 4:5");
    expect(at2({ card: { ...CARD, age: 24 }, prompt: "Mara Veil, aged 24." })).toBe("idea 2: card.age: an adult-audience character is 25 or older; 24 is under");
    // A roleplay seed holds her to 50 (the operator, 2026-10-24).
    expect(at2({ card: { ...CARD, age: 51 }, prompt: "Mara Veil, aged 51." })).toBe("idea 2: card.age: a roleplay character is 50 or younger; 51 is over");
  });

  it("refuses a character prompt that states no age or another age than her card's; the case of `Aged` does not matter", () => {
    expect(at2({ prompt: "Mara Veil in a trench coat, painterly." })).toBe('idea 2: prompt: states no age; a character prompt says "aged 34", her card\'s age');
    expect(at2({ prompt: "Mara Veil, aged 31, auburn bob." })).toBe('idea 2: prompt: "aged 31" is not her card\'s age, 34');
    expect(at2({ prompt: "Mara Veil and a friend aged 30 and aged 19, painterly." })).toBe('idea 2: prompt: "aged 30" is not her card\'s age, 34');
    expect(at2({ prompt: "Mara Veil, Aged 34, painterly." })).toBe("ok");
  });

  it("refuses a youth word and a nudity or sexual word anywhere in a character's brief, whole-word and case-blind; girlfriend passes", () => {
    expect(at2({ title: "Teen detective" })).toBe('idea 2: title: "Teen" is a youth word; only a stylised kids or family character under 18 takes one');
    expect(at2({ prompt: "Mara Veil, aged 34, in a school  uniform, painterly." })).toBe('idea 2: prompt: "school  uniform" is a youth word; only a stylised kids or family character under 18 takes one');
    expect(at2({ genre: "schoolgirl drama" })).toMatch(/^idea 2: genre: "schoolgirl" is a youth word/);
    expect(at2({ card: { ...CARD, look: "petite girl, freckles" } })).toMatch(/^idea 2: card\.look: "petite girl" is a youth word/);
    expect(at2({ prompt: "Mara Veil, aged 34, in lingerie, painterly." })).toBe('idea 2: prompt: "lingerie" is a nudity or sexual word; every brief is SFW');
    expect(at2({ appTarget: "an NSFW pin-up" })).toMatch(/^idea 2: appTarget: "NSFW" is a nudity or sexual word/);
    expect(at2({ anchor: { kind: "watch", ref: "- look: topless beach" } })).toMatch(/^idea 2: anchor\.ref: "topless" is a nudity or sexual word/);
    expect(at2({ prompt: "Mara Veil, aged 34, laughs with her girlfriend at a kidney-shaped pool, painterly." })).toBe("ok");
  });

  it("one bad brief refuses the batch, naming its place", () => {
    expect(at2({ prompt: "Mara Veil, aged 34, nude, painterly." }, 3)).toMatch(/^idea 3: prompt: "nude"/);
  });

  it("leaves a brief that draws nobody as it was: no age, no word list, any aspect", () => {
    const r = parseIdeas([brief("Lantern fishers", { target: "scene", prompt: "Lantern fishers at low tide, loose gouache thumbnail, wide frame." })]);
    expect(r.ok && r.value[0]).toEqual({ title: "Lantern fishers", target: "scene", genre: "character poster", prompt: "Lantern fishers at low tide, loose gouache thumbnail, wide frame.", anchor: { kind: "watch", ref: "- look: painterly portraits" }, use: "roleplay: avatar portrait for a companion", app: "roleplay", aim: "extract a new artstyle: painterly finish", look: "painterly-noir", seed: OTHER_SEED });
    expect(refusal([brief("a", { prompt: "A teen band on a stage, gouache." })])).toBe("ok");
    expect(refusal([brief("a", { aspect: "4:5" })])).toBe("ok");
    const wide = parseIdeas([brief("a", { aspect: "9:16" })]);
    expect(wide.ok && wide.value[0]?.aspect).toBe("9:16");
  });
});

const read = (j: Partial<MuseJudge> = {}): Record<string, unknown> => ({ adult: "yes", apparentAge: 32, clothing: "covered", realPerson: "no", hands: "ok", notes: "painterly, warm key light", ...j });
const eye = (json: unknown) => async (): Promise<{ json?: unknown }> => ({ json });
const IMG = { base64: "AA==", mime: "image/png" as const };

describe("the judge", () => {
  it("passes an adult, covered, fictional still, and fails each field of the line by name", async () => {
    const ok = await judgeStill(IMG, { recognize: eye(read()) });
    expect(ok.ok && judgeFailure(ok.value)).toBe(null);
    const fail = async (j: Partial<MuseJudge>, o: { minors?: boolean } = {}): Promise<string | null> => {
      const r = await judgeStill(IMG, { recognize: eye(read(j)) });
      if (!r.ok) throw r.error;
      return judgeFailure(r.value, o);
    };
    expect(await fail({ adult: "unsure" })).toBe("adult unsure");
    expect(await fail({ adult: "no" })).toBe("adult no");
    expect(await fail({ apparentAge: 19 })).toBe("apparent age 19");
    expect(await fail({ apparentAge: 0 })).toBe("apparent age unread");
    expect(await fail({ clothing: "nude" })).toBe("clothing nude");
    expect(await fail({ realPerson: "maybe" })).toBe("real person maybe");
    expect(await fail({ clothing: "revealing", hands: "bad" })).toBe(null);
    expect(judgeFailure(STAND_JUDGE)).toBe(null);
    // A kids or family character's still: the adult read stands down; nudity and likeness never do.
    expect(await fail({ adult: "no", apparentAge: 9 }, { minors: true })).toBe(null);
    expect(await fail({ adult: "no", apparentAge: 9, clothing: "nude" }, { minors: true })).toBe("clothing nude");
    expect(await fail({ adult: "no", apparentAge: 9, realPerson: "maybe" }, { minors: true })).toBe("real person maybe");
  });

  it("asks for exactly the judge's fields, the parody clause only when asked, and an answer out of shape, absent or thrown is an err", async () => {
    const asked: RecognizeRequest[] = [];
    const record = async (r: RecognizeRequest) => {
      asked.push(r);
      return { json: read() };
    };
    await judgeStill(IMG, { recognize: record });
    await judgeStill(IMG, { recognize: record }, { parody: true });
    expect(asked[0]?.schema?.["required"]).toEqual(["adult", "apparentAge", "clothing", "realPerson", "hands", "notes"]);
    expect(asked.map((a) => a.instruction)).toEqual([JUDGE_INSTRUCTION, `${JUDGE_INSTRUCTION}\n${PARODY_CLAUSE}`]);
    // The real-actor test stays in both.
    expect(judgeInstruction({ parody: true })).toContain('realPerson: "maybe" if any face resembles a specific real, recognisable person');
    const { notes: _n, ...short } = read();
    expect((await judgeStill(IMG, { recognize: eye(short) })).ok).toBe(false);
    expect((await judgeStill(IMG, { recognize: eye({ ...read(), adult: "probably" }) })).ok).toBe(false);
    expect((await judgeStill(IMG, { recognize: eye(undefined) })).ok).toBe(false);
    const thrown = await judgeStill(IMG, {
      recognize: async () => {
        throw new Error("google declined the image: safety");
      },
    });
    expect(!thrown.ok && thrown.error.message).toBe("google declined the image: safety");
  });
});

const ideasOf = async (night: string): Promise<IdeaCandidate[]> => (await readNight(night)).candidates.filter((c): c is IdeaCandidate => c.kind === "idea");

async function open(env: Record<string, string | undefined>, args: string[] = []): Promise<string> {
  const r = await cli(["open", "--json", ...args], { env });
  expect(r.code, r.err).toBe(0);
  return String(r.doc["night"]);
}

describe("a scout night's character ideas job", () => {
  it("dry: a bare job id, the character's stand-in judged as STAND_JUDGE and the rest unjudged, no studio and no eye asked, nothing in the archive", async () => {
    const never: CliPorts = {
      ideas: {
        generate: async () => {
          throw new Error("a dry ideas job called the studio");
        },
        recognize: async () => {
          throw new Error("a dry ideas job asked the eye");
        },
      },
    };
    const night = await open(DRY);
    const r = await cli(["ideas", night, "--json", batch(IDEAS)], { ports: never });
    expect(r.code, r.err).toBe(0);
    expect(r.doc["jobId"]).toBe(`job:scout-ideas:${night}:c-01`);
    const ideas = await ideasOf(night);
    expect(ideas.map((c) => [c.status, c.aspect, c.judge])).toEqual([
      ["rendered", undefined, undefined],
      ["rendered", undefined, undefined],
      ["rendered", "9:16", STAND_JUDGE],
    ]);
    expect(ideas[2]?.card).toEqual({ ...CARD, audience: "adult" });
    expect(FAKE_LEONARDO_STUDIO.calls).toEqual([]);
    expect(existsSync(path.join(ROOT, "scout", night, "ideas", "c-03.png"))).toBe(true);
    expect(existsSync(path.join(ROOT, "scout-muse", night))).toBe(false);
  }, 60_000); // a night's ideas job: ~1 s alone, past vitest's 5 s default under the pre-push gate's load

  it("live on the fake studio: a character drawn 9:16 at quality low; a failing or unread still is never written, its candidate failed `judge: ...`", async () => {
    const seen: GenerateRequest[] = [];
    const answers: (() => Promise<Recognition>)[] = [
      async () => ({ text: "", json: read(), provenance: { provider: "ollama", model: "eye", modelBasis: "requested", durationMs: 1 } }),
      async () => ({ text: "", json: read({ adult: "unsure", apparentAge: 20 }), provenance: { provider: "ollama", model: "eye", modelBasis: "requested", durationMs: 1 } }),
      async () => {
        throw new Error("no recognize provider answered");
      },
    ];
    const ports: CliPorts = {
      ideas: {
        generate: async (req) => {
          seen.push(req);
          return generate(req);
        },
        recognize: async () => {
          const next = answers.shift();
          if (next === undefined) throw new Error("the eye was asked more often than the batch has characters");
          return next();
        },
      },
    };
    const night = await open(LIVE, ["--live"]);
    const r = await cli(["ideas", night, "--json", batch(LIVE_IDEAS)], { env: LIVE, ports });
    expect(r.code, r.err).toBe(0);
    expect(seen.map((g) => [g.aspect, g.quality, g.prefer])).toEqual([["16:9", undefined, "leonardo-studio"], ...Array(3).fill(["9:16", "low", "leonardo-studio"])]);
    // Every studio generation is deleted once held, whatever the eye then said.
    expect(FAKE_LEONARDO_STUDIO.deletes).toEqual(["fake-gen-0001", "fake-gen-0002", "fake-gen-0003", "fake-gen-0004"]);
    const ideas = await ideasOf(night);
    expect(ideas.map((c) => [c.status, c.image, c.error])).toEqual([
      ["rendered", "ideas/c-01.png", undefined],
      ["rendered", "ideas/c-02.png", undefined],
      ["failed", undefined, "judge: adult unsure"],
      ["failed", undefined, "judge: unavailable - no recognize provider answered"],
    ]);
    expect(ideas[0]?.judge).toBeUndefined();
    expect(ideas[1]?.judge).toEqual(read());
    expect(ideas[2]?.judge).toMatchObject({ adult: "unsure", apparentAge: 20 });
    expect(ideas[3]?.judge).toBeUndefined();
    expect(existsSync(resolveInNight(night, "ideas/c-02.png"))).toBe(true);
    expect(existsSync(resolveInNight(night, "ideas/c-03.png"))).toBe(false);
    expect(existsSync(resolveInNight(night, "ideas/c-04.png"))).toBe(false);
  }, 60_000); // a night's ideas job: ~1 s alone, past vitest's 5 s default under the pre-push gate's load
});
