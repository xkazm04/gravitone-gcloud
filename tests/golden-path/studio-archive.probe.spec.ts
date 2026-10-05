// LANE — STUDIO ARCHIVE (AUP-B stage 1: the archive half and the dry run).
//
// Registry: data-retention#dry-run-preview · entity-lifecycle#archive-restore-semantics.
//
// WHY THIS LANE EXISTS. IndexedDB is the only copy of a creator's work — there
// is no backend to refetch from (lib/localMode.ts, lib/firebase.ts) — and
// `evictIdentity` deletes every project, step, theme, asset and uploaded picture
// an account holds. Before this lane there was no export, no import and no way
// to see what a wipe would take before it took it. These cases pin the floor the
// sign-out dialog (stage 2) will stand on:
//
//   1. export → wipe → import restores all five stores deep-equal, upload bytes
//      byte-identical;
//   2. an archive taken by one account lands in another with no trace of the
//      first uid, and the receiving account's own rows untouched;
//   3. the dry run reports exactly what the real eviction then does, and deletes
//      nothing;
//   4. an archive from a NEWER database is refused by name, nothing written;
//   5. a corrupt section is refused, and nothing — not even the sections before
//      it — is written: one transaction, no partial shelf;
//   6. a colliding project id under skip / duplicate / replace.
//
// Runs on fake-indexeddb, the same real engine the DAL and eviction probes use.
// The identity-eviction probes are this lane's oracle and are not edited by it.

import "fake-indexeddb/auto";

import { test, expect } from "@playwright/test";

import { assetFromUpload, putAssets, putUploads } from "@/lib/assets";
import { evictIdentity, userScopedLocalKeys } from "@/lib/identityEviction";
import { onIdentityEvicted } from "@/lib/jobs";
import { newProject, putProject, type Project } from "@/lib/projects";
import {
  ArchiveRefused,
  exportAccount,
  exportProject,
  importArchive,
  inspectArchive,
} from "@/lib/studioArchive";
import {
  ASSETS_STORE,
  PROJECTS_STORE,
  STEPS_STORE,
  THEMES_STORE,
  UPLOADS_STORE,
  openDb,
  runTx,
} from "@/lib/studioDb";
import { newTheme, putTheme, type Theme } from "@/lib/themes";

const STORES = [PROJECTS_STORE, STEPS_STORE, THEMES_STORE, ASSETS_STORE, UPLOADS_STORE] as const;

/* ── fixtures ─────────────────────────────────────────────────────────────── */

async function clearAll() {
  const db = await openDb();
  try {
    await runTx(db, [...STORES], "readwrite", (_s, tx) => {
      for (const s of STORES) tx.objectStore(s).clear();
    });
  } finally {
    db.close();
  }
}

/** Every row of every store, uploads normalised to their bytes so two snapshots
 *  compare by content rather than by Blob identity. */
async function snapshot(): Promise<Record<string, unknown[]>> {
  const db = await openDb();
  const out: Record<string, unknown[]> = {};
  try {
    await runTx(db, [...STORES], "readonly", (_s, tx) => {
      for (const s of STORES) {
        const req = tx.objectStore(s).getAll();
        req.onsuccess = () => void (out[s] = req.result as unknown[]);
      }
    });
  } finally {
    db.close();
  }
  out[UPLOADS_STORE] = await Promise.all(
    (out[UPLOADS_STORE] as { blob: Blob }[]).map(async (u) => ({
      ...u,
      blob: { type: u.blob.type, bytes: [...new Uint8Array(await u.blob.arrayBuffer())] },
    })),
  );
  return out;
}

const bytesOf = async (s: ReadableStream<Uint8Array>) => new Uint8Array(await new Response(s).arrayBuffer());

const png = (name: string, seed: number) =>
  new File([new Uint8Array([137, 80, 78, 71, seed, seed + 1, 0, 255, 13, 10])], name, { type: "image/png" });

const draft = (title: string, themeId?: string) => ({
  title,
  logline: "",
  template: "short-educational-video" as const,
  discipline: "educational" as const,
  targetS: 120,
  themeId,
});

