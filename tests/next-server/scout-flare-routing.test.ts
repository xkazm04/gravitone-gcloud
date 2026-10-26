// SCOUT'S STILLS, STEERED (plan humble-soaring-wave WP-B; studio-first since spark scout-vision S6) - the
// two steers, pinned where they are made: extract's `generator` option reaches the imaging router as
// `prefer` (and an extract run without one is unchanged; one naming the studio is shaped for it), /scout's
// style act asks for the night's still engine (`leonardo-studio` by default, SCOUT_REPLICA_GENERATOR
// otherwise), and a scene's replica request prefers the same. The imaging router is a fake that records what it was asked; every root is
// a temp directory set before any lib/ module loads.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-flare-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  fs.mkdirSync(path.join(dir, "catalogue"), { recursive: true });
  fs.writeFileSync(path.join(dir, "catalogue", "styles.json"), JSON.stringify({ styles: [] }), "utf8");
  return dir;
});

const asked = vi.hoisted(() => ({ generate: [] as Record<string, unknown>[], launches: [] as Record<string, unknown>[] }));

vi.mock("../../lib/imaging/router.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/imaging/router.ts")>();
  return {
    ...real,
    generate: async (req: Record<string, unknown>) => {
      asked.generate.push(req);
      const provider = typeof req["prefer"] === "string" ? req["prefer"] : "google";
      return { images: [{ base64: "AA==", mime: "image/png" }], provenance: { provider, model: "m", modelBasis: "requested", durationMs: 1, costUsd: 0.01, costBasis: "vendor-reported" } };
    },
  };
});

vi.mock("../../lib/producers/extract.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/producers/extract.ts")>();
  const { err } = await import("@gt/domain/errors");
  return {
    ...real,
    launchExtract: async (_store: unknown, target: Record<string, unknown>) => {
      asked.launches.push(target);
      return err("unavailable", "stopped by the test after the launch was asked");
    },
  };
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { openKernel, type Kernel } from "@gt/kernel/kernel";

import { createRun, liveIO } from "../../lib/foundry/extract/store.ts";
import { Refusal, styleAct, type ActContext } from "../../lib/foundry/scout/acts.ts";
import { REPLICA_GENERATOR, replicaRequest } from "../../lib/foundry/scout/scene.ts";
import { createNight, mutateNight, nightDir } from "../../lib/foundry/scout/store.ts";
import type { SceneRecipe, ScoutSource } from "../../lib/foundry/scout/types.ts";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const upload = { name: "g1.png", mime: "image/png" as const, base64: PNG };

let k: Kernel;
beforeAll(() => {
  const r = openKernel(path.join(ROOT, "kernel.sqlite"));
  if (!r.ok) throw r.error;
  k = r.value;
});
afterAll(() => {
  k.close();
  rmSync(ROOT, { recursive: true, force: true });
});
beforeEach(() => {
  asked.generate.length = 0;
  asked.launches.length = 0;
});

describe("extract's generator option", () => {
  it("is kept on the manifest and reaches the router as `prefer` on every generate", async () => {
    const m = await createRun("flare-run", [upload], { generator: "leonardo-flare" });
    expect(m.options.generator).toBe("leonardo-flare");
    const g = await liveIO(m.id).generate("a recipe", "text", "16:9", 11);
    expect(asked.generate).toEqual([{ prompt: "a recipe", negativePrompt: "text", aspect: "16:9", count: 1, seed: 11, prefer: "leonardo-flare" }]);
    // The served vendor is what `engines.generator` records (performReplica: `m.engines.generator = g.model`).
    expect(g.model).toBe("leonardo-flare/m");
  });

  it("absent, the manifest carries no generator and the router is asked without a steer, as before", async () => {
    const m = await createRun("plain-run", [upload], {});
    expect("generator" in m.options).toBe(false);
    await liveIO(m.id).generate("a recipe", "text", "16:9", 11);
    expect(asked.generate).toEqual([{ prompt: "a recipe", negativePrompt: "text", aspect: "16:9", count: 1, seed: 11 }]);
  });

  it("a run naming the studio is drawn at Low, a 4:5 replica as 9:16, its prompt cut to the box", async () => {
    const m = await createRun("studio-run", [upload], { generator: "leonardo-studio" });
    await liveIO(m.id).generate(`${"A flat poster of a lighthouse. ".repeat(60)}`, "text", "4:5", 11);
    const asked0 = asked.generate[0] ?? {};
    expect(asked0).toMatchObject({ aspect: "9:16", quality: "low", prefer: "leonardo-studio", negativePrompt: "text", seed: 11 });
    const prompt = String(asked0["prompt"]);
    expect(prompt.length + "\n\nAvoid: text".length).toBeLessThanOrEqual(1500);
    expect(prompt.endsWith(".")).toBe(true);
  });

  it("a generator that is not a provider id is dropped at creation, not carried to the router", async () => {
    const m = await createRun("odd-run", [upload], { generator: "midjourney" as never });
    expect("generator" in m.options).toBe(false);
  });
});

