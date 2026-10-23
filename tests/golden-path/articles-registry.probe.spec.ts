// LANE — READING THE POST STANDARD BY ADDRESS (lib/articles/registryRead.ts),
// and the prompt that carries it (lib/articles/prompt.ts).
//
// Pinned: the resolution order ($AI_REGISTRY_DIR, then .ai/manifest.yaml
// registry.local, then ../ai-registry); that an explicit $AI_REGISTRY_DIR that
// is wrong is an error and not a reason to look elsewhere; that the standard
// is read at the registry's own addresses and recorded with its version and a
// bundle hash that moves when the bundle does; and THE UNREACHABLE CASE — a
// run created with no registry fails with the named error and holds no stale
// standard. All against a throwaway registry clone. Also the trial sections of
// the writer's prompt (appended after the classic prompt for a trial run only,
// every slot filled, required by the loader) and `registry.remote`, which a
// trial run's source 1 cites.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { createRun, driveRun } from "@/lib/articles/engine";
import { buildPrompt, loadPromptFile, loadReviewPromptFile, PROMPT_PHASES, type PromptTrial, TRIAL_SECTIONS } from "@/lib/articles/prompt";
import {
  listTopicSubjects,
  manifestRegistryLocal,
  manifestRegistryRemote,
  RegistryUnreachableError,
  resolveRegistryDir,
  resolveRegistryRemote,
  resolveStandard,
  resolveTopicSubject,
  standardText,
} from "@/lib/articles/registryRead";
import { readRun } from "@/lib/articles/store";

import { keepEnv } from "./_helpers";
import { ARTICLE_ENV, articleSandbox, ROOT, type ArticleSandbox } from "./_articles";

keepEnv(ARTICLE_ENV);

let box: ArticleSandbox;
test.beforeEach(() => {
  box = articleSandbox();
});
test.afterEach(() => box.cleanup());

test("manifest: registry.local is read out of the registry block only", () => {
  const yaml = "repo:\n  local: wrong\nregistry:\n  remote: github:x/y\n  local: ../ai-registry  # the sibling\n  machine: secondary\nknowledge:\n  local: also-wrong\n";
  expect(manifestRegistryLocal(yaml)).toBe("../ai-registry");
  expect(manifestRegistryLocal("registry:\n  remote: x\n")).toBeUndefined();
  expect(manifestRegistryLocal("nothing: here\n")).toBeUndefined();
});

