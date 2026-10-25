// TWO ROOTS, ONE LOOP (spark scout-muse WP1; merged by spark scout-vision S3): under withWing("muse") every scout read
// lands in the muse root - since the merge a read-only ARCHIVE - and outside a scope, or under withWing("scout"), in the
// scout root, where every new night is written. Read here: the nights per root; the ONE taste brief (the scout nights'
// verdicts, and the character sections over both roots); a source's dedupe across both; the seed batches and the steer
// (the scout root's); the registry digest over both watchlists; the doctor's one night type; and the CLI, which takes
// --wing muse for `status` only. Both roots, the knowledge tree and the kernel store are temp paths; no vendor, no job.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-wing-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "muse");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  return dir;
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { MERGED_WING, runCli } from "../../pipeline/scout.mts";
import { morning } from "../../lib/foundry/scout/acts.ts";
import type { NightBudget } from "../../lib/foundry/scout/budget.ts";
import { blocking, doctor, type DoctorInput } from "../../lib/foundry/scout/doctor.ts";
import { registryDigest } from "../../lib/foundry/scout/registry.ts";
import { createSeedBatch, listSeedBatches, mutateSeedBatch } from "../../lib/foundry/scout/seedStore.ts";
import { seedsInForce } from "../../lib/foundry/scout/seeds.ts";
import { seenElsewhere, urlKey } from "../../lib/foundry/scout/sources.ts";
import { EMPTY_STEER, readSteer, setSplit } from "../../lib/foundry/scout/steer.ts";
import { createNight, listNights, mutateNight, readAllNights, rootOf, scoutRoot } from "../../lib/foundry/scout/store.ts";
import { tasteBrief } from "../../lib/foundry/scout/taste.ts";
import { MUSE_FINDINGS_HEADING } from "../../lib/foundry/scout/tasteMuse.ts";
import { mergePart, nextPart, partRefusal, splitPart } from "../../lib/foundry/scout/parts.ts";
import type { IdeaCandidate, Night, NightCommit } from "../../lib/foundry/scout/types.ts";
import { parseWingRunId, wingRunId, type ScoutWing } from "../../lib/foundry/scout/wing.ts";
import { activeWing, withWing } from "../../lib/foundry/scout/wingScope.ts";
import type { SpawnResult } from "../../lib/foundry/scout/ingest.ts";

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const DAY = "2026-10-24";
const NOW = new Date(`${DAY}T20:00:00.000Z`);
const KNOWLEDGE = path.join(ROOT, "knowledge");

const idea = (id: string, title: string): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title, target: "character", prompt: `${title}, drawn`, anchor: { kind: "free", ref: "free" } });

/** A live night in `wing`, committed with one idea kept and one blocked, and one source a candidate used. */
async function committedNight(wing: ScoutWing, tag: string): Promise<Night> {
  return withWing(wing, async () => {
    const n = await createNight({ dry: false, day: DAY, now: NOW });
    return mutateNight(n.id, (x) => ({
      ...x,
      state: "committed",
      sources: [{ id: "s-01", url: `https://www.youtube.com/watch?v=${tag}`, kind: "video", title: `${tag} source`, why: "craft", found: "search", rights: "reference-only", status: "ingested", files: [] }],
      candidates: [{ ...idea("c-01", `${tag} kept idea`), sourceIds: ["s-01"] }, idea("c-02", `${tag} blocked idea`)],
      committed: { at: NOW.toISOString(), by: "operator", kept: ["c-01/board"], rejected: ["c-02/board"], reasons: { "c-02/board": ["craft"] }, notes: { "c-02/board": `${tag} note` }, dry: false },
    }));
  });
}

