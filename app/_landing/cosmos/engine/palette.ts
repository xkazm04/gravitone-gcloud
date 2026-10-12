// Palettes: hue anchors chosen for paper, never neon. One palette per id
// (optionally varied by a second key), cached, pure.

import { RNG, clamp, hash32 } from "./rng";

const HUES = [6, 17, 30, 43, 350, 96, 140, 168, 187, 205, 222, 244, 272, 302, 334];

export const hsl = (h: number, s: number, l: number, a?: number | string): string =>
  a == null
    ? `hsl(${((h % 360) + 360) % 360 | 0} ${clamp(s, 0, 100).toFixed(0)}% ${clamp(l, 0, 100).toFixed(0)}%)`
    : `hsl(${((h % 360) + 360) % 360 | 0} ${clamp(s, 0, 100).toFixed(0)}% ${clamp(l, 0, 100).toFixed(0)}% / ${a})`;

export type ShadeName = "deep" | "dark" | "mid" | "soft" | "pale" | "paper" | "acc" | "acc2";
const NAMES: ShadeName[] = ["deep", "dark", "mid", "soft", "pale", "paper", "acc", "acc2"];

export interface Palette {
  h: number;
  ah: number;
  warm: boolean;
  k: Record<ShadeName, string>;
  a: Record<ShadeName, [number, number, number]>;
  /** a shade, lightness/saturation nudged, optional alpha */
  t: (n: ShadeName, dl?: number, ds?: number, al?: number) => string;
}

const PALS = new Map<string, Palette>();

export function palette(id: string, vk?: string, spread?: number): Palette {
  const key = vk ? id + "~" + vk + "~" + spread : id;
  const hit = PALS.get(key);
  if (hit) return hit;
  const r = RNG(hash32("pal|" + id));
  let h = (HUES[Math.floor(r() * HUES.length)] + (r() - 0.5) * 14 + 360) % 360;
  const ahPick = r();
  r(); // ahPick2: drawn by the original and never read; kept so later draws match
  if (vk) h = (h + (((hash32(vk) % 1000) / 1000 - 0.5) * (spread ?? 0)) + 360) % 360;
  const warm = h < 68 || h > 318;
  const S = warm ? (h < 68 ? 52 : 40) : h > 80 && h < 160 ? 30 : 40;
  const ah = warm ? [172, 188, 208, 232][Math.floor(ahPick * 4)] : [8, 20, 32, 44][Math.floor(ahPick * 4)];
  const olive = h >= 46 && h <= 90,
    hd = olive ? h - 20 : h,
    hm = olive ? h - 12 : h - 4;
  const sh: [number, number, number][] = [
    [hd, S * 0.85, 15 + r() * 3],
    [hd + 4, S * 0.95, 27 + r() * 3],
    [hm, S, 43 + r() * 4],
    [h + 3, S * 1.05, 63 + r() * 4],
    [h, S * 0.7, 83 + r() * 3],
    [h + 12, 30, 92],
    [ah, 64, 60 + r() * 4],
    [ah + 14, 70, 75],
  ];
  const k = {} as Record<ShadeName, string>;
  const a = {} as Record<ShadeName, [number, number, number]>;
  NAMES.forEach((n, i) => {
    a[n] = sh[i];
    k[n] = hsl(sh[i][0], sh[i][1], sh[i][2]);
  });
  const P: Palette = {
    h,
    ah,
    warm,
    k,
    a,
    t: (n, dl, ds, al) => hsl(a[n][0], a[n][1] + (ds || 0), a[n][2] + (dl || 0), al),
  };
  PALS.set(key, P);
  return P;
}
