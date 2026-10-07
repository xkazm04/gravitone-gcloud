// FIXTURE MODE — the second data universe: a complete, guessed-from-schema
// studio that exists to be developed and tested against, while the default
// universe stays the one real work lives in.
//
// ONE SWITCH, READ IN BOTH HALVES OF THE APP. `NEXT_PUBLIC_GRAVITONE_DATA=fixtures`
// is a NEXT_PUBLIC_ variable on purpose: the browser half (IndexedDB name) and
// the server half (disk roots) must agree, and a second variable is a second
// place for them to disagree. No Node imports here — this file is bundled into
// the client.
//
//   server   every store that backs Library · Board · Calendar · Sound lab ·
//            Foundry reads `OUT_DIRNAME` instead of the literal `foundry-out`,
//            and the Foundry's versioned indices move to `<OUT_DIRNAME>/catalogue`
//            (see lib/fixtures/roots.ts) — so a fixture run can never write
//            into pipeline/foundry/*.json, which is git-tracked evidence.
//   browser  one IndexedDB, `gravitone-studio-fixtures`, seeded from
//            /api/fixtures/browser (lib/fixtures/seedBrowser.ts). Same origin
//            as real use is fine: the database name is what separates them.
//
// DELIBERATELY NOT MOVED: the Articles store (foundry-out/articles). It holds
// real posts and is the one surface that is real in both universes.

export const FIXTURE_MODE = process.env.NEXT_PUBLIC_GRAVITONE_DATA === "fixtures";

/** The output directory every disk store hangs off. */
export const OUT_DIRNAME = FIXTURE_MODE ? "fixtures-out" : "foundry-out";

/** The IndexedDB every browser-side store lives in. */
export const STUDIO_DB_NAME = FIXTURE_MODE ? "gravitone-studio-fixtures" : "gravitone-studio";
