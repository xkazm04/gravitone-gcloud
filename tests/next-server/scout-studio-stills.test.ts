// STUDIO-FIRST STILLS (spark scout-vision S6, WP-A) - the scout's stills default to the Leonardo studio at
// Low: the request shaped for the studio (aspect, quality, a prompt that fits), the engine's lane, the
// receipt priced by the engine, the cross-process studio lock, and the doctor's two pool readings. Every
// root is a temp directory set before any lib/ module loads; no browser, no vendor, no ComfyUI is reached.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-studio-stills-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["LEONARDO_STUDIO_LOCK_DIR"] = path.join(dir, "lock");
  delete process.env["SCOUT_REPLICA_GENERATOR"];
  return dir;
});

import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Actor } from "@gt/domain/event";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { assetPlan, parseAssetRequest } from "@gt/producers/scout-asset/define";
import { STUDIO_CREDIT, studioCredit } from "@gt/producers/scout-ideas/define";
import { scenePlan, parseSceneRequest } from "@gt/producers/scout-scene/define";

import { parseBrief } from "../../lib/foundry/scout/concept.ts";
import { generatorOnLane, replicaGenerator, stillLane } from "../../lib/foundry/scout/stillEngine.ts";
import { createNight, mutateNight } from "../../lib/foundry/scout/store.ts";
import type { Asset3dCandidate } from "../../lib/foundry/scout/types.ts";
import { apiPoolWords, leonardoApiPool, probeLeonardoApiPool, studioBalanceCheck } from "../../lib/imaging/studio/balance.ts";
import { studioLockPath, withStudioLock } from "../../lib/imaging/studio/lock.ts";
import { fitStudioPrompt, STUDIO_MAX_PROMPT_CHARS, studioAspect, studioShaped, trimAtSentence } from "../../lib/imaging/studio/still.ts";
import { StudioError } from "../../lib/imaging/studio/types.ts";
import { launchAsset } from "../../lib/producers/scoutAsset.ts";
import { scoutStillOption } from "../../lib/producers/scoutStillOption.ts";

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

describe("a request shaped for the studio", () => {
  it("studioAspect draws 4:5 as 9:16 and leaves the studio's own radios alone", () => {
    expect(studioAspect("4:5")).toBe("9:16");
    expect(studioAspect("16:9")).toBe("16:9");
    expect(studioAspect("9:16")).toBe("9:16");
    expect(studioAspect("1:1")).toBe("1:1");
  });

  it("a prompt past the box is cut at its last whole sentence; one with no late sentence end is cut hard", () => {
    const s = "A lighthouse on a cliff at dusk. ";
    const long = s.repeat(60);
    const cut = trimAtSentence(long, 200);
    expect(cut.length).toBeLessThanOrEqual(200);
    expect(cut.endsWith("dusk.")).toBe(true);
    expect(trimAtSentence("short. prompt", 200)).toBe("short. prompt");
    const words = "word ".repeat(400);
    expect(trimAtSentence(words, 300)).toHaveLength(299);
    // A sentence end in the first half is not a boundary worth keeping: the cut is hard.
    expect(trimAtSentence(`One. ${"x".repeat(500)}`, 100)).toHaveLength(100);
  });

  it("the prompt and its Avoid sentence fit the box together; a long negative gives way first", () => {
    const fit = fitStudioPrompt("A wide quay at night. ".repeat(100), "text, watermark, logo");
    expect(fit.prompt.length + "\n\nAvoid: text, watermark, logo".length).toBeLessThanOrEqual(STUDIO_MAX_PROMPT_CHARS);
    expect(fit.negativePrompt).toBe("text, watermark, logo");
    const both = fitStudioPrompt("Words. ".repeat(400), "No text. ".repeat(200));
    expect(both.prompt.length + "\n\nAvoid: ".length + (both.negativePrompt?.length ?? 0)).toBeLessThanOrEqual(STUDIO_MAX_PROMPT_CHARS);
    expect(both.prompt.length).toBeGreaterThan(900);
    expect(fitStudioPrompt("fits", undefined)).toEqual({ prompt: "fits" });
  });

  it("studioShaped makes a studio request LOW at a radio's aspect, and leaves any other engine's request untouched", () => {
    const req = { prompt: "A poster.", negativePrompt: "text", aspect: "4:5" as const, count: 1, seed: 3 };
    expect(studioShaped({ ...req, prefer: "leonardo-studio" })).toEqual({ ...req, prefer: "leonardo-studio", aspect: "9:16", quality: "low" });
    const flare = { ...req, prefer: "leonardo-flare" as const };
    expect(studioShaped(flare)).toBe(flare);
  });
});

