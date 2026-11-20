import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderCss, renderTs } from "../src/tokenRender.ts";
import { parseSource, type TokenSource } from "../src/tokenSource.ts";

function load(): TokenSource {
  const r = parseSource(readFileSync(new URL("../tokens/source.json", import.meta.url), "utf8"));
  if (!r.ok) throw r.error;
  return r.value;
}

// Every `--name: value` of the prototype's :root, read from the verbatim copy.
function prototypeRoot(): Array<readonly [string, string]> {
  const css = readFileSync(new URL("./fixtures/prototype-root.css", import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  return [...css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1] ?? "", (m[2] ?? "").trim()] as const);
}

// The design baseline (docs/next/design-baseline/PLAN.md, 2026-11-17) re-valued these on purpose: the ground ramp to
// the deeper near-black, the faces to the loaded grotesque and mono, the type and control sizes to clamps that step
// up past ~2400px; the header's height retired with the header row. Every OTHER prototype value is still carried
// verbatim, and each listed one must really differ - so the list cannot outlive its reason.
const REVALUED: ReadonlySet<string> = new Set(["ink", "ink-1", "ink-2", "ink-3", "ink-4", "sans", "mono", "serif", "fs-meta", "fs-ui", "fs-body", "fs-h3", "fs-h2", "fs-read", "sp-6", "sp-7", "hdr-h"]);
const carried = (): Array<readonly [string, string]> => prototypeRoot().filter(([n]) => !REVALUED.has(n));
const carriesAll = (css: string): boolean => carried().every(([n, v]) => css.includes(`  --${n}: ${v};`));

describe("renderCss", () => {
  const css = renderCss(load());

  it("carries every prototype :root value the design baseline did not re-value, unchanged", () => {
    const root = prototypeRoot();
    expect(root.length).toBe(57);
    for (const [name, value] of carried()) {
      expect(css, `--${name}`).toContain(`  --${name}: ${value};`);
    }
    for (const [name, value] of root.filter(([n]) => REVALUED.has(n))) {
      expect(css, `--${name} is listed as re-valued`).not.toContain(`  --${name}: ${value};`);
    }
  });

  it("names the source and the regeneration command in its header", () => {
    const head = css.split("\n").slice(0, 2).join("\n");
    expect(head).toContain("packages/ui/tokens/source.json");
    expect(head).toContain("npm run tokens:gen");
  });

  it("is deterministic", () => {
    expect(renderCss(load())).toBe(css);
  });

  it("stops carrying the prototype when a value is changed (negative control)", () => {
    expect(carriesAll(css)).toBe(true);
    const src = load();
    const [g0, ...rest] = src.groups;
    if (!g0) throw new Error("empty source");
    const at = g0.tokens.findIndex((t) => !REVALUED.has(t.name));
    if (at < 0) throw new Error("no carried token in the first group");
    const mutated = renderCss({ ...src, groups: [{ ...g0, tokens: g0.tokens.map((t, i) => (i === at ? { ...t, value: "#ffffff" } : t)) }, ...rest] });
    expect(carriesAll(mutated)).toBe(false);
  });
});

describe("renderTs", () => {
  it("mirrors each token and its union", () => {
    const ts = renderTs(load());
    expect(ts).toContain('"ink-bright": "#f3f6fb",');
    expect(ts).toContain("export type TokenName = keyof typeof tokens;");
    expect(ts).toContain("npm run tokens:gen");
  });
});
