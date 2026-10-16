import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { err, ok, type Result } from "@gt/domain/errors";
import type { LibraryItem } from "@gt/domain/libraryItem";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { libraryDetail } from "@gt/kernel/library/detail";
import { readPartIn } from "@gt/kernel/parts/driver";
import { loadProject } from "@gt/kernel/records/schema";
import type { Store } from "@gt/kernel/store";
import { readStyle } from "@gt/kernel/styles/driver";
import { importV1ThemeIn } from "@gt/kernel/styles/v1theme";

import { readArchive, type Archive } from "../../lib/import/archive.ts";
import { commitImport, type Committed } from "../../lib/import/commit.ts";
import { kernelIdOf, planImport } from "../../lib/import/project.ts";
import { themeName, v1AssetItemId, type PublicFile } from "../../lib/import/shelf.ts";
import { THEMES_STORE } from "../../lib/studioDb.ts";
import { BLOCK, SHELF, T0, clearV1, pngB64, putRows, seedV1, v1Archive } from "./import-harness.ts";

// THE SHELF, IMPORTED (Phase 5 wave B, L55): every v1 theme of the account lands as a Style and
// every shelf asset as a Library item, from the same archive and on the same token as its
// projects; what the store will not take is refused by name, and a re-import changes nothing.
// v1's IndexedDB theme/asset stores retire in this phase - this import is their last reader.

