import { describe, expect, expectTypeOf, it } from "vitest";
import { defineMachine } from "../src/transitions.ts";

type S = "draft" | "review" | "done";
const table = {
  draft: ["review"],
  review: ["draft", "done"],
  done: [],
} as const satisfies Record<S, readonly S[]>;
const m = defineMachine(table);

describe("transitions", () => {
  it("allows declared transitions", () => {
    expect(m.can("draft", "review")).toBe(true);
    const r = m.assert("review", "done");
    expect(r.ok && r.value).toBe("done");
    expect(m.next("review")).toEqual(["draft", "done"]);
    expect(m.states).toEqual(["draft", "review", "done"]);
  });
  it("refuses an undeclared transition, naming from -> to", () => {
    expect(m.can("draft", "done")).toBe(false);
    const r = m.assert("draft", "done");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("refused");
      expect(r.error.message).toContain("draft -> done");
    }
  });
  it("derives the state union from the table", () => {
    expectTypeOf(m.states).toEqualTypeOf<readonly S[]>();
    const grown = defineMachine({ a: ["b"], b: ["c"], c: [], d: [] } as const);
    expectTypeOf(grown.states).toEqualTypeOf<readonly ("a" | "b" | "c" | "d")[]>();
    expectTypeOf(grown.states).not.toEqualTypeOf<readonly ("a" | "b" | "c")[]>();
  });
});
