// WHAT THIS DEPLOYMENT CAN ACTUALLY DO — the honest capability matrix.
//
// ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────
//
// This app is being shaped to run in two postures. Local-first on an operator's
// machine, where a `claude` binary, a GPU and a desktop editor are all reachable;
// and as a limited-scope hosted service on Google Cloud, where none of them are.
// Most of the difference is absorbed by the routers — lib/text/router.ts walks
// from a local engine to a cloud one and the caller never knows.
//
// SOME OF IT CANNOT BE. A handful of features have no cloud equivalent at all,
// and pretending otherwise produces the worst possible surface: a button that is
// visible, enabled, and answers 503 after the user has composed something. The
// registry's fallback-ladder technique is blunt about the alternative — a
// capability with no honest stand-in is not degraded, it is ABSENT, and absence
// is designed, labeled and tested rather than discovered.
//
// So this module is one table, computed from the environment, that says which
// capabilities exist HERE. Surfaces read it and hide or explain; they never
// re-derive it from a key check of their own.
//
// ── WHY EVERY FLAG IS NEXT_PUBLIC_ AND WHAT THAT DOES NOT MEAN ──────────────
//
// A capability flag has to be readable in the BROWSER, because hiding a control
// is a client-side act. So these are NEXT_PUBLIC_ and are inlined into the
// bundle — which makes them public, and that is fine: they say what this
// deployment can do, not what any credential is.
//
// WHAT IT EXPLICITLY DOES NOT MEAN IS THAT THEY ARE A SECURITY BOUNDARY. Hiding
// a control does not disable a route. Every money and compute route stays gated
// by lib/apiAuth.ts and fails closed on its own, and a capability that is off
// here but whose key IS set will still serve a caller who crafts the request by
// hand. These flags are for the honest surface; the gate is for the door. Never
// move a spending decision into this file.

/** Read a NEXT_PUBLIC_ flag with an explicit default.
 *
 *  Inlined at build time by the bundler, so `process.env.X` must appear
 *  literally at each call site — a computed lookup returns undefined in the
 *  browser. That is why the reads below are spelled out rather than looped. */
const on = (raw: string | undefined, fallback: boolean): boolean => {
  const v = raw?.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "on") return true;
  if (v === "0" || v === "false" || v === "off") return false;
  return fallback;
};

export interface Capabilities {
  /** Music generation from a spotting cue — the Score phase's render.
   *
   *  PARTIALLY PORTABLE, AND THE CLOUD HALF IS NOW CONFIRMED REACHABLE. The
   *  vendor is ElevenLabs. The 2026-08-27 roster pass (`npm run verify:text --
   *  --roster`) found `lyria-3-clip-preview` and `lyria-3-pro-preview` on the
   *  SAME GOOGLE_AI_API_KEY this app already holds — so a port needs no new
   *  credential and no new account, only an adapter. The cue→plan doctrine in
   *  lib/music/plan.ts would survive it; the wire format would not.
   *
   *  Still OFF in the cloud posture — by the hosted block below, not by this
   *  flag's default, which is on like every other — because "the model is
   *  reachable" and "this app can drive it" are different claims and only the
   *  first is measured. Turn it on when an adapter exists, not before. */
  musicGenerate: boolean;

  /** Section editing against stored audio, and raw wire-format compose.
   *
   *  NOT PORTABLE. Inpainting a section of a previously rendered song against a
   *  stored song id is an ElevenLabs product feature with no Google Cloud
   *  equivalent — not a model difference, a missing product surface. There is
   *  nothing to adapt to, so in the cloud posture this is ABSENT, and the
   *  playground says so instead of offering it. */
  musicSectionEdit: boolean;

  /** Text-to-sound-effect.
   *
   *  NOT PORTABLE, same shape as above and for the same reason: no Google Cloud
   *  service generates a discrete, exact-duration, loopable sound effect from a
   *  text description. */
  musicSfx: boolean;

