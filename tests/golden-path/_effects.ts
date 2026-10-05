// THE EFFECT-LOG HARNESS for the foundry commits (and any later disk store
// that takes an FsPort).
//
// Two instruments over lib/foundry/fsPort.ts:
//
// 1. `RecordingPort` — wraps the real port, logs every call in the order it
//    was APPLIED, and can throw at mutation k. "Crash at k" means mutations
//    1..k-1 reached the disk and k did not: exactly the durable state a
//    process killed between two effects leaves. A probe enumerates k over
//    1..K (K = the mutation count of an uninterrupted commit) instead of
//    hand-picking one failure and simulating it. Registry:
//    durable-agent-operations#recovery-prefix-enumeration — every prefix is
//    its own case, compared against the UNINTERRUPTED result, not merely
//    against "it completed".
//
// 2. `Interleaver` — a deterministic two-actor scheduler. Each actor runs in
//    an AsyncLocalStorage scope, so one process-wide port can tell whose call
//    it is. Calls the probe declares as BOUNDARIES (reads and writes of the
//    versioned indices — about six per commit) park until the probe releases
//    them; everything else runs freely. That bounds the interleavings to the
//    points where a lost update can actually happen. Registry:
//    concurrency-guards#race-catalog-with-two-histories — a race is driven in
//    BOTH of its orders, never in whichever order the runner happened to pick.
//
// A held actor that stops reaching boundaries without finishing is STALLED —
// it is blocked on something outside the port, which is what a correct lock
// looks like from here. The scheduler then lets the other actor run instead of
// hanging, so a fixed store (foundry-engine-A's `withCatalogue`) serializes
// cleanly under the same schedule that exposes the race today.

import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";

import { realFsPort, type FsPort } from "@/lib/foundry/fsPort";

export type EffectOp = keyof FsPort;

/** The calls that change the disk. Reads and stats are logged, never crashed. */
export const MUTATIONS: ReadonlySet<EffectOp> = new Set<EffectOp>(["writeJsonAtomic", "unlink", "copyFile", "writeFile", "mkdir"]);

export interface Effect {
  /** Order applied, across every actor. */
  seq: number;
  /** 1-based index among mutations; absent on reads. */
  k?: number;
  actor: string;
  op: EffectOp;
  file: string;
  /** copyFile's destination. */
  to?: string;
}

/** Human label for logs and assertions: `writeJsonAtomic styles.json`. */
export const label = (e: Effect): string => `${e.op} ${path.basename(e.to ?? e.file)}`;

export class CrashAt extends Error {
  constructor(
    readonly k: number,
    readonly effect: Omit<Effect, "seq">,
  ) {
    super(`injected crash at mutation ${k}: ${effect.op} ${effect.to ?? effect.file}`);
  }
}

const actorScope = new AsyncLocalStorage<string>();

export interface RecordingOptions {
  /** Throw CrashAt instead of applying mutation k (1-based). */
  crashAt?: number;
  /** Awaited before a call is applied; the Interleaver's hook. */
  gate?: (e: Omit<Effect, "seq" | "k">) => Promise<void>;
}

export class RecordingPort implements FsPort {
  readonly log: Effect[] = [];
  private seq = 0;
  private mutations = 0;

  constructor(
    private readonly opts: RecordingOptions = {},
    private readonly inner: FsPort = realFsPort,
  ) {}

  /** Mutations applied so far. After an uninterrupted run, this is K. */
  get applied(): number {
    return this.mutations;
  }

  private async around<T>(op: EffectOp, file: string, to: string | undefined, run: () => Promise<T>): Promise<T> {
    const base = { actor: actorScope.getStore() ?? "-", op, file, ...(to ? { to } : {}) };
    if (this.opts.gate) await this.opts.gate(base);
    const e: Effect = { seq: ++this.seq, ...base };
    if (MUTATIONS.has(op)) {
      e.k = ++this.mutations;
      if (this.opts.crashAt === e.k) {
        // Not logged as applied: the crash means it never reached the disk.
        this.mutations--;
        this.seq--;
        throw new CrashAt(e.k, base);
      }
    }
    this.log.push(e);
    return run();
  }

