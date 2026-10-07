"use client";

// SEED THE BROWSER'S FIXTURE DATABASE — fixture mode only, called by AuthGate
// once a uid exists and before any gated page mounts, so no page ever reads an
// empty shelf and then re-reads a full one.
//
// IDEMPOTENT BY CONTENT. The bundle carries a `seedId` (hash of its contents);
// it is remembered in localStorage against the uid that was seeded, and an
// unchanged bundle for the same account is skipped. A changed one re-writes
// every row it names with `put`, which overwrites rather than duplicates — rows the bundle does not name (what a
// tester made by hand) are left alone.

import { seedProjects } from "@/app/_studio/projectSeed";
import { saveStep } from "@/app/_phases/_shared/stepStore";
import { FIXTURE_SEED_KEY } from "@/lib/identityEviction";
import { accessHeader } from "@/lib/imagingClient";

import { putAssets, putUploads, readUploadPointer, type UploadRecord } from "../assets";
import { addProjects } from "../projects";
import { putTheme } from "../themes";
import { UID_TOKEN, type BrowserBundle } from "./browserBundle";

/** The locked styles of browser.ts, assigned to the demo shelf so projects
 *  stand on a style the way a real one does. */
const PROJECT_THEMES: Record<string, string> = {
  "seed-glass-harbor": "th-fx-signal-ledger",
  "seed-why-bitcoin": "th-fx-signal-ledger",
  "seed-the-quiet-tariff": "th-fx-newsprint-cutout",
  "seed-two-hundred-days": "th-fx-newsprint-cutout",
  "seed-glass-harbor-trailer": "th-fx-harbor-noir",
};

// ONE LITERAL, NOT A KEY BUILT AT RUNTIME. The stamp used to carry the database
// name, which bought nothing - AuthGate calls this only in fixture mode, so the
// database it names is always the fixture one - and cost the thing that matters:
// lib/identityEviction.ts removes localStorage keys BY EXACT NAME (its own header
// argues the case against matching a pattern), and a key assembled from an
// imported constant is one the eviction owner cannot name. So the owner binds it
// and this file writes through that binding, which is the arrangement that
// cannot drift.
const stampKey = FIXTURE_SEED_KEY;

function stamp(): string | null {
  try {
    return localStorage.getItem(stampKey);
  } catch {
    return null;
  }
}

function remember(id: string): void {
  try {
    localStorage.setItem(stampKey, id);
  } catch {
    /* storage off: the next load re-seeds, which is idempotent */
  }
}

function blobOf(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function ensureBrowserFixtures(uid: string): Promise<void> {
  // The demo shelf first: the step records below are keyed to its ids, and the
  // localStorage "already offered" flag in useProjects must not decide this.
  await addProjects(seedProjects(uid).map((p) => ({ ...p, themeId: PROJECT_THEMES[p.id] }))).catch(() => undefined);

  // accessHeader() because the route is behind the read door. In fixture mode it
  // returns {} - a dev-auth session holds no ID token and the bundle holds no
  // secret - and `devOpen()` admits the request anyway; it is sent because the
  // door is what decides, not today's deployment (client-api-auth probe).
  const res = await fetch("/api/fixtures/browser", { cache: "no-store", headers: accessHeader() });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `fixtures: HTTP ${res.status}`);
  }
  const bundle = (await res.json()) as BrowserBundle;
  if (stamp() === `${uid}:${bundle.seedId}`) return;

  for (const t of bundle.themes) await putTheme({ ...t, uid });

  const uploads = new Map(bundle.uploads.map((u) => [u.id, u]));
  const pairs: { asset: BrowserBundle["assets"][number]; upload: UploadRecord }[] = [];
  const plain: BrowserBundle["assets"] = [];
  for (const a of bundle.assets) {
    const asset = { ...a, uid: a.uid === UID_TOKEN ? uid : a.uid };
    const id = readUploadPointer(a.src);
    const up = id ? uploads.get(id) : undefined;
    if (id && up) {
      const blob = blobOf(up.base64, up.mime);
      pairs.push({ asset, upload: { id, blob, mime: up.mime, bytes: blob.size } });
    }
    else plain.push(asset);
  }
  if (plain.length) await putAssets(plain);
  if (pairs.length) await putUploads(pairs);

  for (const s of bundle.steps) {
    const out = await saveStep(s.projectId, s.phase, s.data, s.v === undefined ? undefined : { v: s.v });
    if (!out.ok) throw new Error(`fixtures: ${s.projectId}:${s.phase} — ${out.trouble.message}`);
  }
  remember(`${uid}:${bundle.seedId}`);
}
