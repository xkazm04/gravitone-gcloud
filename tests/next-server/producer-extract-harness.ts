import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// THE EXTRACT PRODUCER'S TEST WORLD - imported FIRST by every producer-extract
// test, because v1's run root (lib/foundry/extract/store.ts EXTRACT_ROOT) and the
// catalogue root are read when their modules load: a temp universe here, before
// anything under lib/ is imported, so no test writes foundry-out/ or
// pipeline/foundry/styles.json. Every store is a temp file; every vendor a fake.

export const ROOT = mkdtempSync(path.join(os.tmpdir(), "gt-l29-extract-"));
process.env["EXTRACT_STORE_DIR"] = path.join(ROOT, "extract");
process.env["FOUNDRY_DIR"] = path.join(ROOT, "catalogue");
mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }), "utf8");

export function disposeRoot(): void {
  rmSync(ROOT, { recursive: true, force: true });
}

/** A 1x1 PNG: a valid gallery image for v1's dimension check. */
export const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
export const uploads = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `g${i + 1}.png`, mime: "image/png" as const, base64: PNG }));

/** A gallery folder on disk, for the CLI. */
export function galleryDir(name: string, n: number): string {
  const dir = path.join(ROOT, "galleries", name);
  mkdirSync(dir, { recursive: true });
  for (const u of uploads(n)) writeFileSync(path.join(dir, u.name), Buffer.from(u.base64, "base64"));
  return dir;
}

let k = 0;
export const storeFile = (): string => path.join(ROOT, `kernel-${++k}.sqlite`);
