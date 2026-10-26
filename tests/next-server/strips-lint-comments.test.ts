import { describe, expect, it } from "vitest";

import { lintStrip } from "../../lib/foundry/strips/lint.ts";

// THE FRAME-PURITY LINT READS CODE, NOT PROSE ABOUT CODE (lib/foundry/strips/lint.ts). A comment that
// names a banned call is not a violation and must not spend a fix round on the author's seat; and a
// comment-aware matcher is a loosened gate if it can be talked into hiding a real call, so the second
// table is every way the stripper could be wrong in that direction.

const API = "window.renderFrameAt = function (i) {}; window.STRIP_READY = true; addEventListener('strip-frame', () => {});";
const page = (body: string, head = ""): string => `<!doctype html><html><head>${head}</head><body><script>\n${API}\n${body}\n</script></body></html>`;
const rules = (html: string): string[] => lintStrip(html).map((f) => f.rule);

describe("lintStrip: comments naming a banned construct are not violations", () => {
  it.each([
    ["a JS line comment", page("// deterministic: never Math.random(), never Date.now()\nvar s = 1;")],
    ["a trailing JS line comment", page("var s = 1; // not setTimeout( or fetch(")],
    ["a JS block comment", page("/* no requestAnimationFrame( here,\n   no performance.now( either */\nvar s = 1;")],
    ["a CSS block comment", page("var s = 1;", "<style>/* transition: opacity 1s would snap */ body { margin: 0 }</style>")],
    ["an HTML comment", `${page("var s = 1;")}<!-- fetch( and new Date() are banned -->`],
  ])("%s is clean", (_name, html) => {
    expect(rules(html)).toEqual([]);
  });
});

describe("lintStrip: the comment-aware matcher never hides a real call", () => {
  it.each([
    ["a real Math.random", page("var r = Math.random();"), "randomness: Math.random (use a seeded PRNG)"],
    ["a real call after a comment line", page("// seeded below\nvar r = Math.random();"), "randomness: Math.random (use a seeded PRNG)"],
    ["a real call after a block comment on the same line", page("/* seeded */ var r = Math.random();"), "randomness: Math.random (use a seeded PRNG)"],
    ["a // inside a string URL, then a call on the line", page("var u = \"https://x/y\"; var r = Math.random();"), "randomness: Math.random (use a seeded PRNG)"],
    ["a /* inside a string, then a call before the closer", page("var u = \"/*\"; var r = Math.random(); var v = \"*/\";"), "randomness: Math.random (use a seeded PRNG)"],
    ["a spaced // inside a string, then a call on the line", page("var u = \"a // b\"; var r = Math.random();"), "randomness: Math.random (use a seeded PRNG)"],
    ["a spaced /* inside a string, then a call before the closer", page("var u = \"a /* b\"; var r = Math.random(); var v = \"*/\";"), "randomness: Math.random (use a seeded PRNG)"],
    ["a regex literal ending in //, then a call on the line", page("var ok = /:\/\//.test(u); var r = Math.random();"), "randomness: Math.random (use a seeded PRNG)"],
    ["a block comment that never closes, then a call", page("var a = 1; /* never closed\nvar r = Math.random();"), "randomness: Math.random (use a seeded PRNG)"],
    ["a real external src", `${page("var s = 1;")}<script src="https://cdn.example/a.js"></script>`, "network: external src/href"],
    ["a real CSS transition beside a comment", page("var s = 1;", "<style>/* c */ a { transition: opacity 1s }</style>"), "time: running CSS transition"],
  ])("%s still fails", (_name, html, rule) => {
    expect(rules(html)).toContain(rule);
  });

  it("reports a finding's line as the original's after a multi-line comment", () => {
    const html = page("/* one\n two\n three */\nvar r = Math.random();");
    const f = lintStrip(html).find((x) => x.rule.startsWith("randomness"));
    const line = html.split("\n").findIndex((l) => l.includes("Math.random();")) + 1;
    expect(f?.excerpt).toBe(`line ${line}: Math.random(`);
  });
});
