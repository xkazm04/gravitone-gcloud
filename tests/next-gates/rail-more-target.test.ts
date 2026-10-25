// The Library rail's "+N more" / "fewer" fold control is a touch target: WCAG 2.5.8 wants 24px.
// The box is token arithmetic (font x line-height + vertical padding, or a min-height), so the
// Node lane reads it from the stylesheet and source.json rather than a browser.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const css = readFileSync(new URL("packages/ui/src/components/library/Rail.module.css", root), "utf8");
const tokens = (JSON.parse(readFileSync(new URL("packages/ui/tokens/source.json", root), "utf8")) as {
  groups: { tokens: { name: string; value: string }[] }[];
}).groups.flatMap((g) => g.tokens);

function px(v: string): number {
  const m = /^var\(--([\w-]+)\)$/.exec(v.trim());
  if (m) {
    const t = tokens.find((x) => x.name === m[1]);
    if (!t) throw new Error(`no token ${m[1]}`);
    return px(t.value);
  }
  const n = /^(-?[\d.]+)px$/.exec(v.trim());
  if (!n) throw new Error(`not px: ${v}`);
  return Number(n[1]);
}

/** The computed height of the `.more` rule, in px. */
function moreHeight(sheet: string): number {
  const rule = /\.more\{([^}]*)\}/.exec(sheet)?.[1];
  if (!rule) throw new Error(".more rule missing");
  const decl = (name: string) => new RegExp(`(?:^|;)${name}:([^;]+)`).exec(rule)?.[1];
  const font = /^\s*\d+\s+(var\([^)]*\))\/([\d.]+)/.exec(decl("font") ?? "");
  if (!font) throw new Error("font shorthand unreadable");
  const content = px(font[1]) * Number(font[2]);
  const pad = (decl("padding") ?? "0").trim().split(/\s+/);
  const vertical = px(pad[0]) * 2;
  const min = decl("min-height");
  return Math.max(content + vertical, min ? px(min) : 0);
}

describe("rail fold control target", () => {
  it("is at least 24px tall (WCAG 2.5.8)", () => {
    expect(moreHeight(css)).toBeGreaterThanOrEqual(24);
  });
});
