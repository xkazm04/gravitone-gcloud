// LANE — THE SIGN-OUT DIALOG AND ARCHIVE IMPORT (AUP-B stage 2).
//
// Registry: data-retention#dry-run-preview · entity-lifecycle#archive-restore-semantics.
//
// Stage 1 (studio-archive.probe) pinned the floor: an archive that round-trips
// and a dry-run eviction that reports what the wipe would take. This lane pins
// what stands on it, in Node with no DOM:
//
//   · the dialog's decisions as pure functions (components/ui/archiveSummary.ts)
//     - the per-store counts and the archive size, which actions are live when,
//     and the one-line statement of what "Sign out and erase" destroys;
//   · the import result shaped as counts, errors verbatim;
//   · the wiring, read from source with comments stripped: the account menu's
//     "Sign out" no longer calls signOut itself - it opens the dialog, and the
//     dialog is the only place the destructive call is made.
//
// OPERATOR DECISION (2026-10-06): dialog only. The lock-instead-of-wipe policy
// for an involuntary session end is NOT approved, so nothing here touches
// `transitionFor` or its consumers; identity-eviction probes stay the oracle.

import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import {
  archiveFileName,
  consequenceLine,
  errorText,
  formatBytes,
  importTallies,
  signOutPlan,
  wantsArchive,
  wipeTallies,
  type ArchivePrep,
} from "@/components/ui/archiveSummary";
import { assetFromUpload, putUploads } from "@/lib/assets";
import { evictIdentity, type EvictionReport } from "@/lib/identityEviction";
import { newProject, putProject } from "@/lib/projects";
import { ArchiveRefused, exportAccount, importArchive } from "@/lib/studioArchive";
import { ASSETS_STORE, PROJECTS_STORE, STEPS_STORE, THEMES_STORE, UPLOADS_STORE, openDb, runTx } from "@/lib/studioDb";
import { newTheme, putTheme } from "@/lib/themes";

import { stripComments } from "./_helpers";

const ROOT = process.cwd();
const src = (rel: string) => stripComments(readFileSync(path.join(ROOT, rel), "utf8"));

const report = (over: Partial<EvictionReport> = {}): EvictionReport => ({
  uid: "uid-a",
  reason: "signed-out",
  projects: 0,
  steps: 0,
  themes: 0,
  assets: 0,
  uploads: 0,
  local: 0,
  trays: 0,
  failed: false,
  ...over,
});

const FULL = report({ projects: 3, steps: 7, themes: 2, assets: 14, uploads: 5, local: 2 });
const READY: ArchivePrep = { state: "ready", bytes: 5 * 1024 * 1024 + 300 * 1024 };

/* ── the counts ───────────────────────────────────────────────────────────── */

test("dialog: the wipe is five counts, one per store, in store order - local keys are not work", () => {
  const t = wipeTallies(FULL);
  expect(t.map((x) => x.key)).toEqual(["projects", "steps", "themes", "assets", "uploads"]);
  expect(t.map((x) => x.n)).toEqual([3, 7, 2, 14, 5]);
  // The theme store is what the rest of the app calls a style.
  expect(t.find((x) => x.key === "themes")?.label).toBe("styles");
  expect(t.every((x) => x.label.split(/\s+/).length <= 2), "a Tally label is two words at most").toBe(true);
});

test("dialog: sizes read as the file a person will save", () => {
  expect(formatBytes(0)).toBe("0 B");
  expect(formatBytes(900)).toBe("900 B");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(READY.state === "ready" ? READY.bytes : 0)).toBe("5.3 MB");
  expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
});

/* ── the statement of consequence ─────────────────────────────────────────── */

test("dialog: the confirm's consequence is ONE line naming what is lost, and only what is there", () => {
  const line = consequenceLine(FULL)!;
  console.log(`[signout] consequence -> ${line}`);
  expect(line).not.toMatch(/\n/);
  for (const piece of ["3 projects", "7 steps", "2 styles", "14 assets", "5 uploads"]) expect(line).toContain(piece);
  // Exempt from the narration law as a destructive confirm, and still held to
  // one line: past the hard cap check:narration uses, it is a paragraph.
  expect(line.split(/\s+/).length).toBeLessThanOrEqual(25);

  // Singular, and a zero store is not named at all.
  const one = consequenceLine(report({ projects: 1, steps: 1 }))!;
  expect(one).toContain("1 project");
  expect(one).not.toContain("1 projects");
  expect(one).not.toMatch(/styles|assets|uploads/);

  // Nothing to lose: no consequence to state.
  expect(consequenceLine(report())).toBeNull();
  // Still counting: nothing to state yet.
  expect(consequenceLine(null)).toBeNull();
  // The count failed: the consequence is stated without numbers rather than as zero.
  const blind = consequenceLine(report({ failed: true }))!;
  expect(blind).toBeTruthy();
  expect(blind).not.toMatch(/\d/);
});

