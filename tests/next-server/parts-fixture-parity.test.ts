import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ok, type Result } from "@gt/domain/errors";
import type { PartOp } from "@gt/domain/partView";
import { blobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { compose } from "@gt/kernel/records/write";

import { makeRealPart } from "../../app/(studio)/projects/[id]/_part/real.ts";
import { loadPart, opPart, resetParts, undoPart } from "../../app/(studio)/projects/[id]/_part/fixture.ts";
import { DRY_STILLS, dryPreset, owes, type UnitRec } from "../../app/(studio)/projects/[id]/_part/fixtureFrames.ts";
import { plateView, takeUrl } from "../../app/(studio)/projects/[id]/_part/fixtureFramesView.ts";
import { fixtureProduce } from "../../app/(studio)/projects/_port/port.ts";
import { isStalePlate } from "../../lib/frames/frames.ts";
import { frameOfUnit } from "../../lib/frames/picture/unit.ts";
import { needsPlate } from "@gt/producers/frames/define";

// THE FIXTURE SIDE ANSWERS WHAT THE REAL SIDE ANSWERS. GRAVITONE_PRODUCE_SIDE=fixture is how every
// part editor is built and photographed, so a state the fixture reaches and the kernel cannot (an
// undo line for an edit that wrote nothing, a crash where the real side refuses) is a screen
// designed against a port that does not exist. Each case drives one verb on BOTH sides and pins
// the outcome's shape - the code, and the words where the editor shows them.

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
let open: Kernel[] = [];
afterEach(() => {
  for (const k of open) k.close();
  open = [];
});
beforeEach(() => resetParts());

const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-10-16T09:00:00Z");

function realAd(): ReturnType<typeof makeRealPart> {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-parity-"));
  dirs.push(dir);
  const k = openKernel(path.join(dir, "k.sqlite"));
  if (!k.ok) throw k.error;
  open.push(k.value);
  const store = k.value.store;
  const c = compose(store, { recipe: "film/ad-social-15" }, OP, { id: "ad1" });
  if (!c.ok) throw c.error;
  return makeRealPart({ store: () => ok(store), now: () => NOW, gates: { store: () => ok(store), blobs: () => blobStore(path.join(dir, "blobs")), now: () => NOW } });
}

/** The fixture's ads project (fixture.ts SEEDS), composed on first read. */
function fixtureAd(): string {
  loadPart("none", "research", NOW);
  const list = fixtureProduce().listProjects();
  if (!list.ok) throw list.error;
  const id = list.value.projects.find((p) => p.title === "Rainshell — social 15")?.id;
  if (id === undefined) throw new Error("no fixture ads project");
  return id;
}

/** A verb's outcome as a comparable shape: a thrown error is a crash, not a refusal. */
async function outcome<T>(run: () => Result<T> | Promise<Result<T>>): Promise<string> {
  try {
    const r = await run();
    return r.ok ? "ok" : r.error.code;
  } catch (e) {
    return `threw ${e instanceof Error ? e.name : typeof e}`;
  }
}

describe("an op of another kind's editor", () => {
  const wrong: readonly [string, PartOp][] = [
    ["research", { op: "pick-scenario", scenarioId: "x" }],
    ["script", { op: "descope", cardId: "x" }],
  ];
  it.each(wrong)("is refused on %s by both sides, never thrown", async (key, op) => {
    const real = realAd();
    const id = fixtureAd();
    const r = await outcome(() => real.opPart({ projectId: "ad1", key, baseRev: 1, op }));
    const f = await outcome(() => opPart(id, key, 1, op, NOW));
    expect(r).toBe("invalid");
    expect(f).toBe(r);
  });
});

describe("an undo with nothing left to undo", () => {
  it("is refused with the kernel's code and words on both sides", async () => {
    const real = realAd();
    const id = fixtureAd();
    const r = await real.undoPart({ projectId: "ad1", key: "research", baseRev: 1 });
    const f = undoPart(id, "research", 1, NOW);
    expect(r.ok ? null : { code: r.error.code, message: r.error.message }).toEqual({ code: "refused", message: "nothing on this part is left to undo" });
    expect(f.ok ? null : { code: f.error.code, message: f.error.message }).toEqual(r.ok ? null : { code: r.error.code, message: r.error.message });
  });
});

describe("an op that changes nothing", () => {
  it("is refused on both sides, and leaves no line on the undo trail", async () => {
    const real = realAd();
    const id = fixtureAd();
    const op: PartOp = { op: "set-brief", field: "mustInclude", value: ["logo on the end card"] };
    const v0 = loadPart(id, "research", NOW);
    const fixtureRev = v0.ok ? v0.value.rev : 0;
    // The real side starts from an empty brief: give it the fixture's list first, so both hold it.
    const first = await real.opPart({ projectId: "ad1", key: "research", baseRev: 1, op });
    expect(first.ok && first.value.kind).toBe("applied");
    const r = await real.opPart({ projectId: "ad1", key: "research", baseRev: 2, op });
    const f = opPart(id, "research", fixtureRev, op, NOW);
    const shape = (x: Result<unknown>) => (x.ok ? "applied" : { code: x.error.code, message: x.error.message });
    expect(shape(r)).toEqual({ code: "invalid", message: "brief mustInclude: changes nothing" });
    expect(shape(f)).toEqual(shape(r));
    const after = loadPart(id, "research", NOW);
    expect(after.ok ? { rev: after.value.rev, ops: after.value.ops.length } : null).toEqual({ rev: fixtureRev, ops: 0 });
  });
});

describe("a plate the next render owes", () => {
  // The producer's rule (needsPlate) prices the act; the module's (owes) labels it and lands it.
  const states = ["empty", "generating", "ready", "refused"] as const;
  const cases = states.flatMap((state) => [false, true].map((moved) => ({ state, moved })));
  it.each(cases)("$state, subject moved: $moved - the fixture owes it exactly when the producer would buy it", ({ state, moved }) => {
    const plate = { state, subject: moved ? "a lighthouse at dusk" : "a harbour wall", renderedSubject: "a harbour wall" };
    const u = { id: "u1", kind: "beat", beatKind: "claim", beatRef: { at: 0 }, title: "t", line: "l", startS: 0, holdS: 3, plate, clip: { status: "not-started", motion: "" }, elements: [], texts: [] } as unknown as UnitRec;
    const stale = isStalePlate(frameOfUnit(u));
    expect(owes(u)).toBe(needsPlate({ id: u.id, plate: state, stale }));
    expect(plateView(u).stale).toBe(stale);
  });
});

describe("a dry stand-in's pixels", () => {
  it("are a shipped preset, still and clip, from the one list frames, its takes and motion read", () => {
    for (const [i, name] of DRY_STILLS.entries()) {
      for (const ext of ["jpg", "webm"] as const) {
        const url = dryPreset(i, ext);
        expect(url).toBe(`/clips/presets/${name}.${ext}`);
        expect(existsSync(path.join(process.cwd(), "public", url))).toBe(true);
      }
    }
    expect(takeUrl("dry:shot-1:7", undefined)).toBe(dryPreset(7, "jpg"));
  });
});