describe("the wing's root", () => {
  it("rootOf honours each wing's env var, and scoutRoot follows the scope - scout outside any", () => {
    expect(rootOf("scout")).toBe(path.join(ROOT, "scout"));
    expect(rootOf("muse")).toBe(path.join(ROOT, "muse"));
    expect(scoutRoot()).toBe(rootOf("scout"));
    expect(withWing("scout", () => scoutRoot())).toBe(rootOf("scout"));
    expect(withWing("muse", () => scoutRoot())).toBe(rootOf("muse"));
  });

  it("wingRunId and parseWingRunId round-trip; an unknown prefix is no wing's", () => {
    for (const wing of ["scout", "muse"] as const) expect(parseWingRunId(wingRunId(wing, DAY))).toEqual({ wing, night: DAY });
    expect(wingRunId("scout", DAY)).toBe(DAY);
    expect(wingRunId("muse", DAY)).toBe(`muse:${DAY}`);
    expect(parseWingRunId(`bogus:${DAY}`)).toBeNull();
    expect(parseWingRunId(`scout:${DAY}`)).toBeNull();
  });

  it("a remainder packet's run names its part after the night, in either wing (spark scout-storyboards)", () => {
    expect([wingRunId("scout", DAY, 2), wingRunId("muse", DAY, 3), wingRunId("scout", DAY, 1)]).toEqual([`${DAY}:2`, `muse:${DAY}:3`, DAY]);
    expect(parseWingRunId(`${DAY}:2`)).toEqual({ wing: "scout", night: DAY, part: 2 });
    expect(parseWingRunId(`muse:${DAY}:2`)).toEqual({ wing: "muse", night: DAY, part: 2 });
    // `:1` is never spelled; it is not a part, and the id names no night of the wing.
    expect(parseWingRunId(`muse:${DAY}:1`)).toEqual({ wing: "muse", night: `${DAY}:1` });
    expect(parseWingRunId(`bogus:${DAY}:2`)).toBeNull();
  });

  it("a part merges into the night's record: union, open, parts, a redelivery, a contradiction, a part out of turn", () => {
    const rec = (kept: string[], rejected: string[], open?: string[], at = "t1"): NightCommit => ({ at, by: "operator", kept, rejected, reasons: {}, notes: {}, dry: false, ...(open === undefined ? {} : { open }) });
    const one = mergePart(undefined, rec(["a"], ["b"], ["c", "d"]), 1);
    if (one.kind !== "write") throw new Error(one.kind);
    expect(one.next).toEqual({ ...rec(["a"], ["b"], ["c", "d"]), parts: 1 });
    expect(mergePart(undefined, rec(["a"], ["b"]), 1)).toEqual({ kind: "write", next: rec(["a"], ["b"]) });
    expect(mergePart(undefined, rec(["c"], []), 2)).toMatchObject({ kind: "refuse" });
    const two = mergePart(one.next, rec(["c"], [], ["d"], "t2"), 2);
    if (two.kind !== "write") throw new Error(two.kind);
    expect(two.next).toMatchObject({ kept: ["a", "c"], rejected: ["b"], open: ["d"], parts: 2, partAt: ["t2"], at: "t1" });
    expect(mergePart(two.next, rec(["c"], [], ["d"], "t9"), 2)).toEqual({ kind: "same" });
    expect(mergePart(two.next, rec(["a"], ["b"], ["c", "d"]), 1)).toEqual({ kind: "same" });
    expect(mergePart(two.next, rec([], ["c"], ["d"]), 2)).toEqual({ kind: "differ", why: "c is keep in v1, reject here" });
    expect(mergePart(two.next, rec(["d"], []), 4)).toEqual({ kind: "refuse", why: "part 4 does not follow part 2" });
    expect([nextPart(two.next), partRefusal(two.next, 3), partRefusal(two.next, 2), partRefusal(rec(["a"], []), 2)]).toEqual([3, undefined, "part 2 is not the next part (3)", "already committed"]);
    expect([splitPart("2026-10-24:12"), splitPart("2026-10-24"), splitPart("x:0")]).toEqual([{ run: "2026-10-24", part: 12 }, { run: "2026-10-24", part: 1 }, { run: "x:0", part: 1 }]);
  });

  it("the close's packet names the wing: a muse night's link is pkt:scout:muse:<night>, the scout night's is unchanged", () => {
    // The first live muse close printed pkt:scout:<night> - a link into the scout wing's night of the same id.
    const n = { id: "2026-10-23-2", state: "closed", candidates: [] } as unknown as Night;
    const b = { settledUsd: 0, uncappedUsd: 0, heldUsd: 0 } as unknown as NightBudget;
    expect(withWing("muse", () => morning(n, b).packet)).toBe("pkt:scout:muse:2026-10-23-2");
    expect(morning(n, b).packet).toBe("pkt:scout:2026-10-23-2");
  });

  it("two concurrent scopes do not leak into each other across an await", async () => {
    const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5));
    const read = (w: ScoutWing) =>
      withWing(w, async () => {
        await tick();
        const first = [activeWing(), scoutRoot()];
        await tick();
        return [...first, activeWing(), scoutRoot()];
      });
    const [a, b] = await Promise.all([read("scout"), read("muse")]);
    expect(a).toEqual(["scout", rootOf("scout"), "scout", rootOf("scout")]);
    expect(b).toEqual(["muse", rootOf("muse"), "muse", rootOf("muse")]);
    expect(activeWing()).toBe("scout");
  });
});

