import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSource, tokenNames } from "../src/tokenSource.ts";

const real = readFileSync(new URL("../tokens/source.json", import.meta.url), "utf8");

describe("tokenSource", () => {
  it("accepts the committed source and exposes every name", () => {
    const r = parseSource(real);
    expect(r.ok).toBe(true);
    if (r.ok) expect(tokenNames(r.value).has("ink-bright")).toBe(true);
  });

  it("refuses a duplicate token name (negative control)", () => {
    const dup = JSON.stringify({
      source: "x",
      groups: [
        {
          id: "a",
          tokens: [
            { name: "ink", tier: "primitive", value: "#000" },
            { name: "ink", tier: "role", value: "#111" },
          ],
        },
      ],
    });
    const r = parseSource(dup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("duplicate token name: ink");
  });

  it("refuses non-JSON and a leading -- in a name (negative control)", () => {
    expect(parseSource("{nope").ok).toBe(false);
    const dashed = JSON.stringify({
      source: "x",
      groups: [{ id: "a", tokens: [{ name: "--ink", tier: "role", value: "#000" }] }],
    });
    expect(parseSource(dashed).ok).toBe(false);
  });
});
