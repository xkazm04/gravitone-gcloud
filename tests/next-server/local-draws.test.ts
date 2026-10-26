import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { FoundryError } from "../../lib/foundry/runStore.ts";
import { readDeskNight, saveDeskNight } from "../../lib/foundry/local-draws/desk.ts";
import { drawFile, listRuns } from "../../lib/foundry/local-draws/read.ts";
import { listNights } from "../../lib/foundry/scout/store.ts";
import type { Night } from "../../lib/foundry/scout/types.ts";

const prior = process.env["GRAVITONE_LOCAL_DRAWS"];
const priorScout = process.env["SCOUT_STORE_DIR"];

afterEach(() => {
  if (prior === undefined) delete process.env["GRAVITONE_LOCAL_DRAWS"];
  else process.env["GRAVITONE_LOCAL_DRAWS"] = prior;
  if (priorScout === undefined) delete process.env["SCOUT_STORE_DIR"];
  else process.env["SCOUT_STORE_DIR"] = priorScout;
});

describe("local draws", () => {
  it("is unset when the env is empty", async () => {
    delete process.env["GRAVITONE_LOCAL_DRAWS"];
    expect(await listRuns()).toEqual({ kind: "unset" });
  });

  it("reads a report and a night, and refuses a path that leaves the folder", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "gt-draws-"));
    process.env["GRAVITONE_LOCAL_DRAWS"] = root;
    const run = path.join(root, "run-1");
    mkdirSync(path.join(run, "tier-a", "engine"), { recursive: true });
    writeFileSync(path.join(run, "tier-a", "prompt.txt"), "the ask\n");
    writeFileSync(path.join(run, "tier-a", "engine", "frame.jpg"), "jpeg");
    writeFileSync(path.join(run, "report.json"), JSON.stringify({
      at: "2026-10-23T00:00:00.000Z",
      engines: { clip: "engine" },
      tiers: [{
        id: "a",
        name: "study",
        draws: [
          { verdict: "landed", kept: true, via: "engine", judge: { follow: "yes", anatomy: "ok", notes: "one figure" } },
          { verdict: "gen-failed", kept: false, via: "flux2", error: "weights absent", judge: null },
        ],
      }],
    }));
    const night = path.join(root, "nights", "night-1", "items", "late");
    mkdirSync(night, { recursive: true });
    writeFileSync(path.join(night, "frame.jpg"), "jpeg");
    writeFileSync(path.join(night, "prompt.txt"), "aged 30\n");
    writeFileSync(path.join(root, "nights", "night-1", "manifest.json"), JSON.stringify({
      at: "2026-10-23T01:00:00.000Z",
      engine: "engine",
      items: [{ slug: "late", title: "The late train", style: "film realism", form: "short", tier: "b", verdict: "landed", follow: "yes", anatomy: "ok", notes: "asleep", frame: "items/late/frame.jpg", clip: "" }],
    }));

    const listed = await listRuns();
    expect(listed.kind).toBe("ok");
    if (listed.kind !== "ok") return;
    expect(listed.runs.map((r) => r.id)).toEqual(["nights/night-1", "run-1"]);
    const bake = listed.runs[1];
    expect(bake?.cards).toHaveLength(2);
    expect(bake?.cards[0]).toMatchObject({ frame: "tier-a/engine/frame.jpg", clip: "", prompt: "the ask", verdict: "landed" });
    expect(bake?.cards[1]).toMatchObject({ frame: "", verdict: "gen-failed", notes: "weights absent" });
    expect(listed.runs[0]?.cards[0]).toMatchObject({ title: "The late train · film realism · short", prompt: "aged 30" });

    const file = await drawFile("run-1", "tier-a/engine/frame.jpg");
    expect(file.abs.endsWith(`${path.sep}frame.jpg`)).toBe(true);
    expect(file.mime).toBe("image/jpeg");
    expect(file.ranges).toBe(false);

    await expect(drawFile("../secret", "frame.jpg")).rejects.toBeInstanceOf(FoundryError);
    await expect(drawFile("run-1", "../../outside.jpg")).rejects.toBeInstanceOf(FoundryError);
    await expect(drawFile("run-1", "tier-a/prompt.txt")).rejects.toBeInstanceOf(FoundryError);
    await expect(drawFile("run-1", "tier-a/missing.jpg")).rejects.toBeInstanceOf(FoundryError);
  });

  it("keeps a desk night out of the scout list", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "gt-desk-"));
    const scout = path.join(root, "scout");
    const draws = path.join(root, "draws");
    process.env["SCOUT_STORE_DIR"] = scout;
    process.env["GRAVITONE_LOCAL_DRAWS"] = draws;
    const live = path.join(scout, "2026-10-23");
    mkdirSync(live, { recursive: true });
    writeFileSync(path.join(live, "night.json"), JSON.stringify({
      id: "2026-10-23", startedAt: "2026-10-23T00:00:00.000Z", ceilingUsd: 15, target: 20, clipCap: 2,
      dry: true, state: "closed", sources: [], candidates: [], jobs: [],
    }));
    const desk: Night = {
      id: "2026-10-20", startedAt: "2026-10-20T00:00:00.000Z", ceilingUsd: 0, target: 1, clipCap: 0,
      dry: true, state: "closed", stop: "operator", sources: [], jobs: [],
      candidates: [{ id: "c-01", kind: "idea", sourceIds: [], status: "rendered", title: "The late train", target: "scene", prompt: "aged 30", anchor: { kind: "free", ref: "" }, image: "ideas/c-01.jpg" }],
    };
    await saveDeskNight(desk);
    expect((await listNights()).map((n) => n.id)).toEqual(["2026-10-23"]);
    expect((await readDeskNight("2026-10-20"))?.candidates).toHaveLength(1);
    expect(await readDeskNight("2026-10-23")).toBeNull();
  });
});
