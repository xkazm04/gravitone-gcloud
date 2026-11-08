// A REFERENCE STILL'S LONG SIDE IS HELD TO 1024 PX BEFORE IT LEAVES THIS PROCESS (character-mirror skill: refs <=1024).
// The rule lived only in a skill document; on 2026-10-27 a 21 MP reference hung a draw for over ten minutes inside
// VAEEncode. A reference at or under the limit is returned as the very same bytes (the caller names its upload by
// them, so the downscale must come first and the name follow the result). A larger one is fitted inside the limit,
// same format, never enlarged. Bytes sharp cannot read are returned as they came: the engine refuses them in its own
// words, which is the sentence the operator should see.
//
// sharp is a transitive dependency (next's image optimiser), loaded on demand so a box without its native binary
// still draws every reference that is already small enough.

export const REF_MAX_SIDE = 1024;

type Sharp = typeof import("sharp").default;

async function loadSharp(): Promise<Sharp | null> {
  try {
    const m = (await import("sharp")) as unknown as { default?: Sharp };
    return m.default ?? (m as unknown as Sharp);
  } catch {
    return null;
  }
}

/** The reference, fitted inside `max` px on its long side; the same bytes when it already is. */
export async function fitReference(bytes: Uint8Array, max: number = REF_MAX_SIDE): Promise<Uint8Array> {
  const sharp = await loadSharp();
  if (sharp === null) return bytes;
  try {
    const meta = await sharp(bytes).metadata();
    if (meta.width === undefined || meta.height === undefined || Math.max(meta.width, meta.height) <= max) return bytes;
    const fitted = sharp(bytes).rotate().resize({ width: max, height: max, fit: "inside", withoutEnlargement: true });
    const out = await (meta.format === "jpeg" ? fitted.jpeg({ quality: 92 }) : meta.format === "webp" ? fitted.webp({ quality: 92 }) : fitted.png()).toBuffer();
    return new Uint8Array(out);
  } catch {
    return bytes;
  }
}
