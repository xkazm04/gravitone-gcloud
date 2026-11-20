import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KnowhowCharacter, KnowhowLaneRecord, KnowhowProduction, MediaRef } from "@gt/domain/knowhow";
import { knowhowPaths } from "@gt/domain/knowhow";

vi.mock("server-only", () => ({}));

const { importKnowhow, indexPath } = await import("../../lib/knowhow/import.ts");
const { mirrorPath, readMirror, writeMirror } = await import("../../lib/knowhow/mirror.ts");
const { readRedrawQueue, redraw, redrawQueuePath } = await import("../../lib/knowhow/redraw.ts");
const { fileOf } = await import("../../lib/knowhow/write.ts");
const { acceptSwap, getProduction, previewSwap, setClipMedia, setVerdict } = await import("../../lib/production/ops.ts");
const { listCores, productionIds, statePath } = await import("../../lib/production/state.ts");
const { keyframes, style } = await import("../../lib/production/draw.ts");
const { eye } = await import("../../lib/production/eye.ts");

// The know-how import (spark device-metadata-sync, KS2) over temp roots: a knowhow folder another device pushed, this
// device's production root and local side. No store is opened (the kernel's half is a recording stand-in), nothing is drawn.

const SELF = { id: "dev:self", name: "here" };
const OTHER = "dev:other";
const ENV = ["KNOWHOW_ROOT", "KNOWHOW_LOCAL_DIR", "PRODUCTION_FIXTURE_DIR", "GRAVITONE_STORE_PATH", "GRAVITONE_DEVICE_FILE"] as const;
let dir = "";
const was: Partial<Record<(typeof ENV)[number], string>> = {};

const put = (file: string, value: unknown): void => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : `${JSON.stringify(value, null, 1)}\n`);
};
const know = (contractPath: string, value: unknown): void => put(fileOf(contractPath), value);

const character = (key: string, over: Partial<KnowhowCharacter> = {}): KnowhowCharacter => ({
  v: 1,
  id: `chr:${key}`,
  owner: OTHER,
  at: "2026-11-20T10:00:00.000Z",
  card: { name: key, look: "short dark hair, green coat", personality: "dry, quick" },
  identity: `${key}, 30: short dark hair, green coat.`,
  looks: { "ink-wash": { portraitPrompt: `${key}, 30: short dark hair, green coat. Image 1 is her portrait: take only who she is. Redraw her in ink wash.`, sheetPrompt: "Her sheet in ink wash." } },
  visuals: {},
  ...over,
});

const lane: KnowhowLaneRecord = { v: 1, id: "music-clip:lesson:0123456789ab", lane: "music-clip", kind: "lesson", text: "Plates before keyframes.", owner: OTHER, at: "2026-11-19T00:00:00.000Z" };

const production = (id: string, owner: string): KnowhowProduction => ({
  v: 1,
  id,
  owner,
  at: "2026-11-20T09:00:00.000Z",
  title: "Night Drive",
  look: "ink wash",
  cast: "chr:sofia",
  nodes: [
    { id: "track", station: "track", label: "Night Drive", state: "made", madeFrom: [] },
    { id: "cast", station: "cast", label: "Sofia", state: "made", madeFrom: [] },
    { id: "kf:K00", station: "keyframe", label: "K00", state: "made", madeFrom: ["cast"], prompt: "She waits at the light.", at: 0, dur: 4, media: { kind: "image", hash: "ab", at: "production-fixture/night-drive/K00.png" } },
    { id: "clip:K00", station: "clip", label: "K00", state: "made", madeFrom: ["kf:K00"], at: 0, dur: 4, verdict: { verdict: "keep", reasons: ["face holds"] } },
  ],
});

/** No other device's bytes are on this disk unless the hash says `here`. */
const localFileOf = (ref: MediaRef): string | null => (ref.hash === "here" ? path.join(dir, "here.png") : null);
const run = (o: { kernel?: (c: KnowhowCharacter) => "added" | "updated" | "unchanged" | "skipped"; dry?: boolean } = {}) => importKnowhow({ self: SELF, localFileOf, ...o });

const snapshot = (): string[] => [mirrorPath(), indexPath(), redrawQueuePath(), statePath("night-drive")].map((f) => (existsSync(f) ? readFileSync(f, "utf8") : "-"));

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "knowhow-import-"));
  for (const k of ENV) was[k] = process.env[k];
  process.env["KNOWHOW_ROOT"] = path.join(dir, "knowhow");
  process.env["KNOWHOW_LOCAL_DIR"] = path.join(dir, "local");
  process.env["PRODUCTION_FIXTURE_DIR"] = path.join(dir, "production");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store.sqlite");
  process.env["GRAVITONE_DEVICE_FILE"] = path.join(dir, "device.json");
  put(path.join(dir, "production", "cores", "sofia", "portrait.jpg"), "x");
  put(path.join(dir, "production", "cores", "sofia", "sheet.jpg"), "x");
});