describe("/scout", () => {
  it("the style act launches its extract run with the night's still engine: the studio by default, the switch otherwise", async () => {
    const n = await createNight({ dry: true, day: "2026-10-22" });
    const file = "sources/s-01/p-001.png";
    mkdirSync(path.dirname(path.join(nightDir(n.id), file)), { recursive: true });
    writeFileSync(path.join(nightDir(n.id), file), Buffer.from(PNG, "base64"));
    const source: ScoutSource = { id: "s-01", url: "https://art.example/one.png", kind: "image", title: "One", why: "two flat inks", found: "search", rights: "reference-only", status: "ingested", files: [file] };
    await mutateNight(n.id, (x) => ({ ...x, sources: [source] }));
    const ctx: ActContext = { store: k.store, location: path.join(ROOT, "kernel.sqlite"), actor: { kind: "operator", id: "op-1" }, dryOnly: true, live: false, detach: true, say: () => undefined };
    const prev = process.env["SCOUT_REPLICA_GENERATOR"];
    try {
      delete process.env["SCOUT_REPLICA_GENERATOR"];
      await expect(styleAct(ctx, n.id, ["s-01"])).rejects.toBeInstanceOf(Refusal);
      process.env["SCOUT_REPLICA_GENERATOR"] = "leonardo-flare";
      await expect(styleAct(ctx, n.id, ["s-01"])).rejects.toBeInstanceOf(Refusal);
    } finally {
      if (prev === undefined) delete process.env["SCOUT_REPLICA_GENERATOR"];
      else process.env["SCOUT_REPLICA_GENERATOR"] = prev;
    }
    expect(asked.launches).toHaveLength(2);
    expect(asked.launches[0]).toMatchObject({ kind: "gallery", options: { generator: "leonardo-studio" } });
    expect(asked.launches[1]).toMatchObject({ kind: "gallery", options: { generator: "leonardo-flare" } });
  });

  it("a scene's replica still prefers the studio at Low by default, Flare when named, with no reference image", () => {
    const recipe: SceneRecipe = {
      shot: "wide",
      camera: "eye level, a normal lens",
      motion: "camera holds",
      composition: "one figure, open space right",
      lighting: "a soft cool key from high left",
      palette: ["slate ground", "amber accent"],
      rhythm: "pace unknown from stills",
      durationS: 3,
      prompt: "A flat colour poster of a lighthouse on a cliff at dusk, two inks, open sky to the right.",
    };
    expect(REPLICA_GENERATOR).toBe("leonardo-studio");
    const req = replicaRequest(recipe, 1, "leonardo-studio");
    expect(req).toMatchObject({ prefer: "leonardo-studio", aspect: "16:9", count: 1, seed: 1, quality: "low", prompt: recipe.prompt });
    expect("references" in req).toBe(false);
    const flare = replicaRequest(recipe, 1, "leonardo-flare");
    expect(flare).toMatchObject({ prefer: "leonardo-flare", aspect: "16:9", count: 1, seed: 1 });
    expect("quality" in flare).toBe(false);
  });
});