describe("the still engine and its lane", () => {
  it("the switch defaults to the studio and names one of three", () => {
    expect(replicaGenerator({})).toBe("leonardo-studio");
    expect(replicaGenerator({ SCOUT_REPLICA_GENERATOR: "leonardo-flare" })).toBe("leonardo-flare");
    expect(replicaGenerator({ SCOUT_REPLICA_GENERATOR: "comfy-flux2" })).toBe("comfy-flux2");
    expect(replicaGenerator({ SCOUT_REPLICA_GENERATOR: "nano-banana" })).toBe("leonardo-studio");
  });

  it("stillLane: the studio on box.chrome, local Flux on gpu.local, Flare on cloud.leonardo", () => {
    expect(stillLane("leonardo-studio")).toBe("box.chrome");
    expect(stillLane("comfy-flux2")).toBe("gpu.local");
    expect(stillLane("leonardo-flare")).toBe("cloud.leonardo");
  });

  it("an act reads the lane first: box.chrome is the studio, cloud.leonardo Flare, gpu.local the switch", () => {
    expect(generatorOnLane("box.chrome", { SCOUT_REPLICA_GENERATOR: "comfy-flux2" })).toBe("leonardo-studio");
    expect(generatorOnLane("cloud.leonardo", {})).toBe("leonardo-flare");
    expect(generatorOnLane("gpu.local", { SCOUT_REPLICA_GENERATOR: "comfy-flux2" })).toBe("comfy-flux2");
    expect(generatorOnLane("gpu.local", {})).toBe("leonardo-studio");
  });
});

