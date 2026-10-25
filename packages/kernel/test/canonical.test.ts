import { describe, expect, it } from "vitest";
import { canonical, chainHash, GENESIS_HASH, sha256Hex } from "../src/canonical.ts";

describe("canonical JSON (RFC 8785)", () => {
  it("sorts keys, recursively, with no whitespace", () => {
    expect(canonical({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
  });

  it("renders numbers in ECMAScript form (RFC 8785 appendix values)", () => {
    const cases: [number, string][] = [
      [0, "0"],
      [-0, "0"],
      [1.0, "1"],
      [0.1, "0.1"],
      [1e-7, "1e-7"],
      [1e21, "1e+21"],
      [1e20, "100000000000000000000"],
      [333333333.3333333, "333333333.3333333"],
      [5e-324, "5e-324"],
      [1.7976931348623157e308, "1.7976931348623157e+308"],
      [-1.5, "-1.5"],
    ];
    for (const [n, s] of cases) expect(canonical(n)).toBe(s);
  });

  it("sorts keys by UTF-16 code unit, which differs from code point order past U+FFFF", () => {
    // U+1F600 is the surrogate pair D83D DE00; U+FF5E is one unit FF5E. By code
    // point the emoji sorts last; by UTF-16 unit it sorts first.
    expect(canonical({ "～": 1, "\u{1f600}": 2 })).toBe('{"\u{1f600}":2,"～":1}');
  });

  it("escapes strings exactly as JSON.stringify does", () => {
    expect(canonical("a\"b\\c\n\u0001\u007f é")).toBe('"a\\"b\\\\c\\n\\u0001\u007f é"');
  });

  it("refuses an array hole as it refuses undefined, never renders it as an empty slot", () => {
    const sparse: unknown[] = [1, , 3];
    expect(() => canonical(sparse)).toThrow(/canonical: \$\[1\]/);
    expect(() => canonical({ a: new Array(2) })).toThrow(/canonical/);
  });

  it("refuses what has no canonical JSON form", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, "\ud800", { a: undefined }, new Date(0), () => 1]) {
      expect(() => canonical(bad)).toThrow(/canonical/);
    }
  });

  it("chains over the previous hash followed by the canonical body", () => {
    expect(chainHash(GENESIS_HASH, { a: 1 })).toBe(sha256Hex(`${GENESIS_HASH}{"a":1}`));
  });
});
