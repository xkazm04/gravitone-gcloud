// THE NIGHT'S REGISTRY DIGEST (lib/foundry/scout/registry.ts) and its doctor note: the
// media-generation techniques tonight's directions match, ranked and capped; the registry's gaps
// (draft subjects, thin subjects, the project's open questions); one consults line with bare
// slugs, and none when no registry resolved. Every registry here is a FIXTURE tree in a temp
// directory and every repo a temp directory: no test reads the real registry or writes the
// checkout's `.ai/`.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { doctor, doctorLine, type DoctorInput } from "../../lib/foundry/scout/doctor.ts";
import { registryDigest, watchlistDirections } from "../../lib/foundry/scout/registry.ts";
import { manifestRegistryLocal as manifestLocal } from "../../lib/articles/registryRead.ts";
import type { SpawnResult } from "../../lib/foundry/scout/ingest.ts";

const DIR = mkdtempSync(path.join(os.tmpdir(), "gt-scout-registry-"));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));
// The shell may carry the operator's AI_REGISTRY_DIR: every test starts without it.
beforeEach(() => vi.stubEnv("AI_REGISTRY_DIR", ""));
afterEach(() => vi.unstubAllEnvs());

let n = 0;
const fresh = (name: string): string => {
  const d = path.join(DIR, `${name}-${++n}`);
  mkdirSync(d, { recursive: true });
  return d;
};
const put = (file: string, text: string): void => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text, "utf8");
};

/** Fourteen camera techniques: more than the twelve a digest may name, four more than one subject's share. */
const CAMERA = Array.from({ length: 14 }, (_, i) => ({ slug: `camera-move-${String(i).padStart(2, "0")}`, use_when: [`unrelated filler ${i}`, `a camera movement must read as dread ${i}`] }));

/** Three subjects: a forged one with applications, a draft, and a forged visual one with none. */
function registry(): string {
  const root = fresh("registry");
  const sub = (cat: string, slug: string) => `knowledge/media-generation/${cat}/${slug}/${slug}.md`;
  const index = {
    meta: { bundle: "media-generation" },
    subjects: {
      "cinematic-language": {
        category: "visual-generation",
        status: "forged",
        file: sub("visual-generation", "cinematic-language"),
        techniques: [{ slug: "scene-grammar-progression", use_when: ["auditing a mix", "planning a shot list in scene grammar order before generation"] }, ...CAMERA],
        applications: [{ technique: "scene-grammar-progression" }, { technique: "camera-move-00" }],
      },
      "data-video-virality": {
        category: "narrative-craft",
        status: "draft",
        file: sub("narrative-craft", "data-video-virality"),
        techniques: [{ slug: "hook-in-two-seconds", use_when: ["a genre short opens without a hook"] }],
        applications: [],
      },
      "frame-direction": {
        category: "visual-generation",
        status: "forged",
        file: sub("visual-generation", "frame-direction"),
        techniques: [{ slug: "motion-intent-authoring", use_when: ["writing what a frame does over its duration", "specifying camera movement for a beat"] }, { slug: "plate-split", use_when: ["keeping glyphs out of plates"] }],
        applications: [],
      },
    },
    laws: {},
  };
  put(path.join(root, "knowledge/media-generation/index.json"), JSON.stringify(index));
  for (const s of Object.values(index.subjects)) put(path.join(root, s.file), "---\n---\n");
  put(path.join(root, "knowledge/media-generation/visual-generation/cinematic-language/applications/next--a.md"), "a");
  put(path.join(root, "knowledge/media-generation/visual-generation/cinematic-language/applications/process--b.md"), "b");
  mkdirSync(path.join(root, "knowledge/media-generation/visual-generation/frame-direction/applications"), { recursive: true });
  return root;
}

/** A repo: a watchlist, OPEN-QUESTIONS.md, an `.ai/` with a manifest naming `registryLocal` when given. */
function repo(o: { registryLocal?: string } = {}): string {
  const root = fresh("repo");
  put(path.join(root, "knowledge/scout/watchlist.md"), "# Scout watchlist\n\n`- <kind>: <name>` per line.\n\n## Watching\n\n- tag: one-take shots - https://example.test/x - camera path, blocking\n");
  put(path.join(root, "knowledge/OPEN-QUESTIONS.md"), "# Open questions\n\n## Q1 · Is the hazard list complete, or merely un-probed?\n\ntext\n\n### Q1a · A sub-question\n");
  mkdirSync(path.join(root, ".ai"), { recursive: true });
  if (o.registryLocal !== undefined) put(path.join(root, ".ai/manifest.yaml"), `schema: ai-manifest\nregistry:\n  remote: github:x/ai-registry\n  local: ${o.registryLocal}  # the checkout\nknowledge:\n  local: nope\n`);
  return root;
}

const consults = (root: string): string[] => {
  const f = path.join(root, ".ai/consults.jsonl");
  return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l !== "") : [];
};
const section = (text: string, heading: string): string[] => {
  const after = text.split(`## ${heading}\n\n`)[1] ?? "";
  return after.split("\n\n")[0]?.split("\n").filter((l) => l.startsWith("- ")) ?? [];
};

