/**
 * THE CX REACH TABLE — one place that says how each named screen is reached.
 *
 * Shared by pipeline/cx-capture.mjs (photographs a screen) and
 * tests/live/legibility.live.spec.ts (measures a screen), so a screen id added
 * here appears in both and the two can never disagree about what "projects"
 * means. Pure data: no browser, no side effects, importable from either lane.
 */
export const PROJECT = process.env.CX_PROJECT ?? "glass-harbor-trailer";

/** id -> how to reach it. `go` may navigate, click, and settle; it receives the
 *  page and must leave it on the screen the id names. */
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
  "library-styles": { url: "/library" },
  "library-assets": { url: "/library", tab: "Assets" },
  "library-next": { url: "/library-next" },
  "library-next-detail": { url: "/library-next?kind=style&sel=style-0006" },
  "library-animations": { url: "/library", tab: "Animations" },
  playground: { url: "/playground" },
  foundry: { url: "/foundry" },
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
};