  readJson<T>(file: string, fallback: T): Promise<T> {
    return this.around("readJson", file, undefined, () => this.inner.readJson(file, fallback));
  }
  writeJsonAtomic(file: string, data: unknown): Promise<void> {
    return this.around("writeJsonAtomic", file, undefined, () => this.inner.writeJsonAtomic(file, data));
  }
  unlink(file: string): Promise<void> {
    return this.around("unlink", file, undefined, () => this.inner.unlink(file));
  }
  copyFile(src: string, dst: string): Promise<void> {
    return this.around("copyFile", src, dst, () => this.inner.copyFile(src, dst));
  }
  writeFile(file: string, data: string): Promise<void> {
    return this.around("writeFile", file, undefined, () => this.inner.writeFile(file, data));
  }
  mkdir(dir: string): Promise<void> {
    return this.around("mkdir", dir, undefined, () => this.inner.mkdir(dir));
  }
  stat(file: string): Promise<{ size: number }> {
    return this.around("stat", file, undefined, () => this.inner.stat(file));
  }

  /** The applied mutations, in order. */
  mutationLog(): Effect[] {
    return this.log.filter((e) => e.k !== undefined);
  }
}

/* ── The interleaver ──────────────────────────────────────────────────────── */

type Pending = Omit<Effect, "seq" | "k">;
interface Waiter {
  e: Pending;
  release: () => void;
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

export class Interleaver {
  private waiting: Waiter[] = [];
  private finished = new Set<string>();
  /** Every boundary released, in release order — the interleaving that ran. */
  readonly released: Pending[] = [];

  constructor(
    private readonly isBoundary: (e: Pending) => boolean,
    /** No boundary reached and not finished for this long = blocked outside the port. */
    private readonly stallMs = 300,
    /** Whole-schedule ceiling, so a deadlock fails the probe instead of hanging the lane. */
    private readonly ceilingMs = 15_000,
  ) {}

  readonly gate = (e: Pending): Promise<void> => {
    if (!this.isBoundary(e)) return Promise.resolve();
    return new Promise<void>((release) => this.waiting.push({ e, release }));
  };

  /** Start `fn` as `actor`. The returned promise never rejects; it settles to an Outcome. */
  start<T>(actor: string, fn: () => Promise<T>): Promise<Outcome<T>> {
    return actorScope
      .run(actor, fn)
      .then(
        (value): Outcome<T> => ({ ok: true, value }),
        (error): Outcome<T> => ({ ok: false, error }),
      )
      .finally(() => this.finished.add(actor));
  }

  private release(w: Waiter): void {
    this.waiting = this.waiting.filter((x) => x !== w);
    this.released.push(w.e);
    w.release();
  }

  /** The actor's oldest held boundary, `null` once it finished, or "stalled". */
  private async parked(actor: string): Promise<Waiter | null | "stalled"> {
    const t0 = Date.now();
    for (;;) {
      const w = this.waiting.find((x) => x.e.actor === actor);
      if (w) return w;
      if (this.finished.has(actor)) return null;
      if (Date.now() - t0 > this.stallMs) return "stalled";
      await new Promise((r) => setTimeout(r, 1));
    }
  }

  /** Release `actor`'s boundaries one at a time until the next one it reaches
   *  matches `until`, and HOLD that one. */
  async advanceTo(actor: string, until: (e: Pending) => boolean): Promise<"parked" | "finished" | "stalled"> {
    for (;;) {
      const w = await this.parked(actor);
      if (w === null) return "finished";
      if (w === "stalled") return "stalled";
      if (until(w.e)) return "parked";
      this.release(w);
    }
  }

  /** Release everything, preferring `first`'s boundaries while it can move, then
   *  any actor's, until every started actor has finished. */
  async drain(first: string, actors: readonly string[]): Promise<void> {
    const t0 = Date.now();
    let preferred: string | null = first;
    while (actors.some((a) => !this.finished.has(a))) {
      if (Date.now() - t0 > this.ceilingMs) {
        throw new Error(
          `interleaver: no progress in ${this.ceilingMs} ms; held: ${this.waiting.map((w) => `${w.e.actor}:${w.e.op} ${path.basename(w.e.file)}`).join(", ") || "none"}`,
        );
      }
      if (preferred) {
        const w = await this.parked(preferred);
        if (w && w !== "stalled") {
          this.release(w);
          continue;
        }
        preferred = null; // finished or blocked: let the others move
      }
      const any = this.waiting[0];
      if (any) this.release(any);
      else await new Promise((r) => setTimeout(r, 1));
    }
  }
}

/** A port that both records and lets an Interleaver hold its boundaries. */
export function interleavedPort(il: Interleaver): RecordingPort {
  return new RecordingPort({ gate: il.gate });
}

/* ── Snapshot normalisation ───────────────────────────────────────────────── */

/** Deep-copy JSON with every `at` timestamp replaced by a placeholder: a retry
 *  stamps its own time, and time is not what convergence is about. */
export function stripAt<T>(v: T): T {
  return JSON.parse(JSON.stringify(v), (key, value) => (key === "at" && typeof value === "string" ? "<at>" : value)) as T;
}
