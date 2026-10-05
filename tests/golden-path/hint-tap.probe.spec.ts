// LANE — A TAP ON A HINT LEAVES IT OPEN (real Chromium, real React, real events).
//
// Every pointer gesture fires mouseover -> focus -> click. Hint opens on the
// first two, so a click handler that toggled on `open` closed what the same
// gesture had just opened and a touch user never saw the disclosure. The only
// faithful instrument is a browser: this renders the ACTUAL components/ui/signal
// Hint.tsx (TypeScript-transpiled, React from node_modules, no bundler and no
// dev server) in a bare page and drives it with Playwright's own tap/click.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, devices, expect, test, type Page } from "@playwright/test";
import ts from "typescript";

test.describe.configure({ timeout: 90_000 });

const root = process.cwd();
const req = createRequire(join(root, "package.json"));

/** Transpile one repo TSX/TS file to CommonJS. */
function transpile(rel: string): string {
  const src = readFileSync(join(root, rel), "utf8");
  return ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

type Mod = { code: string; deps: Record<string, string> };

/** Collect every CJS module reachable from `entry`, with each require resolved
 *  to an absolute path here in Node so the page needs no resolver of its own. */
function collect(entry: string, into: Record<string, Mod>, from: NodeJS.Require): string {
  const file = from.resolve(entry);
  if (file in into) return file;
  const code = readFileSync(file, "utf8");
  const mod: Mod = { code, deps: {} };
  into[file] = mod;
  const r = createRequire(file);
  for (const m of code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
    try {
      mod.deps[m[1]] = collect(m[1], into, r);
    } catch {
      /* node built-ins and optional requires are not part of the browser graph */
    }
  }
  return file;
}

function harnessScript(): string {
  const mods: Record<string, Mod> = {};
  const ext = {
    react: collect("react", mods, req),
    jsx: collect("react/jsx-runtime", mods, req),
    dom: collect("react-dom/client", mods, req),
    lucide: collect("lucide-react", mods, req),
  };
  const worldFile = "<repo>/world";
  mods[worldFile] = { code: transpile("components/ui/world.tsx"), deps: { react: ext.react, "react/jsx-runtime": ext.jsx } };
  const hintFile = "<repo>/Hint";
  mods[hintFile] = {
    code: transpile("components/ui/signal/Hint.tsx"),
    deps: { react: ext.react, "react/jsx-runtime": ext.jsx, "lucide-react": ext.lucide, "../world": worldFile },
  };
  return `
    window.process = { env: { NODE_ENV: "development" } };
    const MODS = ${JSON.stringify(mods)};
    const cache = {};
    function load(abs) {
      if (cache[abs]) return cache[abs].exports;
      const m = (cache[abs] = { exports: {} });
      const def = MODS[abs];
      new Function("module", "exports", "require", def.code)(m, m.exports, (id) => {
        if (!(id in def.deps)) throw new Error("unresolved " + id + " from " + abs);
        return load(def.deps[id]);
      });
      return m.exports;
    }
    const React = load(${JSON.stringify(ext.react)});
    const { createRoot } = load(${JSON.stringify(ext.dom)});
    const { Hint } = load(${JSON.stringify(hintFile)});
    createRoot(document.getElementById("root")).render(
      React.createElement("div", { style: { padding: "120px 40px" } },
        React.createElement(Hint, { label: "About" }, "a bar is 4 beats"),
        React.createElement("button", { id: "outside", style: { marginLeft: 200 } }, "outside")));
  `;
}

async function mount(page: Page) {
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: harnessScript() });
  await page.getByRole("button", { name: "About" }).waitFor();
}
const isOpen = (page: Page) => page.getByRole("tooltip").evaluate((n) => !n.className.includes("sr-only"));
const settle = (page: Page) => page.waitForTimeout(300);

test("a mouse click on the glyph leaves the disclosure open, a second click closes it", async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext()).newPage();
  await mount(page);
  await page.getByRole("button", { name: "About" }).click();
  await settle(page);
  expect(await isOpen(page)).toBe(true);
  await page.mouse.move(600, 400); // pointer leaves: a pinned popover stays
  await settle(page);
  expect(await isOpen(page)).toBe(true);
  await page.getByRole("button", { name: "About" }).click();
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

test("hover alone still opens and un-hovering closes; Escape closes and is stopped", async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext()).newPage();
  await mount(page);
  await page.getByRole("button", { name: "About" }).hover();
  await settle(page);
  expect(await isOpen(page)).toBe(true);
  await page.mouse.move(600, 400);
  await settle(page);
  expect(await isOpen(page)).toBe(false);

  // Modal's Escape-yield (modal-escape-yields.probe) needs the Escape that
  // closed a Hint to be flagged handled: either it never reaches document (React
  // delegates on the root container) or it arrives with cancelBubble set. What
  // must never happen is it arriving unflagged.
  await page.evaluate(() => {
    (window as unknown as { __seen: boolean | null }).__seen = null;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") (window as unknown as { __seen: boolean | null }).__seen = e.cancelBubble;
    });
  });
  await page.keyboard.press("Tab"); // focus opens
  await settle(page);
  expect(await isOpen(page)).toBe(true);
  await page.keyboard.press("Escape");
  await settle(page);
  expect(await isOpen(page)).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { __seen: boolean | null }).__seen)).not.toBe(false);
  await b.close();
});

test("keyboard: focus opens, Enter pins, Enter again closes; blur closes", async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext()).newPage();
  await mount(page);
  await page.keyboard.press("Tab");
  await settle(page);
  expect(await isOpen(page)).toBe(true);
  await page.keyboard.press("Enter");
  await settle(page);
  expect(await isOpen(page)).toBe(true);
  await page.keyboard.press("Enter");
  await settle(page);
  expect(await isOpen(page)).toBe(false);
  await page.keyboard.press("Enter"); // closed -> opens pinned
  await settle(page);
  expect(await isOpen(page)).toBe(true);
  await page.keyboard.press("Tab"); // blur out of the group
  await settle(page);
  expect(await isOpen(page)).toBe(false);
  await b.close();
});