  /** Video rendering on the local GPU rig (ComfyUI, pipeline/vlm-probe).
   *
   *  NOT PORTABLE within the "limited scope" this app's hosted posture means.
   *  It needs a GPU, a running ComfyUI, and the VRAM/RAM headroom guards in
   *  pipeline/vlm-probe/guard.py. Cloud Run with a GPU attached is a different
   *  product with a different cost shape and is a decision nobody has taken —
   *  see docs/video-generation-plan.md, decision 1, which plans the local rig
   *  and a cloud vendor as two providers behind one router. This flag is the
   *  seam that plan will read. */
  localVideoRender: boolean;

  /** Desktop tooling reachable from this deployment — a video editor, a file
   *  picker onto the real filesystem, anything that assumes the app and the
   *  operator share a machine.
   *
   *  STRUCTURALLY IMPOSSIBLE in a hosted posture, not merely unimplemented. */
  desktopTooling: boolean;

  /** Scheduling finished exports onto channels and publishing them
   *  (lib/publish, the Calendar, `pipeline/publish.mts`).
   *
   *  LOCAL BY CONSTRUCTION. The schedule, publications and request plans are
   *  JSON under `foundry-out/publish/`, and what gets published is an mp4 the
   *  Cut step's export wrote to `foundry-out/music-video-exports/` with a local
   *  Chromium and ffmpeg (lib/musicVideoExport.ts). A hosted instance has
   *  neither that disk nor that export, so the calendar would be empty and
   *  forget itself on every restart. Which CHANNEL can actually upload is not
   *  this flag's business — that is lib/publish/channels.ts's readiness table
   *  (live / dry / not_wired), which the preflight reads for this row. */
  publish: boolean;
}

/**
 * THE MATRIX.
 *
 * Each flag defaults to the LOCAL answer and is turned off by an explicit
 * variable, rather than defaulting from a posture the browser cannot see. The
 * direction is chosen deliberately: `lib/deployment.ts`'s posture is a
 * server-side reading of the process environment, and a client bundle has no
 * access to it — so a client-side default that tried to infer the posture would
 * be guessing. Defaulting to "local, everything on" means a normal checkout
 * behaves exactly as it does today with no configuration at all, and a hosted
 * deployment turns things off on purpose, in its own environment, where somebody
 * has thought about it.
 *
 * What a hosted deployment turns off is HOSTED_CAPS below — one constant, not a
 * comment. It used to be a list in this comment AND a list in .env.example,
 * "the two lists must agree", and until 2026-09-05 this one was missing the
 * last entry, so a deployment that copied it shipped a music render button with
 * no adapter behind it. .env.example still carries the block, with a line of
 * reason per variable, and tests/golden-path/deployment-cells.probe.spec.ts
 * fails naming any variable on which the two differ (CIP-B).
 */
export function capabilities(): Capabilities {
  return {
    musicGenerate: on(process.env.NEXT_PUBLIC_CAP_MUSIC_GENERATE, true),
    musicSectionEdit: on(process.env.NEXT_PUBLIC_CAP_MUSIC_SECTION_EDIT, true),
    musicSfx: on(process.env.NEXT_PUBLIC_CAP_MUSIC_SFX, true),
    localVideoRender: on(process.env.NEXT_PUBLIC_CAP_LOCAL_VIDEO, true),
    desktopTooling: on(process.env.NEXT_PUBLIC_CAP_DESKTOP_TOOLING, true),
    publish: on(process.env.NEXT_PUBLIC_CAP_PUBLISH, true),
  };
}

/**
 * THE HOSTED BLOCK — every flag a hosted deployment sets, and the value it sets.
 *
 * One entry per capability the hosted posture cannot honour. A capability that
 * is NOT here stays on in a hosted deployment, so an entry missing from this
 * list is a button that is visible, enabled, and answers 503 — the failure the
 * top of this file names. The deployment-cell lane applies exactly this block
 * to its Cloud Run cells, so a capability left out of it is judged on the
 * hosted routes the day it lands, rather than discovered after a deploy.
 *
 * `musicGenerate` is here until a Google music adapter exists (see its field
 * above); `publish` is here because the calendar lives on local disk.
 */
