// THE ALBUM AND EXPLAINER PARTS' VIEW DATA, OPS AND ACTS (Phase 4 wave C, L40; STEPS-DESIGN §2
// "album parts", "explainer parts"). Zod-free, joined into ./partView.ts like ./partView.finish.ts.
//
// The album video is still · words · render (the still is L39's take grid); the explainer is
// article · strips · voice · cut (cut is ./partView.finish.ts's timeline over strips and voice).
// In v1 a music video had a Script and a Score that were notices reporting done on mount
// ("nothing to score here"); a part that is not in the recipe has no editor here, and a part
// that is has one with work in it.

import type { EngineView } from "./partView.data.ts";
import type { ExportView, TakeView } from "./partView.finish.ts";

/* ── album: words ─────────────────────────────────────────────────────────── */

/** The platform's limits the words are held to (YouTube: title 100, description 5000, tags 500
 *  characters in all - the mv-metadata turn's own bounds, lib/sound/mv). */
export const WORDS_LIMITS = { title: 100, description: 5000, tags: 500 } as const;

const UTF8 = new TextEncoder();

/** THE ONE COUNT of the words, as the platform counts them (lib/publish/youtube.ts snippetProblem,
 *  API-NOTES "Video resource"): the title in code points, the description in UTF-8 BYTES, the tags
 *  with a comma between each and quotes around a tag that holds a space. The verdict, the view's
 *  `tagChars`, the words editor's counter, the schedule form and the uploader all read these. */
export const wordsCount = {
  title: (title: string): number => [...title].length,
  description: (description: string): number => UTF8.encode(description).length,
  tags: (tags: readonly string[]): number => tags.reduce((n, t) => n + t.length + (t.includes(" ") ? 2 : 0), 0) + Math.max(0, tags.length - 1),
} as const;

export type WordsData = {
  readonly face: "words";
  readonly track: { readonly title: string; readonly durationS: number | null } | null;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  /** Characters the tags take as the platform counts them (`wordsCount.tags`: commas, and quotes around a tag with a space). */
  readonly tagChars: number;
  /** The words were written by a turn and edited since (the turn's text is not what is here). */
  readonly edited: boolean;
  readonly engine?: EngineView;
};

/* ── album: render ────────────────────────────────────────────────────────── */

export const RENDER_RES = ["1080p", "1440p", "2160p"] as const;
export type RenderRes = (typeof RENDER_RES)[number];

export type RenderData = {
  readonly face: "render";
  readonly track: { readonly title: string; readonly durationS: number | null } | null;
  /** The adopted still (the still gate's keep), by content address. */
  readonly still: { readonly label: string; readonly blob?: string } | null;
  readonly words: { readonly title: string } | null;
  readonly res: RenderRes;
  readonly exports: readonly ExportView[];
  /** The poster preview's inputs: the audio envelope the compositor animates against. */
  readonly envelope: readonly number[];
};

/* ── explainer: article and strips ────────────────────────────────────────── */

export type ArticleData = {
  readonly face: "article";
  readonly title: string | null;
  readonly sections: readonly { readonly id: string; readonly heading: string; readonly words: number; readonly lead: string }[];
  readonly words: number;
  /** The run's steps as the producer reports them (research, outline, draft, check, critique). */
  readonly steps: readonly { readonly name: string; readonly state: "done" | "waiting" | "failed"; readonly usd: number | null }[];
  readonly engine?: EngineView;
};

export type StripCardView = {
  readonly id: string;
  readonly title: string;
  readonly caption: string;
  /** Which article section the card draws. */
  readonly section: string;
  readonly state: "drawn" | "pending" | "refused";
  readonly blob?: string;
  readonly why?: string;
};

export type StripsData = {
  readonly face: "strips";
  readonly planned: number;
  readonly cards: readonly StripCardView[];
  readonly engine?: EngineView;
};

/* ── explainer: voice ─────────────────────────────────────────────────────── */

export type VoiceLineView = {
  readonly id: string;
  readonly text: string;
  /** The strip card the line plays under. */
  readonly card: string | null;
  readonly takes: readonly TakeView[];
  readonly activeTakeId: string | null;
};

export type VoiceData = {
  readonly face: "voice";
  readonly voice: string;
  readonly lines: readonly VoiceLineView[];
};

export type AlbumOp =
  | { readonly op: "words-field"; readonly field: "title" | "description"; readonly value: string }
  | { readonly op: "words-tags"; readonly tags: readonly string[] }
  | { readonly op: "render-res"; readonly res: RenderRes };

export type ExplainerOp =
  | { readonly op: "voice-use"; readonly lineId: string; readonly takeId: string }
  | { readonly op: "voice-mark"; readonly lineId: string; readonly takeId: string; readonly mark: "kept" | "rejected" | null }
  | { readonly op: "voice-line"; readonly lineId: string; readonly text: string };

export const WORDS_ACTS = ["write-words"] as const;
export const RENDER_ACTS = ["render-video"] as const;
export const ARTICLE_ACTS = ["write-article"] as const;
export const STRIPS_ACTS = ["draw-strips"] as const;
export const VOICE_ACTS = ["record-line"] as const;

export function albumOpLabel(op: AlbumOp | ExplainerOp): string {
  switch (op.op) {
    case "words-field":
      return `${op.field}`;
    case "words-tags":
      return `tags · ${op.tags.length}`;
    case "render-res":
      return op.res;
    case "voice-use":
      return `use ${op.takeId}`;
    case "voice-mark":
      return op.mark === null ? `undecide ${op.takeId}` : `${op.mark === "kept" ? "keep" : "reject"} ${op.takeId}`;
    case "voice-line":
      return `line ${op.lineId}`;
  }
}
