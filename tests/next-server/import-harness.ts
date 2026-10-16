import "fake-indexeddb/auto";

import { newProject, putProject, type Project } from "../../lib/projects.ts";
import { exportAccount } from "../../lib/studioArchive.ts";
import { ASSETS_STORE, PROJECTS_STORE, STEPS_STORE, THEMES_STORE, UPLOADS_STORE, openDb, runTx } from "../../lib/studioDb.ts";

// A v1 ACCOUNT (L42, extended L55) - the fixture archive the import lane reads. The shapes are
// v1's, on the real IndexedDB engine, and the archive is v1's own `exportAccount`: the import is
// tested against bytes v1 wrote, never against a hand-typed NDJSON. v1's theme and shelf writers
// (lib/themes.ts, lib/assets.ts) retired in Phase 5, so their rows are written here in the shapes
// those writers stored - the shapes every browser that still holds them carries.

const STORES = [PROJECTS_STORE, STEPS_STORE, THEMES_STORE, ASSETS_STORE, UPLOADS_STORE] as const;

export async function clearV1(): Promise<void> {
  const db = await openDb();
  try {
    await runTx(db, [...STORES], "readwrite", (_s, tx) => {
      for (const s of STORES) tx.objectStore(s).clear();
    });
  } finally {
    db.close();
  }
}

export async function putRows(store: string, rows: readonly object[]): Promise<void> {
  const db = await openDb();
  try {
    await runTx(db, store, "readwrite", (s) => {
      for (const r of rows) s.put(r);
    });
  } finally {
    db.close();
  }
}

export async function putStep(projectId: string, phase: string, data: unknown): Promise<void> {
  await putRows(STEPS_STORE, [{ id: `${projectId}:${phase}`, projectId, phase, data }]);
}

export const bytesOf = async (s: ReadableStream<Uint8Array>): Promise<Uint8Array> => new Uint8Array(await new Response(s).arrayBuffer());

/** A tiny PNG-ish payload, distinct per seed; the bytes are what the blob store must hold. */
export const pngB64 = (seed: number): string => Buffer.from([137, 80, 78, 71, seed, seed + 1, seed + 2, 0, 255, 13, 10]).toString("base64");
export const dataUrl = (seed: number): string => `data:image/png;base64,${pngB64(seed)}`;

const unit = (id: string, at: number, seed: number) => ({
  id,
  kind: "beat",
  sourceId: "r-glass",
  beatRef: { at },
  startS: at * 5,
  endS: at * 5 + 5,
  plate: { state: "ready", src: dataUrl(seed), model: "gpt-image-2.5", costUsd: 0.04, subject: `plate ${id}` },
  clip: { status: "not-started", motion: "" },
  elements: [],
  texts: [{ role: "caption", factId: "f1" }],
});