describe("a still on the receipt, priced by its engine", () => {
  it("the studio is unpriced in studio credits (the idea artboard's shape), local Flux free, Flare at its fallback", () => {
    const studio = scoutStillOption("scout-asset", "concept still", "box.chrome", "leonardo-studio");
    expect(studio.ok && studio.value).toMatchObject({ lane: "box.chrome", provider: "leonardo-studio", usdPerUnit: null, unpricedReason: STUDIO_CREDIT });
    const flux = scoutStillOption("scout-asset", "concept still", "gpu.local", "comfy-flux2");
    expect(flux.ok && flux.value).toMatchObject({ lane: "gpu.local", provider: "comfy-flux2", usdPerUnit: 0, label: "concept still · local" });
    const flare = scoutStillOption("scout-scene", "replica still", "cloud.leonardo", "leonardo-flare");
    expect(flare.ok && flare.value).toMatchObject({ lane: "cloud.leonardo", provider: "leonardo-flare", model: "openai/gpt-image-2.5-flare", usdPerUnit: 0.01542 });
  });

  it("a studio still's step is credit-paid, so a USD ceiling admits it; any other unpriced step is not", () => {
    expect(studioCredit({ usd: null, unpricedReason: STUDIO_CREDIT })).toEqual({ credit: STUDIO_CREDIT });
    expect(studioCredit({ usd: null, unpricedReason: "a seat's turn" })).toEqual({});
    expect(studioCredit({ usd: 0.01 })).toEqual({});
    const studio = { seconds: 45, usd: null, unpricedReason: STUDIO_CREDIT };
    const scene = parseSceneRequest({ nightId: "2026-10-26", candidateId: "c-01", keyframes: ["sources/s-01/k-1.jpg"], replicas: 1, clip: false, estimates: { read: { seconds: 20, usd: 0.002 }, replica: studio, clip: { seconds: 1, usd: 0 } }, by: "op-1" });
    if (!scene.ok) throw scene.error;
    expect(scenePlan(scene.value, new Map()).find((s) => s.name === "replica:1")).toMatchObject({ credit: STUDIO_CREDIT });
    expect(scenePlan(scene.value, new Map()).find((s) => s.name === "read:1")?.credit).toBeUndefined();
    const asset = parseAssetRequest({ nightId: "2026-10-26", candidateId: "c-02", concepts: [{ design: "canonical", aspect: "1:1", prompt: "a crate" }], techniques: ["T1"], estimates: { concept: studio }, by: "op-1" });
    if (!asset.ok) throw asset.error;
    expect(assetPlan(asset.value, new Map())[0]).toMatchObject({ name: "concept:1", credit: STUDIO_CREDIT });
  });

  it("an asset launches on its engine's lane with the engine's price: the studio by default, Flux on the card, Flare on Leonardo's", async () => {
    const n = await createNight({ dry: true, day: "2026-10-26" });
    const b = parseBrief({ class: "prop", subject: "supply crate, banded planks", use: "a crate on the quay", serves: { newProject: "a harbour game" } });
    if (!b.ok) throw b.error;
    const c: Asset3dCandidate = { id: "c-01", kind: "asset3d", sourceIds: [], status: "pending", brief: b.value.brief, concepts: [] };
    await mutateNight(n.id, (x) => ({ ...x, candidates: [c] }));
    const OP: Actor = { kind: "operator", id: "op-1" };
    const t = { nightId: n.id, candidateId: "c-01" as const };
    const base = { mode: "dry" as const, ceilingUsd: 15, techniques: ["T1" as const], actor: OP, dryOnly: true };
    const seen: [string, string | undefined, number | null | undefined][] = [];
    for (const generator of [undefined, "comfy-flux2", "leonardo-flare"] as const) {
      const r = await launchAsset(k.store, t, { ...base, ...(generator === undefined ? {} : { generator }) });
      if (!r.ok || r.value.kind !== "receipt") throw new Error(`expected a receipt, got ${r.ok ? r.value.kind : r.error.message}`);
      const line = r.value.receipt.lines[0];
      seen.push([line?.lane ?? "", line?.provider, line?.usd]);
    }
    expect(seen).toEqual([
      ["box.chrome", "leonardo-studio", null],
      ["gpu.local", "comfy-flux2", 0],
      ["cloud.leonardo", "leonardo-flare", 0.02],
    ]);
    const r = await launchAsset(k.store, t, base);
    if (!r.ok || r.value.kind !== "receipt") throw new Error("expected a receipt");
    const l = await launchAsset(k.store, t, { ...base, token: r.value.receipt.token });
    expect(l.ok && l.value.kind).toBe("launched");
  });
});

describe("one studio tab at a time, across processes", () => {
  const timing = { staleMs: 5 * 60_000, waitMs: 200 };

  it("the lock file lives where LEONARDO_STUDIO_LOCK_DIR puts it, and is gone once the still is held", async () => {
    const file = studioLockPath();
    expect(file).toBe(path.join(ROOT, "lock", "leonardo-studio.lock"));
    const held = await withStudioLock(async () => existsSync(file));
    expect(held).toBe(true);
    expect(existsSync(file)).toBe(false);
  });

  it("is released when the still fails", async () => {
    const file = path.join(ROOT, "lock-fail", "leonardo-studio.lock");
    await expect(withStudioLock(async () => Promise.reject(new Error("render failed")), { file, timing })).rejects.toThrow("render failed");
    expect(existsSync(file)).toBe(false);
  });

  it("a live holder in another process makes a waiter fail unspent; a holder dead past five minutes is broken", async () => {
    const file = path.join(ROOT, "lock-other", "leonardo-studio.lock");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ pid: 999999, at: new Date().toISOString(), by: "another process" }));
    let ran = false;
    const busy = withStudioLock(async () => (ran = true), { file, timing });
    await expect(busy).rejects.toBeInstanceOf(StudioError);
    await expect(busy).rejects.toThrow(/leonardo studio is busy/);
    expect(ran).toBe(false);
    const old = new Date(Date.now() - 6 * 60_000);
    utimesSync(file, old, old);
    expect(await withStudioLock(async () => "drawn", { file, timing })).toBe("drawn");
    expect(existsSync(file)).toBe(false);
  });

  it("in-process callers queue: never two inside at once", async () => {
    const file = path.join(ROOT, "lock-queue", "leonardo-studio.lock");
    let inside = 0;
    let most = 0;
    const one = async () => {
      inside++;
      most = Math.max(most, inside);
      await new Promise((r) => setTimeout(r, 15));
      inside--;
    };
    await Promise.all([1, 2, 3].map(() => withStudioLock(one, { file, timing })));
    expect(most).toBe(1);
  });

  it("a held lock is touched while it is held, so a long generate is never read as dead", async () => {
    const file = path.join(ROOT, "lock-touch", "leonardo-studio.lock");
    const stat = process.getBuiltinModule("node:fs").statSync;
    const before = await withStudioLock(
      async () => {
        const old = new Date(Date.now() - 4 * 60_000);
        utimesSync(file, old, old);
        const t0 = stat(file).mtimeMs;
        await new Promise((r) => setTimeout(r, 60));
        return [t0, stat(file).mtimeMs] as const;
      },
      { file, timing, touchMs: 20 },
    );
    expect(before[1]).toBeGreaterThan(before[0]);
  });
});

