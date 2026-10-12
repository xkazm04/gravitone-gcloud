// A medallion: a bone plate cut to a silhouette, a recessed window, and three to
// six sheets of motif inside. Everything about it is derived from hash(id).
// Pure paint.

import { MEDAL_INK } from "./inks";
import { MOT, MOTIF_NAMES, SIL_COUNT, silhouette } from "./motifs";
import { palette, type Palette } from "./palette";
import { paper, xf, type Ctx2D } from "./paper";
import { RNG, hash32 } from "./rng";

export interface TypeSpec {
  id: string;
  sil: number;
  motif: string;
  seed: number;
  pal: Palette;
  tilt: number;
}

function typeSpec(id: string): TypeSpec {
  const r = RNG(hash32("spec|" + id));
  return {
    id,
    sil: Math.floor(r() * SIL_COUNT),
    motif: MOTIF_NAMES[Math.floor(r() * MOTIF_NAMES.length)],
    seed: hash32("m|" + id),
    pal: palette(id),
    tilt: (r() - 0.5) * 5,
  };
}
const SPECS = new Map<string, TypeSpec>();
export function specOf(id: string): TypeSpec {
  let s = SPECS.get(id);
  if (!s) {
    s = typeSpec(id);
    SPECS.set(id, s);
  }
  return s;
}

export function drawMedal(ctx: Ctx2D, R: number, spec: TypeSpec, opts?: { sil?: number }): void {
  const P = spec.pal,
    r = RNG(spec.seed);
  const plate = silhouette(opts?.sil == null ? spec.sil : opts.sil, R, r);
  paper(ctx, plate, P.t("paper"), { e: R * 0.1, hl: 0.55 });
  const win = xf(plate, { s: 0.84 });
  ctx.save();
  ctx.clip(win);
  MOT[spec.motif](ctx, R * 0.84, P, RNG(spec.seed ^ 0x9e37));
  const inv = new Path2D();
  inv.rect(-R * 3, -R * 3, R * 6, R * 6);
  inv.addPath(win);
  ctx.shadowColor = MEDAL_INK.inset;
  ctx.shadowBlur = R * 0.075;
  ctx.shadowOffsetX = R * 0.045;
  ctx.shadowOffsetY = R * 0.055;
  ctx.fillStyle = MEDAL_INK.insetFill;
  ctx.fill(inv, "evenodd");
  ctx.restore();
  ctx.save();
  ctx.lineWidth = Math.max(0.8, R * 0.012);
  ctx.strokeStyle = MEDAL_INK.score;
  ctx.stroke(win);
  ctx.restore();
}

/** the CSS box a medallion of diameter D occupies, shadow room included */
export const medalBox = (D: number): number => D + D * 0.16 * 2;

/** paints a medallion centred in a canvas of medalBox(D)*rs pixels */
export function paintMedal(c: Ctx2D, spec: TypeSpec, D: number, rs: number): void {
  const box = medalBox(D);
  c.scale(rs, rs);
  c.translate(box / 2, box / 2);
  c.rotate((spec.tilt * Math.PI) / 180);
  drawMedal(c, D / 2, spec);
}
