import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Whether this machine has a sample folder for the local band, read the way the sidecar reads it
// (pipeline/audio/score_instruments.py runtime_paths: env first, then the untracked runtime config).
// Since engine v2 (5ecd39b4) render_score refuses a stand-in synth, so a render that asserts real
// sources cannot pass on a box without packs - a laptop or a CI runner. Those cases skip; the
// refusal itself is still tested everywhere.
export function sampleFolderConfigured(): boolean {
  if (process.env["GRAVITONE_ABLETON_SAMPLES_DIR"] || process.env["GRAVITONE_FL_PACKS_DIR"]) return true;
  const cfgPath = process.env["GRAVITONE_INSTRUMENTS_CONFIG"] || path.join(process.cwd(), ".hackathon", "instruments.local.json");
  if (!existsSync(cfgPath)) return false;
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8")) as { abletonSamplesDir?: unknown; flPacksDir?: unknown };
    return Boolean(cfg.abletonSamplesDir || cfg.flPacksDir);
  } catch {
    return false;
  }
}

export const SAMPLES = sampleFolderConfigured();
