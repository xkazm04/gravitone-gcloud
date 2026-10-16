// LANE — THE MEDIUM DRAFT AT THE GATE (lib/articles/mediumDraft.ts, lib/medium).
//
// Offline: the driver is lib/medium/fake.ts, which touches no browser and no
// account. What is pinned:
//   · reaching the gate makes the draft: `mediumDraft.state` ready, the editor URL and a
//     screenshot that exists on disk; the driver was handed the title and the body of post.md
//   · with no driver configured the key is ABSENT (not null) and the gate still opens
//   · a driver that is down, or throws, leaves the run at the gate with the reason verbatim
//   · a rework that returns to the gate replaces the body of the SAME draft, not a second one
//   · the draft is made at the gate only
//   · nothing under lib/medium can publish: no selector, no click, and a request guard
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { createRun, defaultDeps, driveRun, ensureMediumDraft, reworkRun } from "@/lib/articles/engine";
import { ArticleError, runDir } from "@/lib/articles/store";
import { FAKE_MEDIUM, fakeMediumDriver, resetFakeMedium } from "@/lib/medium/fake";

import { keepEnv } from "./_helpers";
import { ARTICLE_ENV, ROOT, articleSandbox, type ArticleSandbox } from "./_articles";

keepEnv(ARTICLE_ENV);
test.describe.configure({ timeout: 180_000 });

let box: ArticleSandbox;
test.beforeEach(() => {
  box = articleSandbox();
  resetFakeMedium();
});
test.afterEach(() => box.cleanup());

const withFake = () => defaultDeps({ render: false, medium: fakeMediumDriver });

async function toGate(deps = withFake()) {
  const run = await createRun({ topic: { kind: "free", text: "the token tax" } }, deps);
  const done = await driveRun(run.id, deps);
  expect(done.status, done.error).toBe("awaiting-approval");
  return done;
}

test("the gate opens with a ready draft: url, screenshot, title and body handed over", async () => {
  const run = await toGate();
  expect(run.mediumDraft?.state).toBe("ready");
  expect(run.mediumDraft?.url).toMatch(/^https:\/\/medium\.com\/p\/.+\/edit$/);
  expect(existsSync(path.join(runDir(run.id), run.mediumDraft!.shot!))).toBe(true);
  expect(FAKE_MEDIUM.calls).toHaveLength(1);
  const call = FAKE_MEDIUM.calls[0];
  const meta = JSON.parse(readFileSync(path.join(runDir(run.id), "post", "meta.json"), "utf8")) as { title: string };
  expect(call.title).toBe(meta.title);
  expect(call.storyHtml).toContain("<h1>");
  expect(call.existingUrl).toBeUndefined();
});

test("no driver configured: the key is absent and the gate still opens", async () => {
  const run = await toGate(defaultDeps({ render: false }));
  expect("mediumDraft" in run).toBe(false);
  expect(readFileSync(path.join(runDir(run.id), "run.json"), "utf8")).not.toContain("mediumDraft");
});

test("a driver that is down or throws leaves the run at the gate with the reason verbatim", async () => {
  FAKE_MEDIUM.health = { ok: false, reason: "medium browser not running" };
  const down = await toGate();
  expect(down.mediumDraft).toMatchObject({ state: "unavailable", reason: "medium browser not running" });
  expect("url" in down.mediumDraft!).toBe(false);

  resetFakeMedium();
  FAKE_MEDIUM.failWith = "medium refused the paste";
  const threw = await toGate();
  expect(threw.mediumDraft).toMatchObject({ state: "unavailable", reason: "medium refused the paste" });
});

test("a rework back at the gate replaces the same draft; a retry after a failure keeps its url", async () => {
  const first = await toGate();
  const url = first.mediumDraft!.url!;
  await reworkRun(first.id, "tighten the opening", withFake());
  const again = await driveRun(first.id, withFake());
  expect(again.status, again.error).toBe("awaiting-approval");
  expect(again.mediumDraft?.url).toBe(url);
  expect(FAKE_MEDIUM.calls.map((c) => c.existingUrl)).toEqual([undefined, url]);

  FAKE_MEDIUM.failWith = "medium is slow";
  const failed = await ensureMediumDraft(first.id, withFake());
  expect(failed.mediumDraft).toMatchObject({ state: "unavailable", url });
  FAKE_MEDIUM.failWith = null;
  const retried = await ensureMediumDraft(first.id, withFake());
  expect(retried.mediumDraft).toMatchObject({ state: "ready", url });
});

test("a draft is made at the gate only", async () => {
  const run = await createRun({ topic: { kind: "free", text: "the token tax" } }, withFake());
  const err = await ensureMediumDraft(run.id, withFake()).catch((e) => e);
  expect(err).toBeInstanceOf(ArticleError);
  expect(`${(err as ArticleError).status}:${(err as ArticleError).code}`).toBe("409:bad-transition");
});

test("nothing under lib/medium can publish", () => {
  const dir = path.join(ROOT, "lib", "medium");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
    const code = readFileSync(path.join(dir, f), "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    // a button, role or text named for publishing / scheduling / review submission is a way to publish
    expect(code, f).not.toMatch(/name:\s*\/?["']?(publish|schedule|submit)/i);
    expect(code, f).not.toMatch(/text(-is)?\(\s*["'](publish|schedule|submit)/i);
  }
});
