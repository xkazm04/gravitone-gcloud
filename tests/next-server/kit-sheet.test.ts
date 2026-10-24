// THE /kit SHEET, HELD TO WHAT IT CLAIMS (app/(studio)/kit). The page says it is the design
// system as shipped: every token of source.json, every row of the one keymap, the motion the
// components play. tests/live/kit.live.spec.ts drives the assembled page in Chromium; these cases
// are the claims a node render or a read of the stylesheets can decide, so `npm run test:unit`
// sees them without a browser.
//
//   1. A scroller that glides (`scroll-behavior: smooth`) stops gliding under reduced motion.
//      globals.css's blanket rule reaches `html` and every animation and transition, never a
//      module's own `scroll-behavior` - the kit's body scrolled smoothly for a person who asked
//      for no motion on every nav click (WCAG 2.3.3).
//   2. Every keyed row of the keymap is drawn in a legend - its field's rows too. keyTable draws
//      a field's rows only when asked for that field, so one legend per mode hid every key that
//      fires inside a field (save a note, clear a search, rename): 21 of 170 rows.
//   3. An act the Motion card plays is the animation a component ships: the same keyframes and
//      the same timing. CSS modules scope keyframes, so the kit redefines them, and the copy
//      drifted - its fadeUp ran .35s where the Library detail's runs .22s. Acts nothing ships
//      are named in UNSHIPPED_ACTS, and the list can only shrink.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { BINDINGS } from "@gt/ui/keymap/bindings";

import { SignalSections } from "../../app/(studio)/kit/Signal.tsx";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CSS_ROOTS = ["app", "components", "packages/ui/src"];

function cssFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".next")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...cssFiles(full));
    else if (name.endsWith(".css")) out.push(full);
  }
  return out;
}

/** CSS has block comments only, and they do not nest: this strip is sound. */
const css = (file: string): string => readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The bodies of every `@media (prefers-reduced-motion: reduce)` block, braces balanced. */
function reducedBlocks(text: string): string[] {
  const out: string[] = [];
  const open = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/g;
  for (let m = open.exec(text); m !== null; m = open.exec(text)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
    }
    out.push(text.slice(start, i - 1));
  }
  return out;
}

describe("/kit: motion honours reduced motion", () => {
  test("every stylesheet that scrolls smoothly turns it off under prefers-reduced-motion", () => {
    const files = CSS_ROOTS.flatMap((r) => cssFiles(path.join(ROOT, r)));
    expect(files.length, "the walk read no stylesheet").toBeGreaterThan(50);
    const smooth = files.filter((f) => /scroll-behavior\s*:\s*smooth/.test(css(f)));
    expect(smooth.length, "no stylesheet scrolls smoothly: the case has nothing to hold").toBeGreaterThan(0);
    const unguarded = smooth
      .filter((f) => !reducedBlocks(css(f)).some((b) => /scroll-behavior\s*:\s*auto/.test(b)))
      .map((f) => path.relative(ROOT, f).replaceAll("\\", "/"));
    expect(unguarded).toEqual([]);
  });
});

/** A rendered fragment's words: tags dropped, the five entities React writes decoded. */
const words = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&");

describe("/kit: the key legends draw the whole keymap", () => {
  test("every keyed row is drawn in its mode's legend, or its mode's legend for that field", () => {
    const html = renderToStaticMarkup(h(SignalSections));
    const legends = new Map<string, string>();
    for (const m of html.matchAll(/role="group" aria-label="([^"]+) keys">([\s\S]*?)<\/div>/g)) legends.set(m[1] ?? "", words(m[2] ?? ""));
    const keyed = BINDINGS.filter((b) => b.keys.length > 0);
    expect(keyed.length, "the keymap holds no keyed row").toBeGreaterThan(100);
    const missing = keyed
      .filter((b) => {
        const legend = legends.get(b.field === undefined ? b.mode : `${b.mode} · ${b.field}`);
        return legend === undefined || !legend.includes(b.does ?? b.verb);
      })
      .map((b) => `${b.mode}/${b.verb}${b.field === undefined ? "" : `@${b.field}`}`);
    expect(missing).toEqual([]);
  });
});

/**
 * OWED, NOT ALLOWED: the kit's acts no @gt/ui component plays (kit.js "acts" from the prototype;
 * nothing ratifies or re-routes with motion yet). The case fails on an unshipped act NOT listed
 * and on a listed act that now ships, so this list cannot outlive the decision.
 */
const UNSHIPPED_ACTS: readonly string[] = ["lockIn", "moved"];

/** `@keyframes name{...}` bodies in a stylesheet, braces balanced. */
function keyframes(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const open = /@keyframes\s+([\w-]+)\s*\{/g;
  for (let m = open.exec(text); m !== null; m = open.exec(text)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
    }
    out.set(m[1] ?? "", text.slice(start, i - 1).replace(/\s+/g, ""));
  }
  return out;
}

/** `animation:<name> <rest>` declarations: name -> the rest (timing), whitespace collapsed. */
const animations = (text: string): [string, string][] =>
  [...text.matchAll(/animation\s*:\s*([\w-]+)\s+([^;}]+)/g)].map((m) => [m[1] ?? "", (m[2] ?? "").trim().replace(/\s+/g, " ")]);

describe("/kit: the Motion card plays what ships", () => {
  test("each act's keyframes and timing are a shipped component's", () => {
    const kit = css(path.join(ROOT, "app/(studio)/kit/kit.module.css"));
    const acts = animations(kit).filter(([name]) => keyframes(kit).has(name));
    expect(acts.length, "the kit plays no act").toBeGreaterThan(0);
    const shipped = cssFiles(path.join(ROOT, "packages/ui/src")).map(css);
    const drift: string[] = [];
    const unshipped: string[] = [];
    for (const [name, timing] of acts) {
      const bodies = shipped.flatMap((t) => {
        const body = keyframes(t).get(name);
        return body === undefined ? [] : [{ body, timings: animations(t).filter(([n]) => n === name).map(([, r]) => r) }];
      });
      if (bodies.length === 0) {
        unshipped.push(name);
        continue;
      }
      const ownBody = keyframes(kit).get(name);
      if (!bodies.some((b) => b.body === ownBody && b.timings.includes(timing))) drift.push(`${name} ${timing} vs ${bodies.flatMap((b) => b.timings).join(" | ")}`);
    }
    expect(drift).toEqual([]);
    expect(unshipped).toEqual(UNSHIPPED_ACTS);
  });
});
