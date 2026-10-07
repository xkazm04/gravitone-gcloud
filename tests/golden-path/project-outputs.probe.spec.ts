// LANE — PROJECT OUTPUTS: the studio's Outputs shelf is this project's own
// frames and score, read through the typed record seam on fake-indexeddb with
// no component mounted (card WORKSPACE-B stage 1).
//
//   1  v2 units: 3 ready, 1 refused, 1 empty -> 3 images, one missing row
//   2  v1 migrates to the same outputs; a v3 record refuses frames, score lives
//   3  a seeded alternative equal to the active plate is not counted twice;
//      stress clones (`~s`) are excluded
//   4  score: active take in the store -> audio; no take -> `take-missing`;
//      store unreachable -> score unavailable, frames still render
//   5  no records -> every source empty, tally 0
//   6  project A then B -> none of A's outputs
//   7  no output is approved/done/final; each outputs.ts stays off React/Next
//   8  shot units: a ready plate counts, an empty one is neither output nor gap
//   9  StudioView and LibraryShelves no longer import app/_studio/assets
//   +  the tally's cost, measured (reported, never asserted: timing flakes)
import "fake-indexeddb/auto";

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { saveStep } from "@/app/_phases/_shared/stepStore";
import type { Frame } from "@/app/_phases/frames/frames";
import { unitsFromFrames, type PictureUnit } from "@/app/_phases/frames/picture/unit";
import { readOutputs } from "@/app/_library/projectOutputs";

import { stripComments } from "./_helpers";

const ROOT = process.cwd();

function frame(id: string, plate: Frame["plate"]["state"], extra: Partial<Frame["plate"]> = {}): Frame {
  return {
    id,
    at: "0:00",
    atS: 0,
    kind: "hook",
    title: `title ${id}`,
    line: `line ${id}`,
    plate: { state: plate, ...(plate === "ready" ? { src: `/p/${id}.png` } : {}), ...extra },
    clip: { status: "not-started", motion: "" },
    elements: [],
    texts: [],
  };
}

const unitsOf = (frames: Frame[]) => unitsFromFrames(frames, { sourceId: "r-1", totalS: null });

async function putFrames(id: string, frames: Frame[], units: PictureUnit[] = unitsOf(frames), v = 2) {
  const out = await saveStep(id, "frames", { units, frames, renderId: "r-1" }, { v });
  expect(out.ok).toBe(true);
}

const spot = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `cue ${id}`,
  sceneIds: [],
  note: "",
  ...extra,
});

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

/** The sound store, answering every list call with these takes. */
function soundStore(takes: { id: string; title?: string; provider?: string }[]) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ takes: takes.map((t) => ({ title: "t", provider: "elevenlabs", ...t })) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

function soundDown() {
  globalThis.fetch = (async () => {
    throw new Error("connect ECONNREFUSED");
  }) as typeof fetch;
}

/* ───────────────────────────────── case 1 ─────────────────────────────────── */

test("case 1: 3 ready, 1 refused, 1 empty -> 3 images; the refused plate is only a missing row", async () => {
  const frames = [
    frame("a", "ready", { costUsd: 0.04, model: "m" }),
    frame("b", "ready", { costUsd: 0.04 }),
    frame("c", "ready", { costUsd: 0.05 }),
    frame("d", "refused"),
    frame("e", "empty"),
  ];
  await putFrames("p1", frames);
  soundStore([]);
  const r = await readOutputs("p1");
  expect(r.sources.frames.state).toBe("loaded");
  const shown = r.outputs.filter((o) => o.state !== "missing");
  expect(shown).toHaveLength(3);
  expect(shown.map((o) => o.id)).toEqual(unitsOf(frames).slice(0, 3).map((u) => `frames:${u.id}`));
  expect(shown.every((o) => o.kind === "image" && o.provenance.step === "frames")).toBe(true);
  expect(shown.reduce((n, o) => n + (o.provenance.costUsd ?? 0), 0)).toBeCloseTo(0.13, 5);
  const missing = r.outputs.filter((o) => o.state === "missing");
  expect(missing).toHaveLength(1);
  expect(missing[0].code).toBe("plate-refused");
  expect(missing[0].src).toBeUndefined();
  expect(r.count).toBe(3);
});

/* ───────────────────────────────── case 2 ─────────────────────────────────── */

