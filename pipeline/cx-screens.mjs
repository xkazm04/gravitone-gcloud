/**
 * THE CX REACH TABLE — one place that says how each named screen is reached.
 *
 * Shared by pipeline/cx-capture.mjs (photographs a screen) and
 * tests/live/legibility.live.spec.ts (measures a screen), so a screen id added
 * here appears in both and the two can never disagree about what "projects"
 * means. Pure data: no browser, no side effects, importable from either lane.
 */
export const PROJECT = process.env.CX_PROJECT ?? "glass-harbor-trailer";

/** id -> how to reach it: a `url`, then the optional `open`, `tab`, `follow` and `picks` steps
 *  each lane applies in that order to leave the page on the screen the id names. */
export const SCREENS = {
  landing: { url: "/" },
  // PHASE 4 WAVE D (L43): v1's shelf, wizard and studio retired and redirect to the Project; the
  // ids stay (plan §5.7: re-mapped here, the vocabulary stays), each anchored on the screen that
  // does the job now. The Projects screens read the produce port, so like the part-* ids below they
  // are reached on its fixture side (GRAVITONE_PRODUCE_SIDE=fixture - the live lane's server; for
  // cx-capture, set it on the dev server).
  //   projects        the composition list, opened on its first project's Plan
  //   projects-empty  an account with no compositions has v1 browser projects or nothing: the
  //                   one-click import is its screen (an empty list needs an empty store, which
  //                   a browser cannot wipe the way v1's IndexedDB could)
  //   wizard-*        Compose, the dialog that replaced the four wizard stages
  //   studio-<step>   that step's part editor on a seeded project that has one
  //   studio-outputs  the Project's Plan: its parts are what it produced
  projects: { url: "/projects" },
  "projects-empty": { url: "/projects/import" },
  "wizard-discipline": { url: "/projects?compose=1" },
  "wizard-template": { url: "/projects?compose=1" },
  "wizard-style": { url: "/projects?compose=1" },
  "wizard-name": { url: "/projects?compose=1" },
  "studio-research": { url: "/projects/why-bitcoin/research" },
  "studio-script": { url: "/projects/why-bitcoin/script" },
  "studio-frames": { url: `/projects/${PROJECT}/frames` },
  "studio-motion": { url: "/projects/why-bitcoin/motion" },
  "studio-score": { url: `/projects/${PROJECT}/score` },
  "studio-cut": { url: `/projects/${PROJECT}/cut` },
  "studio-outputs": { url: `/projects/${PROJECT}` },
  "library": { url: "/library" },
  "library-detail": { url: "/library?kind=style&sel=style-0006" },
  // a muse character's detail (spark scout-use-aim): her card chips, the looks she was kept in, the core prompt
  "library-character": { url: "/library?kind=character&sel=character%3Amuse%3Asofia" },
  // a genre's detail (spark scout-vision S2): its rung on the ladder, kept trials, grammar, the kept piece playing, its venture
  "library-genre": { url: "/library?kind=genre&sel=genre%3Agn-deadpan-office-satire-painted-3d" },
  // a venture's detail: its kind and frame, its genres as doors, the proposal it was born from
  "library-venture": { url: "/library?kind=venture&sel=venture%3Avn-quiet-desk" },
  // a game asset's detail (spark game-3d-assets): the fixture's rigged hero, its 3D viewer, gates and export
  "library-model": { url: "/library?kind=model&sel=model%3Amesh%3Ahooded-archer%3At2-a" },
  // `playground` and `foundry` retired in Phase 6 wave C with their pages: each URL is a redirect
  // now (`/playground` -> `/audio`, `/foundry` -> `/floor`), and a screen id that photographs a
  // redirect would only duplicate `audio` and `floor` below.
  // The new world's kit (app/(studio)/kit, 2026-10-15). v1's Almanac kit had Law, Parts and
  // Migration tabs; it retired whole, and the ids were kept (plan §5.7: ids are re-mapped
  // here, the vocabulary stays) as anchors of the nearest section of the one page: the
  // token law, the component specimens, and the status table that replaced the five copies.
  kit: { url: "/kit" },
  "kit-law": { url: "/kit#colour" },
  "kit-parts": { url: "/kit#signal" },
  "kit-migration": { url: "/kit#status" },
  // The part editors (Phase 4 wave C, L38): a part of a seeded project, reached as its Plan row
  // reaches it. The fixture part side seeds these two projects' own records (their notebook,
  // their beat board), so each screen draws real work, not an empty state.
  "part-research-notebook": { url: "/projects/why-bitcoin/research" },
  "part-script-document": { url: "/projects/why-bitcoin/script" },
  "part-research-beats": { url: "/projects/glass-harbor-trailer/research" },
  "part-script-trailer": { url: "/projects/glass-harbor-trailer/script" },
  // L39: frames and motion. The trailer's frames are its composed spine's SHOTS (derived on read,
  // no adopt needed); the explainer's wait for Script's adopt, so its screen is the frame's own
  // "no adopted script" state until a session adopts one.
  "part-frames-shots": { url: "/projects/glass-harbor-trailer/frames" },
  "part-frames-assembly": { url: "/projects/why-bitcoin/frames" },
  "part-motion-plates": { url: "/projects/why-bitcoin/motion" },
  // L40: score, cut and the explainer's parts. Each draws its own project's records; on a fresh
  // server the trailer's score and cut wait on its frames record (a plate render writes it), the
  // explainer's voice and strips on their runs - the screens show those states until a session acts.
  "part-score-spotting": { url: "/projects/glass-harbor-trailer/score" },
  "part-cut-timeline": { url: "/projects/glass-harbor-trailer/cut" },
  "part-explainer-strips": { url: "/projects/provider-routing-explainer/strips" },
  "part-explainer-voice": { url: "/projects/provider-routing-explainer/voice" },
  "kit-part": { url: "/kit#part" },
  // PHASE 6 (L61): the new world's own screens, which had no id - the legibility lane walked them
  // by route (studio-routes.live) and nothing photographed them.
  //   floor           the hub: four lanes, Foundry -> Weir -> shelf, the Calendar rail
  //   floor-calendar  the rail opened into the month (`?cal=1`, a link can carry it)
  //   board           a packet's Board as a reload or a pasted link opens it: full page
  //   board-sheet     the same Board as a sheet over the Floor. Only a SOFT navigation is
  //                   intercepted by @sheet/(.)board, so the URL alone cannot reach it: it is
  //                   the Floor's first pile, clicked
  //   ledger, runs    the event log, and the runs a project's parts were made by
  //   library-style   one style's atelier, on the fixture side's seeded style
  //   audio           the Audio lane's desk
  // `follow` is data, not a function, so both lanes can read it: after `url` settles, take the
  // first element matching `selector`; `nav: "goto"` loads its href (a hard load, as a pasted
  // link is), `nav: "click"` clicks it (a soft navigation, as the operator's own click is). The
  // board's packet is whichever pile the Floor shows first, rather than a fixed id, because the
  // Board answers from the real side (board/_port/port.ts SIDE) and a hard-coded packet would be a
  // claim about one machine's stores.
  floor: { url: "/floor" },
  "floor-calendar": { url: "/floor?cal=1" },
  // the slot record over the month: a failed YouTube upload (quota), fixture side
  "floor-slot": { url: "/floor?cal=1&slot=sl-chokepoint-quota" },
  // the schedule sheet over the month (v1 Composer absorbed), on a future day
  "floor-schedule": { url: "/floor?cal=1&new=1&day=2030-01-14" },
  board: { url: "/floor", follow: { selector: "a[href^='/board/']", nav: "goto" } },
  "board-sheet": { url: "/floor", follow: { selector: "a[href^='/board/']", nav: "click" } },
  // board-scout   a /scout night's morning packet (pkt:scout:<night>): the Floor's first scout
  //               pile, so - like `board` - it photographs whichever closed night THIS machine's
  //               scout store holds, and refuses when it holds none.
  "board-scout": { url: "/floor", follow: { selector: "a[href^='/board/pkt%3Ascout%3A']", nav: "goto" } },
  // scout          the scout's decision graph (spark scout-decision-graph): every branch's bands, stage columns,
  //                effort and the split. Reads the produce port's side: the fixture universe on the fixture lane.
  scout: { url: "/scout" },
  // (scout-muse, the muse wing's graph, retired with the wing - spark scout-vision S3: the archive's nodes are in `scout`.)
  // scout-runs   the Runs tab: every scout night and seed batch on the rail, the newest open one on the Board desk.
  "scout-runs": { url: "/scout/runs" },
  ledger: { url: "/ledger" },
  runs: { url: "/projects/runs" },
  "library-style": { url: "/library/style/painted-3d" },
  audio: { url: "/audio" },
  "audio-arrange": { url: "/audio?s=arrange" },
  "audio-arrange-sfx": { url: "/audio?s=arrange&kind=sfx" },
  "audio-effects": { url: "/audio?kind=sfx" },
  "audio-hunt": { url: "/audio?s=hunt" },
  "audio-hunt-open": { url: "/audio?s=hunt&h=hn-c24d408353" },
  "audio-hunt-sfx": { url: "/audio?s=hunt&kind=sfx&h=hn-efdbee99ac" },
  "audio-lessons": { url: "/audio?s=lessons" },
  "audio-strengths": { url: "/audio?s=strengths" },
  "audio-rubric": { url: "/audio?s=rubric" },
  "audio-batch": { url: "/audio?s=batch" },
  "audio-batch-sfx": { url: "/audio?s=batch&kind=sfx" },
};
