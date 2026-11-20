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
  //   studio-<step>   that step's part editor on a seeded project that has one (frames, score and
  //                   cut on the trailer: made; motion on why-bitcoin: nothing to direct yet)
  //   studio-outputs  the Project's Plan: its parts are what it produced, every number the same
  //                   one its editors draw
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
  "kit-parts": { url: "/kit/signal#signal" },
  "kit-migration": { url: "/kit/signal#status" },
  // spark character-cores WP3: the track-locked Timeline's specimen.
  "kit-timeline": { url: "/kit/production#timeline" },
  // The part editors (Phase 4 wave C, L38): a part of a seeded project, reached as its Plan row
  // reaches it. The fixture part side seeds these two projects' own records (their notebook,
  // their beat board), so each screen draws real work, not an empty state. why-bitcoin's script
  // is its Plan's running turn: the document draws with that job in flight.
  "part-research-notebook": { url: "/projects/why-bitcoin/research" },
  "part-script-document": { url: "/projects/why-bitcoin/script" },
  "part-research-beats": { url: "/projects/glass-harbor-trailer/research" },
  "part-script-trailer": { url: "/projects/glass-harbor-trailer/script" },
  // L39/L40 and the fixture world (2026-11-09): a part's records are projected from its Plan row
  // (projects/[id]/_part/fixtureWorld/), so a screen shows what its project's Plan claims, made or
  // unmade, on a fresh server with no session act. Glass Harbor's trailer is ratified to the cut:
  // its frames, motion, score and cut are MADE (plates composed, every shot moving with its clip,
  // cues spotted with takes, the animatic exported). The cinematic is a cut of the same film that has
  // made nothing after Script: its editors are the trailer's UNMADE states (`-empty`). The
  // explainer's frames wait for Script's adopt, and why-bitcoin's script is the turn in flight, so
  // its motion has no plate to direct.
  "part-frames-shots": { url: "/projects/glass-harbor-trailer/frames" },
  "part-frames-shots-empty": { url: "/projects/glass-harbor-cinematic/frames" },
  "part-frames-assembly": { url: "/projects/why-bitcoin/frames" },
  // a failed frames job: its plates culled at the gate, the job's own sentence drawn over the editor
  "part-frames-failed": { url: "/projects/the-quiet-tariff/frames" },
  "part-motion-plates": { url: "/projects/glass-harbor-trailer/motion" },
  "part-motion-empty": { url: "/projects/why-bitcoin/motion" },
  "part-score-spotting": { url: "/projects/glass-harbor-trailer/score" },
  "part-score-spotting-empty": { url: "/projects/glass-harbor-cinematic/score" },
  "part-cut-timeline": { url: "/projects/glass-harbor-trailer/cut" },
  "part-cut-timeline-empty": { url: "/projects/glass-harbor-cinematic/cut" },
  // the explainer's voice and strips wait on their runs (its article is written; its strips queue)
  "part-explainer-strips": { url: "/projects/provider-routing-explainer/strips" },
  "part-explainer-voice": { url: "/projects/provider-routing-explainer/voice" },
  "kit-part": { url: "/kit/production#part" },
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
  // scout-canvas   the same graph as a map (docs/scout-canvas-port.md): basins, rivers, weirs, the toolbar and docks.
  "scout-canvas": { url: "/scout/canvas" },
  // the production basin's street (spark character-cores S1, fixture side): Unlatched's first minute on the timeline
  // street (the production's only street since 2026-11-20; the river and film-strip ids retired with them), its core
  // picker, a swap's preview (elif: frames drawn by the experiment; kaori: none drawn yet, pending), and the stale state
  // after an accept (mirela; the accept holds for the dev server's life, so this id comes last).
  "scout-canvas-street": { url: "/scout/canvas?street=unlatched" },
  "scout-canvas-cores": { url: "/scout/canvas?street=unlatched&tray=1" },
  "scout-canvas-swap": { url: "/scout/canvas?street=unlatched&swap=chr%3An01-elif" },
  "scout-canvas-swap-pending": { url: "/scout/canvas?street=unlatched&swap=chr%3An03-kaori" },
  // the timeline street's overlays (S1.5 WP7): a keyframe, a take with its verdict, a plate - each a press on the street
  "scout-canvas-kf-overlay": { url: "/scout/canvas?street=unlatched", open: "B07, keyframes" },
  "scout-canvas-clip-overlay": { url: "/scout/canvas?street=unlatched", open: "K02, clips" },
  "scout-canvas-plate-overlay": { url: "/scout/canvas?street=unlatched", open: "SETUP-C, look" },
  "scout-canvas-stale": { url: "/scout/canvas?street=unlatched&swap=chr%3An02-mirela", open: "Accept" },
  // another device's production (spark device-metadata-sync KS3, fixture side: Unlatched as studio-pc holds it; both
  // rivers and studio-pc's facts sit in `scout-canvas`'s Productions basin): its street read-only, a take's overlay
  // with studio-pc's verdict as text and its media "on studio-pc", and a swap asked by link and refused in the street's
  // error line. (A core held by two devices is on scout-canvas-cores: Hana, whom studio-pc holds pictures of too.)
  "scout-canvas-foreign-street": { url: "/scout/canvas?street=unlatched-studio-pc" },
  "scout-canvas-foreign-clip": { url: "/scout/canvas?street=unlatched-studio-pc", open: "K01, clips" },
  "scout-canvas-foreign-refused": { url: "/scout/canvas?street=unlatched-studio-pc&swap=chr%3An01-elif" },
  // (scout-muse, the muse wing's graph, retired with the wing - spark scout-vision S3: the archive's nodes are in `scout`.)
  // scout-runs   the Runs tab: every scout night and seed batch on the rail, the newest open one on the Board desk.
  "scout-runs": { url: "/scout/runs" },
  // reels          the reel studio's overview (spark reel-studio) on the fixture side: ten reels, one per film stage,
  //                in each of the three views behind its switch (filmstrip rows, poster grid, stage board).
  // reels-review   one reel at its film stop: the two linked players, the strip, the verdict bar, a past round.
  reels: { url: "/reels" },
  "reels-posters": { url: "/reels?view=posters" },
  "reels-stages": { url: "/reels?view=stages" },
  "reels-review": { url: "/reels/towers-of-light" },
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
  // the cover desk (spark track-mirror-studio) over the dev-only fixture (_cover/desk/fixture.ts), one cover per
  // state among a history; a store with no covers draws the upload instead. One row per station a state opens on.
  "audio-cover": { url: "/audio?s=cover&fixture=judging" },
  "audio-cover-empty": { url: "/audio?s=cover&fixture=empty" },
  "audio-cover-draft": { url: "/audio?s=cover&fixture=draft" },
  "audio-cover-failed": { url: "/audio?s=cover&fixture=failed" },
  "audio-cover-picked": { url: "/audio?s=cover&fixture=picked" },
  "audio-cover-remixed": { url: "/audio?s=cover&fixture=remixed" },
  // Spark suno-advisor: the scripted Suno conversation, and its kit pieces.
  "audio-suno": { url: "/audio?s=studio&source=fixture&session=night-drive" },
  "kit-suno": { url: "/kit/audio#suno" },
  // Spark yue2-song-lab S2: the knockout on the fixture side (the contest's staged field, a scripted
  // agent) - the main draw with its first match glowing; the post · s3 draw with its upset quarter-final
  // open in the booth, revealed (that draw opens with its quarter-finals judged); the field sheet open.
  "audio-songlab": { url: "/audio?s=songlab&source=fixture" },
  "audio-songlab-match": { url: "/audio?s=songlab&source=fixture&d=037e2bd84636&m=QF-2" },
  "audio-songlab-field": { url: "/audio?s=songlab&source=fixture&f=1" },
  // Spark audio-distribution: the release wizard on its fixture - the picker, and the ready EP opened at its first step.
  "audio-release": { url: "/audio?s=release&source=fixture" },
  "audio-release-open": { url: "/audio?s=release&source=fixture&r=rel-0000000000b2" },
  // Spark studio-to-release: the studio's package stage (the dock layout) and its release stage, on the fixture.
  "audio-package": { url: "/audio?s=studio&source=fixture&session=night-drive&stage=package&r=rel-0000000000a1" },
  "audio-release-stage": { url: "/audio?s=studio&source=fixture&session=night-drive&stage=release&r=rel-0000000000b2" },
  "kit-songlab": { url: "/kit/audio#songlab" },
};