async function putStep(projectId: string, phase: string, data: unknown) {
  const db = await openDb();
  try {
    await runTx(db, STEPS_STORE, "readwrite", (s) => s.put({ id: `${projectId}:${phase}`, projectId, phase, data }));
  } finally {
    db.close();
  }
}

/** A whole account: a theme with a proof, two projects with steps, two uploads,
 *  one pointer-only asset. Returns the ids the cases assert against. */
async function seedAccount(uid: string) {
  const theme: Theme = {
    ...newTheme(uid, { name: "Ledger ink", origin: "scratch", block: { medium: "ink" } as never, elements: ["grid"] }),
    proofs: [
      { id: "pr-1", label: "first", base64: "aGVsbG8=", mime: "image/png", state: "approved", createdAt: 1 },
    ],
  };
  await putTheme(theme);
  const p1 = await putProject(newProject(uid, draft("Glass harbor", theme.id)));
  const p2 = await putProject(newProject(uid, draft("Second cut", theme.id)));
  await putStep(p1.id, "research", { notes: ["a", "b"], plate: "data:image/png;base64,AAAA" });
  await putStep(p1.id, "script", { beats: [{ t: 0, line: "open" }] });
  await putStep(p2.id, "research", { notes: [] });
  const u1 = assetFromUpload(uid, png("one.png", 1), ["refs"]);
  const u2 = assetFromUpload(uid, png("two.png", 2), ["refs", "deep"]);
  await putUploads([u1, u2]);
  // The id must not embed the uid: case 2 searches every stored byte for it.
  await putAssets([{ ...u1.asset, id: `as-pointer-${u1.upload.id}`, src: "/frames/plate.png", meta: {} }]);
  return { theme, p1, p2, u1, u2 };
}

test.beforeEach(async () => {
  await clearAll();
});

/* ── 1 · round trip ───────────────────────────────────────────────────────── */

test("archive: export, wipe, import restores all five stores deep-equal, upload bytes identical", async () => {
  await seedAccount("uid-a");
  await seedAccount("uid-b"); // the bystander: present before and after, never in the archive
  const before = await snapshot();

  const archive = await bytesOf(exportAccount("uid-a"));
  // Gzip by default wherever CompressionStream exists (Node 24, every browser).
  expect([archive[0], archive[1]]).toEqual([0x1f, 0x8b]);

  const { manifest } = await inspectArchive(new Blob([archive]));
  expect(manifest.counts).toEqual({ projects: 2, steps: 3, themes: 1, assets: 3, uploads: 2 });

  const wiped = await evictIdentity("uid-a", "signed-out");
  expect(wiped.projects).toBe(2);

  const report = await importArchive(new Blob([archive]), "uid-a", { onCollision: "skip" });
  console.log(`[archive] round trip -> ${JSON.stringify(report)}`);
  expect(report).toMatchObject({ projects: 2, steps: 3, themes: 1, assets: 3, uploads: 2, skipped: 0, reminted: 0 });

  const after = await snapshot();
  const byId = (rows: unknown[]) => [...(rows as { id: string }[])].sort((a, b) => a.id.localeCompare(b.id));
  for (const s of STORES) expect(byId(after[s]), `store ${s}`).toEqual(byId(before[s]));
});

/* ── 2 · cross-account ────────────────────────────────────────────────────── */

test("archive: U1's archive imported into U2 leaves no row carrying U1, and U2's own rows untouched", async () => {
  await seedAccount("uid-one");
  const archive = await bytesOf(exportAccount("uid-one"));
  await evictIdentity("uid-one", "signed-out");

  await seedAccount("uid-two");
  const own = await snapshot();

  const report = await importArchive(new Blob([archive]), "uid-two", { onCollision: "skip" });
  expect(report).toMatchObject({ projects: 2, themes: 1, assets: 3, uploads: 2 });

  const after = await snapshot();
  const text = JSON.stringify(after);
  expect(text.includes("uid-one"), "a row still carries the exporting account's uid").toBe(false);
  for (const s of STORES) {
    for (const row of own[s] as { id: string }[]) {
      expect((after[s] as { id: string }[]).find((r) => r.id === row.id), `${s}/${row.id}`).toEqual(row);
    }
  }
  expect((after[PROJECTS_STORE] as Project[]).filter((p) => p.uid === "uid-two").length).toBe(4);
});

