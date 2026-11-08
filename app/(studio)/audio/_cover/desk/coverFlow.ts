// WHAT ONE COVER IN HAND HANDS THE DESK (./useCover.ts): the shape, apart from the hook that fills it.
import type { CoverCard } from "@gt/domain/cover";
import type { Receipt } from "@gt/domain/produce";
import type { ReceiptChanges } from "@gt/ui/components/produce/produce.ts";
import type { Span } from "@gt/ui/components/rangepick/rangepick.ts";

import type { Heard } from "./audio.ts";

export type Launching = { readonly receipt: Receipt; readonly changes?: ReceiptChanges; readonly readAtMs: number };

export type BriefFlow = {
  readonly launching: Launching | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly ask: () => void;
  readonly confirm: () => void;
  readonly cancel: () => void;
  /** The job the brief's act answered already exists: nothing new was queued. */
  readonly existing: string | null;
  /** When the view was last read (client only): the brief's age is measured against it. */
  readonly readAtMs: number | null;
};

export type CoverFlow = {
  readonly card: CoverCard;
  readonly heard: Heard | null;
  readonly heardError: string | null;
  readonly lenS: number;
  readonly span: Span;
  readonly setSpan: (s: Span) => void;
  readonly style: string;
  readonly setStyle: (s: string) => void;
  readonly sourceStyle: string;
  readonly setSourceStyle: (s: string) => void;
  readonly lyrics: string;
  readonly setLyrics: (s: string) => void;
  /** The plan may still change: nothing is queued, or the last job failed. */
  readonly editable: boolean;
  readonly launching: Launching | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly launch: () => void;
  readonly confirm: () => void;
  readonly cancel: () => void;
  readonly picking: number | null;
  readonly pickError: string | null;
  readonly pick: (seed: number) => void;
  readonly remixError: string | null;
  readonly remixBusy: boolean;
  readonly sendRemix: (file: File, style: string) => void;
  readonly stylesBusy: boolean;
  readonly stylesError: string | null;
  readonly stylesSaved: boolean;
  readonly saveStyles: (sourceStyle: string, remixStyle: string) => void;
  readonly brief: BriefFlow;
};
