// THE BOARD PORT - the contract between the Board's desks and whatever decides for real
// (Phase 3 COMMON "The BoardPort contract"). Wave A builds the UI against it with a fixture
// (app/(studio)/board/_port/fixture.ts); L24 implements it as Server Actions over the kernel
// and the source adapters. Types only, plus two pure readers, so a client module holds it.
//
// THE WIRE SHAPE IS THE ACTION CORE'S, not `Result<T>` itself: an AppError is a class and does
// not survive React's serialisation (app/_server/actionCore.ts), so every answer is
// `{ok, value}` or `{ok, error: ErrorEnvelope}` - the same envelope route() answers with.
//
// EVERY WRITE NAMES THE REVISION IT READ (`baseRev`). A stale one answers `conflict`; the
// gate then re-reads and sends only the keys it touched again (./boardGate.ts), which is
// v1's read-fresh-then-merge discipline (app/foundry/gate/cull.ts `write`) moved server-side.
//
// WHAT THE KERNEL DOES NOT HOLD rides beside the PacketView as `present`: the source's own
// words for its items (a plate's label, a scene's reference, an article's sections, a cut's
// beats). The kernel stores candidates by blob and grade; the adapter that opened the packet
// from v1 knows what a human calls them. Kept apart so the view stays the kernel's record.

import type { Consequence, EditPlan, PacketList, PacketView, PickOutcome } from "@gt/domain/board";
import type { ErrorEnvelope } from "@gt/domain/errors";

export type PortResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ErrorEnvelope };

/** One item's words, as its source names it. */
export type ItemWords = {
  readonly label: string;
  /** A second word under the label: a mechanism, a role, a provider and duration. */
  readonly meta?: string;
  /** A take's prompt, or a strip's line: clamped to two lines on the tile. */
  readonly prompt?: string;
  /** A take's waveform peaks (0..1), for an audio tile. */
  readonly peaks?: readonly number[];
  /** A take is music and may spawn a music video on commit (prototype M). */
  readonly music?: boolean;
};

/** A matrix row: a scene, a style, a strip. `ref` is a reference image, never output. */
export type RowWords = { readonly id: string; readonly label: string; readonly ref?: string; readonly inCatalogue?: boolean };

/** What the machine said before the gate (hitl-approval oracle-before-gate). */
export type Oracle = { readonly passed: boolean; readonly summary: string; readonly digest?: string; readonly fixture?: boolean };

export type ReviewSection = { readonly id: string; readonly heading: string; readonly text: string; readonly regenerated?: boolean };
export type ReviewCheck = { readonly name: string; readonly value: string; readonly ok: boolean };
export type Reviewer = { readonly who: string; readonly vote: "approve" | "request"; readonly note: string };

/** An article as the review desk reads it (prototype ArticleReview). */
export type ReviewDoc = {
  readonly title: string;
  readonly standfirst: string;
  readonly sections: readonly ReviewSection[];
  readonly checks: readonly ReviewCheck[];
  readonly reviewers: readonly Reviewer[];
  readonly turn: number;
  /** Illustrative text (a stand-in draft) is marked, never passed off as the real thing. */
  readonly illustrative?: boolean;
  readonly spend?: { readonly low: number; readonly high: number };
};

/** A cut as the cut desk reads it (prototype CutReview): the export and its caption beats. */
export type CutDoc = {
  readonly video: string;
  readonly poster?: string;
  readonly beats: readonly { readonly t0: number; readonly t1: number; readonly text: string }[];
  readonly channels: readonly string[];
};

export type Presentation = {
  /** By candidate id. */
  readonly items: Readonly<Record<string, ItemWords>>;
  /** Matrix rows in draw order (a blind pair's rows are its pairs). */
  readonly rows: readonly RowWords[];
  /** A blind pair's question, by pair (row) id. */
  readonly questions?: Readonly<Record<string, string>>;
  readonly oracle?: Oracle;
  /** Grades registered under graders other than the one the current calibration was measured on. */
  readonly series?: { readonly measured: string; readonly graded: readonly string[] };
  /** The packet's second line: the run, the bundle, the turn. */
  readonly meta?: string;
  readonly review?: ReviewDoc;
  readonly cut?: CutDoc;
  /** What v1 holds that this packet cannot carry whole (import-normalization: lossy-conversion
   *  disclosure), shown at the gate so the operator sees it before committing (wave B ruling 8). */
  readonly losses?: readonly Loss[];
};

/** One thing the v1 -> kernel conversion could not carry whole, graded. */
export type Loss = { readonly candidate?: string; readonly grade: "approximate" | "dropped"; readonly reason: string };

export type BoardPacket = { readonly view: PacketView; readonly present: Presentation };

/** One key of a patch: a candidate, its verdict, the source's reasons, a note where kept. */
export type VerdictChange = {
  readonly candidate: string;
  readonly verdict: "keep" | "reject" | null;
  readonly reasons: readonly string[];
  readonly note?: string;
};

export type Revised = { readonly rev: number };

/** What a commit answers: the kernel's counts, and the v1 apply it queued (decision 2). */
export type CommitReceipt = {
  readonly packetId: string;
  readonly rev: number;
  readonly kept: number;
  readonly rejected: number;
  readonly at: string;
  readonly apply?: PacketView["apply"];
};

export type BoardPort = {
  readonly loadPacket: (input: { readonly id: string }) => Promise<PortResult<BoardPacket>>;
  readonly listPackets: () => Promise<PortResult<PacketList>>;
  readonly patch: (input: { readonly id: string; readonly baseRev: number; readonly changes: readonly VerdictChange[] }) => Promise<PortResult<Revised>>;
  readonly undo: (input: { readonly id: string; readonly baseRev: number }) => Promise<PortResult<Revised>>;
  readonly pick: (input: { readonly id: string; readonly baseRev: number; readonly pair: string; readonly outcome: PickOutcome }) => Promise<PortResult<Revised>>;
  readonly preview: (input: { readonly id: string }) => Promise<PortResult<Consequence>>;
  readonly commit: (input: { readonly id: string; readonly rev: number; readonly token: string; readonly ticket: string }) => Promise<PortResult<CommitReceipt>>;
  readonly returnPacket: (input: { readonly id: string; readonly rev: number; readonly plan: EditPlan }) => Promise<PortResult<Revised>>;
};

/** The kernel's 409 on a commit whose preview went stale (L19: conflict, detail "stale-preview"). */
export function isStalePreview(e: ErrorEnvelope): boolean {
  return e.code === "conflict" && e.detail === "stale-preview";
}

/** The candidate id inside a `<packetId>::<candidateId>` decision key (the first `::` splits). */
export function candidateOfKey(key: string): string {
  const i = key.indexOf("::");
  return i < 0 ? key : key.slice(i + 2);
}
