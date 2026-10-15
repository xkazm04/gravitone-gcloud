import { describe, expect, it } from "vitest";
import { lintCss } from "../src/tokenLint.ts";

const allowed = new Set(["ink", "ink-bright", "hair", "r-chip", "hdr-h"]);
const kinds = (css: string) => lintCss(css, allowed).findings.map((f) => f.kind);

describe("lintCss", () => {
  it("passes a stylesheet that names every value through a token", () => {
    const css = `/* #fff in a comment is fine */
.a { color: var(--ink-bright); border: 1px solid var(--hair); border-radius: var(--r-chip); margin: 0; width: 100%; }
@media (max-width: 1360px) { .a { top: calc(var(--hdr-h) + 0px); } }
.b { background: url("x.png#ff0000"); content: "12px"; }
#month { z-index: 3; }`;
    const r = lintCss(css, allowed);
    expect(r.findings).toEqual([]);
    expect(r.declarations).toBeGreaterThan(5);
    expect(r.varRefs).toBe(4);
  });

  it("flags a raw colour in every spelling (negative control)", () => {
    expect(kinds(".a { color: #fecdd3; }")).toEqual(["raw-colour"]);
    expect(kinds(".a { color: rgba(0,0,0,.6); }")).toEqual(["raw-colour"]);
    expect(kinds(".a { color: hsl(10 20% 30%); }")).toEqual(["raw-colour"]);
  });

  it("flags a px literal, also as a var() fallback (negative control)", () => {
    expect(kinds(".a { padding: 12px; }")).toEqual(["raw-px"]);
    expect(kinds(".a { top: calc(var(--hdr-h) + 12px); }")).toEqual(["raw-px"]);
    expect(kinds(".a { color: var(--ink, #fff); }")).toEqual(["raw-colour"]);
  });

  it("flags a var() that names no token and reports its line (negative control)", () => {
    const r = lintCss(".a {\n  color: var(--ink);\n  fill: var(--cyann);\n}", allowed);
    expect(r.findings).toEqual([{ line: 3, kind: "unknown-var", text: "--cyann" }]);
  });

  it("accepts a var() naming a custom property declared in the same file", () => {
    const css = ".a { --det-w: calc(var(--hdr-h) * 2); width: var(--det-w); }\n.b { --gap: 0; margin: var(--gap); }";
    expect(lintCss(css, allowed).findings).toEqual([]);
    expect(kinds(".a { width: var(--det-w); }")).toEqual(["unknown-var"]);
  });

  it("still checks the value of a local custom property (negative control)", () => {
    expect(kinds(".a { --tint: #fecdd3; color: var(--tint); }")).toEqual(["raw-colour"]);
    expect(kinds(".a { --det-w: 360px; width: var(--det-w); }")).toEqual(["raw-px"]);
  });

  it("admits a px literal only under a --one-off-* name, and counts it", () => {
    const r = lintCss(".a { --one-off-w: 28px; width: var(--one-off-w); }", allowed);
    expect(r.findings).toEqual([]);
    expect(r.oneOffs).toBe(1);
    expect(lintCss(".a { width: var(--ink); }", allowed).oneOffs).toBe(0);
  });

  it("never admits a colour through the hatch, nor one name declared twice (negative control)", () => {
    expect(kinds(".a { --one-off-tint: #fecdd3; color: var(--one-off-tint); }")).toEqual(["raw-colour"]);
    expect(kinds(".a { --one-off-w: 28px; }\n.b { --one-off-w: 30px; }")).toEqual(["one-off-reused"]);
    expect(kinds(".a { --oneoff-w: 28px; }")).toEqual(["raw-px"]);
  });
});
