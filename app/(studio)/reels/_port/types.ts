// THE /reels PORT'S SHAPES (spark reel-studio, WP-0 contract). WP3 owns the port (fixture + real); WP4's steps
// read `ReelDetail` and nothing else. Media are URLs the screen can hand to a <video> or <img>: the real side
// builds them on `/api/foundry/file?kind=reel`, the fixture side on its own static files. Absent = key omitted.

import type { FilmStage } from "@/lib/reel/film";
import type { ReelJobView } from "@/lib/producers/reel";
import type { ReelPin, StopKey } from "@/lib/reel/store";
import type { BedPrompt, FilmFace, FilmRecord, ReelIdea, ReelSource } from "@/lib/reel/types";

export type ReelLastVerdict = { readonly stop: StopKey; readonly verdict: "keep" | "reject" | "drop"; readonly at: string };

export type ReelRow = {
  readonly slug: string;
  readonly title: string;
  readonly hook: string;
  readonly stage: FilmStage;
  readonly last?: ReelLastVerdict;
  /** Desktop and phone film lengths, seconds. */
  readonly seconds?: Partial<Record<FilmFace, number>>;
  /** Publish copy sizes when encoded, else the masters'. */
  readonly bytes?: Partial<Record<FilmFace, number>>;
  readonly poster?: string;
  /** 12 desktop frames, in film order. Empty before the film is rendered. */
  readonly strip: readonly string[];
  readonly updatedAt: string;
};

export type ReelTableView = {
  readonly unit: string;
  readonly granularity: string;
  readonly periods: number;
  readonly entities: number;
  readonly source: ReelSource;
  readonly continuity: { readonly ok: boolean; readonly steps: number; readonly leadChanges: number; readonly movements: number; readonly events: number; readonly failures: readonly string[] };
};

export type ReelVerdictView = {
  readonly verdict: "keep" | "reject" | "drop";
  readonly reasons: readonly string[];
  readonly note?: string;
  readonly pins?: readonly ReelPin[];
  readonly at: string;
  readonly round: number;
  /** False when the subject was made again since: the verdict is history, the stop is open. */
  readonly current: boolean;
};

export type ReelDetail = ReelRow & {
  readonly idea: ReelIdea;
  readonly table?: ReelTableView;
  readonly film?: FilmRecord;
  readonly media: {
    readonly desktop?: string;
    readonly phone?: string;
    readonly phoneStrip?: readonly string[];
    readonly mixDesktop?: string;
    readonly mixPhone?: string;
    readonly releaseDesktop?: string;
    readonly releasePhone?: string;
    readonly bed?: string;
  };
  readonly bedPrompt?: BedPrompt;
  readonly verdicts: Partial<Record<StopKey, ReelVerdictView>>;
  /** The reason words each stop offers (from @gt/domain's reel source). */
  readonly reasons: { readonly film: readonly string[]; readonly release: readonly string[] };
  readonly jobs: readonly ReelJobView[];
};

export interface ReelsPort {
  listReels(): Promise<readonly ReelRow[]>;
  /** Undefined: no such reel. */
  reel(slug: string): Promise<ReelDetail | undefined>;
}
