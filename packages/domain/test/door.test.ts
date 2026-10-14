import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { parseAt, parseJsonAt } from "../src/door.ts";

const Shot = z.object({ id: z.string(), note: z.string().optional(), n: z.number() });

describe("door", () => {
  it("parses valid input", () => {
    const r = parseAt("shot", Shot, { id: "a", n: 1 });
    expect(r.ok && r.value).toEqual({ id: "a", n: 1 });
  });
  it("optional field is an omitted key, not undefined", () => {
    const r = parseAt("shot", Shot, { id: "a", n: 1 });
    if (!r.ok) throw new Error("expected ok");
    expect("note" in r.value).toBe(false);
    expectTypeOf(r.value).toEqualTypeOf<{ id: string; n: number; note?: string }>();
  });
  it("drops an explicit undefined so the type does not lie", () => {
    const r = parseAt("shot", Shot, { id: "a", n: 1, note: undefined });
    if (!r.ok) throw new Error("expected ok");
    expect("note" in r.value).toBe(false);
  });
  it("refuses bad input, keeping door name, path and message", () => {
    const r = parseAt("shot", Shot, { id: "a", n: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("invalid");
      expect(r.error.message).toMatch(/^shot: n: /);
      expect(r.error.detail).toBe("shot");
    }
  });
  it("reports a root-level failure", () => {
    const r = parseAt("shot", Shot, null);
    if (r.ok) throw new Error("expected refusal");
    expect(r.error.message).toContain("shot: (root)");
  });
  it("parseJsonAt parses, and refuses malformed JSON without throwing", () => {
    const good = parseJsonAt("shot", Shot, '{"id":"a","n":2}');
    expect(good.ok).toBe(true);
    const bad = parseJsonAt("shot", Shot, "{nope");
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.message).toContain("shot: not valid JSON");
      expect(bad.error.cause).toBeInstanceOf(Error);
    }
    expect(parseJsonAt("shot", Shot, '{"id":1}').ok).toBe(false);
  });
});

describe("Parsed keeps brands", () => {
  it("a branded id read through parseAt is still the branded type", async () => {
    const { projectIdSchema } = await import("../src/ids.ts");
    type ProjectId = import("../src/ids.ts").ProjectId;
    const r = parseAt("test", z.object({ id: projectIdSchema }), { id: "p1" });
    if (!r.ok) throw r.error;
    const id: ProjectId = r.value.id;
    expect(id).toBe("p1");
  });
});