const dirs: string[] = [];
let open: Kernel[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
afterEach(() => {
  for (const k of open) k.close();
  open = [];
});
beforeEach(async () => {
  await clearV1();
});

const OP = { kind: "operator", id: "op" } as const;
const TRIAL_BYTES = new Uint8Array([255, 216, 255, 224, 1, 2, 3]);
/** The studio's served files, as a test pins them: only the trial plate the seed points at. */
const pub: PublicFile = (src) => (src === SHELF.trialSrc ? { bytes: TRIAL_BYTES, mime: "image/jpeg" } : null);

function universe(): { store: Store; blobs: BlobStore } {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-import-shelf-"));
  dirs.push(dir);
  const k = openKernel(path.join(dir, "k.sqlite"));
  if (!k.ok) throw k.error;
  open.push(k.value);
  return { store: k.value.store, blobs: blobStore(path.join(dir, "blobs")) };
}

function read(bytes: Uint8Array): Archive {
  const a = readArchive(bytes);
  if (!a.ok) throw a.error;
  return a.value;
}

async function importInto(u: { store: Store; blobs: BlobStore }, archive: Archive, afterStyles?: () => Result<unknown>): Promise<Extract<Committed, { kind: "done" }>> {
  const plan = u.store.read((r) => planImport(r, archive, pub));
  if (!plan.ok) throw plan.error;
  const done = await commitImport({ ...u, actor: OP, publicFile: pub, ...(afterStyles === undefined ? {} : { afterStyles }) }, archive, plan.value.token);
  if (!done.ok) throw done.error;
  if (done.value.kind !== "done") throw new Error("stale");
  return done.value;
}

const style = (store: Store, v1Id: string) => {
  const r = readStyle(store, `v1-theme:${v1Id}`);
  if (!r.ok) throw r.error;
  return r.value.style;
};
const item = (store: Store, v1Id: string): LibraryItem => {
  const d = libraryDetail(store, v1AssetItemId(v1Id));
  if (!d.ok) throw d.error;
  return d.value.item;
};

describe("the preview", () => {
  it("stages every theme and shelf asset with its outcome, and writes nothing", async () => {
    const seed = await seedV1("uid-a");
    const u = universe();
    const archive = read(await v1Archive(seed.uid));
    const p = u.store.read((r) => planImport(r, archive, pub));
    if (!p.ok) throw p.error;
    expect(Object.fromEntries(p.value.themes.map((t) => [t.preview.v1Id, [t.preview.outcome, t.preview.name, t.preview.named, t.preview.locked]]))).toEqual({
      [seed.theme.id]: ["import", "Ledger ink", false, false],
      [SHELF.locked]: ["import", "Signal ledger", false, true],
      [SHELF.unnamed]: ["import", "Blueprint", true, false],
      [SHELF.untitled]: ["import", "Brief style 2026-08-20", true, false],
    });
    expect(Object.fromEntries(p.value.items.map((i) => [i.preview.v1Id, i.preview.outcome]))).toEqual({
      [seed.takeId]: "import",
      [SHELF.proofAsset]: "import",
      [SHELF.upload]: "import",
      [SHELF.trial]: "import",
      [SHELF.audio]: "refuse",
    });
    expect(p.value.items.find((i) => i.preview.v1Id === SHELF.audio)?.preview.reason).toBe("it carries no bytes; the sound store holds v1's takes");
    expect(u.store.read((r) => [r.get("SELECT count(*) AS n FROM styles")?.["n"], r.get("SELECT count(*) AS n FROM library_docs")?.["n"]])).toEqual(ok([0, 0]));
  });

  it("binds the shelf into the token: a style the store took since the preview makes the confirm stale", async () => {
    const seed = await seedV1("uid-a");
    const u = universe();
    const archive = read(await v1Archive(seed.uid));
    const before = u.store.read((r) => planImport(r, archive, pub));
    if (!before.ok) throw before.error;
    // The same archive, the same projects: only the store moved under one theme.
    const ink = before.value.themes.find((t) => t.preview.v1Id === seed.theme.id)?.draft;
    if (ink === undefined) throw new Error("the film's theme did not stage");
    expect(u.store.tx((t) => importV1ThemeIn(t, ink, OP))).toEqual(ok("created"));
    const r = await commitImport({ ...u, actor: OP, publicFile: pub }, archive, before.value.token);
    expect(r.ok && r.value.kind).toBe("stale");
    expect(r.ok && r.value.kind === "stale" && r.value.themes.find((t) => t.v1Id === seed.theme.id)?.outcome).toBe("skip");
    expect(u.store.read((x) => x.get("SELECT count(*) AS n FROM projects")?.["n"])).toEqual(ok(0));
  });
});

describe("the confirm", () => {
  it("lands every theme as a Style: ids projects carry, proofs as blobs, v1's lock grandfathered, the rest on the new gate", async () => {
    const seed = await seedV1("uid-a");
    const u = universe();
    let exported = 0;
    const done = await importInto(u, read(await v1Archive(seed.uid)), () => ok(exported++));
    expect(done.styles.map((s) => s.outcome)).toEqual(["imported", "imported", "imported", "imported"]);
    expect(exported).toBe(1);
    const ink = style(u.store, seed.theme.id);
    expect(ink).toMatchObject({ name: "Ledger ink", status: "candidate", block: BLOCK, elements: ["grid"] });
    expect(ink.lock).toBeUndefined();
    const bytes = await u.blobs.read(ink.proofs[0]!.media);
    expect(bytes.ok && Buffer.from(bytes.value).toString("base64")).toBe(pngB64(40));
    expect(style(u.store, SHELF.locked)).toMatchObject({ status: "locked", lock: { by: "v1", grandfathered: true, at: new Date(T0 + 100).toISOString() } });
    expect(style(u.store, SHELF.unnamed)).toMatchObject({ name: "Blueprint", status: "candidate", origin: { kind: "preset", presetId: "blueprint" } });
    // The film is built on the theme it named in v1, and the project's ref resolves.
    const film = kernelIdOf(seed.film.id);
    expect(u.store.read((r) => loadProject(r, film).styleId)).toEqual(ok(`v1-theme:${seed.theme.id}`));
  });

  it("lands every shelf asset as a Library item: bytes as blobs, folders as a collection, the projects that name it as another", async () => {
    const seed = await seedV1("uid-a");
    const u = universe();
    const done = await importInto(u, read(await v1Archive(seed.uid)));
    expect(Object.fromEntries(done.items.map((i) => [i.v1Id, i.outcome]))).toMatchObject({ [seed.takeId]: "imported", [SHELF.audio]: "refused" });
    // The v1 asset id inside an imported record resolves to an item.
    const ad = kernelIdOf(seed.ad.id);
    const snap = u.store.read((r) => readPartIn(r, { projectId: ad, partId: `${ad}/frames` }));
    if (!snap.ok) throw snap.error;
    const named = (snap.value.records.get("ads-shots")?.["shots"] as { sh1: { adoptedImage: string } }).sh1.adoptedImage;
    const take = item(u.store, named);
    expect(take).toMatchObject({ kind: "image", origin: "import", state: "reference", collections: expect.arrayContaining([{ kind: "pin", id: "ads" }, { kind: "project", id: ad }]) });
    const tb = take.media === undefined ? null : await u.blobs.read(take.media);
    expect(tb?.ok && Buffer.from(tb.value).toString("base64")).toBe(pngB64(60));
    // A promoted proof is the style's own proof bytes, ratified, and points at the style.
    const promoted = item(u.store, SHELF.proofAsset);
    expect(promoted).toMatchObject({ state: "ratified", lineage: [{ kind: "style", id: `v1-theme:${seed.theme.id}` }], collections: [{ kind: "pin", id: "shared/styles/proofs/ledger-ink" }] });
    expect(promoted.media?.sha256).toBe(style(u.store, seed.theme.id).proofs[0]?.media.sha256);
    expect(item(u.store, SHELF.trial).media).toMatchObject({ bytes: TRIAL_BYTES.byteLength, mime: "image/jpeg" });
    expect(u.store.read((r) => r.get("SELECT 1 AS x FROM library_docs WHERE id = ?", v1AssetItemId(SHELF.audio)))).toEqual(ok(undefined));
  });

  it("a styles.json export that fails is said on the outcome; the styles stay landed", async () => {
    const seed = await seedV1("uid-a");
    const u = universe();
    const done = await importInto(u, read(await v1Archive(seed.uid)), () => err("unavailable", "cannot write styles.json"));
    expect(done.styleExport).toBe("cannot write styles.json");
    expect(style(u.store, seed.theme.id).name).toBe("Ledger ink");
  });

  it("a re-import changes nothing: every style and item already held is skipped", async () => {
    const seed = await seedV1("uid-a");
    const u = universe();
    const archive = read(await v1Archive(seed.uid));
    await importInto(u, archive);
    const events = () => u.store.read((r) => r.get("SELECT count(*) AS n FROM events")?.["n"]);
    const before = events();
    let exported = 0;
    // The preview already says so: nothing left to import.
    const preview = u.store.read((r) => planImport(r, archive, pub));
    if (!preview.ok) throw preview.error;
    expect(preview.value.themes.map((t) => t.preview.outcome)).toEqual(["skip", "skip", "skip", "skip"]);
    expect(preview.value.items.filter((i) => i.preview.outcome === "import")).toEqual([]);
    const again = await importInto(u, archive, () => ok(exported++));
    expect(again.styles.every((s) => s.outcome === "skipped")).toBe(true);
    expect(again.items.filter((i) => i.outcome !== "refused").every((i) => i.outcome === "skipped")).toBe(true);
    expect(exported).toBe(0);
    expect(events()).toEqual(before);
  });

  it("refuses a theme the Style door will not take, by name; its project keeps no style, and the others land", async () => {
    const seed = await seedV1("uid-a");
    await putRows(THEMES_STORE, [{ ...seed.theme, block: { medium: "ink" } }]);
    const u = universe();
    const archive = read(await v1Archive(seed.uid));
    const plan = u.store.read((r) => planImport(r, archive, pub));
    if (!plan.ok) throw plan.error;
    const film = plan.value.projects.find((p) => p.preview.v1Id === seed.film.id);
    expect(film?.styleId).toBeUndefined();
    expect(film?.preview.losses.find((l) => l.entity === "theme")).toMatchObject({ grade: "dropped" });
    const done = await importInto(u, archive);
    const ink = done.styles.find((s) => s.v1Id === seed.theme.id);
    expect(ink?.outcome).toBe("refused");
    expect(ink?.reason).toMatch(/^v1 theme/);
    expect(done.styles.filter((s) => s.outcome === "imported")).toHaveLength(3);
  });
});

describe("a theme nobody named", () => {
  it("is named from its preset, then its Foundry style, then its origin and day", () => {
    expect(themeName({ id: "a", name: "  ", presetId: "data-neon" })).toEqual({ name: "Data Neon", named: true });
    expect(themeName({ id: "a", name: "", origin: "foundry", foundryStyleId: "painted-3d" })).toEqual({ name: "painted 3d", named: true });
    expect(themeName({ id: "a", name: "Untitled style", origin: "plate", createdAt: T0 })).toEqual({ name: "Plate style 2026-08-20", named: true });
    expect(themeName({ id: "a", name: "Kept" })).toEqual({ name: "Kept", named: false });
  });
});
