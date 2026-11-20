import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { knowhowPaths, type KnowhowCharacter, type MediaRef } from "@gt/domain/knowhow";
import type { Production, ProductionNode } from "@gt/domain/productionGraph";

vi.mock("server-only", () => ({}));

const { fixtureProductions } = await import("../../app/(studio)/scout/canvas/_port/fixtureProduction.ts");
const { NodeOverlay } = await import("../../app/(studio)/scout/canvas/_canvas/production/NodeOverlay.tsx");
const { devicesLine } = await import("../../app/(studio)/scout/canvas/_canvas/production/CorePicker.tsx");
const { importKnowhow } = await import("../../lib/knowhow/import.ts");
const { redraw } = await import("../../lib/knowhow/redraw.ts");
const { fileOf } = await import("../../lib/knowhow/write.ts");
const { getProduction } = await import("../../lib/production/ops.ts");
const { listCores } = await import("../../lib/production/state.ts");

// Another device's productions read-only on the scout canvas (spark device-metadata-sync KS3), over temp roots: the
// fixture side's foreign copy of Unlatched (owner studio-pc), its port refusing every write with the state's sentence,
// its media "on studio-pc", the take overlay with the owner's verdict as text and nothing to judge with, and a core
// with every device's pictures. Nothing is drawn, no store is opened, the repo's knowhow/ is never read.

const ENV = ["KNOWHOW_ROOT", "KNOWHOW_LOCAL_DIR", "PRODUCTION_FIXTURE_DIR", "GRAVITONE_STORE_PATH", "GRAVITONE_DEVICE_FILE"] as const;
const SELF = { id: "dev:00000000-0000-4000-8000-000000000001", name: "here" };
const OTHER = "dev:fixture-other";
const FOREIGN = "unlatched-studio-pc";
const SENTENCE = "Leave the Door Unlatched belongs to studio-pc: lessons only here";
let dir = "";
const was: Partial<Record<(typeof ENV)[number], string>> = {};

const put = (file: string, value: unknown): void => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : `${JSON.stringify(value, null, 1)}\n`);
};

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "knowhow-canvas-"));
  for (const k of ENV) was[k] = process.env[k];
  process.env["KNOWHOW_ROOT"] = path.join(dir, "knowhow");
  process.env["KNOWHOW_LOCAL_DIR"] = path.join(dir, "local");
  process.env["PRODUCTION_FIXTURE_DIR"] = path.join(dir, "production");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store.sqlite");
  process.env["GRAVITONE_DEVICE_FILE"] = path.join(dir, "device.json");
  put(path.join(dir, "device.json"), SELF);
});

afterEach(() => {
  for (const k of ENV) {
    if (was[k] === undefined) delete process.env[k];
    else process.env[k] = was[k];
  }
  rmSync(dir, { recursive: true, force: true });
});

async function foreign(): Promise<Production> {
  const all = await fixtureProductions.productions();
  if (!all.ok) throw new Error(all.error.message);
  const p = all.value.productions.find((x) => x.id === FOREIGN);
  if (p === undefined) throw new Error("no foreign production listed");
  return p;
}

/** The pressable toggles that are not a node's tile: keep, reject and the reasons. */
const toggles = (html: string): string[] => [...html.matchAll(/<button[^>]*aria-pressed[^>]*>/g)].map((m) => m[0]).filter((b) => !b.includes("data-node="));

const node = (p: Production, id: string): ProductionNode => {
  const n = p.nodes.find((m) => m.id === id);
  if (n === undefined) throw new Error(`no ${id}`);
  return n;
};