test("archive: a collision with ANOTHER account's row is never replaced or skipped - it is re-minted", async () => {
  // The exporting account is still resident on this machine. Replacing would
  // hand its rows to the importer; skipping would silently drop the import.
  await seedAccount("uid-one");
  const theirs = await snapshot();
  const archive = await bytesOf(exportAccount("uid-one", { gzip: false }));

  const report = await importArchive(new Blob([archive]), "uid-two", { onCollision: "replace" });
  expect(report.replaced).toBe(0);
  expect(report.reminted).toBeGreaterThanOrEqual(8); // 1 theme · 2 projects · 3 assets · 2 uploads

  const after = await snapshot();
  for (const s of STORES) {
    for (const row of theirs[s] as { id: string }[]) {
      expect((after[s] as { id: string }[]).find((r) => r.id === row.id), `${s}/${row.id}`).toEqual(row);
    }
  }
  const mine = (after[PROJECTS_STORE] as Project[]).filter((p) => p.uid === "uid-two");
  expect(mine.length).toBe(2);
  const myThemes = (after[THEMES_STORE] as Theme[]).filter((t) => t.uid === "uid-two");
  // The copies point at the copied theme, not at the other account's.
  for (const p of mine) expect(p.themeId).toBe(myThemes[0].id);
});

/* ── 3 · dry run ──────────────────────────────────────────────────────────── */

test("eviction dry run: reports exactly what the real eviction then does, and deletes nothing", async () => {
  await seedAccount("uid-a");
  await seedAccount("uid-b");

  const store = new Map<string, string>();
  const g = globalThis as { localStorage?: unknown };
  g.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  let told = 0;
  const off = onIdentityEvicted(() => void told++);
  try {
    const keys = userScopedLocalKeys("uid-a").slice(0, 3);
    for (const k of keys) store.set(k, "1");
    const before = await snapshot();

    const preview = await evictIdentity("uid-a", "signed-out", { dryRun: true });
    console.log(`[archive] dry run -> ${JSON.stringify(preview)}`);
    expect(await snapshot(), "the dry run deleted rows").toEqual(before);
    expect([...store.keys()].sort(), "the dry run removed localStorage keys").toEqual([...keys].sort());
    expect(told, "the dry run emptied a mounted job tray").toBe(0);

    const real = await evictIdentity("uid-a", "signed-out");
    expect(told).toBe(1);
    expect(preview).toEqual(real);
    // Not vacuous: the two agree on a wipe that actually took something.
    expect(real).toMatchObject({ projects: 2, steps: 3, themes: 1, assets: 3, uploads: 2, local: 3, trays: 1 });
  } finally {
    off();
    delete g.localStorage;
  }
});

/* ── 4 · newer database ───────────────────────────────────────────────────── */

test("archive: one taken from a NEWER database version is refused by name and writes nothing", async () => {
  await seedAccount("uid-a");
  const text = new TextDecoder().decode(await bytesOf(exportAccount("uid-a", { gzip: false })));
  const lines = text.split("\n");
  const header = JSON.parse(lines[0]);
  lines[0] = JSON.stringify({ ...header, dbVersion: header.dbVersion + 1 });
  await clearAll();

  const err = await importArchive(lines.join("\n"), "uid-a", { onCollision: "skip" }).catch((e) => e);
  expect(err).toBeInstanceOf(ArchiveRefused);
  expect((err as ArchiveRefused).code).toBe("newer-db-version");
  expect(String((err as Error).message)).toContain(String(header.dbVersion + 1));
  const after = await snapshot();
  for (const s of STORES) expect(after[s], s).toEqual([]);
});

/* ── 5 · corrupt section ──────────────────────────────────────────────────── */

