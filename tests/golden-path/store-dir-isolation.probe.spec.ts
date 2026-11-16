// LANE - EVERY `*_STORE_DIR` lib/ READS IS ISOLATED CENTRALLY.
//
// playwright.config.ts gives each name in STORE_DIR_NAMES its own temp directory. This scans lib/ for the
// names it reads and fails with the first one the list lacks. Zero names found fails too: a broken
// matcher must not pass. An exception is a named, commented entry in STORE_DIR_EXEMPT (playwright.config.ts).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { STORE_DIR_EXEMPT, STORE_DIR_NAMES } from "../../playwright.config";

const LIB = path.resolve(__dirname, "../../lib");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const libStoreDirNames = (): string[] => {
  const found = new Set<string>();
  for (const f of walk(LIB)) for (const m of readFileSync(f, "utf8").matchAll(/\b[A-Z][A-Z_]*_STORE_DIR\b/g)) found.add(m[0]);
  return [...found].sort();
};

test("the scan of lib/ finds store dir names", () => {
  expect(libStoreDirNames().length, "the matcher found no *_STORE_DIR in lib/").toBeGreaterThan(0);
});

test("every *_STORE_DIR lib/ reads is on the central list", () => {
  const listed = new Set<string>(STORE_DIR_NAMES);
  const missing = libStoreDirNames().filter((n) => !listed.has(n) && !(n in STORE_DIR_EXEMPT));
  expect(missing, `not isolated in playwright.config.ts STORE_DIR_NAMES: ${missing.join(", ")}`).toEqual([]);
});

test("each listed name is set to a directory in this process", () => {
  for (const n of STORE_DIR_NAMES) expect(process.env[n], n).toBeTruthy();
});

test("an exemption names a name lib/ still reads and is not also isolated", () => {
  const read = new Set(libStoreDirNames());
  for (const n of Object.keys(STORE_DIR_EXEMPT)) {
    expect(read.has(n), `${n} is exempt but lib/ no longer reads it`).toBe(true);
    expect((STORE_DIR_NAMES as readonly string[]).includes(n), `${n} is both listed and exempt`).toBe(false);
  }
});