describe("the registry digest", () => {
  it("names at most twelve governing techniques, ranked, four per subject, with the index's file verbatim", async () => {
    const reg = registry();
    const r = repo();
    const d = await registryDigest({ registryDir: reg, repoDir: r, directions: ["scene grammar", "planning a shot list", "camera movement lighting"] });
    const governs = section(d.text, "Governs tonight");
    expect(d.text.startsWith("# Registry\n\n## Governs tonight\n\n")).toBe(true);
    expect(governs.length).toBeLessThanOrEqual(12);
    expect(governs[0]).toBe("- cinematic-language/scene-grammar-progression - planning a shot list in scene grammar order before generation (knowledge/media-generation/visual-generation/cinematic-language/cinematic-language.md)");
    expect(governs.filter((l) => l.startsWith("- cinematic-language/"))).toHaveLength(4);
    expect(governs).toContain("- frame-direction/motion-intent-authoring - specifying camera movement for a beat (knowledge/media-generation/visual-generation/frame-direction/frame-direction.md)");
    // The best-matching use_when is the one quoted, not the first.
    expect(governs[1]).toMatch(/ - a camera movement must read as dread \d+ \(/);
    expect(d.registryDir).toBe(reg);
  });

  it("caps the governing lines at twelve when one subject per technique would allow more", async () => {
    const reg = registry();
    const index = JSON.parse(readFileSync(path.join(reg, "knowledge/media-generation/index.json"), "utf8")) as { subjects: Record<string, unknown> };
    for (let i = 0; i < 20; i++) index.subjects[`lens-${i}`] = { category: "narrative-craft", status: "forged", file: `knowledge/media-generation/narrative-craft/lens-${i}/lens-${i}.md`, techniques: [{ slug: "lens-pick", use_when: ["camera movement"] }] };
    writeFileSync(path.join(reg, "knowledge/media-generation/index.json"), JSON.stringify(index));
    const d = await registryDigest({ registryDir: reg, repoDir: repo(), directions: ["camera movement"] });
    expect(section(d.text, "Governs tonight")).toHaveLength(12);
    expect(d.techniques.length).toBeLessThanOrEqual(12);
  });

  it("lifts a subject scout's acts are governed by over a stronger match outside them - a multiplier, not a tier", async () => {
    const reg = fresh("governing");
    const subject = (cat: string, slug: string, technique: string, useWhen: string[]) => [slug, { category: cat, status: "forged", file: `knowledge/media-generation/${cat}/${slug}/${slug}.md`, techniques: [{ slug: technique, use_when: useWhen }] }] as const;
    const subjects = Object.fromEntries([
      // Answers three quarters of one direction, in a governing subject whose slug shares no word
      // with the scout vocabulary (visual-style-locking would, through "style").
      subject("visual-generation", "image-prompt-composition", "partial-answer", ["risograph ink misregistration"]),
      // Answers that whole direction, outside: raw, it is the better match.
      subject("narrative-craft", "outside-one", "whole-answer", ["risograph ink misregistration paper"]),
      // Answers all four directions, outside: the boost must not bury it.
      subject("narrative-craft", "outside-four", "every-answer", ["risograph ink misregistration paper", "halftone dots", "screen print", "spot colour"]),
    ]);
    put(path.join(reg, "knowledge/media-generation/index.json"), JSON.stringify({ subjects }));
    const d = await registryDigest({ registryDir: reg, repoDir: repo(), directions: ["risograph ink misregistration paper", "halftone dots", "screen print", "spot colour"] });
    expect(section(d.text, "Governs tonight").map((l) => l.split(" - ")[0])).toEqual(["- outside-four/every-answer", "- image-prompt-composition/partial-answer", "- outside-one/whole-answer"]);
  });

  it("lists the gaps: the draft subject, the thin visual subject, and the open questions' headings", async () => {
    const d = await registryDigest({ registryDir: registry(), repoDir: repo(), directions: ["camera"] });
    const gaps = section(d.text, "Gaps");
    expect(gaps.length).toBeLessThanOrEqual(8);
    expect(gaps).toEqual([
      "- data-video-virality (draft) - look for: published evidence on data video virality to forge it",
      "- frame-direction (0 applications) - look for: a worked case of writing what a frame does over its duration",
      "- OPEN-QUESTIONS Q1 - look for: Is the hazard list complete, or merely un-probed?",
      "- OPEN-QUESTIONS Q1a - look for: A sub-question",
    ]);
    // cinematic-language has two application files: not thin.
    expect(gaps.some((l) => l.includes("cinematic-language"))).toBe(false);
    for (const g of gaps) expect(g.split(" - look for: ")[1]?.split(" ").length).toBeLessThanOrEqual(15);
  });

  it("reads the watchlist's bullets as directions when none are given, their kind and url dropped", async () => {
    expect(watchlistDirections("# W\n\n`- <kind>: x`\n\n- tag: one-take shots - https://example.test/x - camera path\n* channel: Foo\n")).toEqual(["one-take shots - camera path", "Foo"]);
    const d = await registryDigest({ registryDir: registry(), repoDir: repo() });
    expect(section(d.text, "Governs tonight").length).toBeGreaterThan(0);
  });

  it("writes one consults line per digest, bare slugs only", async () => {
    const r = repo();
    const d = await registryDigest({ registryDir: registry(), repoDir: r, directions: ["scene grammar"] });
    const lines = consults(r);
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(Object.keys(row)).toEqual(["ts", "bundle", "subjects", "techniques", "deviations"]);
    expect(row).toMatchObject({ bundle: "media-generation", deviations: 0, subjects: d.subjects, techniques: d.techniques });
    expect(row["ts"]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(d.subjects).toContain("cinematic-language");
    expect(d.techniques).toContain("scene-grammar-progression");
    for (const s of [...d.subjects, ...d.techniques]) expect(s).toMatch(/^[a-z0-9-]+$/);
    await registryDigest({ registryDir: registry(), repoDir: r, directions: ["scene grammar"] });
    expect(consults(r)).toHaveLength(2);
  });

  it("an absent registry is `registry: none (...)`, never a throw, and logs nothing", async () => {
    const r = repo();
    const missing = await registryDigest({ registryDir: path.join(DIR, "no-such-registry"), repoDir: r });
    expect(missing.text).toMatch(/^# Registry\n\nregistry: none \(the registryDir option names .*no-such-registry, which does not exist\)\n$/);
    expect(missing).toMatchObject({ subjects: [], techniques: [] });
    expect(missing.registryDir).toBeUndefined();
    const empty = fresh("empty-registry");
    expect((await registryDigest({ registryDir: empty, repoDir: r })).text).toMatch(/registry: none \(no knowledge\/media-generation\/index\.json under /);
    expect((await registryDigest({ repoDir: r })).text).toBe("# Registry\n\nregistry: none (no AI_REGISTRY_DIR and no .ai/manifest.yaml)\n");
    expect(consults(r)).toEqual([]);
  });

  it("resolves the registry from AI_REGISTRY_DIR, then the manifest's registry.local relative to the repo", async () => {
    const reg = registry();
    vi.stubEnv("AI_REGISTRY_DIR", reg);
    expect((await registryDigest({ repoDir: repo({ registryLocal: "../nowhere" }), directions: ["genre"] })).registryDir).toBe(reg);
    vi.stubEnv("AI_REGISTRY_DIR", "");
    const r = repo({ registryLocal: path.relative(fresh("x"), reg).replace(/\\/g, "/") });
    // `fresh("x")` and the repo are siblings under DIR, so the same relative path resolves from the repo.
    const viaManifest = await registryDigest({ repoDir: r, directions: ["genre"] });
    expect(viaManifest.registryDir).toBe(reg);
    expect(consults(r)).toHaveLength(1);
    expect(manifestLocal("registry:\n  remote: x\n  local: \"../ai-registry\" # c\nother:\n  local: y\n")).toBe("../ai-registry");
    expect(manifestLocal("other:\n  local: y\n")).toBeUndefined();
    const none = await registryDigest({ repoDir: repo({ registryLocal: "../nowhere" }) });
    expect(none.text).toMatch(/registry: none \(registry\.local names .*nowhere, which does not exist\)/);
  });
});

describe("the doctor's registry note", () => {
  const spawn = async (bin: string): Promise<SpawnResult> => ({ ok: true, stdout: Buffer.from(`${bin} version 9.9\n`), stderr: "" });
  const input = (o: Partial<DoctorInput>): DoctorInput => ({ env: { SCOUT_CLIP_ENGINE: "hailuo" }, storePath: path.join(DIR, "kernel.sqlite"), scoutRoot: path.join(DIR, "scout"), dry: true, spawn, ...o });
  const note = async (o: Partial<DoctorInput>) => (await doctor(input(o))).find((c) => c.name === "registry");

  it("names where the registry was found and how many techniques it holds", async () => {
    const reg = registry();
    const c = await note({ env: { SCOUT_CLIP_ENGINE: "hailuo", AI_REGISTRY_DIR: reg }, repoDir: repo() });
    expect(c).toMatchObject({ ok: true, needed: false, found: `found at ${reg} with 18 techniques` });
  });

  it("notes an absent registry with its remedy, and never blocks a night", async () => {
    const c = await note({ repoDir: repo() });
    expect(c).toMatchObject({ ok: false, needed: false });
    expect(doctorLine(c ?? { name: "registry", ok: true, found: "", needed: false })).toBe(`note ${"registry".padEnd(19)} registry: none (no AI_REGISTRY_DIR and no .ai/manifest.yaml) -> set AI_REGISTRY_DIR or .ai/manifest.yaml registry.local`);
    const live = await note({ dry: false, repoDir: repo({ registryLocal: "../nowhere" }) });
    expect(live).toMatchObject({ ok: false, needed: false });
  });
});
