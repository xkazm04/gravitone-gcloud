// THE FINISHED MESH'S GATES (spark game-3d-assets WP2) - PoF's scorers ported under
// lib/foundry/mesh/gates/, asked by lib/foundry/mesh/grade.ts, over glbs this file builds in code:
// the stand-ins, a box with its lid off, two boxes, a Draco-flagged file. The rule under test above
// all: a gate whose input is missing says `unmeasured` and why - never `pass`, never silence.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { POLYCOUNT_PRESETS } from "../../lib/foundry/mesh/gates/polycount.ts";
import { readBack, readGlb, writeGlb, type GltfJson } from "../../lib/foundry/mesh/glb.ts";
import { gradeFinished, gradeRig } from "../../lib/foundry/mesh/grade.ts";
import { computeMetrics, glbMetrics } from "../../lib/foundry/mesh/metrics.ts";
import { standInBox, standInGlb } from "../../lib/foundry/mesh/standin.ts";
import { ASSET_CLASSES, BUDGETS } from "../../lib/foundry/mesh/types.ts";
import { targetFaces, weaponKind } from "../../lib/foundry/mesh/variant.ts";

const verdicts = (gs: readonly { name: string; verdict: string }[]): Record<string, string> => Object.fromEntries(gs.map((g) => [g.name, g.verdict]));

describe("the ported scorers", () => {
  it("the repo's class budgets are PoF's presets, number for number", () => {
    for (const c of ASSET_CLASSES) {
      const p = POLYCOUNT_PRESETS.find((x) => x.assetClass === c);
      expect([p?.faceLimit, p?.warnAbove, p?.maxComponents]).toEqual([BUDGETS[c].tris, BUDGETS[c].warnAbove, BUDGETS[c].maxParts]);
    }
  });

  it("every ported file names its source and the commit or date it came from", () => {
    const dir = path.join("lib", "foundry", "mesh", "gates");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && x !== "version.ts")) {
      const head = readFileSync(path.join(dir, f), "utf8").slice(0, 400);
      expect(head, f).toMatch(/PORTED WITH PROVENANCE[\s\S]*src\/lib\/visual-gen\/[a-z-]+\.ts @ [0-9a-f]{8}/);
    }
    for (const f of ["finish.py", "touchup.py", "rig.py", "render.py", "views4.py", "metrics.py"]) {
      expect(readFileSync(path.join("pipeline", "mesh", "blender", f), "utf8").slice(0, 300), f).toMatch(/PORTED WITH PROVENANCE[\s\S]*lynx-bench\\pof3d\\round4\\.*2026-10-21/);
    }
    expect(readFileSync(path.join("lib", "foundry", "mesh", "metrics.ts"), "utf8").slice(0, 300)).toMatch(/pofmetrics2\.py/);
  });

  it("the decimate target is round 4's: a character's T1 38000, T2 18000; else the class budget", () => {
    expect([targetFaces("character", "T1"), targetFaces("character", "T2"), targetFaces("weapon", "T1"), targetFaces("prop", "T1")]).toEqual([38_000, 18_000, 15_000, 10_000]);
  });

  it("the touch-up's weapon kind is read from the subject's words, and absent when none is named", () => {
    expect([weaponKind("viking battle-axe, rune etched"), weaponKind("a greatsword"), weaponKind("oak staff with a crystal"), weaponKind("flanged mace"), weaponKind("hooded archer")]).toEqual(["axe", "sword", "staff", "mace", undefined]);
  });
});

describe("the metrics (pofmetrics2's arithmetic)", () => {
  it("a stand-in is one closed, consistently wound shell standing at the class's size", () => {
    const m = glbMetrics(standInGlb("character"));
    expect(m).toMatchObject({ verts: 218, faces: 432, watertight: true, windingConsistent: true, components: 1, euler: 2, bbox: [0.6, 1.8, 0.35], degenerateFaces: 0, componentFaces: [432] });
    expect(m.volume).toBeCloseTo(0.6 * 1.8 * 0.35, 5);
  });

  it("a box with its lid off is not watertight, and two boxes are two components", () => {
    const box = standInBox([1, 1, 1], 2);
    const open = computeMetrics(box.positions, box.faces.slice(0, box.faces.length - 6 * 4));
    expect(open.watertight).toBe(false);
    expect(open.volume).toBeNull();
    const shifted = box.positions.map((x, i) => (i % 3 === 0 ? x + 3 : x));
    const two = computeMetrics([...box.positions, ...shifted], [...box.faces, ...box.faces.map((f) => f + box.positions.length / 3)]);
    expect([two.components, two.componentFaces]).toEqual([2, [48, 48]]);
  });

  it("a flipped face breaks the winding", () => {
    const box = standInBox([1, 1, 1], 1);
    const f = [...box.faces];
    [f[0], f[1]] = [f[1] ?? 0, f[0] ?? 0];
    expect(computeMetrics(box.positions, f).windingConsistent).toBe(false);
  });
});

