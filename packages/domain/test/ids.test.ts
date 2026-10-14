import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { idSchema, type Brand } from "../src/ids.ts";

const ProjectId = idSchema("ProjectId");
const ShotId = idSchema("ShotId");
type ProjectId = z.output<typeof ProjectId>;
type ShotId = z.output<typeof ShotId>;

describe("ids", () => {
  it("mints a branded id at the schema door", () => {
    expect(ProjectId.parse("p1")).toBe("p1");
  });
  it("refuses an empty id", () => {
    expect(ProjectId.safeParse("").success).toBe(false);
  });
  it("is assignable to string but never from it, and brands do not mix", () => {
    expectTypeOf<ProjectId>().toExtend<string>();
    expectTypeOf<string>().not.toExtend<ProjectId>();
    expectTypeOf<ProjectId>().not.toExtend<ShotId>();
    expectTypeOf<ProjectId>().toExtend<Brand<string, "ProjectId">>();
  });
});
