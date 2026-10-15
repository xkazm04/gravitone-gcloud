import type { Result } from "@gt/domain/errors";
import type { AtSource, EventInput } from "@gt/domain/event";
import type { JobState } from "@gt/domain/job";
import type { MediaLane, ResourceLane } from "@gt/domain/lane";

// THE v1 PROJECTION'S CONTRACT (Phase 2) - what every adapter under
// app/_server/v1/sources/ implements, and what the sync, the Ledger and Runs
// build on.
//
// A Source is a reader and a PURE projection. `read()` is the only I/O and
// goes through v1's own readers in lib/ (listRuns, getRun, ...), which stay
// the writers of their stores: NOTHING here writes to a v1 file. `project()`
// takes the snapshot and the sync's clock and returns three things computed
// from the same bytes:
//   events  the event-grade facts, each with its natural key (COMMON decision 2);
//   live    the work in flight, read at render time and never stored (decision 4);
//   tally   what the store holds, counted WITHOUT going through `events`, so the
//           reconcile probe compares two independent readings and a fact the
//           projection drops shows up as a difference.
// Types only: this file is imported by tests and the CLI as well as the app.

/** Which data universe a record came from (lib/fixtures/mode.ts). Every
 *  projected event carries it in `data.src`, so a fixture row can never be read
 *  as real work. */
export type Universe = "real" | "fixture";

export type ProjectCtx = {
  /** The sync's clock: a `derived` instant is this, never a guessed past. */
  readonly now: Date;
  readonly universe: Universe;
};

/** A projected fact: always keyed, always carrying its two clocks. */
export type IngestEvent = EventInput & { readonly key: string; readonly occurredAt: string; readonly atSrc: AtSource };

/** One unit of v1 work in flight, as Runs draws it. */
export type LiveJob = {
  readonly source: string;
  readonly id: string;
  readonly title: string;
  readonly lane: ResourceLane;
  /** Why the lane is what it is when v1 does not say: the rule used, verbatim. */
  readonly laneFrom?: string;
  readonly media: MediaLane;
  /** Mapped onto @gt/domain/job honestly: `running` only when something is
   *  provably driving it; see each adapter for its v1 states. */
  readonly state: JobState;
  readonly startedAt?: string;
  readonly progress?: { readonly done: number; readonly total: number; readonly stage?: string };
  readonly attempt?: number;
  readonly error?: string;
  /** Where v1 shows it. v1's foundry has no per-record URL; the page is the link. */
  readonly href: string;
};

/**
 * A pile waiting for a human (plan §2.2 Packet: "a Weir pile"). Not a job -
 * nothing occupies a lane while it waits - so it is a list of its own rather
 * than a LiveJob with a fake state: Runs' Weir lane draws these, its resource
 * lanes draw LiveJobs, and neither has to filter the other. A committable run
 * with nothing to judge (a forge run that failed before its first plate) is
 * not a pile: v1 lets it be committed, but the Weir has nothing to show.
 */
export type WeirItem = {
  readonly source: string;
  readonly id: string;
  readonly title: string;
  readonly media: MediaLane;
  /** `cull`: keep/reject over generated plates or styles. `gate`: approve/reject claimed improvements. */
  readonly kind: "cull" | "gate";
  /** When it became ready, if v1 recorded it. */
  readonly since?: string;
  readonly decided: number;
  readonly pending: number;
  readonly href: string;
};

/** What the v1 store holds, counted the way the reconcile probe compares. */
export type SourceTally = {
  /** Records by their v1 state (`run.done: 3`). */
  readonly records: Readonly<Record<string, number>>;
  /** Event-grade facts by the event type they project to (`run.log: 188`). */
  readonly facts: Readonly<Record<string, number>>;
};

/** A record the reader could not use, and the v1 reader's or the door's words. */
export type Skipped = { readonly id: string; readonly reason: string };

export type Projection = {
  readonly events: readonly IngestEvent[];
  readonly live: readonly LiveJob[];
  readonly weir: readonly WeirItem[];
  readonly tally: SourceTally;
  readonly skipped: readonly Skipped[];
};

/**
 * One v1 store. Methods, not function properties, on purpose: a method's
 * parameter is checked bivariantly, so `Source<ForgeSnapshot>` sits in a
 * `Source<unknown>[]` registry without a cast, while each adapter keeps its
 * own snapshot type end to end.
 */
export type Source<S> = {
  readonly id: string;
  read(): Promise<Result<S>>;
  project(snapshot: S, ctx: ProjectCtx): Projection;
};