/* ── which actions are live when ──────────────────────────────────────────── */

test("dialog: while the dry run is counting, nothing can be pressed", () => {
  const p = signOutPlan({ report: null, prep: { state: "idle" }, busy: false, saved: false });
  expect(p.download.enabled).toBe(false);
  expect(p.erase.enabled).toBe(false);
  expect(p.consequence).toBeNull();
});

test("dialog: work on the shelf - download is the primary act, erase is destructive and stated", () => {
  const preparing = signOutPlan({ report: FULL, prep: { state: "preparing" }, busy: false, saved: false });
  expect(preparing.download.shown).toBe(true);
  expect(preparing.download.enabled, "no file to save until the archive is built").toBe(false);
  expect(preparing.download.size).toBeNull();
  // Erase does not wait on the archive: an archive nobody downloads dies with the dialog.
  expect(preparing.erase.enabled).toBe(true);
  expect(preparing.erase).toMatchObject({ label: "Sign out and erase", destructive: true });
  expect(preparing.consequence).toBe(consequenceLine(FULL));

  const ready = signOutPlan({ report: FULL, prep: READY, busy: false, saved: false });
  expect(ready.download).toMatchObject({ shown: true, enabled: true, label: "Download archive", size: "5.3 MB" });

  const saved = signOutPlan({ report: FULL, prep: READY, busy: false, saved: true });
  expect(saved.download.enabled, "a second copy is still the user's call").toBe(true);
  expect(saved.download.label).toBe("Downloaded");

  const failed = signOutPlan({ report: FULL, prep: { state: "failed", error: "quota" }, busy: false, saved: false });
  expect(failed.download.enabled).toBe(false);
  expect(failed.erase.enabled, "a failed archive must not trap the user signed in").toBe(true);
});

test("dialog: an empty shelf signs out plainly - no archive, no erase wording", () => {
  const p = signOutPlan({ report: report({ local: 3 }), prep: { state: "idle" }, busy: false, saved: false });
  expect(p.download.shown).toBe(false);
  expect(p.erase).toMatchObject({ enabled: true, label: "Sign out", destructive: false });
  expect(p.consequence).toBeNull();
});

test("dialog: a dry run that could not count is treated as work at stake, not as an empty shelf", () => {
  const p = signOutPlan({ report: report({ failed: true }), prep: { state: "preparing" }, busy: false, saved: false });
  expect(p.download.shown).toBe(true);
  expect(p.erase).toMatchObject({ label: "Sign out and erase", destructive: true });
  expect(p.consequence).toBeTruthy();
});

test("dialog: an archive is built only when a sign-out would lose something", () => {
  expect(wantsArchive(null)).toBe(false);
  expect(wantsArchive(report({ local: 4, trays: 1 }))).toBe(false);
  expect(wantsArchive(report({ uploads: 1 }))).toBe(true);
  expect(wantsArchive(report({ failed: true }))).toBe(true);
});

test("dialog: once signing out, both actions are dead", () => {
  const p = signOutPlan({ report: FULL, prep: READY, busy: true, saved: true });
  expect(p.download.enabled).toBe(false);
  expect(p.erase.enabled).toBe(false);
});

test("dialog: the archive file is named by date, never by account", () => {
  const name = archiveFileName(new Date(Date.UTC(2026, 9, 6, 12)));
  expect(name).toBe("gravitone-2026-10-06.gravitone");
});

/* ── the import result ────────────────────────────────────────────────────── */

test("import: the result is five store counts, plus skipped / replaced / re-minted only when non-zero", () => {
  const base = { uid: "u", projects: 2, steps: 3, themes: 1, assets: 3, uploads: 2, skipped: 0, replaced: 0, reminted: 0, remap: {} };
  const plain = importTallies(base);
  expect(plain.map((x) => [x.label, x.n])).toEqual([
    ["projects", 2],
    ["steps", 3],
    ["styles", 1],
    ["assets", 3],
    ["uploads", 2],
  ]);
  const mixed = importTallies({ ...base, skipped: 4, reminted: 1 });
  expect(mixed.map((x) => x.label)).toEqual(["projects", "steps", "styles", "assets", "uploads", "skipped", "re-minted"]);
  expect(mixed.find((x) => x.label === "skipped")?.tone).toBe("amber");
});

test("import: a refusal is shown verbatim, as the archive code wrote it", () => {
  const msg = "archive from database version 99; this studio is at version 7 - update the app, then import";
  expect(errorText(new ArchiveRefused("newer-db-version", msg))).toBe(msg);
  expect(errorText(new Error("QuotaExceededError: the quota has been exceeded"))).toBe(
    "QuotaExceededError: the quota has been exceeded",
  );
  expect(errorText("plain string")).toBe("plain string");
});

