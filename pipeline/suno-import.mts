// IMPORT THE SUNO LIBRARY — `npm run suno:import`.
//
// The same import the audio canvas runs from a triage cell's menu
// (lib/sound/suno/library.ts), without the app: every finished, untrashed song
// in the operator's Suno library becomes a clip in the gate's triage (origin
// "library", ungrouped, unjudged). Free and read-only on Suno's side; it needs
// the signed-in profile (`npm run suno:browser`) and writes suno.json in the
// sound store (foundry-out/sound, or SOUND_STORE_DIR). Idempotent by song id:
// a re-run adds 0.
//
// Prints `added N, skipped M, total T` and exits 0; a failure prints the
// driver's sentence and exits 1.

import { errorMessage } from "@gt/domain/errors";
import { importSunoLibrary } from "../lib/sound/suno/library";
import { sunoFile } from "../lib/sound/suno/store";

async function main() {
  console.log(`suno library -> ${sunoFile()}`);
  const r = await importSunoLibrary((n) => process.stdout.write(`\r  read ${n} clips`));
  process.stdout.write("\n");
  console.log(`added ${r.added}, skipped ${r.skipped}, total ${r.total}`);
}

main().then(
  // The CDP connection would hold the event loop open; the operator's Chrome
  // stays up (the driver never closes it), only this process ends.
  () => process.exit(0),
  (e: unknown) => {
    console.error(errorMessage(e));
    process.exit(1);
  },
);
