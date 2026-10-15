import type { Result } from "@gt/domain/errors";
import type { AtSource, EventInput } from "@gt/domain/event";
import type { JobState } from "@gt/domain/job";
import type { MediaLane, ResourceLane } from "@gt/domain/lane";

// THE v1 PROJECTION'S CONTRACT (Phase 2) - what every adapter under
// lib/ledger/v1/sources/ implements, and what the sync, the Ledger and Runs
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

/**
 * A Calendar slot that has not settled (lib/publish/types.ts ScheduleSlot).
 * Not a job - a slot occupies no resource while it waits for its hour, and
 * Runs draws it on the Calendar row - so it is its own list, as the Weir is
 * (wave B, lot 15). `published` and `cancelled` slots are history: they are
 * in the ledger, not here.
 */
export type LiveSlot = {
  readonly source: string;
  readonly id: string;
  readonly title: string;
  readonly channel: string;
  readonly projectId: string;
  /** When v1 will (or would have) published it. A reschedule moves this. */
  readonly publishAt: string;
  /** v1's own word, verbatim: the Calendar's state machine is not a job's. */
  readonly status: "scheduled" | "publishing" | "missed" | "failed";
  readonly error?: string;
  readonly href: string;
};

/**
 * Money a spend class has reserved and not yet settled (lib/spend/meter.ts
 * reserve): in flight, not spent, not a job. v1's hold names no vendor - the
 * provider is known only when the row is booked - so a hold carries its class
 * and no resource lane; Runs draws it as in-flight money, never on a row it
 * would have to guess.
 */
export type LiveHold = {
  readonly source: string;
  readonly id: string;
  readonly spendClass: string;
  readonly amount: number;
  readonly unit: "usd" | "audio-s";
  /** When it was reserved; absent when v1's stamp does not read as an instant. */
  readonly since?: string;
  /** The reserving process: `gone` is a hold v1's next transaction reclaims once its TTL has run. */
  readonly owner: "alive" | "gone" | "unknown";
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
  /** Only the publish source has slots and only the spend source has holds; absent elsewhere. */
  readonly slots?: readonly LiveSlot[];
  readonly holds?: readonly LiveHold[];
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
