// A FAILED DRAW SPENDS NO PLACE (perfect 2026-11-08, scout-engine-core: failed-draws-spare-cap). The shape of 2026-10-26:
// thirty-two storyboards failed in seconds and the night's cap read full. storyboardsUsed does not count a failed
// candidate, whichever engine failed it.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-gate-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  fs.mkdirSync(path.join(dir, "catalogue"), { recursive: true });
  fs.writeFileSync(path.join(dir, "catalogue", "styles.json"), JSON.stringify({ styles: [] }), "utf8");
  return dir;
});

import { rmSync } from "node:fs";

import { DEFAULT_STORYBOARD_CAP, type Night } from "../../lib/foundry/scout/types.ts";
import { storyboardCapOf, storyboardsUsed } from "../../lib/foundry/scout/storyboard.ts";

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const NOT_THERE = "the engine did not draw";

/** A night shaped as 2026-10-26's: `failed` storyboards that never drew, `kept` ones that did, one idea that is not a storyboard. */
const night = (failed: number, kept: number): Night =>
  ({
    id: "2026-10-26",
    candidates: [
      ...Array.from({ length: failed }, (_, i) => ({ id: `c-${i + 1}`, kind: "storyboard", status: "failed", error: NOT_THERE })),
      ...Array.from({ length: kept }, (_, i) => ({ id: `c-${100 + i}`, kind: "storyboard", status: "rendered" })),
      { id: "c-900", kind: "idea", status: "rendered" },
    ],
  }) as unknown as Night;

describe("storyboardsUsed", () => {
  it("replays 32 'ComfyUI is not reachable' failures: the cap is intact", () => {
    const dead = night(32, 0);
    expect(dead.candidates.filter((c) => c.kind === "storyboard" && c.status === "failed")).toHaveLength(32);
    expect(storyboardsUsed(dead)).toBe(0);
    expect(Math.max(0, storyboardCapOf(dead) - storyboardsUsed(dead))).toBe(DEFAULT_STORYBOARD_CAP);
  });

  it("still counts a pending or rendered storyboard, and only a storyboard", () => {
    expect(storyboardsUsed(night(32, 3))).toBe(3);
    const pending = { candidates: [{ id: "c-1", kind: "storyboard", status: "pending" }] } as unknown as Night;
    expect(storyboardsUsed(pending)).toBe(1);
  });
});
