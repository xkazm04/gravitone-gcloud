// File helpers the steps share: copy a directory tree, and test that a path exists.
// Its own file because the agent steps, the critique, the rework archive and the check
// loop all copy run files, and none of them should own the copy.

import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

export async function copyDir(from: string, to: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(from, { withFileTypes: true });
  } catch {
    return out;
  }
  await mkdir(to, { recursive: true });
  for (const e of entries) {
    if (e.isDirectory()) out.push(...(await copyDir(path.join(from, e.name), path.join(to, e.name))).map((p) => `${e.name}/${p}`));
    else if (e.isFile()) {
      await copyFile(path.join(from, e.name), path.join(to, e.name));
      out.push(e.name);
    }
  }
  return out;
}

export const fileExists = (f: string) => stat(f).then(() => true, () => false);
