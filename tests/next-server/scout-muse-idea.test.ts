// THE MUSE WING'S IDEAS (spark scout-muse WP2) - `pipeline/scout.mts --wing muse ideas` end to end,
// every store a temp directory set below before any lib/ module loads: the muse door (its targets, the
// card, the stated age, the refused words) beside the unchanged scout door; the eye's judge over a fake
// recognize; and the scout-ideas job of a muse night - its own job id, its stills drawn 4:5 at quality
// low, each one judged before it is written, a failing still never kept. No vendor, no browser, no
// network: the fake studio records, the eye is scripted, and fetch throws.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeProcessKernel } from "@gt/kernel/process";

import { runCli, type CliPorts } from "../../pipeline/scout.mts";
import { parseIdeas } from "../../lib/foundry/scout/idea.ts";
import { judgeStill, STAND_JUDGE } from "../../lib/foundry/scout/judge.ts";
import { judgeFailure, type MuseJudge } from "../../lib/foundry/scout/muse.ts";
import { readNight, resolveInNight } from "../../lib/foundry/scout/store.ts";
import type { IdeaCandidate } from "../../lib/foundry/scout/types.ts";
import { withWing } from "../../lib/foundry/scout/wingScope.ts";
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
  ...o,
});
const MUSE = [
  brief("Gouache noir detective"),
  brief("Rain-lit station farewell", { target: "scene", prompt: "Two women aged 29 and 41 share an umbrella on a rain-lit platform, anime cel shading, wide frame." }),
  brief("Mara Veil", { target: "character", card: CARD, prompt: "Mara Veil, aged 34, auburn bob, grey eyes, freckles, long camel trench coat, photoreal portrait." }),
];
const SCOUT = [brief("Lantern fishers at low tide", { target: "scene", prompt: "Lantern fishers at low tide, loose gouache thumbnail, wide frame." })];

const refusal = (raw: unknown, wing: "scout" | "muse"): string => {
  const r = parseIdeas(raw, wing);
  return r.ok ? "ok" : r.error.message;
};
const muse = (o: Record<string, unknown>, k = 2): string => refusal([MUSE[0], ...Array<unknown>(k - 2).fill(MUSE[0]), brief("x", o)], "muse");

