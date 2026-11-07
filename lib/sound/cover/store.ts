import "server-only";

import { AppError } from "@gt/domain/errors";
import type { CoverId, CoverRecord, CoverRights } from "@gt/domain/cover";

// WP0 STUB: final signatures, filled by WP1. <storeRoot>/covers/<id>/{cover.json,source.<ext>,section.wav,
// score.abc,takes/s<seed>.flac,winner.mp3,remix.<ext>}.

const stub = (): never => {
  throw new AppError("internal", "cover store: not built yet");
};

export type NewCover = {
  readonly title: string;
  readonly rights: CoverRights;
  readonly holder?: string;
  readonly note?: string;
  readonly source: { readonly bytes: Uint8Array; readonly mime: string; readonly name: string; readonly durationS: number };
};

export const newCoverId = (): CoverId => stub();
export const createCover = async (_c: NewCover): Promise<CoverRecord> => stub();
export const readCover = async (_id: string): Promise<CoverRecord | undefined> => stub();
export const listCovers = async (): Promise<readonly CoverRecord[]> => stub();
/** Read, change, validate and write atomically, serialized per cover. */
export const mutateCover = async (_id: string, _f: (c: CoverRecord) => CoverRecord): Promise<CoverRecord> => stub();
/** The absolute path of a file relative to a cover's folder; refuses anything that leaves the folder. */
export const coverFileAbs = (_id: string, _rel: string): string => stub();
export const writeCoverFile = async (_id: string, _rel: string, _bytes: Uint8Array): Promise<void> => stub();
