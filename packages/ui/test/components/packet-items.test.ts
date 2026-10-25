// PacketReview decides every item (src/components/review/packetItems.ts): a two-item packet
// decides whichever item is focused, commits only when both hold a verdict, and a one-item
// packet decides items[0] and commits at once, as it always did.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { BoardVerdict } from "../../src/board/boardGate.ts";
import { seedReasons, stepItems } from "../../src/components/review/packetItems.ts";

const keep: BoardVerdict = { verdict: "keep", reasons: [] };
const reject: BoardVerdict = { verdict: "reject", reasons: ["too dark"] };

describe("the item a packet review decides", () => {
  it("decides the second item's id when it is focused", () => {
    expect(stepItems(["rim", "fog"], {}, 1)?.decide).toBe("fog");
    expect(stepItems(["rim", "fog"], {}, 0)?.decide).toBe("rim");
  });

  it("does not commit until both items are decided, and walks to the undecided one", () => {
    expect(stepItems(["rim", "fog"], {}, 0)).toEqual({ decide: "rim", commit: false, next: 1 });
    expect(stepItems(["rim", "fog"], { rim: keep }, 1)).toEqual({ decide: "fog", commit: true, next: null });
    expect(stepItems(["rim", "fog"], { fog: reject }, 0)).toEqual({ decide: "rim", commit: true, next: null });
  });

  it("wraps past the end to an undecided item before the focus", () => {
    expect(stepItems(["a", "b", "c"], {}, 2)).toEqual({ decide: "c", commit: false, next: 0 });
    expect(stepItems(["a", "b", "c"], { a: keep }, 2)).toEqual({ decide: "c", commit: false, next: 1 });
  });

  it("a one-item packet decides items[0] and commits at once", () => {
    expect(stepItems(["only"], {}, 0)).toEqual({ decide: "only", commit: true, next: null });
  });

  it("an empty packet or a stray focus decides nothing", () => {
    expect(stepItems([], {}, 0)).toBeNull();
    expect(stepItems(["rim"], {}, 3)).toBeNull();
  });

  it("seeds the reject reasons from the focused item's own verdict", () => {
    expect(seedReasons({ fog: reject }, "fog")).toEqual(["too dark"]);
    expect(seedReasons({ fog: reject }, "rim")).toEqual([]);
    expect(seedReasons({}, undefined)).toEqual([]);
  });
});

describe("the review page's hover tools", () => {
  // A section's `note` chip is a button in the tab order, drawn at opacity 0 until its section is
  // hovered or focused: Tab must not land on a control nobody can see (WCAG 2.4.7).
  it("show while one of their own controls holds the keyboard focus", () => {
    const css = readFileSync(new URL("../../src/components/review/Review.module.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.secTools\{[^}]*opacity:0/);
    expect(css).toMatch(/\.secTools:focus-within[^{]*\{[^}]*opacity:1/);
  });
});
