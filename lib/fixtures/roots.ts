// SERVER-ONLY DISK ROOTS for the stores fixture mode redirects. Kept apart from
// ./mode.ts so the client bundle never sees `node:path`.

import path from "node:path";

import { FIXTURE_MODE, OUT_DIRNAME } from "./mode";

/** `<cwd>/<foundry-out | fixtures-out>/<...segments>` */
export function outPath(...segments: string[]): string {
  return path.join(process.cwd(), OUT_DIRNAME, ...segments);
}

/** Where the Foundry's versioned indices (styles.json, ledger.json,
 *  training-ledger.json, the catalogue journal and lock) live. Real use keeps
 *  them in pipeline/foundry, where they are git-tracked; fixture mode moves
 *  them under the fixture output so a test commit cannot dirty the repo. */
export function catalogueDir(): string {
  return process.env.FOUNDRY_DIR || (FIXTURE_MODE ? outPath("catalogue") : path.join(process.cwd(), "pipeline", "foundry"));
}

/** The Sound lab's verdict/lesson ledger — git-tracked in real use. */
export function soundLedgerFile(): string {
  return FIXTURE_MODE ? outPath("sound-ledger.json") : path.join(process.cwd(), "pipeline", "sound", "ledger.json");
}