/* ── against the real engine ──────────────────────────────────────────────── */

const STORES = [PROJECTS_STORE, STEPS_STORE, THEMES_STORE, ASSETS_STORE, UPLOADS_STORE] as const;

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

test("dialog + import on fake-indexeddb: the dry run's counts are the dialog's, and re-importing over the shelf under skip changes nothing", async () => {
  await clearAll();
  const uid = "uid-signout";
  const theme = newTheme(uid, { name: "Ink", origin: "scratch", block: { medium: "ink" } as never, elements: [] });
  await putTheme(theme);
  for (const title of ["One", "Two"]) {
    await putProject(
      newProject(uid, { title, logline: "", template: "short-educational-video", discipline: "educational", targetS: 60, themeId: theme.id }),
    );
  }
  const up = assetFromUpload(uid, new File([new Uint8Array([1, 2, 3])], "r.png", { type: "image/png" }), []);
  await putUploads([up]);

  const dry = await evictIdentity(uid, "signed-out", { dryRun: true });
  const shown = wipeTallies(dry);
  expect(Object.fromEntries(shown.map((t) => [t.key, t.n]))).toEqual({
    projects: 2,
    steps: 0,
    themes: 1,
    assets: 1,
    uploads: 1,
  });
  expect(consequenceLine(dry)).toContain("2 projects");

  // What the dialog's Download button saves, imported back over the same shelf
  // with the control's default policy: everything is already there, so every
  // by-uid row is skipped and nothing is written.
  const file = await new Response(exportAccount(uid)).blob();
  expect(file.size).toBeGreaterThan(0);
  const back = await importArchive(file, uid, { onCollision: "skip" });
  const t = importTallies(back);
  expect(t.find((x) => x.label === "projects")?.n).toBe(0);
  expect(t.find((x) => x.label === "skipped")?.n).toBe(4); // 2 projects · 1 theme · 1 asset
  // And the shelf is intact: the dry run deleted nothing.
  expect((await evictIdentity(uid, "signed-out", { dryRun: true })).projects).toBe(2);
});

/* ── the wiring, from source ──────────────────────────────────────────────── */

test("wiring: the account menu's Sign out opens the dialog and never calls signOut itself", () => {
  const menu = src("components/ui/UserMenu.tsx");
  expect(menu.length, "read nothing from UserMenu.tsx").toBeGreaterThan(2000);
  expect(menu).toContain("Sign out");
  expect(menu).toMatch(/<SignOutDialog\b/);
  expect(menu, "UserMenu still reaches signOut directly").not.toMatch(/\bsignOut\b/);
  // Local mode keeps its own branch: there is no session to end there.
  expect(menu).toMatch(/LOCAL_MODE\s*\?/);
});

test("wiring: the dialog previews with a dry run, offers the archive, and is the one caller of signOut", () => {
  const dlg = src("components/ui/SignOutDialog.tsx");
  expect(dlg.length, "read nothing from SignOutDialog.tsx").toBeGreaterThan(1000);
  expect(dlg).toMatch(/evictIdentity\([^)]*dryRun:\s*true/);
  expect(dlg).toMatch(/\bexportAccount\(/);
  expect(dlg).toMatch(/\bsignOut\(\)/);
  expect(dlg).toMatch(/<Modal\b/);
  expect(dlg).toMatch(/<Tally\b/);
  expect(dlg).toMatch(/\bsignOutPlan\(/);
  // A file the person saves - nothing leaves the machine.
  expect(dlg, "the archive must not be sent anywhere").not.toMatch(/\bfetch\(/);
});

test("wiring: /projects imports with skip as the default and shows the result as counts", () => {
  const view = src("app/projects/ProjectsView.tsx");
  expect(view.length, "read nothing from ProjectsView.tsx").toBeGreaterThan(2000);
  expect(view).toMatch(/importArchive\([^)]*onCollision:\s*"skip"/);
  expect(view).toMatch(/\bimportTallies\(/);
  expect(view).toMatch(/\berrorText\(/);
  expect(view).toContain("Import archive");
});

test("wiring: the three surfaces speak through the announcer, not live regions of their own", () => {
  // lib/announcer.tsx rule 2 (one writer); live-region-budget.probe holds the
  // app-wide ceiling, this holds the files this lane wrote.
  for (const rel of ["components/ui/UserMenu.tsx", "components/ui/SignOutDialog.tsx", "app/projects/ProjectsView.tsx"]) {
    const s = src(rel);
    expect(s.length, `read nothing from ${rel}`).toBeGreaterThan(1000);
    expect(s, rel).not.toMatch(/aria-live=|role="(?:status|alert)"/);
  }
  expect(src("components/ui/SignOutDialog.tsx")).toMatch(/\buseAnnounce\(\)/);
  expect(src("app/projects/ProjectsView.tsx")).toMatch(/\buseAnnounce\(\)/);
});
