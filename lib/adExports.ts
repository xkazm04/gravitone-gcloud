// WHERE AD EXPORTS LIVE — server-only, and deliberately tiny.
//
// Split out of lib/adRender.ts so lib/publish/exports.ts can list ad exports
// without importing the render service's module graph (ffmpeg spawns, the
// Chromium overlay renderer, the clip and sound stores). Both import from here;
// the directory convention is stated once.

import path from "node:path";

/** Read per call, so a probe can point it at a temp directory. */
export function adExportRoot(): string {
  const env = process.env.AD_EXPORT_DIR?.trim();
  return env ? path.resolve(env) : path.join(process.cwd(), "foundry-out", "ad-exports");
}

/** Export ids are minted by lib/adRender.ts as uuids; nothing else names a path. */
export const AD_EXPORT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
