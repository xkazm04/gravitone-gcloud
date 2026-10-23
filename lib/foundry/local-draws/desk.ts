import "server-only";

// A desk night is a scout-shaped manifest that does not live under the scout
// root. listNights, taste.md, the library feed and the lead queue never read
// it. The Board opens it by id when the scout store has no night of that id.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { FoundryError, containedIn } from "../runStore.ts";
import { NIGHT_ID_RE, type Night } from "../scout/types.ts";
import { drawsRoot } from "./read.ts";

function deskDir(id: string): string {
  const root = drawsRoot();
  if (!root) throw new FoundryError("GRAVITONE_LOCAL_DRAWS is unset.", 404);
  if (!NIGHT_ID_RE.test(id)) throw new FoundryError("That is not a night id.", 400);
  return path.join(root, "nights", id);
}

/** The desk manifest, or null when this id is not a desk night. */
export async function readDeskNight(id: string): Promise<Night | null> {
  if (!NIGHT_ID_RE.test(id) || drawsRoot() === null) return null;
  try {
    const text = await readFile(path.join(deskDir(id), "night.json"), "utf8");
    const night = JSON.parse(text) as Night;
    return night.id === id ? night : null;
  } catch {
    return null;
  }
}

/** Write the manifest back. Used when the Board commits a desk night. */
export async function saveDeskNight(night: Night): Promise<void> {
  const dir = deskDir(night.id);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "night.json");
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(night, null, 2), "utf8");
  await rename(tmp, file);
}

/** One file inside the desk night. A path that climbs out is a 400. */
export function deskAbs(id: string, rel: string): string {
  return containedIn(deskDir(id), rel, false, "draw");
}

/** The studio file route for one desk file. The run id is `nights/<id>`. */
export function deskCellUrl(id: string, rel: string): string {
  return `/api/local-draws/file?${new URLSearchParams({ run: `nights/${id}`, path: rel }).toString()}`;
}
