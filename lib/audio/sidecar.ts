import type { AudioMeasureFull } from "@gt/domain/audio.accept";
import type { FxChain } from "@gt/domain/audio.fx";
import { err, type Result } from "@gt/domain/errors";

// THE AUDIO SIDECAR, FROM NODE - the one door to pipeline/audio/sidecar.py (pedalboard +
// pyloudnorm on this box). Server-only by construction: it spawns a local binary, so it is
// reached only from producers and server code, never from a client module.
//
// CONTRACT (the sidecar's stdout, LAST line, JSON):
//   python pipeline/audio/sidecar.py measure --in <wav> --json
//     -> {"ok":true,"measure":{integratedLufs,truePeakDb,lra,clippedSamples,leadSilenceS,tailSilenceS,durationS}}
//   python pipeline/audio/sidecar.py fx --in <wav> --chain <chain.json> --out <wav> --json
//     -> {"ok":true,"durationS":n}
//   any failure -> {"ok":false,"error":"<the tool's own sentence>"} and exit code 1.
// The interpreter is `PYTHON` or the platform default (lib/producers/forge.ts:76).
//
// WP0 STUBS: the signatures are final; WP1 replaces the bodies.

export type SidecarOptions = { readonly timeoutMs?: number };

const NOT_BUILT = "the audio sidecar is not built yet";

export async function measureFile(path: string, opts: SidecarOptions = {}): Promise<Result<AudioMeasureFull>> {
  void path;
  void opts;
  return err("unavailable", NOT_BUILT);
}

export async function applyChain(inPath: string, chain: FxChain, outPath: string, opts: SidecarOptions = {}): Promise<Result<{ readonly durationS: number }>> {
  void inPath;
  void chain;
  void outPath;
  void opts;
  return err("unavailable", NOT_BUILT);
}

/** Is the sidecar runnable here: which interpreter, and which of its modules import. */
export async function sidecarDoctor(): Promise<Result<{ readonly python: string; readonly modules: readonly string[] }>> {
  return err("unavailable", NOT_BUILT);
}
