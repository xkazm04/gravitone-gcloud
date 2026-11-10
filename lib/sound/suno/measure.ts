// MEASURED BEFORE FILED - the one step a Suno take enters the sound store through, whether the person
// uploaded the file (app/(studio)/audio/studio/take/route.ts) or the studio pulled it from their
// Suno library (./pull.ts). The bytes go to a temp file named with the take's own extension (a
// decoder that sniffs by name reads it as what it is), the sidecar's `analyze` (librosa's tempo and
// key, measure's loudness) reads it, and only an analysed file becomes a take (./facts.ts
// fileSunoTake): a file that does not decode is refused in the decoder's own words, with no take.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { StudioTakeFacts } from "@gt/domain/audio.suno";
import { err, type Result } from "@gt/domain/errors";

import { analyzeFile, type AudioAnalysis } from "../../audio/sidecar.ts";
import type { IncomingFile } from "../takes.ts";
import { fileSunoTake, type TakeFrom } from "./facts.ts";

export type AnalyzeFn = (file: string) => Promise<Result<AudioAnalysis>>;

/** The temp file's extension: the name's own, letters and digits only. */
export const tempExt = (name: string): string => path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 6);

/** Measure the bytes and file them as a Suno take; refused in the decoder's words when they do not decode. */
export async function measureAndFile(file: IncomingFile, from: TakeFrom, analyze: AnalyzeFn = analyzeFile): Promise<Result<StudioTakeFacts>> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gt-studio-take-"));
  try {
    const tmp = path.join(dir, `upload${tempExt(file.name)}`);
    await writeFile(tmp, file.bytes);
    const analysis = await analyze(tmp);
    if (!analysis.ok) return err(analysis.error.code, `${file.name} could not be measured: ${analysis.error.message}`);
    return await fileSunoTake(file, from, analysis.value);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
