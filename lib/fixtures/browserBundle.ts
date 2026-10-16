// THE BROWSER HALF OF THE FIXTURE UNIVERSE — what pipeline/fixtures writes to
// <fixtures-out>/browser.json and lib/fixtures/seedBrowser.ts writes into
// IndexedDB. Types only, so the generator (Node) and the seeder (browser) agree
// on one shape. Everything the browser owns is here: v1 themes and shelf assets
// with the bytes of uploads, and per-project step records.
//
// THE THEME AND ASSET ROWS ARE v1's, AS v1 STORED THEM. Their writers and readers
// (lib/themes.ts, lib/assets.ts, the v1 Library) retired in Phase 5; what still
// reads these rows is the import (/projects/import -> lib/import/shelf.ts), which
// takes them into the Style store and the Library index. The fixture keeps them
// so that screen has an account to import. The shapes below are copied from
// those retired modules, field for field.
//
// Projects themselves are NOT in the bundle: app/_studio/projectSeed.ts already
// is the project fixture, and the step records below are keyed to its ids.

import type { Discipline } from "@gt/catalog/projects";
import type { StyleBlock } from "@gt/catalog/style";

export type V1ProofState = "pending" | "approved" | "rejected";

/** v1 lib/themes.ts `Proof`: one rendered reference, its bytes inline. */
export interface V1Proof {
  id: string;
  label: string;
  base64: string;
  mime: string;
  state: V1ProofState;
  note?: string;
  model?: string;
  provider?: string;
  costUsd?: number;
  trialId?: string;
  blockDigest?: string;
  createdAt: number;
}

/** v1 lib/themes.ts `Theme`. */
export interface V1Theme {
  id: string;
  uid: string;
  name: string;
  origin: "scratch" | "preset" | "screenshot" | "plate" | "foundry";
  presetId?: string;
  foundryStyleId?: string;
  discipline?: Discipline;
  block: StyleBlock;
  elements: string[];
  proofs: V1Proof[];
  createdAt: number;
  updatedAt: number;
  lockedAt?: number;
}

/** v1 lib/assets.ts `Asset`: a shelf row; `src` a pointer (lib/shelfPointers.ts) or a URL. */
export interface V1Asset {
  id: string;
  uid: string;
  path: string[];
  name: string;
  src: string;
  kind: "image" | "audio";
  meta?: Record<string, unknown>;
  createdAt: number;
}

/** Stands in for the signed-in uid on every `uid` field; the seeder swaps it. */
export const UID_TOKEN = "__fixture_uid__";

export interface BundleStep {
  projectId: string;
  /** The phase key stepStore writes under, e.g. "frames-alts". */
  phase: string;
  data: unknown;
  /** Record version, when the phase's record def is not at SCHEMA_VERSION. */
  v?: number;
}

export interface BundleUpload {
  id: string;
  mime: string;
  base64: string;
}

export interface BrowserBundle {
  version: 1;
  /** Content hash of everything below. A changed bundle re-seeds; an unchanged
   *  one is skipped. */
  seedId: string;
  themes: V1Theme[];
  assets: V1Asset[];
  uploads: BundleUpload[];
  steps: BundleStep[];
}
