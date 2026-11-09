// THE RUNS THE LIBRARY FILES ITS ITEMS UNDER - the sources whose feed writes a `run` collection
// with the source's own run id (./feeds/foundry.ts forge, extract, dojo and strips; ./feeds/scout.ts
// a night). A door to "what run X made" (`f=run:<id>`) is offered only for these: the run facet is
// one value space across sources, so a seeds batch dated like a scout night (both `2026-11-08`)
// would otherwise count - and open - the night's items as its own. Client-safe: plain data.

export const LIBRARY_RUN_SOURCES: ReadonlySet<string> = new Set(["forge", "extract", "dojo", "strips", "scout"]);
