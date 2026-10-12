/**
 * THE CX REACH TABLE — one place that says how each named screen is reached.
 *
 * Shared by pipeline/cx-capture.mjs (photographs a screen) and
 * tests/live/legibility.live.spec.ts (measures a screen), so a screen id added
 * here appears in both and the two can never disagree about what "projects"
 * means. Pure data: no browser, no side effects, importable from either lane.
 */
export const PROJECT = process.env.CX_PROJECT ?? "seed-glass-harbor";

/** id -> how to reach it. `go` may navigate, click, and settle; it receives the
 *  page and must leave it on the screen the id names. */
export const SCREENS = {
  landing: { url: "/" },
  projects: { url: "/projects" },
  // seeded once, then emptied — see the `wipe` block below for why this is
  // NOT what a new account sees.
  "projects-empty": { url: "/projects", wipe: true },
  "wizard-discipline": { url: "/projects/new" },
  "wizard-template": { url: "/projects/new", picks: 1 },
  "wizard-style": { url: "/projects/new", picks: 2 },
  "wizard-name": { url: "/projects/new", picks: 3 },
  "studio-research": { url: `/studio/${PROJECT}?step=research` },
  "studio-script": { url: `/studio/${PROJECT}?step=script` },
  "studio-frames": { url: `/studio/${PROJECT}?step=frames` },
  // `via` — the steps the user passes THROUGH to get here, in order.
  //
  // A studio step does not only render, it WRITES: useFrames saves its derived
  // frames to the "frames" key, debounced 600ms, and the Score step downstream
  // reads that key. Jumping straight to ?step=score therefore photographs the
  // honest empty state ("this project has no frames for them to sit on") rather
  // than the populated screen — correct behaviour, wrong screen, and it read as
  // a failed acceptance until the cause was found (2026-09-08).
  //
  // Nobody reaches step 4 without passing step 3. Walking the upstream steps is
  // what the user does, so it is what the capture does.
  // Motion reads the frames record too, so it walks Frames first for the same
  // reason Score does.
  "studio-motion": { url: `/studio/${PROJECT}?step=motion`, via: ["frames"] },
  "studio-score": { url: `/studio/${PROJECT}?step=score`, via: ["frames"] },
  "studio-cut": { url: `/studio/${PROJECT}?step=cut`, via: ["frames", "score"] },
  // The Outputs shelf is not a route: it is the header button, opened over a step.
  // It reads this project's own frames and score, so it walks both first.
  "studio-outputs": { url: `/studio/${PROJECT}?step=cut`, via: ["frames", "score"], open: "Outputs" },
  "library-styles": { url: "/library" },
  "library-assets": { url: "/library", tab: "Assets" },
  "library-animations": { url: "/library", tab: "Animations" },
  playground: { url: "/playground" },
  foundry: { url: "/foundry" },
  kit: { url: "/kit" },
  "kit-law": { url: "/kit", tab: "Law" },
  "kit-parts": { url: "/kit", tab: "Parts" },
  "kit-migration": { url: "/kit", tab: "Migration" },
};
