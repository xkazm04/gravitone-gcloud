# film-starter - the proven engine of a /music-clip film

Copied from Break the Sequence (unit-0451, approved 2026-10-31 as film v3). A new track's film
starts as a copy of this folder at `<folder>/music-clip/film/`; the CLI serves it with the clip's
`vendor/three` (`../vendor/three/...` in the import map, vendored by `cut.mts` / `shoot.mts`).

Keep (track-independent):
- `core/post.js` - the post chain (DOF, bloom, ACES, grade, CA, vignette, grain, gate weave,
  letterbox, SMAA, AO), resolution-independent.
- `core/textures.js` - the seeded 2048 px material library (hull, paint, rubber, concrete, decals).
- `core/env.js` - timeline helpers, seeded rng, the approved beat-locked nod (`nod`, `nodEnv`,
  `nodAmp`), and `hermite`, the monotone camera path for one-takes.
- `core/kit.js`, `core/dotmatrix.js`, `core/set-api.js` - stage, lamps, beams, dust, rain/sparks,
  LED panels; the set contract and its validator.
- `index.html` - the router: shot list -> set -> post, `window.render(t)` pure.

Per track (rewrite):
- `core/robots.js` - Unit 0451's procedural worker and army. Keep it if the cast are machines.
- `env.js` story anchors (`tLock`, `tWave`, `tStop`, `tCut11`) and the refrain set `REFRAIN`.
- `index.html` `SETS` - this track's set names; one `sets/<set>.js` per name.
- `sets/` - `cable-room.js` with `cable-room/onetake.js` is kept as the exemplar of a set and of a
  one-take (a 15 s camera path over timed keys, an event on every onset and beat).