test("case 2: a v1 record gives the same outputs; a v3 record refuses frames and score still renders", async () => {
  const frames = [frame("a", "ready"), frame("b", "refused")];
  await putFrames("p2a", frames);
  const v1 = await saveStep("p2b", "frames", { frames, renderId: "r-1" });
  expect(v1.ok).toBe(true);
  soundStore([]);
  const [a, b] = [await readOutputs("p2a"), await readOutputs("p2b")];
  expect(b.outputs.map((o) => [o.id, o.state, o.code])).toEqual(a.outputs.map((o) => [o.id, o.state, o.code]));
  expect(b.count).toBe(1);

  await putFrames("p2c", frames, unitsOf(frames), 3);
  await saveStep("p2c", "score", { spots: [spot("s1", { activeTakeId: "t1", takeIds: ["t1"] })] });
  soundStore([{ id: "t1" }]);
  const c = await readOutputs("p2c");
  const f = c.sources.frames;
  expect(f.state).toBe("refused");
  if (f.state === "refused") expect(f.refused).toBe("future");
  expect(c.sources.score.state).toBe("loaded");
  expect(c.count).toBe(1);
});

/* ───────────────────────────────── case 3 ─────────────────────────────────── */

test("case 3: a seeded alternative equal to the active plate counts once; ~s scenes are excluded", async () => {
  const frames = [frame("a", "ready"), frame("b~s", "ready"), frame("c", "ready")];
  await putFrames("p3", frames);
  const plate = (src: string) => ({ state: "ready" as const, src });
  await saveStep(
    "p3",
    "frames-alts",
    {
      byFrame: {
        a: {
          activeId: "a1",
          alts: [
            { id: "a1", plate: plate("/p/a.png"), createdAt: 1, seeded: true },
            { id: "a2", plate: plate("/p/a-2.png"), createdAt: 2 },
          ],
        },
        c: {
          activeId: "c2",
          alts: [
            { id: "c1", plate: plate("/p/c.png"), createdAt: 1, seeded: true },
            { id: "c2", plate: plate("/p/c-2.png"), createdAt: 2 },
          ],
        },
        "b~s": {
          activeId: "x",
          alts: [
            { id: "x", plate: plate("/p/x.png"), createdAt: 1 },
            { id: "y", plate: plate("/p/y.png"), createdAt: 1 },
          ],
        },
      },
    },
    { v: 1 },
  );
  soundStore([]);
  const r = await readOutputs("p3");
  // The frame's own plate is the one in the cut; a seeded copy of it, or the
  // alternative the scene marks active, is the same picture and is not a row.
  expect(r.outputs.filter((o) => o.src === "/p/a.png")).toHaveLength(1);
  expect(r.outputs.filter((o) => o.src === "/p/c.png")).toHaveLength(1);
  expect(r.outputs.filter((o) => o.state === "alternative").map((o) => o.src)).toEqual(["/p/a-2.png"]);
  expect(r.outputs.some((o) => /\/p\/[xy]\.png$/.test(o.src ?? ""))).toBe(false);
});

/* ───────────────────────────────── case 4 ─────────────────────────────────── */

test("case 4: an active take in the store is audio; no take is `take-missing`; an unreachable store makes score unavailable only", async () => {
  await putFrames("p4", [frame("a", "ready")]);
  await saveStep("p4", "score", {
    spots: [spot("s1", { activeTakeId: "t1", takeIds: ["t1", "t2"] }), spot("s2")],
  });
  soundStore([{ id: "t1" }, { id: "t2" }]);
  const r = await readOutputs("p4");
  const audio = r.outputs.filter((o) => o.kind === "audio");
  expect(audio.filter((o) => o.state === "in-cut")).toHaveLength(1);
  expect(audio.filter((o) => o.state === "alternative")).toHaveLength(1);
  expect(audio.filter((o) => o.state === "missing").map((o) => o.code)).toEqual(["take-missing"]);
  expect(r.count).toBe(1 + 2);

  soundDown();
  const down = await readOutputs("p4");
  const s = down.sources.score;
  expect(s.state).toBe("unavailable");
  if (s.state === "unavailable") expect(s.reason).toBe("the studio server could not be reached");
  expect(down.sources.frames.state).toBe("loaded");
  expect(down.count).toBe(1);
});

/* ───────────────────────────────── case 5 ─────────────────────────────────── */

test("case 5: a project with no records: every source is empty and the tally is 0", async () => {
  soundDown();
  const r = await readOutputs("p5-nothing");
  expect(Object.values(r.sources).map((s) => s.state)).toEqual(["empty", "empty"]);
  expect(r.count).toBe(0);
  expect(r.outputs).toEqual([]);
});

/* ───────────────────────────────── case 6 ─────────────────────────────────── */

test("case 6: project A then B: none of A's outputs appear in B", async () => {
  await putFrames("p6a", [frame("only-a", "ready")]);
  await putFrames("p6b", [frame("only-b", "ready")]);
  soundStore([]);
  const a = await readOutputs("p6a");
  const b = await readOutputs("p6b");
  expect(a.projectId).toBe("p6a");
  expect(b.projectId).toBe("p6b");
  expect(b.outputs.map((o) => o.id)).toEqual(["frames:only-b"]);
  expect(b.outputs.some((o) => a.outputs.some((x) => x.id === o.id))).toBe(false);
});

