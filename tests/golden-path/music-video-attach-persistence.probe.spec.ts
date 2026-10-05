// LANE — A MUSIC-VIDEO ATTACH THAT DID NOT PERSIST SAYS SO (static ratchet).
//
// `attach` guarded the decode only. `putUploads` rejects on a storage failure
// (status stayed "decoding" forever) and `saveStep` RETURNS `{ok:false}` (the
// outcome was discarded, so the surface drew "done" with nothing on disk).
import { readFileSync } from "node:fs";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

test("attach guards putUploads and reads the save outcomes before drawing success", () => {
  const src = stripComments(readFileSync("app/_phases/research/useMusicVideoSource.ts", "utf8"));
  expect(src.length).toBeGreaterThan(0);

  expect(src).toMatch(/try\s*\{\s*await putUploads\(\[pair\]\);\s*\}\s*catch/);
  expect(src).not.toMatch(/^\s*await write\(/m);
  expect(src).not.toMatch(/^\s*await markResearched\(/m);
  // The writes return an outcome the attach reads. `RecordWriteOutcome` since
  // the writes became record patches (phase-shared-A): SaveOutcome plus the
  // refusals, and `.ok` still decides.
  expect(src).toMatch(/Promise<(SaveOutcome|RecordWriteOutcome)>/);
  expect(src.indexOf("setEnvelope(env)")).toBeGreaterThan(src.indexOf("await markResearched()"));
});
