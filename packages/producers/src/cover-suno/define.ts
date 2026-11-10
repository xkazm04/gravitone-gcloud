// A COVER'S SUNO SEND AS A PRODUCER (spark suno-covers): one job per send, `job:cover-suno:<cover>:<n>`, on lane
// `cloud.suno` - the winner uploaded once per cover, two covers asked of Suno (song credits), each read for free.
// The pure half, on ./cover/define.ts's shape: the request, the plan of steps not yet booked, the ports.
//
// WP0: the names every package keys on. WP1 writes the request schema, the plan, the ports and `defineCoverSuno`.

export const COVER_SUNO = "cover-suno";
export const COVER_SUNO_REQUEST = "audio.cover-suno-requested";
export const COVER_SUNO_LANE = "cloud.suno";

export const UPLOAD_STEP = "upload";
export const coverStep = (take: 1 | 2): string => `cover-${take}`;
export const readStep = (take: 1 | 2): string => `read-${take}`;
/** In order: the upload, then each take's cover and its read. */
export const COVER_SUNO_STEPS = [UPLOAD_STEP, coverStep(1), coverStep(2), readStep(1), readStep(2)] as const;
