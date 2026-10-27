// LANE - an UpstreamBreak chain fits a 360px page (real Chromium, the actual component and its CSS).
//
// PartWorkspace draws [...upstream, here]: four missing upstream parts make five steps, and a
// node that holds a fixed minimum width in a non-wrapping rail pushed the page sideways on a phone.
// The instrument bundles the live UpstreamBreak with its CSS module and tokens.css through Vite and
// reads the scroll width of the page and of the box, at 4, 5 and 6 steps, in a 360px viewport with
// the 16px gutter.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, expect, test, type Page } from "@playwright/test";
import { build } from "vite";

test.describe.configure({ timeout: 90_000 });

const root = process.cwd();
const STEPS = ["research", "script", "frames", "motion", "sound", "edit"];

async function bundle(): Promise<{ js: string; css: string }> {
  const ub = join(root, "packages/ui/src/components/upstream/UpstreamBreak.tsx").replaceAll("\\", "/");
  const dir = join(root, "test-results", "upstream-break-phone-harness");
  mkdirSync(dir, { recursive: true });
  const ENTRY = join(dir, "entry.tsx");
  writeFileSync(
    ENTRY,
    `import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { UpstreamBreak } from ${JSON.stringify(ub)};
const n = (window as unknown as { __steps: number }).__steps;
createRoot(document.getElementById("root")!).render(
  createElement("div", { style: { padding: "0 16px" } },
    createElement(UpstreamBreak, { steps: ${JSON.stringify(STEPS)}.slice(0, n), brokeAt: 0, detail: "research · script not ready" })));
`,
  );
  const out = await build({
    configFile: false,
    logLevel: "silent",
    root,
    define: { "process.env.NODE_ENV": '"development"' },
    build: { write: false, minify: false, cssCodeSplit: false, lib: { entry: ENTRY, formats: ["iife"], name: "UbHarness", fileName: "u" } },
  });
  const files = (Array.isArray(out) ? out : [out]).flatMap((o) => ("output" in o ? o.output : []));
  let js = "";
  let css = "";
  for (const f of files) {
    if (f.type === "chunk") js += f.code;
    else if (f.fileName.endsWith(".css")) css += String(f.source);
  }
  return { js, css };
}

let built: Promise<{ js: string; css: string }> | undefined;

/** Page and box overflow, in px, of an UpstreamBreak of `n` steps at 360px. */
async function overflow(page: Page, n: number): Promise<{ page: number; box: number }> {
  await page.setContent(`<!doctype html><html><body style="margin:0"><div id="root"></div></body></html>`);
  const { js, css } = await (built ??= bundle());
  await page.addStyleTag({ content: readFileSync(join(root, "packages/ui/src/tokens.css"), "utf8") });
  await page.addStyleTag({ content: css });
  await page.evaluate((k) => ((window as unknown as { __steps: number }).__steps = k), n);
  await page.addScriptTag({ content: js });
  await page.locator('[role="list"]').waitFor();
  return page.evaluate(() => {
    const box = document.querySelector('[role="list"]')!.parentElement!;
    return { page: document.documentElement.scrollWidth - window.innerWidth, box: box.scrollWidth - box.clientWidth };
  });
}

for (const n of [4, 5, 6]) {
  test(`${n} steps do not overflow a 360px page`, async () => {
    const b = await chromium.launch();
    const page = await (await b.newContext({ viewport: { width: 360, height: 700 } })).newPage();
    const o = await overflow(page, n);
    await b.close();
    expect(o.page, "page overflow").toBeLessThanOrEqual(0);
    expect(o.box, "box overflow").toBeLessThanOrEqual(0);
  });
}
