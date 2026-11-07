import "server-only";

import { AppError } from "@gt/domain/errors";
import type { Result } from "@gt/domain/errors";

// WP0 STUB: final signatures, filled by WP1. ffmpeg and ffprobe with no shell, `FFMPEG` from the env
// (lib/audio/layers.ts's pattern), refused when lib/deployment.ts canSpawnLocalBinaries() is false.

const stub = (): never => {
  throw new AppError("internal", "cover cut: not built yet");
};

export const probeDurationS = async (_abs: string): Promise<Result<number>> => stub();
/** The section as 44.1 kHz stereo wav: what SheetSage2 reads. */
export const cutSection = async (_abs: string, _startS: number, _endS: number, _out: string): Promise<Result<void>> => stub();
/** The winner as a 320 kbps mp3. */
export const exportMp3 = async (_abs: string, _out: string): Promise<Result<void>> => stub();
