import "server-only";

import { FIXTURE_MODE } from "../../../../lib/fixtures/mode.ts";
import { outPath } from "../../../../lib/fixtures/roots.ts";

// WHERE A v1 STORE LIVES IN THE UNIVERSE THE SYNC PROJECTS.
//
// The v1 stores below never learned the fixture switch (lib/fixtures/mode.ts): their
// root is `foundry-out/<x>` in both universes, with at most an env override (strips
// was one until Phase 4 L33 gave lib/foundry/strips/store.ts `stripsRoot()`, which
// picks the universe itself; ./strips.ts reads it there) -
//   articles  lib/articles/store.ts storeRoot(), ARTICLES_STORE_DIR (deliberately
//             unmoved: lib/fixtures/mode.ts calls Articles "real in both universes")
//   turns     lib/turns/ledger.ts turnDir(), TEXT_TURN_DIR
//   spend     lib/spend/fileStore.ts spendStoreDir(), SPEND_STORE_DIR
//   clips     lib/imaging/video/store.ts clipRoot(), CLIP_STORE_DIR
// Projected as v1 reads them, a fixture-universe sync would put REAL records
// into the fixture ledger under `data.src: "fixture"` - the one mislabel
// types.ts `Universe` exists to make impossible. So the adapter, not lib/
// (which this lot may not change), decides: v1's own override wins when it is
// set (a probe pointed it somewhere on purpose); else the fixture universe
// reads `fixtures-out/<x>`, which pipeline/fixtures/work.ts writes; else v1's
// own root. The price, named in the lot report: in the fixture universe the
// Ledger shows fixture articles while v1's /articles shows real ones.

/** The directory a v1 store's reader should list in this process's universe. */
export function universeRoot(sub: string, v1Root: () => string, override?: string): string {
  if (override !== undefined && (process.env[override]?.trim() ?? "") !== "") return v1Root();
  return FIXTURE_MODE ? outPath(sub) : v1Root();
}
