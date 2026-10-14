import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderCss, renderTs } from "../src/tokenRender.ts";
import { parseSource, type TokenSource } from "../src/tokenSource.ts";

function load(): TokenSource {
  const r = parseSource(readFileSync(new URL("../tokens/source.json", import.meta.url), "utf8"));
  if (!r.ok) throw new Error(r.error);
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

const carriesAll = (css: string): boolean => prototypeRoot().every(([n, v]) => css.includes(`  --${n}: ${v};`));

describe("renderCss", () => {
  const css = renderCss(load());

  it("carries every prototype :root value unchanged", () => {
    const root = prototypeRoot();
    expect(root.length).toBe(57);
    for (const [name, value] of root) {
      expect(css, `--${name}`).toContain(`  --${name}: ${value};`);
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
    const [t0, ...tail] = g0.tokens;
    if (!t0) throw new Error("empty group");
    const mutated = renderCss({ ...src, groups: [{ ...g0, tokens: [{ ...t0, value: "#ffffff" }, ...tail] }, ...rest] });
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
