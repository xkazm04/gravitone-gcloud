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
//   · a table becomes a figure of its PNG in story order; a figure PNG is the drawing at
//     2800 px wide, not a 680 px drawing in the corner of a blank canvas
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { createRun, defaultDeps, driveRun, ensureMediumDraft, reworkRun } from "@/lib/articles/engine";
import { ArticleError, runDir } from "@/lib/articles/store";
import { markdownToStory, renderFigurePngs, renderTablePngs, storyFigures, svgSize } from "@/lib/articles/mediumPackage";
import { splitFigures } from "@/lib/medium/driver";
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

test("a Markdown table travels as a picture, in story order, and its cells keep their inline marks", () => {
  const md = "# T\n\n![Fig one](figures/01-a.png)\nFig one [1]\n\n| A | B `c` |\n| --- | :---: |\n| x \\| y | [2] |\n| **z** | w |\n\nText.\n\n![Fig two](figures/02-b.png)\nFig two\n";
  const { html, tables } = markdownToStory(md);
  expect(tables).toHaveLength(1);
  expect(tables[0]).toMatchObject({ name: "table-01.png", head: ["A", "B <code>c</code>"], rows: [["x | y", "[2]"], ["<strong>z</strong>", "w"]] });
  expect(html).not.toContain("| ---");
  expect(storyFigures(html)).toEqual(["figures/01-a.png", "figures/table-01.png", "figures/02-b.png"]);
  // the driver turns every figure, captioned or not, into one marker in that same order
  expect(splitFigures(html).captions).toEqual(["Fig one [1]", "", "Fig two"]);
  // the registry's text form keeps the table as a table: its lane fails an image that is not a listed SVG's render
  const text = markdownToStory(md, { tables: "html" }).html;
  expect(storyFigures(text)).toEqual(["figures/01-a.png", "figures/02-b.png"]);
  expect(text).toContain("<table><thead><tr><th>A</th><th>B <code>c</code></th></tr></thead><tbody><tr><td>x | y</td><td>[2]</td></tr>");
});

test("a figure PNG is the drawing, not the drawing in the corner of a blank canvas", async () => {
  const dir = path.join(box.dir, "svg");
  mkdirSync(dir, { recursive: true });
  // the writer's shape: width/height attributes equal to the viewBox, far narrower than a column
  writeFileSync(path.join(dir, "01-x.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 400" width="680" height="400"><rect width="680" height="400" fill="#c00"/></svg>');
  expect(svgSize(readFileSync(path.join(dir, "01-x.svg"), "utf8"))).toEqual({ w: 680, h: 400 });
  const out = path.join(box.dir, "png");
  const r = await renderFigurePngs(dir, out);
  expect(r).toEqual({ written: ["01-x.png"], failed: [] });
  const png = readFileSync(path.join(out, "01-x.png"));
  const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  expect([w, h]).toEqual([2800, Math.round((400 * 2800) / 680)]);
  const t = await renderTablePngs([{ name: "table-01.png", head: ["A", "B"], rows: [["1", "2"]] }], out);
  expect(t.written).toEqual(["table-01.png"]);
  expect(readFileSync(path.join(out, "table-01.png")).readUInt32BE(16)).toBe(2800);
});
