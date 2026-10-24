import { mkdtempSync, rmSync } from "node:fs";
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
import { fixtureProduce } from "../../app/(studio)/projects/_port/port.ts";

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