describe("the read-back", () => {
  it("reads the triangles and joints off the file, and catches Draco in the extensions", () => {
    expect(readBack(standInGlb("weapon"))).toMatchObject({ tris: 432, joints: 0, draco: false });
    expect(readBack(standInGlb("character", { rig: true }))).toMatchObject({ tris: 432, joints: 23, draco: false });
    const g = readGlb(standInGlb("prop"));
    const drac = writeGlb({ ...g.json, extensionsUsed: ["KHR_draco_mesh_compression"] } as GltfJson, g.bin ?? new Uint8Array());
    expect(readBack(drac).draco).toBe(true);
    expect(() => readBack(new TextEncoder().encode("not a glb at all, just words"))).toThrow(/glTF magic/);
  });
});

describe("the gates a finished variant owes", () => {
  it("a stand-in character grades: mesh pass, budget pass, scale pass (1.8 m), rig bound to ue5-mannequin", () => {
    const glb = standInGlb("character", { rig: true });
    const gs = gradeFinished({ cls: "character", budgetTris: 40_000, metrics: { ok: true, value: glbMetrics(glb) }, rigged: { ok: true, value: glb } });
    expect(verdicts(gs)).toEqual({ mesh: "pass", budget: "pass", scale: "pass", rig: "warn" });
    const rig = gs.find((g) => g.name === "rig");
    expect(rig?.fails).toEqual([]);
    expect(rig?.warns.join(" ")).toMatch(/orphan joint/);
    expect(gs.every((g) => g.version.startsWith("pof/"))).toBe(true);
  });

  it("a weapon has no honest nominal size: its scale gate reads unmeasured, and says why", () => {
    const gs = gradeFinished({ cls: "weapon", budgetTris: 15_000, metrics: { ok: true, value: glbMetrics(standInGlb("weapon")) } });
    const scale = gs.find((g) => g.name === "scale");
    expect(scale?.verdict).toBe("unmeasured");
    expect(scale?.warns[0]).toMatch(/^unmeasured: no target size was requested/);
  });

  it("UNMEASURED IS NOT A PASS: with no metrics every mesh gate is unmeasured with a reason", () => {
    const gs = gradeFinished({ cls: "character", budgetTris: 40_000, metrics: { ok: false, why: "metrics.py exited 1: MemoryError" }, rigged: { ok: false, why: "no rigged glb was produced" } });
    expect(verdicts(gs)).toEqual({ mesh: "unmeasured", budget: "unmeasured", scale: "unmeasured", rig: "unmeasured" });
    for (const g of gs) {
      expect(g.verdict).not.toBe("pass");
      expect(g.fails).toEqual([]);
      expect(g.warns.length, g.name).toBe(1);
      expect(g.warns[0], g.name).toMatch(/^unmeasured: \S/);
    }
    expect(gs.find((g) => g.name === "mesh")?.warns[0]).toBe("unmeasured: metrics.py exited 1: MemoryError");
  });

  it("a rigged file the parser cannot read is unmeasured, not a pass and not a crash", () => {
    const g = gradeRig({ ok: true, value: new TextEncoder().encode("truncated") });
    expect(g.verdict).toBe("unmeasured");
    expect(g.warns[0]).toMatch(/^unmeasured: the rigged glb could not be read: not a binary glTF/);
  });

  it("an unrigged glb handed to the rig gate fails it: no skin is a defect, not an absence", () => {
    const g = gradeRig({ ok: true, value: standInGlb("character") });
    expect(g.verdict).toBe("fail");
    expect(g.fails[0]).toMatch(/^no skin/);
  });
});
