// Prints the presets as JSON on stdout: [{ id, name, motion }].
//
// The Python renderer (pipeline/video/render_preset_clips.py) used to regex the
// TypeScript source for these, which broke on any motion line whose escapes the
// regex did not model. This is the real module, evaluated by tsx, so a quote or
// a newline in a motion line round-trips exactly.
//
// Run:  npx tsx pipeline/emit-presets.mts
import { PRESETS } from "@gt/catalog/presets";

process.stdout.write(
  JSON.stringify(PRESETS.map((p) => ({ id: p.id, name: p.name, motion: p.motion }))) + "\n",
);