test("resolution order: env, then manifest, then ../ai-registry", () => {
  const repo = mkdtempSync(path.join(tmpdir(), "articles-repo-"));
  try {
    const env = { AI_REGISTRY_DIR: box.registry };
    expect(resolveRegistryDir(env, repo)).toEqual({ dir: box.registry, via: "env" });

    const rel = path.relative(repo, box.registry);
    expect(resolveRegistryDir({}, repo, () => `registry:\n  local: ${rel}\n`)).toEqual({ dir: path.resolve(repo, rel), via: "manifest" });

    // the manifest names nothing usable; a sibling ../ai-registry is next
    const parent = mkdtempSync(path.join(tmpdir(), "articles-parent-"));
    try {
      const child = path.join(parent, "gravitone");
      mkdirSync(child);
      mkdirSync(path.join(parent, "ai-registry", "recipes"), { recursive: true });
      mkdirSync(path.join(parent, "ai-registry", "knowledge"));
      writeFileSync(path.join(parent, "ai-registry", "recipes", "index.json"), "{}");
      expect(resolveRegistryDir({}, child, () => "registry:\n  local: ./nowhere\n")).toEqual({ dir: path.join(parent, "ai-registry"), via: "sibling" });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }

    // nothing anywhere
    expect(() => resolveRegistryDir({}, repo, () => undefined)).toThrow(RegistryUnreachableError);
    // an explicit env that is wrong does NOT fall through to the manifest
    expect(() => resolveRegistryDir({ AI_REGISTRY_DIR: path.join(repo, "nope") }, repo, () => `registry:\n  local: ${rel}\n`)).toThrow(/AI_REGISTRY_DIR points at/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("the standard: recipe version, subjects, laws and files at their addresses; the hash follows the bundle", async () => {
  const s = await resolveStandard();
  expect(s.standard).toMatchObject({ recipe: "technical-blog-post-authoring", version: "0.1.0", bundle: "technical-writing", subjects: ["article-structure", "voice-and-register"] });
  expect(s.standard.bundleHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(s.subjects.map((x) => x.file)).toEqual([
    "knowledge/technical-writing/craft/article-structure/article-structure.md",
    "knowledge/technical-writing/craft/voice-and-register/voice-and-register.md",
  ]);
  expect(s.laws).toEqual([{ name: "every-number-has-a-source", statement: "Every number in a post traces to a numbered source." }]);
  expect(s.files).toContain("recipes/creative_design/writing/technical-blog-post-authoring/recipe.json");
  const text = standardText(s);
  expect(text).toContain("### Golden path: article-structure (knowledge/technical-writing/craft/article-structure/article-structure.md)");
  expect(text).toContain("every-number-has-a-source");

  const index = path.join(box.registry, "knowledge", "technical-writing", "index.json");
  const j = JSON.parse(readFileSync(index, "utf8"));
  j.meta.touched = true;
  writeFileSync(index, JSON.stringify(j));
  expect((await resolveStandard()).standard.bundleHash).not.toBe(s.standard.bundleHash);
});

test("a missing recipe entry is a named error, not an empty standard", async () => {
  writeFileSync(path.join(box.registry, "recipes", "index.json"), JSON.stringify({ recipes: {} }));
  await expect(resolveStandard()).rejects.toThrow(/standard-missing: recipes\/index.json has no "technical-blog-post-authoring"/);
});

test("topics: a subject by address, and the picker's list across bundles", async () => {
  const t = await resolveTopicSubject("software-engineering/token-budgeting");
  expect(t).toMatchObject({ bundle: "software-engineering", subject: "token-budgeting", title: "Token budgeting" });
  await expect(resolveTopicSubject("software-engineering/nope")).rejects.toThrow(/no subject "nope"/);
  await expect(resolveTopicSubject("not an address")).rejects.toThrow(/<bundle>\/<slug>/);
  const all = await listTopicSubjects();
  expect(all.map((s) => `${s.bundle}/${s.slug}`)).toEqual(["software-engineering/token-budgeting", "technical-writing/article-structure", "technical-writing/voice-and-register"]);
});

test("UNREACHABLE: a run created with no registry fails with the named error and holds no standard", async () => {
  process.env.AI_REGISTRY_DIR = path.join(box.dir, "no-registry-here");
  const run = await createRun({ topic: { kind: "free", text: "token tax" } });
  expect(run.status).toBe("failed");
  expect(run.error).toMatch(/^registry-unreachable: /);
  expect(run.standard.version).toBeUndefined();
  expect(run.standard.bundleHash).toBeUndefined();
  expect(run.standard.subjects).toEqual([]);
});

test("UNREACHABLE mid-run: the registry vanishing before research fails the step by name", async () => {
  const run = await createRun({ topic: { kind: "free", text: "token tax" } });
  expect(run.status).toBe("queued");
  process.env.AI_REGISTRY_DIR = path.join(box.dir, "gone");
  const after = await driveRun(run.id);
  expect(after.status).toBe("failed");
  expect(after.error).toMatch(/^research: registry-unreachable: /);
  expect((await readRun(run.id)).steps.find((s) => s.name === "research")?.status).toBe("failed");
});

test("prompt: every phase fills every slot, carries its phase line, and inlines the standard by address", async () => {
  const file = await loadPromptFile(ROOT);
  expect(file.sha).toMatch(/^[0-9a-f]{64}$/);
  const s = await resolveStandard();
  for (const phase of ["research", "outline", "draft"] as const) {
    const p = buildPrompt(file, phase, {
      topic: { kind: "free", text: "the token tax", angle: "the bill" },
      standard: standardText(s),
      standardAddress: "recipes/index.json#technical-blog-post-authoring@0.1.0",
      today: "2026-10-05",
    });
    expect(p, `${phase}: an unfilled slot`).not.toMatch(/\{\{[A-Z_0-9]+\}\}/);
    expect(p).toContain(`ARTICLE-PHASE: ${phase}`);
    expect(p).toContain("A hook, a content preview, a through-line");
    expect(p).toContain("the bill");
    expect(p).not.toContain("section:");
  }
  const draft = buildPrompt(file, "draft", { topic: { kind: "free", text: "t" }, standard: "S", standardAddress: "A", today: "2026-10-05" });
  for (const contract of ["out/post/index.html", "out/post/post.md", "out/post/meta.json", "out/patches.json", 'data-role="content-preview"', 'id="sources"']) {
    expect(draft).toContain(contract);
  }
});

/* ── the trial sections (2026-10-18) ──────────────────────────────────────── */

const TRIAL: PromptTrial = {
  ref: { id: "t-slots", verdict: "challenged", technique: "count-before-send", alternative: "character estimate", metric: "overflow rate", n: 30, sourceN: 1, applicationPath: "knowledge/software-engineering/llm-agent/token-budgeting/applications/node--count-before-send.md" },
  prereg: {
    schema: "article-trial-prereg/1",
    subject: { bundle: "software-engineering", slug: "token-budgeting" },
    technique: "count-before-send",
    claim: "Count before send.",
    alternative: { name: "character estimate", description: "Characters over four.", source: { url: "https://example.org/e", title: "E", date: "2026-05-01" } },
    prior: "Counting wins.",
    question: "Does counting beat estimating?",
    arms: [
      { id: "golden", label: "counted", description: "Count." },
      { id: "alternative", label: "estimate", description: "Estimate." },
    ],
    metric: { id: "p50_ms", label: "median latency", unit: "ms", direction: "lower" },
    minEffect: { kind: "absolute", value: 5 },
    thresholds: [{ metric: "overflows", op: "<=", value: 0, label: "no overflow" }],
    n: 30,
    controls: [],
    stack: "node",
    environment: "node@24.12.0",
    budget: { wallMin: 20, modelCalls: 0 },
  },
  verdict: { schema: "article-trial-verdict/1", verdict: "challenged", reason: "The estimate is faster by 12 ms and clears every guard.", arms: [{ id: "golden", n: 30, mean: 40, sd: 3, guardsCleared: true }, { id: "alternative", n: 30, mean: 28, sd: 2.5, guardsCleared: true }], delta: 12, band: 5, deltaCi95: [10.6, 13.4], at: "2026-10-17T10:00:00.000Z" },
  results: {
    schema: "article-trial-results/1",
    arms: [
      { id: "golden", observations: Array.from({ length: 30 }, () => 40), guards: { overflows: 0 } },
      { id: "alternative", observations: Array.from({ length: 30 }, () => 28), guards: { overflows: 0 } },
    ],
    controls: [],
    modelCalls: 0,
  },
};

test("prompt, trial: each phase's trial section is appended after the classic prompt, every slot filled", async () => {
  const file = await loadPromptFile(ROOT);
  const ctx = { topic: { kind: "subject" as const, bundle: "software-engineering", subject: "token-budgeting", text: "Token budgeting" }, standard: "S", standardAddress: "A", today: "2026-10-18", round: 1, maxRounds: 2, checkFailures: "- x" };
  const marks: Record<string, string> = {
    research: "SOURCE 1 IS THE TRIAL.",
    outline: "THE POST IS A STORY OF A QUESTION, NOT A LAB REPORT",
    draft: "REGISTRY PATCHES, for this post, replace the draft phase's rule above.",
    critique: "METHOD FINDINGS",
    "revise-research": "METHOD FINDINGS",
    revise: "METHOD FINDINGS",
    fix: "METHOD FINDINGS",
  };
  for (const phase of PROMPT_PHASES) {
    const classic = buildPrompt(file, phase, ctx);
    const trial = buildPrompt(file, phase, { ...ctx, trial: TRIAL });
    expect(classic, `${phase}: a classic prompt carries trial text`).not.toMatch(/THIS POST IS WRITTEN AROUND A TRIAL|\{\{TRIAL/);
    expect(trial.startsWith(classic), `${phase}: the trial section is appended, the classic prompt untouched`).toBe(true);
    expect(trial, `${phase}: an unfilled slot`).not.toMatch(/\{\{[A-Z_0-9]+\}\}/);
    expect(trial).toContain(marks[phase]);
    expect(trial).toContain("THE TRIAL t-slots, measured first-hand before this run existed.");
    expect(trial).toContain("- Verdict: CHALLENGED. The estimate is faster by 12 ms and clears every guard.");
    expect(trial).toContain("Bootstrap 95 percent interval (reported, never decisive): 10.6 to 13.4 ms.");
    expect(trial).toContain("- Guards each arm must clear to win: no overflow (overflows <= 0).");
    expect(trial).toContain("  - none declared");
    expect(trial.slice(classic.length), `${phase}: a dash in the trial section`).not.toMatch(/[—–]/);
  }
  const draft = buildPrompt(file, "draft", { ...ctx, trial: TRIAL });
  expect(draft).toContain("`n=30 per arm`");
  expect(draft).toContain("only to `knowledge/software-engineering/llm-agent/token-budgeting/techniques/count-before-send.md`");
  expect(draft).toContain("This trial's verdict is challenged.");
  expect(draft).toContain(TRIAL.ref.applicationPath);
});

test("prompt, trial: a prompt file without a trial section is malformed, by name", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "articles-prompts-"));
  try {
    mkdirSync(path.join(root, "pipeline"));
    const post = readFileSync(path.join(ROOT, "pipeline", "ARTICLE-POST-PROMPT.md"), "utf8");
    writeFileSync(path.join(root, "pipeline", "ARTICLE-POST-PROMPT.md"), post.replace("<!-- section: trial-draft -->", "<!-- removed -->"));
    await expect(loadPromptFile(root)).rejects.toMatchObject({ code: "prompt-malformed", message: expect.stringContaining('no "trial-draft" section') });
    const review = readFileSync(path.join(ROOT, "pipeline", "ARTICLE-REVIEW-PROMPT.md"), "utf8");
    writeFileSync(path.join(root, "pipeline", "ARTICLE-REVIEW-PROMPT.md"), review.replace("<!-- section: trial-review -->", "<!-- removed -->"));
    await expect(loadReviewPromptFile(root)).rejects.toMatchObject({ code: "prompt-malformed", message: expect.stringContaining('no "trial-review" section') });
    expect(TRIAL_SECTIONS).toEqual(["trial-research", "trial-outline", "trial-draft", "trial-writer"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("manifest: registry.remote is read out of the registry block; ARTICLES_REGISTRY_REMOTE wins", () => {
  const yaml = "repo:\n  remote: wrong\nregistry:\n  remote: github:x/ai-registry  # origin\n  local: ../ai-registry\n";
  expect(manifestRegistryRemote(yaml)).toBe("github:x/ai-registry");
  expect(manifestRegistryRemote("registry:\n  local: ../r\n")).toBeUndefined();
  expect(resolveRegistryRemote({}, "/repo", () => yaml)).toBe("github:x/ai-registry");
  expect(resolveRegistryRemote({ ARTICLES_REGISTRY_REMOTE: "https://github.com/y/z" }, "/repo", () => yaml)).toBe("https://github.com/y/z");
  expect(resolveRegistryRemote({}, "/repo", () => undefined)).toBeUndefined();
  // this repo's own manifest names one
  expect(resolveRegistryRemote({}, ROOT)).toMatch(/^github:[\w.-]+\/[\w.-]+$/);
});