describe("nights per root, one taste brief, dedupe across both", () => {
  let scout: Night;
  let muse: Night;

  it("a night opened in each wing is listed and read only in its own", async () => {
    scout = await committedNight("scout", "scoutonly");
    muse = await committedNight("muse", "museonly");
    // The same day names both: the root, not the id, keeps them apart.
    expect([scout.id, muse.id]).toEqual([DAY, DAY]);
    for (const [w, tag] of [["scout", "scoutonly"], ["muse", "museonly"]] as const) {
      const ids = await withWing(w, async () => (await listNights()).map((s) => s.id));
      expect(ids).toEqual([DAY]);
      const all = await withWing(w, readAllNights);
      expect(all.map((n) => n.sources[0]?.title)).toEqual([`${tag} source`]);
    }
    // Outside a scope is the scout wing.
    expect((await readAllNights()).map((n) => n.sources[0]?.title)).toEqual(["scoutonly source"]);
  });

  it("the one brief holds the scout nights' verdicts; the archive's nights are never read as verdicts", async () => {
    const s = await tasteBrief();
    expect(s).toContain('"scoutonly blocked idea"');
    expect(s).toContain("scoutonly note");
    expect(s).not.toContain("museonly");
    expect(await withWing("scout", () => tasteBrief())).toBe(s);
  });

  it("the one brief carries the character sections over both roots: kept characters (keptCharacters), technique findings (techniques.md, legacy), already drawn; `none yet` while empty", async () => {
    const empty = await tasteBrief();
    expect(empty).toContain("## Kept characters\n\n- none yet\n\n## Technique findings\n\n- none yet\n\n## Already drawn\n\n- none yet\n");
    // A kept character on the archive (c-01, with her card and still) and a new one kept on the scout night of the SAME id.
    const mara = { name: "Mara Voss", age: 34, look: "silver bob, green coat", personality: "dry wit" };
    const ines = { name: "Ines Roca", age: 41, look: "cropped grey hair, oilskin jacket", personality: "patient", kind: "original" as const, audience: "adult" as const, render: "stylised" as const };
    await withWing("muse", () => mutateNight(DAY, (x) => ({ ...x, candidates: x.candidates.map((c) => (c.id === "c-01" && c.kind === "idea" ? { ...c, card: mara, image: "ideas/c-01.png" } : c)) })));
    await mutateNight(DAY, (x) => ({ ...x, candidates: x.candidates.map((c) => (c.id === "c-01" && c.kind === "idea" ? { ...c, card: ines, image: "ideas/c-01.png" } : c)) }));
    const found = `- rim light reads older than flat light - "a rim adds a decade" (n=1, scout ${DAY}) <!-- scout:${DAY}/c-03 -->`;
    mkdirSync(path.join(KNOWLEDGE, "scout-muse"), { recursive: true });
    // characters.md is the keep's file, not the brief's source: a line only there is not a kept character.
    writeFileSync(path.join(KNOWLEDGE, "scout-muse", "characters.md"), `# Muse characters\n\n## Kept characters\n\n- **Only In The File**, aged 30 - x. Plays: y.\n`, "utf8");
    writeFileSync(path.join(KNOWLEDGE, "scout-muse", "techniques.md"), `# Muse techniques\n\n## The line\n\n- not this\n\n## Scout findings\n\n${found}\n\n## Later\n\n- nor this\n`, "utf8");
    const s = await tasteBrief();
    expect(s).toContain(
      [
        "## Kept characters",
        "",
        `- Mara Voss, aged 34 - silver bob, green coat · adult · original · no sheet yet · last kept muse:${DAY}/c-01`,
        `- Ines Roca, aged 41 - cropped grey hair, oilskin jacket · adult · original · stylised · no sheet yet · last kept ${DAY}/c-01`,
        "",
        MUSE_FINDINGS_HEADING,
        "",
        found,
        "",
        "## Already drawn",
      ].join("\n"),
    );
    expect(s).not.toContain("Only In The File");
    expect(s).not.toContain("not this");
    expect(s).not.toContain("nor this");
    expect(s.match(/- (Mara Voss|Ines Roca) \(/g)?.sort()).toEqual(["- Ines Roca (", "- Mara Voss ("]);
  });

  it("seenElsewhere dedupes a URL across the scout root and the archive (named by its run id); the archive's own scope sees only itself", async () => {
    const scoutKey = urlKey("https://youtu.be/scoutonly");
    const museKey = urlKey("https://youtu.be/museonly");
    const s = await seenElsewhere("2099-01-01");
    const m = await withWing("muse", () => seenElsewhere("2099-01-01"));
    expect(s.get(scoutKey)).toBe(`${DAY}/s-01`);
    expect(s.get(museKey)).toBe(`muse:${DAY}/s-01`);
    expect(m.get(museKey)).toBe(`${DAY}/s-01`);
    expect(m.has(scoutKey)).toBe(false);
  });
});

describe("seeds and the steer per wing", () => {
  it("a kept seed in the scout root puts seeds in force for scout and not for muse; each wing lists its own batches", async () => {
    await withWing("scout", async () => {
      const b = await createSeedBatch(DAY, (id) => ({ id, createdAt: NOW.toISOString(), dry: false, seeds: [{ id: "sd-001", sentence: "A lighthouse keeper rations the light.", genre: "drama", subgenre: "quiet study", type: "animated short", audience: "adult", format: "short" }] }));
      await mutateSeedBatch(b.id, (x) => ({ ...x, committed: { at: NOW.toISOString(), by: "operator", kept: ["sd-001"], rejected: [], reasons: {}, notes: {}, dry: false } }));
    });
    const s = await withWing("scout", listSeedBatches);
    const m = await withWing("muse", listSeedBatches);
    expect(s.map((b) => b.id)).toEqual([DAY]);
    expect(m).toEqual([]);
    expect(seedsInForce(s)).toBe(true);
    expect(seedsInForce(m)).toBe(false);
  });

  it("a steer set in one wing is not read by the other", async () => {
    const set = await withWing("muse", () => setSplit({ audience: { adult: 100 } }, "operator", NOW));
    expect(set.ok).toBe(true);
    expect((await withWing("muse", readSteer)).split).toEqual({ audience: { adult: 100 } });
    expect(await withWing("scout", readSteer)).toEqual(EMPTY_STEER);
    expect(await readSteer()).toEqual(EMPTY_STEER);
  });
});

describe("the registry digest reads both watchlists", () => {
  it("tonight's directions are the scout watchlist's and the muse archive's, whatever the scope", async () => {
    const repo = path.join(ROOT, "repo");
    const registry = path.join(ROOT, "registry");
    const put = (file: string, text: string): void => {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, text, "utf8");
    };
    put(path.join(repo, "knowledge", "scout", "watchlist.md"), "# Scout\n\n- tag: quokka parade choreography\n");
    put(path.join(repo, "knowledge", "scout-muse", "watchlist.md"), "# Muse\n\n- tag: zygomatic cheekbone glow\n");
    const file = "knowledge/media-generation/a/a.md";
    put(
      path.join(registry, "knowledge", "media-generation", "index.json"),
      JSON.stringify({ subjects: { quokka: { status: "forged", file, techniques: [{ slug: "parade", use_when: ["quokka parade choreography"] }] }, zygomatic: { status: "forged", file, techniques: [{ slug: "glow", use_when: ["zygomatic cheekbone glow"] }] } } }),
    );
    const s = await registryDigest({ repoDir: repo, registryDir: registry });
    const m = await withWing("muse", () => registryDigest({ repoDir: repo, registryDir: registry }));
    expect([...s.subjects].sort()).toEqual(["quokka", "zygomatic"]);
    expect(m.subjects).toEqual(s.subjects);
  });
});