describe("the muse door", () => {
  it("accepts a batch of style, scene and character; each idea draws 4:5 unless it names its aspect, and a character carries her card", () => {
    const r = parseIdeas([...MUSE, brief("Wide establishing look", { aspect: "16:9" })], "muse");
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((b) => [b.target, b.aspect])).toEqual([
      ["style", "4:5"],
      ["scene", "4:5"],
      ["character", "4:5"],
      ["style", undefined],
    ]);
    expect(r.value[2]?.card).toEqual(CARD);
  });

  it("refuses a target the wing does not draw", () => {
    expect(muse({ target: "asset3d", use: "a game's armoury" })).toBe("idea 2: target: asset3d is not drawn in the muse wing (it draws style, scene, character)");
    const reel = { brief: { case: "c", title: "t", hook: "h", unit: "u", kind: "counter", data: [1], illustrative: true }, approach: { name: "n", medium: "svg", grammar: "stepped", density: "low", direction: "d", falsifier: "f" } };
    const stats = muse({ target: "stats", reel });
    expect(stats.startsWith("idea 2: reel.") ? "the reel fixture no longer parses" : stats).toBe("idea 2: target: stats is not drawn in the muse wing (it draws style, scene, character)");
  });

  it("refuses a character without her card, a card on any other idea, and a card's age outside 25..60", () => {
    expect(muse({ target: "character" })).toBe("idea 2: card: a character idea carries her card {name, age, look, personality}");
    expect(muse({ card: CARD })).toBe("idea 2: card: only a character idea carries a card");
    expect(muse({ target: "character", card: { ...CARD, age: 24 } })).toBe("idea 2: card.age: her age is a whole number from 25 to 60");
    expect(muse({ target: "character", card: { ...CARD, age: 61 } })).toBe("idea 2: card.age: her age is a whole number from 25 to 60");
  });

  it("refuses a prompt that states no age, an age under 25, and a character prompt whose age is not her card's", () => {
    expect(muse({ prompt: "A poster of a woman in a trench coat, painterly." })).toBe('idea 2: prompt: states no age; a muse prompt says "aged NN", 25 or older');
    expect(muse({ prompt: "A poster of a woman aged 22, painterly." })).toBe('idea 2: prompt: "aged 22" is under 25, the youngest a muse prompt may state');
    expect(muse({ prompt: "Two women aged 30 and aged 19, painterly." })).toBe('idea 2: prompt: "aged 19" is under 25, the youngest a muse prompt may state');
    expect(muse({ target: "character", card: CARD, prompt: "Mara Veil, aged 31, auburn bob." })).toBe('idea 2: prompt: "aged 31" is not her card\'s age, 34');
    expect(muse({ prompt: "A woman Aged 40, painterly." })).toBe("ok");
  });

  it("refuses a youth word and a nudity or sexual word anywhere in the brief, whole-word and case-blind; girlfriend passes", () => {
    expect(muse({ title: "Teen detective" })).toBe('idea 2: title: "Teen" is a youth word; the muse wing draws adult women only');
    expect(muse({ prompt: "A woman aged 30 in a school  uniform, painterly." })).toBe('idea 2: prompt: "school  uniform" is a youth word; the muse wing draws adult women only');
    expect(muse({ genre: "schoolgirl drama" })).toMatch(/^idea 2: genre: "schoolgirl" is a youth word/);
    expect(muse({ target: "character", card: { ...CARD, look: "petite girl, freckles" }, prompt: "Mara Veil, aged 34." })).toMatch(/^idea 2: card\.look: "petite girl" is a youth word/);
    expect(muse({ prompt: "A woman aged 30 in lingerie, painterly." })).toBe('idea 2: prompt: "lingerie" is a nudity or sexual word; the muse wing is SFW');
    expect(muse({ use: "an NSFW pin-up" })).toMatch(/^idea 2: use: "NSFW" is a nudity or sexual word/);
    expect(muse({ anchor: { kind: "watch", ref: "- look: topless beach" } })).toMatch(/^idea 2: anchor\.ref: "topless" is a nudity or sexual word/);
    expect(muse({ prompt: "His girlfriend, aged 33, laughs at a kidney-shaped pool, painterly." })).toBe("ok");
  });

  it("one bad brief refuses the batch, naming its place", () => {
    expect(muse({ prompt: "A woman aged 30, nude, painterly." }, 3)).toMatch(/^idea 3: prompt: "nude"/);
  });

  it("leaves the scout door as it was, and refuses a card or a character there", () => {
    const r = parseIdeas(SCOUT, "scout");
    expect(r.ok && r.value[0]).toEqual({ title: SCOUT[0]?.title, target: "scene", genre: "character poster", prompt: SCOUT[0]?.prompt, anchor: SCOUT[0]?.anchor });
    expect(refusal([brief("a", { target: "character", card: CARD })], "scout")).toBe("idea 1: target: character is the muse wing's target (--wing muse)");
    expect(refusal([brief("a", { card: CARD })], "scout")).toBe("idea 1: card: a character card is the muse wing's (--wing muse)");
    // No age and a refused word pass on the scout wing: its line is its own.
    expect(refusal([brief("a", { prompt: "A teen band on a stage, gouache." })], "scout")).toBe("ok");
    const wide = parseIdeas([brief("a", { aspect: "4:5" })], "scout");
    expect(wide.ok && wide.value[0]?.aspect).toBe("4:5");
    // Outside any scope the door is the scout wing's.
    expect(parseIdeas([brief("a", { card: CARD })]).ok).toBe(false);
    expect(withWing("muse", () => parseIdeas(MUSE)).ok).toBe(true);
  });
});

const read = (j: Partial<MuseJudge> = {}): Record<string, unknown> => ({ adult: "yes", apparentAge: 32, clothing: "covered", realPerson: "no", hands: "ok", notes: "painterly, warm key light", ...j });
const eye = (json: unknown) => async (): Promise<{ json?: unknown }> => ({ json });
const IMG = { base64: "AA==", mime: "image/png" as const };

