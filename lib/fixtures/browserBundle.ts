// THE BROWSER HALF OF THE FIXTURE UNIVERSE — what pipeline/fixtures writes to
// <fixtures-out>/browser.json and lib/fixtures/seedBrowser.ts writes into
// IndexedDB. Types only, so the generator (Node) and the seeder (browser) agree
// on one shape. Everything the browser owns is here: themes and assets (Library
// · Styles / Assets, Board · Proofs), the bytes of uploads, and per-project step
// records (Board · Adoption / Alternatives / Triage).
//
// Projects themselves are NOT in the bundle: app/_studio/projectSeed.ts already
// is the project fixture, and the step records below are keyed to its ids.

import type { Asset } from "../assets";
import type { Theme } from "../themes";

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
  themes: Theme[];
  assets: Asset[];
  uploads: BundleUpload[];
  steps: BundleStep[];
}