afterEach(() => {
  for (const k of ENV) {
    if (was[k] === undefined) delete process.env[k];
    else process.env[k] = was[k];
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("know-how import", () => {
  it("is idempotent: a second run over the same folder changes nothing", () => {
    know(knowhowPaths.character("mara"), character("mara"));
    know(knowhowPaths.lane(lane.lane, lane.id), lane);
    know(knowhowPaths.production("night-drive"), production("night-drive", OTHER));
    const first = run();
    expect(first).toMatchObject({ created: 3, updated: 0, conflicts: 0, problems: [] });
    const before = snapshot();
    const second = run();
    expect(second).toMatchObject({ created: 0, updated: 0, conflicts: 0, skipped: 3 });
    expect(snapshot()).toEqual(before);
    const index = JSON.parse(readFileSync(indexPath(), "utf8")) as { lanes: Record<string, Record<string, unknown>> };
    expect(Object.keys(index.lanes["music-clip"] ?? {})).toEqual([lane.id]);
  });

  it("hands a kernel id to the kernel's half, and a key id to the production only", () => {
    const seen: string[] = [];
    know(knowhowPaths.character("01JD0000000000000000000000"), character("x", { id: "chr:01JD0000000000000000000000" }));
    know(knowhowPaths.character("mara"), character("mara"));
    run({ kernel: (c) => (seen.push(c.id), "added") });
    expect(seen.sort()).toEqual(["chr:01JD0000000000000000000000", "chr:mara"]);
    expect(Object.keys(readMirror()).sort()).toEqual(["chr:01JD0000000000000000000000", "chr:mara"]);
  });

  it("holds another device's production read-only: every change refuses with one sentence", async () => {
    know(knowhowPaths.production("night-drive"), production("night-drive", OTHER));
    run();
    const p = getProduction("night-drive");
    expect(p.ok && p.value.title).toBe("Night Drive");
    expect(productionIds()).toEqual({ ok: true, value: ["unlatched", "night-drive"] });
    const sentence = "Night Drive belongs to device other: lessons only here";
    const refused = (r: { ok: boolean; error?: { message: string } }): void => {
      expect(r.ok).toBe(false);
      expect(r.error?.message).toBe(sentence);
    };
    put(path.join(dir, "production", "takes", "K00.mp4"), "mp4");
    const noDraw = async (): Promise<boolean> => {
      throw new Error("drew on a read-only production");
    };
    refused(previewSwap({ production: "night-drive", core: "unlatched-lead" }) as never);
    refused(acceptSwap({ production: "night-drive", core: "unlatched-lead" }) as never);
    refused(setVerdict({ production: "night-drive", node: "clip:K00", verdict: "reject", reasons: [] }) as never);
    refused(setClipMedia({ production: "night-drive", node: "clip:K00", run: "takes", path: "K00.mp4" }) as never);
    refused((await style("night-drive", "sofia", noDraw)) as never);
    refused((await keyframes("night-drive", { all: true }, noDraw)) as never);
    refused((await eye("night-drive", {}, async () => ({ ok: true as const, reply: "{}" }))) as never);
    const held = JSON.parse(readFileSync(statePath("night-drive"), "utf8")) as Record<string, unknown>;
    expect(held).toMatchObject({ readOnly: true, owner: OTHER, ownerName: "device other" });
  });

  it("never overwrites a production owned here, nor a local file with no owner", () => {
    know(knowhowPaths.production("mine"), production("mine", SELF.id));
    know(knowhowPaths.production("local-one"), production("local-one", OTHER));
    put(statePath("local-one"), "{\"production\": \"this device's own\"}\n");
    const s = run();
    expect(s.created).toBe(0);
    expect(existsSync(statePath("mine"))).toBe(false);
    expect(readFileSync(statePath("local-one"), "utf8")).toBe("{\"production\": \"this device's own\"}\n");
    expect(s.problems).toEqual(["Night Drive is held here as this device's own: not overwritten by dev:other's copy"]);
  });

  it("writes the loser to knowhow/conflicts/ when both sides changed, and the newer `at` wins", () => {
    know(knowhowPaths.character("mara"), character("mara"));
    run();
    const m = readMirror();
    const local = m["chr:mara"]?.record as KnowhowCharacter;
    writeMirror({ ...m, "chr:mara": { record: { ...local, owner: SELF.id, at: "2026-11-20T11:00:00.000Z", card: { ...local.card, look: "short dark hair, red coat" } } } });
    know(knowhowPaths.character("mara"), character("mara", { at: "2026-11-20T12:00:00.000Z", card: { name: "mara", look: "long dark hair, green coat", personality: "dry, quick" } }));
    const s = run();
    expect(s.conflicts).toBe(1);
    expect(readMirror()["chr:mara"]?.record.card.look).toBe("long dark hair, green coat");
    const kept = fileOf(knowhowPaths.conflict("chr:mara", SELF.id, "2026-11-20T11:00:00.000Z"));
    expect((JSON.parse(readFileSync(kept, "utf8")) as KnowhowCharacter).card.look).toBe("short dark hair, red coat");
    expect(run()).toMatchObject({ conflicts: 0, updated: 0 });
  });

  it("plans a redraw for exactly the characters with no picture here, and the redraw makes them this device's", async () => {
    know(knowhowPaths.character("mara"), character("mara"));
    know(knowhowPaths.character("ines"), character("ines", { visuals: { [SELF.id]: [{ kind: "portrait", media: { kind: "image", hash: "h", at: "production-fixture/cores/ines/portrait.png" } }] } }));
    know(knowhowPaths.character("lea"), character("lea", { visuals: { [OTHER]: [{ kind: "portrait", media: { kind: "image", hash: "here", at: "production-fixture/cores/lea/portrait.png" } }] } }));
    know(knowhowPaths.character("noor"), character("noor", { visuals: { [OTHER]: [{ kind: "portrait", media: { kind: "image", hash: "gone", at: "production-fixture/cores/noor/portrait.png" } }] } }));
    expect(run({ dry: true }).redraw).toBe(2);
    expect(existsSync(redrawQueuePath())).toBe(false);
    expect(run().redraw).toBe(2);
    expect(readRedrawQueue().map((i) => i.id)).toEqual(["chr:mara", "chr:noor"]);
    const mara = readRedrawQueue()[0];
    expect(mara?.portraitPrompt.startsWith("mara, 30:")).toBe(true);
    expect(mara?.portraitPrompt).not.toContain("Image 1");

    const calls: string[] = [];
    const done = await redraw(SELF.id, async (d, name, _prompt, refs) => {
      calls.push(`${path.basename(path.dirname(d))}/${name}:${refs.length}`);
      mkdirSync(d, { recursive: true });
      writeFileSync(path.join(d, `${name}.png`), `png ${name}`);
      return true;
    });
    expect(done.every((d) => d.ok)).toBe(true);
    expect(calls.sort()).toEqual(["mara/portrait:0", "mara/sheet:1", "noor/portrait:0", "noor/sheet:1"]);
    expect(readRedrawQueue()).toEqual([]);
    const visuals = readMirror()["chr:mara"]?.record.visuals[SELF.id] ?? [];
    expect(visuals.map((v) => v.kind)).toEqual(["portrait", "sheet"]);
    expect(visuals[0]?.media.at).toBe("production-fixture/cores/mara/redrawn/portrait.png");
    const cores = listCores();
    expect(cores.ok && cores.value.some((c) => c.id === "chr:mara" && c.origin === "knowhow")).toBe(true);
    expect(run().redraw).toBe(0); // her own pictures survive the next pull
  });
});

describe("the kernel's half", () => {
  it("adopts a character by the id she was born with: added, then unchanged, then her card updated", async () => {
    const { openKernel } = await import("../../packages/kernel/src/kernel.ts");
    const { adoptCharacterIn, readCharacter } = await import("../../packages/kernel/src/characters/store.ts");
    const k = openKernel(":memory:");
    if (!k.ok) throw k.error;
    const id = "chr:01JD0000000000000000000000";
    const actor = { kind: "machine" as const, id: "knowhow-import" };
    const adopt = (look: string) => k.value.store.tx((t) => adoptCharacterIn(t, { id, card: { name: "Mara", look, personality: "dry" }, origin: "scout-character" }, actor));
    expect(adopt("green coat")).toMatchObject({ ok: true, value: { did: "added", id } });
    expect(adopt("green coat")).toMatchObject({ ok: true, value: { did: "unchanged" } });
    expect(adopt("red coat")).toMatchObject({ ok: true, value: { did: "updated" } });
    const held = k.value.store.read((r) => readCharacter(r, id));
    expect(held.ok && held.value?.card.look).toBe("red coat");
    k.value.close();
  });
});