describe("the doctor, one night type", () => {
  const T = Date.parse(`${DAY}T22:00:00.000Z`);
  const spawnFails = async (): Promise<SpawnResult> => ({ ok: false, error: "not found" });
  const input = (root: string): DoctorInput => ({
    env: { GOOGLE_AI_API_KEY: "set", LEONARDO_API_KEY: "set", COMFY_URL: "http://comfy.test:8188" },
    storePath: path.join(ROOT, "kernel.sqlite"),
    scoutRoot: root,
    dry: false,
    tracks: 2,
    spawn: spawnFails,
    keyFetch: async () => ({ ok: true, status: 200, text: async () => "{}" }),
    fetch: async () => {
      throw new TypeError("fetch failed");
    },
    worker: async () => T - 60_000,
    now: () => T,
    studio: async () => ({ ok: true }),
    chromium: async () => path.join(ROOT, "no-chromium"),
    suno: async () => ({ ok: false, reason: "no browser" }),
  });

  it("a live night is blocked by its binaries, its clip engine and Suno, in any scope: there is no stills-only night", async () => {
    const s = blocking(await doctor(input(rootOf("scout")))).map((c) => c.name);
    expect(s).toEqual(expect.arrayContaining(["yt-dlp", "ffmpeg", "ffprobe", "comfyui", "suno"]));
    const m = blocking(await withWing("muse", () => doctor(input(rootOf("scout"))))).map((c) => c.name);
    expect(m).toEqual(s);
  });

  it("a night folder that cannot be written names SCOUT_STORE_DIR", async () => {
    const blocked = path.join(ROOT, "a-file");
    writeFileSync(blocked, "x", "utf8");
    const s = await doctor(input(path.join(blocked, "under")));
    expect(s.find((c) => c.name === "nights")?.remedy).toMatch(/set SCOUT_STORE_DIR$/);
  });
});