test("archive: a corrupt section imports nothing - not even the intact sections before it", async () => {
  await seedAccount("uid-a");
  const text = new TextDecoder().decode(await bytesOf(exportAccount("uid-a", { gzip: false })));
  // Flip one byte inside an UPLOAD row - the last data section, so a writer that
  // committed section by section would already have landed projects and steps.
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.startsWith('{"s":"uploads"'));
  expect(at, "the archive has no uploads section to corrupt").toBeGreaterThan(0);
  const row = JSON.parse(lines[at]);
  const b64: string = row.r.blob.b64;
  row.r.blob.b64 = (b64[0] === "A" ? "B" : "A") + b64.slice(1);
  lines[at] = JSON.stringify(row);
  await clearAll();

  const err = await importArchive(lines.join("\n"), "uid-a", { onCollision: "skip" }).catch((e) => e);
  expect(err).toBeInstanceOf(ArchiveRefused);
  expect((err as ArchiveRefused).code).toBe("corrupt-section");
  expect(String((err as Error).message)).toContain("uploads");
  const after = await snapshot();
  for (const s of STORES) expect(after[s], s).toEqual([]);

  // And a truncated archive (no trailing manifest) is refused the same way.
  const cut = lines.filter((l) => !l.includes('"kind":"gravitone-archive-manifest"')).join("\n");
  expect(cut.length).toBeLessThan(lines.join("\n").length);
  const err2 = await importArchive(cut, "uid-a", { onCollision: "skip" }).catch((e) => e);
  expect((err2 as ArchiveRefused).code).toBe("truncated");
});

/* ── 6 · collisions ───────────────────────────────────────────────────────── */

test("archive: a colliding project id - skip keeps it, duplicate re-mints and re-keys, replace overwrites", async () => {
  const { p1, theme } = await seedAccount("uid-a");
  const one = await bytesOf(exportProject("uid-a", p1.id));
  const { manifest } = await inspectArchive(new Blob([one]));
  expect(manifest.counts).toEqual({ projects: 1, steps: 2, themes: 1, assets: 0, uploads: 0 });

  // The local copy moves on after the export: a new title and a step the
  // archive never saw.
  await putProject({ ...p1, title: "edited locally" });
  await putStep(p1.id, "frames", { plates: [] });
  const local = await snapshot();

  // SKIP: the shelf is exactly as it was.
  const skipped = await importArchive(new Blob([one]), "uid-a", { onCollision: "skip" });
  expect(skipped).toMatchObject({ projects: 0, steps: 0, themes: 0, skipped: 2 });
  expect(await snapshot()).toEqual(local);

  // DUPLICATE: a new project id, its steps re-keyed `${newId}:${phase}`, the
  // original untouched.
  const dup = await importArchive(new Blob([one]), "uid-a", { onCollision: "duplicate" });
  const newId = dup.remap[p1.id];
  expect(newId, "no new id for the colliding project").toBeTruthy();
  expect(newId).not.toBe(p1.id);
  expect(newId.startsWith("p-")).toBe(true);
  const after = await snapshot();
  const projects = after[PROJECTS_STORE] as Project[];
  expect(projects.find((p) => p.id === p1.id)).toEqual(local[PROJECTS_STORE].find((p) => (p as Project).id === p1.id));
  const copy = projects.find((p) => p.id === newId)!;
  expect(copy.title).toBe("Glass harbor");
  expect(copy.themeId).toBe(dup.remap[theme.id]);
  const steps = (after[STEPS_STORE] as { id: string; projectId: string; phase: string }[]).filter(
    (s) => s.projectId === newId,
  );
  expect(steps.map((s) => s.id).sort()).toEqual([`${newId}:research`, `${newId}:script`]);
  for (const s of steps) expect(s.id).toBe(`${s.projectId}:${s.phase}`);
  expect((after[STEPS_STORE] as { projectId: string }[]).filter((s) => s.projectId === p1.id).length).toBe(3);

  // REPLACE: the archive's version wins, including the step set.
  const rep = await importArchive(new Blob([one]), "uid-a", { onCollision: "replace" });
  expect(rep.replaced).toBe(2); // the project and its theme
  const final = await snapshot();
  expect((final[PROJECTS_STORE] as Project[]).find((p) => p.id === p1.id)!.title).toBe("Glass harbor");
  expect(
    (final[STEPS_STORE] as { id: string; projectId: string }[])
      .filter((s) => s.projectId === p1.id)
      .map((s) => s.id)
      .sort(),
  ).toEqual([`${p1.id}:research`, `${p1.id}:script`]);
});
