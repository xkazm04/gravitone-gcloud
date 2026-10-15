// The geometry of an audio peak strip (shell.js `Wave(peaks, w, h, color, played)`), pure, so
// the arithmetic is tested without a DOM: one bar per peak, centred on the midline, at least
// 1.5 units tall and 1 wide, the bars past the playhead dimmed.

export type WaveBar = { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly played: boolean };

const fixed = (n: number): number => Math.round(n * 10) / 10;

export function waveBars(peaks: readonly number[], width: number, height: number, played?: number): readonly WaveBar[] {
  const n = peaks.length;
  if (n === 0) return [];
  const bw = width / n;
  return peaks.map((p, i) => {
    const bh = Math.max(1.5, p * (height - 2));
    return {
      x: fixed(i * bw),
      y: fixed((height - bh) / 2),
      w: fixed(Math.max(1, bw - 1)),
      h: fixed(bh),
      played: played === undefined || i / n <= played,
    };
  });
}
