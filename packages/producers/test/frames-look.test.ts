import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { PRESETS } from "@gt/catalog/presets";
import type { Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { blockDigest } from "@gt/domain/style.ratchet";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { draftFromV1Theme, importV1ThemeIn } from "@gt/kernel/styles/v1theme";

import { DEFAULT_LOOK_PRESET, lookOf, lookWords, projectLookIn } from "../src/frames/look.ts";

// THE PROJECT'S LOOK (Phase 5, L56): which style a frames job draws in, read from the Style store
// by the project's own binding, and which approved proofs ride along as references. The store is
// seeded the way the importer seeds it (`importV1ThemeIn`), under the `v1-theme:<id>` an imported
// project already names.

const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};
const OP: Actor = { kind: "operator", id: "op" };
const tmp = mkdtempSync(path.join(tmpdir(), "gt-look-"));
const open: Kernel[] = [];
afterAll(() => {
  for (const k of open) k.close();
  rmSync(tmp, { recursive: true, force: true });
});
let n = 0;
function kernel(): Kernel {
  const k = must(openKernel(path.join(tmp, `k-${++n}.sqlite`)));
  open.push(k);
  return k;
}

const BLOCK = PRESETS[1]?.block ?? DEFAULT_LOOK_PRESET.block;
const DIGEST = blockDigest(BLOCK);
const SHA = (i: number) => i.toString(16).padStart(64, "0");
const ms = (day: number) => Date.parse(`2026-09-${String(day).padStart(2, "0")}T10:00:00.000Z`);

/** A v1 theme: six approvals on the current block (days 1-6), one pending, one rejected, and one
 *  approval under an EARLIER block (day 7, the newest of all) that must never travel. */
function theme(over: Record<string, unknown> = {}) {
  const trial = ["peak-and-fall", "wish-list", "booking-not-meal", "flywheel", "the-exit", "peak-and-fall"];
  const approved = trial.map((t, i) => ({ id: `a${i + 1}`, label: `approval ${i + 1}`, state: "approved", trialId: t, blockDigest: DIGEST, createdAt: ms(i + 1) }));
  return {
    id: "th-ink",
    name: "Ink Harbor",
    origin: "preset",
    presetId: PRESETS[1]?.id ?? "x",
    block: BLOCK,
    elements: [],
    createdAt: ms(1),
    updatedAt: ms(9),
    proofs: [
      ...approved,
      { id: "p1", label: "pending", state: "pending", trialId: "flywheel", blockDigest: DIGEST, createdAt: ms(8) },
      { id: "r1", label: "rejected", state: "rejected", trialId: "the-exit", blockDigest: DIGEST, createdAt: ms(9) },
      { id: "old", label: "earlier block", state: "approved", trialId: "wish-list", blockDigest: "0badc0de", createdAt: ms(10) },
    ],
    ...over,
  };
}

const media = (id: string) => ({ sha256: SHA(id.charCodeAt(0) * 100 + Number(id.slice(1).replace(/\D/g, "") || 0)), bytes: 100, mime: "image/png" });

function seeded(over: Record<string, unknown> = {}): Kernel {
  const k = kernel();
  const d = must(draftFromV1Theme(theme(over), media));
  must(k.store.tx((t) => importV1ThemeIn(t, d, OP)));
  return k;
}

describe("a locked style", () => {
  const k = seeded({ lockedAt: ms(11) });
  const look = must(k.store.read((r) => projectLookIn(r, "v1-theme:th-ink")));

  it("draws in its own (frozen) block, under its own name", () => {
    expect(look.style).toEqual({ id: "v1-theme:th-ink", name: "Ink Harbor", status: "locked" });
    expect(look.block).toEqual(BLOCK);
    expect(look.digest).toBe(DIGEST);
    expect(look.miss).toBeUndefined();
  });

  it("sends the two founding approvals pinned, then the newest - four, never a pending, rejected or earlier-block proof", () => {
    expect(look.refs.map((r) => r.sha256)).toEqual(["a1", "a2", "a6", "a5"].map((id) => media(id).sha256));
    const sent = new Set(look.refs.map((r) => r.sha256));
    for (const id of ["p1", "r1", "old"]) expect(sent.has(media(id).sha256)).toBe(false);
  });

  it("is named on the receipt with its reference count, and no 'not locked'", () => {
    expect(lookWords(look)).toBe("style Ink Harbor · 4 refs");
  });
});

describe("the binding's misses are named, and the default is drawn only on one", () => {
  it("no style bound: the named default, `unset`", () => {
    const look = lookOf(undefined, undefined);
    expect(look).toMatchObject({ name: DEFAULT_LOOK_PRESET.name, block: DEFAULT_LOOK_PRESET.block, refs: [], miss: "unset" });
    expect(lookWords(look)).toBe(`default style ${DEFAULT_LOOK_PRESET.name} · the project has no style of its own`);
  });

  it("a binding the store does not hold: `missing`, never another style standing in", () => {
    const k = seeded();
    const look = must(k.store.read((r) => projectLookIn(r, "v1-theme:th-gone")));
    expect(look).toMatchObject({ name: DEFAULT_LOOK_PRESET.name, miss: "missing", refs: [] });
    expect(look.style).toBeUndefined();
  });

  it("a style with no block: the style is named as the one chosen, the default drawn, `no-block`", () => {
    const look = lookOf("painted-3d", { id: "painted-3d", name: "Painted 3D", status: "proven", proofs: [] });
    expect(look).toMatchObject({ name: DEFAULT_LOOK_PRESET.name, miss: "no-block", style: { id: "painted-3d", status: "proven" } });
    expect(lookWords(look)).toContain("its style has no block yet");
  });

  it("a style with a block that is not locked yet is drawn in, and the receipt says so", () => {
    const k = seeded();
    const look = must(k.store.read((r) => projectLookIn(r, "v1-theme:th-ink")));
    expect(look.block).toEqual(BLOCK);
    expect(look.style?.status).not.toBe("locked");
    expect(lookWords(look)).toMatch(/^style Ink Harbor · 4 refs · (candidate|proven), not locked$/);
  });
});