/* ───────────────────────────────── case 7 ─────────────────────────────────── */

const FORBIDDEN = /^(react|react-dom|next)(\/|$)/;

function valueImports(src: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
  for (const m of src.matchAll(re)) {
    if (m[2]) continue;
    const braces = m[3].trim().match(/^\{([\s\S]*)\}$/);
    if (braces) {
      const items = braces[1].split(",").map((s) => s.trim()).filter(Boolean);
      if (items.length > 0 && items.every((s) => s.startsWith("type "))) continue;
    }
    out.push(m[4]);
  }
  for (const m of src.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) out.push(m[1]);
  return out;
}

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, path.join(base, "index.ts"), path.join(base, "index.tsx")])
    if (existsSync(c) && statSync(c).isFile()) return c;
  throw new Error(`unresolved import ${spec} from ${path.relative(ROOT, from)}`);
}

function closure(entry: string): { files: string[]; packages: Map<string, string> } {
  const seen = new Set<string>();
  const packages = new Map<string, string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    if (!/\.(ts|tsx|mts)$/.test(f)) continue;
    for (const spec of valueImports(stripComments(readFileSync(f, "utf8")))) {
      const r = resolveSpec(f, spec);
      if (r) stack.push(r);
      else packages.set(spec, path.relative(ROOT, f));
    }
  }
  return { files: [...seen], packages };
}

test("case 7: no output state is approved, done or final; each outputs.ts stays off React and Next", () => {
  const types = stripComments(readFileSync(path.join(ROOT, "app/_library/projectOutputs.ts"), "utf8"));
  const union = types.match(/export type OutputState =([^;]+);/)?.[1] ?? "";
  expect(union).toContain("in-cut");
  expect(union).not.toMatch(/approved|done|final/);

  for (const rel of ["app/_phases/frames/outputs.ts", "app/_phases/score/outputs.ts"]) {
    const abs = path.join(ROOT, rel);
    const src = stripComments(readFileSync(abs, "utf8"));
    expect(src, `${rel} is a client module`).not.toMatch(/^\s*["']use client["']/);
    expect(src).not.toMatch(/["'](approved|done|final)["']/);
    const { files, packages } = closure(abs);
    expect(files.length).toBeGreaterThanOrEqual(1);
    const bad = [...packages].filter(([spec]) => FORBIDDEN.test(spec));
    expect(bad, `${rel} reaches ${bad.map(([s, by]) => `${s} (via ${by})`).join(", ")}`).toEqual([]);
  }
});

/* ───────────────────────────────── case 8 ─────────────────────────────────── */

test("case 8: a ready shot unit is an image, an empty shot unit is neither an output nor a missing row", async () => {
  const frames = [frame("s1", "ready"), frame("s2", "empty")];
  const units = unitsOf(frames).map((u) => ({ ...u, kind: "shot" as const }));
  await putFrames("p8", frames, units);
  soundStore([]);
  const r = await readOutputs("p8");
  expect(r.outputs).toHaveLength(1);
  expect(r.outputs[0].kind).toBe("image");
  expect(r.outputs[0].state).toBe("in-cut");
  expect(r.outputs.some((o) => o.state === "missing")).toBe(false);
});

/* ───────────────────────────────── case 9 ─────────────────────────────────── */

test("case 9: StudioView and LibraryShelves no longer import the fixture assets", () => {
  for (const rel of ["app/studio/[projectId]/StudioView.tsx", "app/_library/LibraryShelves.tsx"]) {
    const src = stripComments(readFileSync(path.join(ROOT, rel), "utf8"));
    expect(src.length, rel).toBeGreaterThan(0);
    expect(src, rel).not.toMatch(/from\s*["'][^"']*_studio\/assets["']/);
  }
});

/* ─────────────────────── the tally's cost, measured ───────────────────────── */

test("measure: readOutputs over a ~5 MB frames record, 5 runs (reported, never asserted)", async ({}, testInfo) => {
  // Plates are stored as data: URLs; 12 x ~400 KB is the record the studio holds.
  const blob = `data:image/png;base64,${"A".repeat(400_000)}`;
  const frames = Array.from({ length: 12 }, (_, i) => ({
    ...frame(`m${i}`, "ready"),
    plate: { state: "ready" as const, src: blob, costUsd: 0.04 },
  }));
  await putFrames("p-big", frames);
  soundStore([]);
  const ms: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    const r = await readOutputs("p-big");
    ms.push(performance.now() - t);
    expect(r.count).toBe(12);
  }
  const median = [...ms].sort((a, b) => a - b)[2];
  const report = { medianMs: Math.round(median * 10) / 10, runsMs: ms.map((m) => Math.round(m * 10) / 10) };
  console.log(`TALLY-MEASURE ${JSON.stringify(report)}`);
  await testInfo.attach("tally-measure", { body: JSON.stringify(report), contentType: "application/json" });
});
