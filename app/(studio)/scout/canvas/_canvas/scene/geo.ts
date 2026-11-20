// THE TERRITORY'S MEASURES - world units, byte-for-byte the winner's (model.js). Stage columns are SW apart from X0;
// the coast waves around COAST_X; a town's lots are LW x LH on a PX x PY grid behind a GUT-wide night gutter; past each
// port the release lane (CAL_*), then the projected audience fan (FAN_X0), then the sea.

export const SW = 940;
export const X0 = 360;
export const SRC_X = X0 - 420;
export const sx = (i: number): number => X0 + i * SW;
export const COAST_I = 6.5;
export const COAST_X = sx(COAST_I);
export const coastX = (y: number): number => COAST_X + 24 * Math.sin(y / 170) + 12 * Math.sin(y / 53 + 1);
export const LW = 26;
export const LH = 10;
export const PX = 30;
export const PY = 13;
export const GUT = 46;
export const CAL_X0 = 190;
export const DAY_W = 18;
export const CAL_DAYS = 28;
export const FAN_X0 = CAL_X0 + CAL_DAYS * DAY_W + 40;
export const SEA_X = COAST_X + FAN_X0 + 120;

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const smooth = (z: number, a: number, b: number): number => {
  const t = clamp((z - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** FNV-1a over a string, as a fraction in [0, 1): a stable per-key phase. */
export const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
};
export const sum = <T>(xs: readonly T[], f: (x: T) => number): number => xs.reduce((s, x) => s + f(x), 0);
export const cut = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
export const shortNight = (s: string): string => (s.length > 1 && /^\d{4}-/.test(s) ? s.slice(5) : s);
export const fmt = (n: number): string => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