describe("the CLI: one night type, the archive by status only", () => {
  const cli = async (argv: string[]): Promise<{ code: number; out: string[]; err: string[] }> => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(argv, { env: { GRAVITONE_DRY_ONLY: "1" }, out: (x) => out.push(x), err: (x) => err.push(x) });
    return { code, out, err };
  };

  it("refuses every command but status under --wing muse, naming /scout, and writes nothing in either root", async () => {
    const before = [await listNights(), await withWing("muse", listNights)];
    for (const argv of [["--wing", "muse", "open"], ["open", "--wing", "muse", "--json"], ["--wing", "muse", "ideas", DAY, "--json", "-"], ["--wing", "muse", "close", DAY], ["--wing", "muse", "doctor"], ["--wing", "muse"]]) {
      const r = await cli(argv);
      expect([r.code, r.err], argv.join(" ")).toEqual([3, [MERGED_WING]]);
      expect(r.out).toEqual([]);
    }
    expect(MERGED_WING).toBe("the muse wing is merged into /scout (spark scout-vision S3); its nights are an archive - status --wing muse lists them");
    expect([await listNights(), await withWing("muse", listNights)]).toEqual(before);
    expect((await cli(["--wing", "nope", "status"])).code).toBe(2);
  });

  it("status --wing muse lists the archive's nights by run id, read-only; status alone lists the scout root's", async () => {
    const archive = await cli(["--wing", "muse", "status"]);
    expect(archive.code, archive.err.join("\n")).toBe(0);
    expect(archive.out.map((l) => l.split(" ")[0])).toEqual([`muse:${DAY}`]);
    const json = await cli(["status", "--wing", "muse", "--json"]);
    expect(JSON.parse(json.out.join("\n"))).toMatchObject({ ok: true, archive: true, nights: [{ id: DAY }] });
    const scout = await cli(["status", "--json"]);
    const doc = JSON.parse(scout.out.join("\n")) as Record<string, unknown>;
    expect(doc["archive"]).toBeUndefined();
    expect((doc["nights"] as { id: string }[]).map((n) => n.id)).toEqual([DAY]);
    const one = await cli(["--wing", "muse", "status", DAY]);
    expect(one.code, one.err.join("\n")).toBe(0);
    expect(one.out[0]).toMatch(new RegExp(`^archive night muse:${DAY} · committed`));
  });

  it("open (with or without --wing scout) opens a scout night with every cap, never one in the archive", async () => {
    const r = await cli(["open", "--wing", "scout", "--json"]);
    expect(r.code, r.err.join("\n")).toBe(0);
    const doc = JSON.parse(r.out.join("\n")) as Record<string, unknown>;
    expect(doc).toMatchObject({ ok: true, ceilingUsd: 15, dry: true });
    expect(doc["clipCap"]).toBeGreaterThan(0);
    expect(doc["reelCap"]).toBeGreaterThan(0);
    expect((await listNights()).map((n) => n.id)).toContain(doc["night"]);
    expect((await withWing("muse", listNights)).map((n) => n.id)).toEqual([DAY]);
  });
});