describe("the judge", () => {
  it("passes an adult, covered, fictional still, and fails each field of the line by name", async () => {
    const ok = await judgeStill(IMG, { recognize: eye(read()) });
    expect(ok.ok && judgeFailure(ok.value)).toBe(null);
    const fail = async (j: Partial<MuseJudge>): Promise<string | null> => {
      const r = await judgeStill(IMG, { recognize: eye(read(j)) });
      if (!r.ok) throw r.error;
      return judgeFailure(r.value);
    };
    expect(await fail({ adult: "unsure" })).toBe("adult unsure");
    expect(await fail({ adult: "no" })).toBe("adult no");
    expect(await fail({ apparentAge: 19 })).toBe("apparent age 19");
    expect(await fail({ apparentAge: 0 })).toBe("apparent age unread");
    expect(await fail({ clothing: "nude" })).toBe("clothing nude");
    expect(await fail({ realPerson: "maybe" })).toBe("real person maybe");
    expect(await fail({ clothing: "revealing", hands: "bad" })).toBe(null);
    expect(judgeFailure(STAND_JUDGE)).toBe(null);
  });

  it("asks for exactly the judge's fields, and an answer out of shape, absent or thrown is an err", async () => {
    let asked: RecognizeRequest | undefined;
    await judgeStill(IMG, {
      recognize: async (r) => {
        asked = r;
        return { json: read() };
      },
    });
    expect(asked?.schema?.["required"]).toEqual(["adult", "apparentAge", "clothing", "realPerson", "hands", "notes"]);
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

async function openIn(wing: "scout" | "muse", env: Record<string, string | undefined>, args: string[] = []): Promise<string> {
  const r = await cli(["--wing", wing, "open", "--json", ...args], { env });
  expect(r.code, r.err).toBe(0);
  return String(r.doc["night"]);
}

describe("a muse night's ideas job", () => {
  it("dry: its own job id, the stand-in judged as STAND_JUDGE, no studio and no eye asked; a scout batch the same day keeps its id", async () => {
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
    const night = await openIn("muse", DRY);
    const r = await cli(["--wing", "muse", "ideas", night, "--json", batch(MUSE)], { ports: never });
    expect(r.code, r.err).toBe(0);
    expect(r.doc["jobId"]).toBe(`job:scout-ideas:muse:${night}:c-01`);
    const ideas = await withWing("muse", () => ideasOf(night));
    expect(ideas.map((c) => [c.status, c.aspect, c.judge])).toEqual(Array(3).fill(["rendered", "4:5", STAND_JUDGE]));
    expect(ideas[2]?.card).toEqual(CARD);
    expect(FAKE_LEONARDO_STUDIO.calls).toEqual([]);

    // Each wing numbers its own nights: the same day's first night in each is the same id.
    const scout = await openIn("scout", DRY);
    expect(scout).toBe(night);
    const s = await cli(["ideas", scout, "--json", batch(SCOUT)], { ports: never });
    expect(s.code, s.err).toBe(0);
    expect(s.doc["jobId"]).toBe(`job:scout-ideas:${scout}:c-01`);
    const kept = await ideasOf(scout);
    expect(kept.map((c) => [c.status, c.aspect, c.judge])).toEqual([["rendered", undefined, undefined]]);
    expect(existsSync(path.join(ROOT, "scout-muse", night, "ideas", "c-03.png"))).toBe(true);
    expect(existsSync(path.join(ROOT, "scout", night, "ideas", "c-03.png"))).toBe(false);
  });

  it("live on the fake studio: drawn 4:5 at quality low; a failing or unread still is never written, its candidate failed `judge: ...`", async () => {
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
          if (next === undefined) throw new Error("the eye was asked more often than the batch has stills");
          return next();
        },
      },
    };
    const night = await openIn("muse", LIVE, ["--live"]);
    const r = await cli(["--wing", "muse", "ideas", night, "--json", batch(MUSE)], { env: LIVE, ports });
    expect(r.code, r.err).toBe(0);
    expect(seen.map((g) => [g.aspect, g.quality, g.prefer])).toEqual(Array(3).fill(["4:5", "low", "leonardo-studio"]));
    expect(FAKE_LEONARDO_STUDIO.calls.map((c) => c.aspect)).toEqual(["4:5", "4:5", "4:5"]);
    // Every studio generation is deleted once held, whatever the eye then said.
    expect(FAKE_LEONARDO_STUDIO.deletes).toEqual(["fake-gen-0001", "fake-gen-0002", "fake-gen-0003"]);
    await withWing("muse", async () => {
      const ideas = await ideasOf(night);
      expect(ideas.map((c) => [c.status, c.image, c.error])).toEqual([
        ["rendered", "ideas/c-01.png", undefined],
        ["failed", undefined, "judge: adult unsure"],
        ["failed", undefined, "judge: unavailable - no recognize provider answered"],
      ]);
      expect(ideas[0]?.judge).toEqual(read());
      expect(ideas[1]?.judge).toMatchObject({ adult: "unsure", apparentAge: 20 });
      expect(ideas[2]?.judge).toBeUndefined();
      expect(existsSync(resolveInNight(night, "ideas/c-01.png"))).toBe(true);
      expect(existsSync(resolveInNight(night, "ideas/c-02.png"))).toBe(false);
      expect(existsSync(resolveInNight(night, "ideas/c-03.png"))).toBe(false);
    });
  });
});
