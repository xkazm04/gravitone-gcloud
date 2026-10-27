// The Board rail's `[` / `]` step (app/(studio)/board/_board/rail.ts), walked over literal rails:
// open piles first, the whole rail when none is open, a wrap at both ends, and a desk whose packet
// is not on the walked list (a decided packet beside open ones) stepping in from either end.

import { describe, expect, it } from "vitest";

import type { PacketSummary } from "@gt/domain/board";

import { stepTarget } from "../../app/(studio)/board/_board/rail.ts";

const pile = (id: string, state: "open" | "committed" = "open"): PacketSummary => ({ id, state }) as unknown as PacketSummary;

describe("the rail step", () => {
  const rail = [pile("a"), pile("b"), pile("c"), pile("done", "committed")];

  it("walks the open piles and wraps at both ends", () => {
    expect(stepTarget(rail, "a", 1)).toBe("b");
    expect(stepTarget(rail, "c", 1)).toBe("a");
    expect(stepTarget(rail, "a", -1)).toBe("c");
    expect(stepTarget(rail, "b", -1)).toBe("a");
  });

  it("from a decided packet, ] opens the first open pile and [ the last", () => {
    expect(stepTarget(rail, "done", 1)).toBe("a");
    expect(stepTarget(rail, "done", -1)).toBe("c");
    expect(stepTarget([pile("a"), pile("b"), pile("done", "committed")], "done", -1)).toBe("b");
  });

  it("with nothing open walks the whole rail; alone or empty, it stays", () => {
    expect(stepTarget([pile("x", "committed"), pile("y", "committed")], "x", 1)).toBe("y");
    expect(stepTarget([pile("a")], "a", 1)).toBeUndefined();
    expect(stepTarget([], "a", -1)).toBeUndefined();
  });
});
