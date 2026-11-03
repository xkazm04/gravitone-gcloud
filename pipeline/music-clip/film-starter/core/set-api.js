// film/core/set-api.js - THE SET MODULE CONTRACT. One ES module per set in film/sets/<set>.js:
//
//   export default {
//     name: "<set>",                          // must equal the shotlist's `set` value and the file name
//     cams: ["wide", ...],                    // the cams it implements; others fall back to its nearest (see nearestCam)
//     async build(core) { return state },     // once, before READY: its own THREE.Scene, lights, props, robots
//     render(t, shot, core, state) {          // PURE f(t, shot): no Date/performance/Math.random/rAF, seeded rng only
//       return { scene, camera, post: { exposure, bloomThreshold, bloomStrength, focusDistance, aperture, maxblur,
//                                        flash, lift, ao, vignette, ca } };   // any post key may be omitted (defaults)
//     },
//   };
//
// shot = { ...shotlist entry (id, sectionId, startS, endS, set, cam, note, variant), local: t - startS,
//          p: progress 0..1 through the shot, t, sec: the timeline section, cam: the RESOLVED cam (after fallback) }
//
// core (built once in film/index.html, shared by every set):
//   core.THREE, core.W, core.H
//   core.env      timeline helpers: beatAt, barOf, downbeatAt, beatPulse, downPulse, band, lowSmooth, sectionAt,
//                 isRefrain, lyric, lyricStart, phaseAt, nod(t) -> {head, body} (the APPROVED nod), nodEnv, nodAmp,
//                 tLock (green allowed from here), tWave, tStop, tCut11, BEAT, STEP, S (sections by id)
//   core.X        texture/material library: canvas, tex, stencilTex, ledCanvas, hullSet, rubberSet, shutterCanvas,
//                 laneCanvas, BUMP, floorMat, robotMat, darkMat, whiteMat, rubberMat, visorMat, plateMat, envFrom, ...
//   core.robots   createArmy(max) (instanced, LOD), poseRobot, VISOR colours {RED, GREEN, OFF, WHITE}
//   core.kit      stage(), cageLamp(), beam(), dust(), streaks() (sparks/rain), ledPanel(), camMove(), place()
//   core.post     focusOn(camera, worldPoint) -> focusDistance
//   core.rng      mulberry(seed), hash1(n)
//
// Rules every set keeps (CRAFT.md + the approved look):
//   - the camera MOVES in every shot (parameterise by shot.p and shot.variant so repeats differ)
//   - something happens ON THE BEAT in every shot (env.beatPulse / downPulse / nod)
//   - palette: #000 ground, #ff1e1e red, #fff white; green #3dff7a ONLY when t >= env.tLock ('Lock: released')
//   - type lives IN the world (stencils, LED, HUD on a visor), never a caption overlay
//   - additive glows/beams/dust/rain carry userData.noDepth = true (kit helpers already do)
//   - the army (many robots) appears only in refrains (env.isRefrain) and the intense second half; verses use 1-5 units
//   - flash (one white frame) only where the set returns it on a drop

export const CAMS = ["wide", "medium", "close", "macro", "track", "orbit", "crane", "pov", "insert"];
// nearest-cam fallback order when a set does not implement a cam
const NEAR = { wide: ["crane", "track", "medium"], medium: ["close", "wide", "orbit"], close: ["medium", "macro", "insert"], macro: ["insert", "close"], track: ["wide", "medium", "orbit"],
  orbit: ["medium", "wide", "track"], crane: ["wide", "orbit"], pov: ["close", "insert", "macro"], insert: ["macro", "close"] };
export function nearestCam(set, cam) { if (set.cams.includes(cam)) return cam; for (const c of NEAR[cam] || []) if (set.cams.includes(c)) return c; return set.cams[0]; }

/** tiny validator: returns a list of problems (empty = valid) */
export function validateSet(mod, file) {
  const e = [];
  if (!mod || typeof mod !== "object") return [`${file}: no default export object`];
  if (typeof mod.name !== "string") e.push(`${file}: name must be a string`);
  if (file && mod.name && !file.endsWith(mod.name + ".js")) e.push(`${file}: name "${mod.name}" does not match the file`);
  if (!Array.isArray(mod.cams) || !mod.cams.length || mod.cams.some(c => !CAMS.includes(c))) e.push(`${file}: cams must be a non-empty subset of ${CAMS.join(",")}`);
  if (typeof mod.build !== "function") e.push(`${file}: build(core) missing`);
  if (typeof mod.render !== "function") e.push(`${file}: render(t, shot, core, state) missing`);
  return e;
}
