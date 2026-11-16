// THE TWO ELEMENTS A PLAYER HOLDS (./useAB.ts, ./sleeve/usePair.ts): the shape of the A/B, making an element, letting
// go of them, and one clock step of a take against its section. A browser's HTMLAudioElements, no React.
export type Side = "a" | "b";

export type AB = {
  readonly at: string | null;
  readonly playing: boolean;
  readonly side: Side;
  /** Seconds into what is loaded: the take, or the section. */
  readonly clock: number;
  readonly failed: string | null;
  readonly positionOf: (key: string) => number;
  readonly toggle: (key: string, url: string | null) => void;
  readonly seek: (key: string, url: string | null, s: number) => void;
  readonly hear: (key: string, url: string, side: Side) => void;
  readonly stop: () => void;
};

export type Loaded = { readonly key: string; readonly url: string | null };
export type AudioRef = { current: HTMLAudioElement | null };

export const DRIFT_S = 0.15;

export function audioOf(r: AudioRef): HTMLAudioElement {
  if (r.current === null) {
    r.current = new Audio();
    r.current.preload = "auto";
  }
  return r.current;
}

/** Leaving the page pauses both and lets go of their sources. */
export function reap(refs: readonly AudioRef[]): void {
  for (const r of refs) {
    const x = r.current;
    if (x === null) continue;
    x.pause();
    x.removeAttribute("src");
    x.load();
  }
}

/** One frame of what is sounding: seconds into it, or "ended". The source follows a take and falls silent past the
 *  section's end. */
export function advance(c: Loaded, src: HTMLAudioElement, take: HTMLAudioElement | null, { startS, endS }: { readonly startS: number; readonly endS: number }): number | "ended" | null {
  if (c.url === null) return src.currentTime >= endS || src.ended ? "ended" : src.currentTime - startS;
  if (take === null) return null;
  if (take.ended) return "ended";
  const t = take.currentTime;
  if (t >= endS - startS) src.pause();
  else {
    if (Math.abs(src.currentTime - (startS + t)) > DRIFT_S) src.currentTime = startS + t;
    if (src.paused) void src.play().catch(() => undefined);
  }
  return t;
}