describe("another device's production on the fixture side", () => {
  it("is listed after this device's, read-only, with its owner, and its media is on the owner", async () => {
    const all = await fixtureProductions.productions();
    expect(all.ok && all.value.productions.map((p) => p.id)).toEqual(["unlatched", FOREIGN]);
    const p = await foreign();
    expect(p).toMatchObject({ readOnly: true, owner: OTHER, ownerName: "studio-pc" });
    expect(node(p, "clip:K01")).toMatchObject({ remote: "video", verdict: { verdict: "reject", reasons: ["craft", "style"] } });
    expect(node(p, "clip:K01").media).toBeUndefined();
    expect(p.nodes.filter((n) => n.media !== undefined)).toEqual([]);
    const own = all.ok ? all.value.productions[0] : undefined;
    expect(own?.readOnly).toBeUndefined();
    expect(own?.nodes.some((n) => n.remote !== undefined)).toBe(false);
  });

  it("refuses every write through the port with the state's own sentence", async () => {
    const answers = [
      await fixtureProductions.productionVerdict({ production: FOREIGN, node: "clip:K02", verdict: "reject", reasons: ["craft"] }),
      await fixtureProductions.swapPreview({ production: FOREIGN, core: "chr:n01-elif" }),
      await fixtureProductions.swapAccept({ production: FOREIGN, core: "chr:n01-elif" }),
    ];
    for (const r of answers) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toBe(SENTENCE);
    }
    expect(node(await foreign(), "clip:K02").verdict).toEqual({ verdict: "keep", reasons: [], note: "the rug side-step lands on the bar" });
  });

  it("a take's overlay reads the owner's verdict as text: no keep, no reject, no direction field", async () => {
    const p = await foreign();
    const html = renderToStaticMarkup(h(NodeOverlay, { st: {} as never, p, n: node(p, "clip:K01"), onGo: () => undefined, onClose: () => undefined }));
    expect(html).toContain('data-role="clip-verdict-read"');
    expect(html).toContain("her face goes soft in the turn");
    expect(html).toMatch(/>reject</);
    expect(html).toContain('aria-label="on studio-pc"');
    expect(html).not.toContain('data-role="clip-verdict"');
    expect(html).not.toMatch(/<textarea|<input/);
    expect(toggles(html)).toEqual([]);
    expect(html).not.toContain("<video");
  });

  it("this device's own take still opens with the verdict controls", async () => {
    const all = await fixtureProductions.productions();
    const own = all.ok ? all.value.productions[0] : undefined;
    if (own === undefined) throw new Error("no own production");
    const html = renderToStaticMarkup(h(NodeOverlay, { st: {} as never, p: own, n: node(own, "clip:K00"), onGo: () => undefined, onClose: () => undefined }));
    expect(html).toContain('data-role="clip-verdict"');
    expect(html).not.toContain('data-role="clip-verdict-read"');
    expect(toggles(html).length).toBeGreaterThan(0);
  });

  it("a core studio-pc also holds pictures of says two devices", async () => {
    const c = await fixtureProductions.cores();
    if (!c.ok) throw new Error(c.error.message);
    const hana = c.value.cores.find((x) => x.id === "chr:hana");
    expect(hana?.devices).toBe(2);
    expect(devicesLine(hana as NonNullable<typeof hana>)).toEqual(["2 devices"]);
    expect(c.value.cores.find((x) => x.id === "chr:sofia")?.devices).toBeUndefined();
  });
});

describe("a production and a character the know-how import brought", () => {
  const ref = (at: string): MediaRef => ({ kind: "image", hash: "f".repeat(64), at });
  const rin: KnowhowCharacter = {
    v: 1,
    id: "chr:rin",
    owner: OTHER,
    at: "2026-11-19T21:00:00.000Z",
    card: { name: "Rin", look: "a cropped grey coat" },
    identity: "Rin, aged 34: a cropped grey coat.",
    looks: {},
    visuals: { [OTHER]: [{ kind: "portrait", media: ref("production-fixture/cores/rin/portrait.png") }] },
  };

  it("marks the media this device lacks remote, and a character redrawn here as this device's own redraw", async () => {
    put(
      fileOf(knowhowPaths.production("night-drive")),
      {
        v: 1,
        id: "night-drive",
        owner: OTHER,
        ownerName: "studio-pc",
        at: "2026-11-20T09:00:00.000Z",
        title: "Night Drive",
        look: "ink wash",
        cast: "chr:sofia",
        nodes: [
          { id: "track", station: "track", label: "Night Drive", state: "made", madeFrom: [] },
          { id: "cast", station: "cast", label: "Sofia", state: "made", madeFrom: [] },
          { id: "kf:K00", station: "keyframe", label: "K00", state: "made", madeFrom: ["cast"], at: 0, media: ref("production-fixture/night-drive/K00.png") },
        ],
      },
    );
    put(fileOf(knowhowPaths.character("rin")), rin);
    const done = importKnowhow({ self: SELF, localFileOf: () => null });
    expect(done.problems).toEqual([]);
    const p = getProduction("night-drive");
    if (!p.ok) throw new Error(p.error.message);
    expect(p.value).toMatchObject({ readOnly: true, ownerName: "studio-pc" });
    expect(node(p.value, "kf:K00")).toMatchObject({ remote: "image" });

    const drawn = await redraw(SELF.id, async (to, name) => {
      put(path.join(to, `${name}.png`), name);
      return true;
    });
    expect(drawn.every((d) => d.ok)).toBe(true);
    const cores = listCores();
    if (!cores.ok) throw new Error(cores.error.message);
    const core = cores.value.find((c) => c.id === "chr:rin");
    expect(core).toMatchObject({ redrawnHere: true, devices: 2 });
    expect(devicesLine(core as NonNullable<typeof core>)).toEqual(["2 devices", "redrawn here"]);
  });
});