/** v1 lib/themes.ts `Theme`, as `putTheme` stored it. */
export type V1Theme = {
  readonly id: string;
  readonly uid: string;
  readonly name: string;
  readonly origin: string;
  readonly presetId?: string;
  readonly block: unknown;
  readonly elements: readonly string[];
  readonly proofs: readonly object[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lockedAt?: number;
};

/** A v1 StyleBlock (@gt/catalog/style). */
export const BLOCK = {
  technique: "ink wash on rag paper",
  subject: "a harbor of glass at dawn",
  palette: [
    { name: "ink", hex: "#101418", role: "ground" },
    { name: "bone", hex: "#e8e2d4", role: "objects" },
    { name: "signal", hex: "#e0542e", role: "accent" },
  ],
  finish: "matte, a hairline grain",
};

export const T0 = Date.parse("2026-08-20T09:00:00.000Z");
const proof = (id: string, seed: number, state: string, extra: object = {}) => ({ id, label: `proof ${id}`, base64: pngB64(seed), mime: "image/png", state, createdAt: T0 + seed, ...extra });

/** The account's shelf beyond the film's theme: three themes and the assets no project names. */
export const SHELF = {
  /** v1 locked it: imports locked, grandfathered. */
  locked: "th-locked",
  /** No name: named from its preset. */
  unnamed: "th-unnamed",
  /** The retired "From a brief" placeholder name: named from its origin and day. */
  untitled: "th-untitled",
  proofAsset: "as-proof-th-ink-pr-1",
  upload: "as-upload-harbor",
  trial: "as-trial-blueprint",
  audio: "as-audio-migrated",
  /** A file the studio serves, where v1's trial seed pointed its rows. */
  trialSrc: "/trials/google/blueprint/flywheel.jpg",
} as const;

export type Seeded = {
  readonly uid: string;
  readonly film: Project;
  readonly ad: Project;
  readonly album: Project;
  readonly empty: Project;
  readonly theme: V1Theme;
  readonly signedAt: number;
  /** The shelf asset the ad's records name. */
  readonly takeId: string;
};

/** One account: a film with every step's work and two sign-offs, an ad naming an uploaded take,
 *  a music video, an untouched project, the theme the film is built on, three more themes and a
 *  shelf of assets no project names. */
export async function seedV1(uid: string): Promise<Seeded> {
  const theme: V1Theme = { id: "th-ink", uid, name: "Ledger ink", origin: "scratch", block: BLOCK, elements: ["grid"], proofs: [proof("pr-1", 40, "approved")], createdAt: T0, updatedAt: T0 };
  await putRows(THEMES_STORE, [
    theme,
    { id: SHELF.locked, uid, name: "Signal ledger", origin: "preset", presetId: "signal-ledger", block: BLOCK, elements: [], proofs: [proof("pl-1", 41, "approved", { trialId: "peak-and-fall" }), proof("pl-2", 42, "rejected", { note: "too busy" })], createdAt: T0, updatedAt: T0, lockedAt: T0 + 100 },
    { id: SHELF.unnamed, uid, name: "", origin: "preset", presetId: "blueprint", block: BLOCK, elements: [], proofs: [proof("pu-1", 43, "pending")], createdAt: T0, updatedAt: T0 },
    { id: SHELF.untitled, uid, name: "Untitled style", origin: "scratch", block: BLOCK, elements: [], proofs: [], createdAt: T0, updatedAt: T0 },
  ]);
  const signedAt = Date.parse("2026-09-01T10:00:00.000Z");
  const film = await putProject({
    ...newProject(uid, { title: "Glass harbor", logline: "", template: "short-educational-video", discipline: "educational", targetS: 90, themeId: theme.id }),
    signedOff: { research: signedAt, frames: signedAt },
  });
  const units = [unit("u1", 0, 1), unit("u2", 1, 2)];
  await putStep(film.id, "research", { topic: "glass harbors", researched: true, savedAt: 11 });
  await putStep(film.id, "research-scope", { scope: { c1: { descoped: false, liked: true, deepen: false } }, savedAt: 12 });
  await putStep(film.id, "script-adopted", { renderId: "r-glass", savedAt: 13 });
  await putStep(film.id, "script-mode", { mode: "expert", savedAt: 14 });
  await putStep(film.id, "frames", { v: 2, renderId: "r-glass", units, frames: units.map((u) => ({ id: u.id, at: u.beatRef.at, plate: u.plate })), savedAt: 15 });
  await putStep(film.id, "frames-alts", { byFrame: { u1: { activeId: "a1", alts: [{ id: "a1", plate: { state: "ready", src: dataUrl(7) }, createdAt: 5 }] } }, savedAt: 16 });
  await putStep(film.id, "score", { spots: [{ id: "s1", title: "open", sceneIds: ["u1"], note: "" }], savedAt: 17 });
  await putStep(film.id, "cut", { offsets: { u1: 120 }, savedAt: 18 });

  const ad = await putProject(newProject(uid, { title: "Rainshell", logline: "", template: "ad-social-15", discipline: "ads", targetS: 15 }));
  const takeId = "as-up-take";
  const asset = (id: string, path: readonly string[], name: string, src: string, kind = "image", meta?: object) => ({ id, uid, path, name, src, kind, ...(meta === undefined ? {} : { meta }), createdAt: T0 });
  const upload = (id: string, seed: number) => {
    const blob = new Blob([Buffer.from(pngB64(seed), "base64")], { type: "image/png" });
    return { id, blob, mime: "image/png", bytes: blob.size };
  };
  await putRows(UPLOADS_STORE, [upload("up-take", 60), upload("up-harbor", 61)]);
  await putRows(ASSETS_STORE, [
    asset(takeId, ["ads"], "take", "upload:up-take", "image", { upload: true, uploadId: "up-take" }),
    asset(SHELF.proofAsset, ["shared", "styles", "proofs", "ledger-ink"], "first", "proof:th-ink/pr-1"),
    asset(SHELF.upload, ["refs", "harbors"], "harbor", "upload:up-harbor"),
    asset(SHELF.trial, ["trials", "blueprint"], "the flywheel", SHELF.trialSrc),
    // v1's sound migration moved a take's bytes to the sound store and left the row with no src.
    asset(SHELF.audio, ["audio"], "night drive bed", "", "audio", { verdict: "kept", vendor: "suno", duration_s: 32 }),
  ]);
  await putStep(ad.id, "ads-shots", { scenarioId: "sc1", shots: { sh1: { imageTakes: [takeId], adoptedImage: takeId, clips: [], adoptedClip: null } } });

  const album = await putProject(newProject(uid, { title: "Night drive", logline: "", template: "music-video", discipline: "music-video", targetS: 180 }));
  await putStep(album.id, "music-video-source", { style: "neon", seed: 4 });

  const empty = await putProject(newProject(uid, { title: "Not yet", logline: "", template: "teaser", discipline: "trailer", targetS: 45 }));
  return { uid, film, ad, album, empty, theme, signedAt, takeId };
}

export async function v1Archive(uid: string): Promise<Uint8Array> {
  return bytesOf(exportAccount(uid));
}
