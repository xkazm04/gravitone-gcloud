// THE PRODUCTION FIXTURE'S FILES (spark character-cores S1) - the media the canvas's fixture production draws: the
// Unlatched first minute's stills, takes, cut and track excerpt (`unlatched/`), the character cores' portraits and
// sheets (`cores/`), and the core-to-scene experiment's redrawn frames (`experiment/`, written by its own run). All of
// it sits under foundry-out/production-fixture/ (gitignored: third-party reference frames and a vendor-made film, never
// to be published), so the browser reaches it through the foundry file door as `kind=production`, and only here: one
// root, a run id from the door's own pattern, a path held inside it, images, mp4 and mp3 only.

import { stat } from "node:fs/promises";
import path from "node:path";

import { FoundryError, containedIn, runRoot } from "../runStore.ts";

/** The door serves these and nothing else from the production root: never json, never the experiment's notes. */
export const PRODUCTION_SERVABLE = new Set([".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mp3"]);

/** `foundry-out/production-fixture`, or PRODUCTION_FIXTURE_DIR (tests). Read per call. */
export function productionFixtureRoot(): string {
  const o = process.env["PRODUCTION_FIXTURE_DIR"]?.trim();
  return o ? path.resolve(o) : path.join(process.cwd(), "foundry-out", "production-fixture");
}

/** The browser's URL for one file: `run` is the first folder (`unlatched`, `cores`, `experiment`), `rel` the rest. */
export function productionFileUrl(run: string, rel: string): string {
  return `/api/foundry/file?${new URLSearchParams({ run, path: rel, kind: "production" }).toString()}`;
}

/** Resolve one file for the door: a run id, a contained path, a servable extension, a file that exists. */
export async function productionFileStat(run: string, rel: string): Promise<{ abs: string; size: number }> {
  const abs = containedIn(runRoot(productionFixtureRoot(), run, "production fixture folder"), rel, false, "production fixture folder");
  if (!PRODUCTION_SERVABLE.has(path.extname(abs).toLowerCase())) throw new FoundryError("Not a servable file.", 400);
  try {
    const s = await stat(abs);
    if (!s.isFile()) throw new Error("not a file");
    return { abs, size: s.size };
  } catch {
    throw new FoundryError("No such file in the production fixture.", 404);
  }
}
