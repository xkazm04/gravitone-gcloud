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
   *  Still off by default in the cloud posture, because "the model is reachable"
   *  and "this app can drive it" are different claims and only the first is
   *  measured. Turn it on when an adapter exists, not before. */
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
 * A hosted deployment sets, in one block:
 *   NEXT_PUBLIC_CAP_MUSIC_SECTION_EDIT=0
 *   NEXT_PUBLIC_CAP_MUSIC_SFX=0
 *   NEXT_PUBLIC_CAP_LOCAL_VIDEO=0
 *   NEXT_PUBLIC_CAP_DESKTOP_TOOLING=0
 */
export function capabilities(): Capabilities {
  return {
    musicGenerate: on(process.env.NEXT_PUBLIC_CAP_MUSIC_GENERATE, true),
    musicSectionEdit: on(process.env.NEXT_PUBLIC_CAP_MUSIC_SECTION_EDIT, true),
    musicSfx: on(process.env.NEXT_PUBLIC_CAP_MUSIC_SFX, true),
    localVideoRender: on(process.env.NEXT_PUBLIC_CAP_LOCAL_VIDEO, true),
    desktopTooling: on(process.env.NEXT_PUBLIC_CAP_DESKTOP_TOOLING, true),
  };
}

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
};
