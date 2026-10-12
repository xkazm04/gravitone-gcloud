// PERFORMANCE: which quality tier this machine gets, and the governor that
// steps it down when the frames say so.
//
// THE CHOICE (nothing here costs first paint: it runs after the engine chunk
// loaded, and the WebGL probe is asked of the raster worker, not the main
// thread):
//   1. `?tier=` forces a tier (the performance instrument and the tests);
//   2. prefers-reduced-motion: reduce -> still;
//   3. the renderer a throwaway WebGL context names: SwiftShader, llvmpipe,
//      softpipe, "Microsoft Basic Render", or no WebGL at all, means the page
//      is composited in software -> lite; so do <= 2 cores, <= 2 GB of device
//      memory and Save-Data;
//   4. otherwise full.
// A verdict the governor had to correct is remembered in localStorage under a
// signature of those same inputs, so the next visit starts where this one
// ended; storage can throw (private windows, blocked site data), and a miss is
// only a first visit again.
//
// THE GOVERNOR samples frame times with rAF over the first ~3 s after the intro
// has ended (the page at rest, idle motion running; the intro's one-off reveal
// while every layer lands is not what a tier is chosen for), and over the first
// seconds of the first pointer parallax and of the first level transition.
// When the 90th percentile frame is over 22 ms across at least 45 frames it
// steps down one tier (full -> lite -> still) without a reload: the overview is
// re-rastered in the background and swapped in with a short crossfade. It never
// steps back up in the same session, and after a step it watches the new tier
// the same way. A forced tier and reduced motion are never governed.

export type Tier = "full" | "lite" | "still";
const ORDER: Tier[] = ["full", "lite", "still"];
export const lower = (t: Tier): Tier | null => ORDER[ORDER.indexOf(t) + 1] ?? null;

const SOFTWARE = /swiftshader|llvmpipe|softpipe|microsoft basic render|software rasterizer/i;
const KEY = "gravitone.cosmos-tier.v1";
// Only a governor's DOWNGRADE is ever stored (the probe re-decides for free), and
// a downgrade can be one busy afternoon - a build running beside the browser - so
// it is kept for a day, not a fortnight: a GPU machine that was briefly loaded
// gets its full design back tomorrow, at the price of a slow machine re-measuring
// once a day.
const TTL = 24 * 3600 * 1000;

interface NavPerf {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

export interface Verdict {
  tier: Tier;
  why: string;
}

const nav = (): NavPerf => (typeof navigator === "object" ? (navigator as unknown as NavPerf) : {});

export function signature(ren: string | null): string {
  const n = nav();
  return [ren || "no-webgl", n.hardwareConcurrency ?? "?", n.deviceMemory ?? "?", n.connection?.saveData ? 1 : 0].join("|");
}

/** the verdict from the probe's inputs alone */
export function classify(ren: string | null): Verdict {
  const n = nav();
  if (!ren) return { tier: "lite", why: "no WebGL: software compositing" };
  if (SOFTWARE.test(ren)) return { tier: "lite", why: "software renderer: " + ren.slice(0, 80) };
  if ((n.hardwareConcurrency ?? 8) <= 2) return { tier: "lite", why: "cores " + n.hardwareConcurrency };
  if ((n.deviceMemory ?? 8) <= 2) return { tier: "lite", why: "device memory " + n.deviceMemory + " GB" };
  if (n.connection?.saveData) return { tier: "lite", why: "Save-Data" };
  return { tier: "full", why: "hardware renderer: " + ren.slice(0, 80) };
}

function readCache(sig: string): Verdict | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as { sig?: string; tier?: Tier; why?: string; at?: number };
    if (c.sig !== sig || !c.tier || !ORDER.includes(c.tier) || !c.at || Date.now() - c.at > TTL) return null;
    return { tier: c.tier, why: "remembered: " + (c.why || "") };
  } catch {
    return null;
  }
}
export function remember(sig: string, v: Verdict): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ sig, tier: v.tier, why: v.why, at: Date.now() }));
  } catch {
    // storage full or blocked: the next visit decides again
  }
}

/** the probe's verdict, lowered to what an earlier visit's governor measured */
export function decide(ren: string | null): Verdict & { sig: string } {
  const sig = signature(ren),
    v = classify(ren),
    c = readCache(sig);
  if (c && ORDER.indexOf(c.tier) > ORDER.indexOf(v.tier)) return { ...c, sig };
  return { ...v, sig };
}

export const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- the governor ---------- */

export interface GovHost {
  /** the frame loop's slot (Life.want) */
  want(name: string, step: (now: number) => boolean): void;
  /** called once per verdict that lowers the tier */
  stepDown(p90: number, n: number, window: string): void;
}

const P90_MS = 22,
  MIN_FRAMES = 45;

export class Governor {
  private seen = new Set<string>();
  private win: { name: string; t0: number; dur: number; last: number; d: number[] } | null = null;
  off = false;

  constructor(private host: GovHost) {}

  /** opens a sampling window named `name` the first time it is asked for (per tier) */
  kick(name: string, dur: number): void {
    if (this.off || this.seen.has(name) || this.win) return;
    this.seen.add(name);
    this.win = { name, t0: 0, dur, last: 0, d: [] };
    this.host.want("governor", (now) => this.frame(now));
  }

  /** the tier changed: every window may run again, against the new tier */
  reset(): void {
    this.seen.clear();
    this.win = null;
  }

  private frame(now: number): boolean {
    const w = this.win;
    if (!w || this.off) return false;
    if (typeof document === "object" && document.hidden) {
      // a hidden tab has no frames worth judging: give the window back
      this.seen.delete(w.name);
      this.win = null;
      return false;
    }
    if (!w.t0) w.t0 = now;
    else w.d.push(now - w.last);
    w.last = now;
    if (now - w.t0 < w.dur || w.d.length < MIN_FRAMES) return true;
    this.win = null;
    const s = [...w.d].sort((a, b) => a - b),
      p90 = s[Math.floor(s.length * 0.9)];
    if (p90 > P90_MS) this.host.stepDown(p90, s.length, w.name);
    return false;
  }
}
