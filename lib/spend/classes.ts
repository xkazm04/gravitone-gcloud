// SPEND CLASSES — what each metered balance is, declared once.
//
// A spend class is one ceiling: a unit, the env vars an operator turns it with,
// the defaults that apply when they do not, and the axes a booked row is
// attributed on. The meter (./meter.ts) is the same code for every class; the
// class is the only thing that differs.
//
// ONE CLASS AT A TIME, BY DESIGN (card IMG-A stage 1). `imaging-usd` is the
// ledger lib/imaging/budget.ts always kept, moved onto the kernel with no
// change in behaviour. Text USD joins in a later stage, as one more entry here
// with a new var. A class nobody books against is a declared ceiling that
// enforces nothing, so a class is added in the same change as its first adapter.
//
// `video-usd` (2026-10-06, spark ads-project-type WP3) is the second, and it
// arrived that way: lib/imaging/video/budget.ts books every hosted
// image-to-video clip against it, and the clip route reserves before the
// vendor is called. Its own vars rather than imaging's: a clip costs dollars
// where a plate costs cents, and one ceiling over both would let a single
// clip starve a whole storyboard of plates (or the other way round).
//
// `music-audio-s` (card IMG-A stage 2) is the third, and the first whose unit
// is not money: lib/music/budget.ts has always metered SECONDS OF AUDIO
// REQUESTED, because no credits-per-second rate has been measured and a ceiling
// in a unit nobody can compute never fires. It keeps the vars and defaults that
// file always read; only the floor var is new, and it is reporting only.
//
// ENV IS READ PER CALL, never cached at import: a probe or an operator changes a
// ceiling after the module loaded and the next call must see it.
//
// DEFAULTS ARE SAFE, NOT UNLIMITED. An unset ceiling is the class's bounded
// default, never an open tab ("budget-defaults-unlimited"). `0` is a valid
// ceiling meaning "spend nothing", not "disabled".

export type SpendClass = "imaging-usd" | "video-usd" | "music-audio-s";

/** `audio-s`: seconds of audio requested from a music vendor. */
export type SpendUnit = "usd" | "audio-s";

export interface SpendClassDef {
  readonly id: SpendClass;
  readonly unit: SpendUnit;
  /** The ceiling per window, in `unit`. */
  readonly ceilingVar: string;
  /** The rolling window, in ms. */
  readonly windowVar: string;
  /** The bottom of the expected band, in `unit`. Reporting only: nothing the
   *  gate reads, so declaring a floor can never change who is refused. */
  readonly floorVar: string;
  readonly defaultCeiling: number;
  readonly defaultWindowMs: number;
  readonly defaultFloor: number;
  /** The axes a booked row carries, in the order a surface lists them. */
  readonly axes: readonly string[];
  /** The axis whose absence makes a row `unattributed` — the honesty field a
   *  booking path that forgot its axes shows up in. One of `axes`. */
  readonly attributionAxis: string;
}

export const SPEND_CLASSES: Readonly<Record<SpendClass, SpendClassDef>> = {
  "imaging-usd": {
    id: "imaging-usd",
    unit: "usd",
    ceilingVar: "IMAGING_BUDGET_USD_PER_WINDOW",
    windowVar: "IMAGING_BUDGET_WINDOW_MS",
    floorVar: "IMAGING_BUDGET_FLOOR_USD",
    defaultCeiling: 5,
    defaultWindowMs: 3_600_000, // one hour
    defaultFloor: 0, // off unless an operator states a band
    // The axes lib/imaging/log.ts already prints, so the ledger and the log
    // line describe one call in one vocabulary.
    axes: ["cap", "provider", "model"],
    attributionAxis: "cap",
  },
  "video-usd": {
    id: "video-usd",
    unit: "usd",
    ceilingVar: "VIDEO_BUDGET_USD_PER_WINDOW",
    windowVar: "VIDEO_BUDGET_WINDOW_MS",
    floorVar: "VIDEO_BUDGET_FLOOR_USD",
    // $15 an hour. Sized against the gate's per-clip hold, not a guess at a
    // bill: an unpriced clip holds $0.75/s (lib/imaging/video/pricing.ts), so
    // this admits four 5 s clips in flight at once, or two 10 s ones, and
    // refuses the fifth before the vendor is called. Settled rows replace the
    // holds with what the vendor reported, which is normally far less.
    defaultCeiling: 15,
    defaultWindowMs: 3_600_000, // one hour, as imaging
    defaultFloor: 0,
    // `project` leads because a clip is requested BY a project (the wire type
    // carries projectId "for spend attribution"); a row without one is the
    // honesty field, as `cap` is for imaging.
    axes: ["project", "provider", "model"],
    attributionAxis: "project",
  },
  "music-audio-s": {
    id: "music-audio-s",
    unit: "audio-s",
    ceilingVar: "MUSIC_BUDGET_SECONDS_PER_WINDOW",
    windowVar: "MUSIC_BUDGET_WINDOW_MS",
    floorVar: "MUSIC_BUDGET_FLOOR_SECONDS",
    // 600 s of audio an hour: a POLICY CHOICE, not a measurement, and the one
    // invented number in lib/music/budget.ts (its header says why). Unchanged
    // by the move onto the kernel.
    defaultCeiling: 600,
    defaultWindowMs: 3_600_000, // one hour
    defaultFloor: 0, // reporting only, as for imaging and video
    // The axes lib/music/log.ts prints: what was asked for, and which model.
    axes: ["op", "model"],
    attributionAxis: "op",
  },
};

/** The ceiling. Unset/negative/NaN → the class default. */
export function ceilingOf(def: SpendClassDef): number {
  const n = Number(process.env[def.ceilingVar]);
  return Number.isFinite(n) && n >= 0 ? n : def.defaultCeiling;
}

/** The floor. Unset/negative/NaN → the class default (0: no band declared). */
export function floorOf(def: SpendClassDef): number {
  const n = Number(process.env[def.floorVar]);
  return Number.isFinite(n) && n >= 0 ? n : def.defaultFloor;
}

/** The rolling window in ms. Unset/non-positive/NaN → the class default. */
export function windowMsOf(def: SpendClassDef): number {
  const n = Number(process.env[def.windowVar]);
  return Number.isFinite(n) && n > 0 ? n : def.defaultWindowMs;
}
