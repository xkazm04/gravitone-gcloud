import "fake-indexeddb/auto";

import { assetFromUpload, putUploads } from "../../lib/assets.ts";
import { newProject, putProject, type Project } from "../../lib/projects.ts";
import { exportAccount } from "../../lib/studioArchive.ts";
import { ASSETS_STORE, PROJECTS_STORE, STEPS_STORE, THEMES_STORE, UPLOADS_STORE, openDb, runTx } from "../../lib/studioDb.ts";
import { newTheme, putTheme, type Theme } from "../../lib/themes.ts";

// A v1 ACCOUNT, BUILT WITH v1's OWN WRITERS (L42) - the fixture archive the import lane reads.
// The shapes are v1's, on the real IndexedDB engine the studio-archive probe uses
// (tests/golden-path/studio-archive.probe.spec.ts), and the archive is v1's own `exportAccount`:
// the import is tested against bytes v1 wrote, never against a hand-typed NDJSON.

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

export async function putStep(projectId: string, phase: string, data: unknown): Promise<void> {
  const db = await openDb();
  try {
    await runTx(db, STEPS_STORE, "readwrite", (s) => s.put({ id: `${projectId}:${phase}`, projectId, phase, data }));
  } finally {
    db.close();
  }
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

export type Seeded = { readonly uid: string; readonly film: Project; readonly ad: Project; readonly album: Project; readonly empty: Project; readonly theme: Theme; readonly signedAt: number };

/** One account: a film with every step's work and two sign-offs, an ad naming an uploaded take,
 *  a music video, an untouched project, and the theme the film is built on. */
export async function seedV1(uid: string): Promise<Seeded> {
  const theme: Theme = {
    ...newTheme(uid, { name: "Ledger ink", origin: "scratch", block: { medium: "ink" } as never, elements: ["grid"] }),
    proofs: [{ id: "pr-1", label: "first", base64: pngB64(40), mime: "image/png", state: "approved", createdAt: 1 }],
  };
  await putTheme(theme);
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
  const take = assetFromUpload(uid, new File([Buffer.from(pngB64(60), "base64")], "take.png", { type: "image/png" }), ["ads"]);
  await putUploads([take]);
  await putStep(ad.id, "ads-shots", { scenarioId: "sc1", shots: { sh1: { imageTakes: [take.asset.id], adoptedImage: take.asset.id, clips: [], adoptedClip: null } } });

  const album = await putProject(newProject(uid, { title: "Night drive", logline: "", template: "music-video", discipline: "music-video", targetS: 180 }));
  await putStep(album.id, "music-video-source", { style: "neon", seed: 4 });

  const empty = await putProject(newProject(uid, { title: "Not yet", logline: "", template: "teaser", discipline: "trailer", targetS: 45 }));
  return { uid, film, ad, album, empty, theme, signedAt };
}

export async function v1Archive(uid: string): Promise<Uint8Array> {
  return bytesOf(exportAccount(uid));
}
