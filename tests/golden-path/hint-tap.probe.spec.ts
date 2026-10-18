// LANE — A TAP ON A HINT LEAVES IT OPEN (real Chromium, real React, real events).
//
// Every pointer gesture fires pointerenter -> focus -> click, and on touch a
// pointerleave when the finger lifts. Hint opens on the first two, so a tip
// that closes on pointerleave (or a click that toggles what the same gesture
// just opened) leaves a touch user without the disclosure. The only faithful
// instrument is a browser: this bundles the ACTUAL packages/ui Hint.tsx (with
// its CSS module and layer stack) through Vite into one script and drives it
// with Playwright's own tap/click.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, devices, expect, test, type Page } from "@playwright/test";
import { build } from "vite";

test.describe.configure({ timeout: 90_000 });

const root = process.cwd();

/** Bundle the live Hint plus a tiny mount script to one IIFE and its CSS. */
async function bundle(): Promise<{ js: string; css: string }> {
  const hint = join(root, "packages/ui/src/components/hint/Hint.tsx").replaceAll("\\", "/");
  // Beside the repo, not in the OS temp dir, so `react` resolves from node_modules.
  const dir = join(root, "test-results", "hint-tap-harness");
  mkdirSync(dir, { recursive: true });
  const ENTRY = join(dir, "entry.tsx");
  writeFileSync(
    ENTRY,
    `import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Hint } from ${JSON.stringify(hint)};
createRoot(document.getElementById("root")!).render(
  createElement("div", { style: { padding: "120px 40px" } },
    createElement(Hint, { name: "About", text: "a bar is 4 beats" }),
    createElement("button", { id: "outside", style: { marginLeft: 200 } }, "outside")));
`,
  );
  const out = await build({
    configFile: false,
    logLevel: "silent",
    root,
    define: { "process.env.NODE_ENV": '"development"' },
    build: {
      write: false,
      minify: false,
      cssCodeSplit: false,
      lib: { entry: ENTRY, formats: ["iife"], name: "HintHarness", fileName: "h" },
    },
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

async function mount(page: Page) {
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
  const { js, css } = await (built ??= bundle());
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: js });
  await page.getByRole("button", { name: "About" }).waitFor();
}
const isOpen = (page: Page) => page.getByRole("tooltip").evaluate((n) => getComputedStyle(n).opacity === "1");
const settle = (page: Page) => page.waitForTimeout(300);

test("a mouse click on the glyph leaves the disclosure open until the pointer leaves", async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext()).newPage();
  await mount(page);
  await page.getByRole("button", { name: "About" }).click();
  await settle(page);
  expect(await isOpen(page)).toBe(true);
  await page.mouse.move(600, 400);
  await settle(page);
  expect(await isOpen(page)).toBe(false);
  await b.close();
});

test("a touch tap on the glyph leaves the disclosure open; a tap outside closes it", async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ ...devices["Pixel 7"] })).newPage();
  await mount(page);
  await page.getByRole("button", { name: "About" }).tap();
  await settle(page);
  expect(await isOpen(page)).toBe(true);
  await page.locator("#outside").tap();
  await settle(page);
  expect(await isOpen(page)).toBe(false);
  await b.close();
});

test("hover alone opens and un-hovering closes; Escape closes with the pointer still over it", async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext()).newPage();
  await mount(page);
  const glyph = page.getByRole("button", { name: "About" });
  await glyph.hover();
  await settle(page);
  expect(await isOpen(page)).toBe(true);
  await page.keyboard.press("Escape");
  await settle(page);
  expect(await isOpen(page)).toBe(false);
  await page.mouse.move(600, 400);
  await glyph.hover();
  await settle(page);
  expect(await isOpen(page)).toBe(true);
  await page.mouse.move(600, 400);
  await settle(page);
  expect(await isOpen(page)).toBe(false);
  await b.close();
});

test("keyboard: focus opens, Escape closes, blur closes", async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext()).newPage();
  await mount(page);
  await page.keyboard.press("Tab");
  await settle(page);
  expect(await isOpen(page)).toBe(true);
  await page.keyboard.press("Escape");
  await settle(page);
  expect(await isOpen(page)).toBe(false);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await settle(page);
  expect(await isOpen(page)).toBe(true);
  await page.keyboard.press("Tab"); // out of the group
  await settle(page);
  expect(await isOpen(page)).toBe(false);
  await b.close();
});