export const HOSTED_CAPS: readonly { cap: keyof Capabilities; variable: string; value: "0" }[] = [
  { cap: "musicSectionEdit", variable: "NEXT_PUBLIC_CAP_MUSIC_SECTION_EDIT", value: "0" },
  { cap: "musicSfx", variable: "NEXT_PUBLIC_CAP_MUSIC_SFX", value: "0" },
  { cap: "localVideoRender", variable: "NEXT_PUBLIC_CAP_LOCAL_VIDEO", value: "0" },
  { cap: "desktopTooling", variable: "NEXT_PUBLIC_CAP_DESKTOP_TOOLING", value: "0" },
  { cap: "musicGenerate", variable: "NEXT_PUBLIC_CAP_MUSIC_GENERATE", value: "0" },
  { cap: "publish", variable: "NEXT_PUBLIC_CAP_PUBLISH", value: "0" },
];

/**
 * The API routes behind each capability, as repo-relative route files.
 *
 * A capability that is ON must not have a route that answers "not configured"
 * — that is the disagreement the deployment-cell lane looks for, per cell.
 * A capability with no route here is one whose work never crosses this app's
 * API: `localVideoRender` runs on the GPU rig through pipeline/vlm-probe (the
 * hosted clip hop at /api/video/clips is a vendor, not the rig), and
 * `desktopTooling` hands off to the operator's own machine. An empty list is a
 * claim, and the lane checks every listed file exists.
 *
 * Paths, not imports: this module is read in the browser, and a route module
 * there would pull a server's worth of code into the client bundle.
 */
export const CAPABILITY_ROUTES: Readonly<Record<keyof Capabilities, readonly string[]>> = {
  musicGenerate: ["app/api/music/generate/route.ts"],
  musicSectionEdit: ["app/api/music/compose/route.ts"],
  musicSfx: ["app/api/music/sfx/route.ts"],
  localVideoRender: [],
  desktopTooling: [],
  publish: [
    "app/api/publish/channels/route.ts",
    "app/api/publish/exports/route.ts",
    "app/api/publish/metrics/route.ts",
    "app/api/publish/metrics/refresh/route.ts",
    "app/api/publish/schedule/route.ts",
    "app/api/publish/schedule/[id]/route.ts",
  ],
};

/**
 * The sentence a surface shows where a capability is absent.
 *
 * Written here rather than at each surface so that two places cannot explain the
 * same absence differently — and so that the explanation names WHY it is absent
 * rather than only that it is. "Not available in this deployment" tells a user
 * nothing they can act on; "this vendor feature has no equivalent on the hosted
 * plan, run the studio locally to use it" tells them the remedy.
 */
export const ABSENCE_REASON: Record<keyof Capabilities, string> = {
  musicGenerate:
    "Music rendering is off in this deployment. The Score phase still writes and edits spotting cues — only the render is unavailable.",
  musicSectionEdit:
    "Section editing needs the music vendor's stored-song inpainting, which the hosted plan does not carry. Run the studio locally to use it.",
  musicSfx:
    "Text-to-SFX needs the music vendor's sound-effect model, which the hosted plan does not carry. Run the studio locally to use it.",
  localVideoRender:
    "Clip rendering runs on a local GPU rig, which a hosted deployment does not have. Run the studio locally to render clips.",
  desktopTooling:
    "This step hands off to desktop tooling on your own machine, which a hosted deployment cannot reach.",
  publish:
    "Publishing keeps its calendar and reads finished exports on the studio's own disk, which a hosted deployment does not have. Run the studio locally to schedule and publish.",
};