describe("the doctor's two Leonardo pools", () => {
  it("the API pool is apiSubscriptionTokens + apiPaidTokens alone; without them, the old sum with a note", () => {
    expect(leonardoApiPool({ subscriptionTokens: 9500, paidTokens: 30, apiSubscriptionTokens: 0, apiPaidTokens: 0 })).toEqual({ tokens: 0, basis: "api" });
    expect(leonardoApiPool({ subscriptionTokens: 120, apiPaidTokens: 30 })).toEqual({ tokens: 30, basis: "api" });
    const sum = leonardoApiPool({ subscriptionTokens: 120, paidTokens: 30 });
    expect(sum).toMatchObject({ tokens: 150, basis: "sum" });
    expect(apiPoolWords(sum)).toMatch(/^accepted · 150 credits \(no apiSubscriptionTokens\/apiPaidTokens .* may include the studio's web pool\)$/);
    expect(apiPoolWords(leonardoApiPool({ email: "x" }))).toBe("accepted · no token field on the account answer");
  });

  it("the key probe reads the API pool, and a refusal quotes the vendor with the key redacted", async () => {
    const secret = "leo-secret-key";
    const me = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ user_details: [{ subscriptionTokens: 9530, apiSubscriptionTokens: 0, apiPaidTokens: 25 }] }) });
    expect(await probeLeonardoApiPool(secret, me)).toEqual({ ok: true, found: "accepted · API pool 25 credits" });
    const refused = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: `bad key ${secret}` }) });
    expect(await probeLeonardoApiPool(secret, refused)).toEqual({ ok: false, found: "401: bad key [redacted]" });
  });

  it("the studio balance is read by the recon it is handed, never on a dry night, never with the fake driver", async () => {
    const env = { LEONARDO_STUDIO_CDP: "http://127.0.0.1:9333" };
    let reads = 0;
    const recon = async () => (reads++, { signedIn: true, balance: 4200 });
    expect(await studioBalanceCheck({ env, dry: false, recon })).toEqual({ name: "studio balance", ok: true, found: "4200 studio credits (a still at Low is 8)", needed: false });
    expect(await studioBalanceCheck({ env, dry: true, recon })).toMatchObject({ ok: true, found: "not read on a dry night (a read opens a studio tab)" });
    expect(await studioBalanceCheck({ env: { ...env, LEONARDO_STUDIO_DRIVER: "fake" }, dry: false, recon })).toMatchObject({ ok: true, needed: false });
    expect(await studioBalanceCheck({ env: {}, dry: false, recon })).toMatchObject({ ok: false, found: "LEONARDO_STUDIO_CDP is unset", needed: false });
    expect(reads).toBe(1);
    expect(await studioBalanceCheck({ env, dry: false, recon: async () => ({ signedIn: true, balance: 0 }) })).toMatchObject({ ok: false, found: "0 studio credits (a still at Low is 8)" });
    expect(await studioBalanceCheck({ env, dry: false, recon: async () => ({ signedIn: false }) })).toMatchObject({ ok: false, found: "not signed in to leonardo" });
    expect(await studioBalanceCheck({ env, dry: false, recon: async () => Promise.reject(new Error("leonardo studio browser not running\nstack")) })).toMatchObject({
      ok: false,
      found: "the studio could not be read: leonardo studio browser not running",
    });
  });
});
