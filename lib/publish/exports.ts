// FINISHED EXPORTS — what there is to publish. Server-only.
//
// Two producers write here. The Cut step's music-video export
// (lib/musicVideoExport.ts) writes `<uuid>.mp4` under
// `foundry-out/music-video-exports/` (its OUT_ROOT and exportFilePath). The
// Cut's animatic export (lib/cutExport.ts) writes to `exportsRoot()` below, so
// it lands wherever this lister reads, and its `<id>.json` sidecar carries the
// projectId plus the finish line's verdicts at export time. The export id IS
// the uuid, so an ExportRef's id round-trips to the file through the same
// convention the download routes use.
//
// projectId IS null WHEN NO SIDECAR SAYS OTHERWISE, AND THAT IS THE TRUTH
// RATHER THAN A GAP PAPERED OVER. A `<id>.json` sidecar with a string
// `projectId` is read; without one the scheduler asks the caller for the
// project instead of inventing one.
//
// A mux in progress never carries a listed name: both producers encode to
// `<id>.partial.mp4`, which fails ID_RE below, and rename on success
// (lib/export/headless.ts, landExport).

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { ExportRef } from "./types";

export function exportsRoot(): string {
  const env = process.env.PUBLISH_EXPORTS_DIR?.trim();
  return env ? path.resolve(env) : path.join(process.cwd(), "foundry-out", "music-video-exports");
}

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

async function sidecarProjectId(dir: string, id: string): Promise<string | null> {
  try {
    const raw = JSON.parse(await readFile(path.join(dir, `${id}.json`), "utf8")) as { projectId?: unknown };
    return typeof raw.projectId === "string" && raw.projectId.trim() ? raw.projectId : null;
  } catch {
    return null;
  }
}

/** Newest first. A missing directory is an empty shelf, not an error. */
export async function listExports(): Promise<ExportRef[]> {
  const dir = exportsRoot();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: ExportRef[] = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".mp4")) continue;
    const id = name.slice(0, -4);
    if (!ID_RE.test(id)) continue;
    const full = path.join(dir, name);
    const st = await stat(full).catch(() => null);
    if (!st?.isFile()) continue;
    // birthtime is the creation instant where the filesystem keeps one; some
    // report 0 (epoch), and then the last write is the honest stand-in
    const created = st.birthtimeMs > 0 ? st.birthtime : st.mtime;
    out.push({ id, projectId: await sidecarProjectId(dir, id), path: full, bytes: st.size, createdAt: created.toISOString() });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** One export by id, or null when there is no such file. */
export async function getExport(id: string): Promise<ExportRef | null> {
  if (!ID_RE.test(id)) return null;
  const dir = exportsRoot();
  const full = path.join(dir, `${id}.mp4`);
  const st = await stat(full).catch(() => null);
  if (!st?.isFile()) return null;
  const created = st.birthtimeMs > 0 ? st.birthtime : st.mtime;
  return { id, projectId: await sidecarProjectId(dir, id), path: full, bytes: st.size, createdAt: created.toISOString() };
}

/** Caption sidecars published with the video when present: `<id>.srt` or `<id>.vtt`. */
export async function captionSidecar(id: string): Promise<string | null> {
  if (!ID_RE.test(id)) return null;
  for (const ext of [".srt", ".vtt"]) {
    const p = path.join(exportsRoot(), `${id}${ext}`);
    if (await stat(p).then((s) => s.isFile()).catch(() => false)) return p;
  }
  return null;
}
