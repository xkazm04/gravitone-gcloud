import { z } from "zod";
import { parseAt } from "@gt/domain/door";
import { AppError, ok, type Result } from "@gt/domain/errors";
import type { Estimate } from "@gt/domain/estimate";
import { actorSchema, type Actor, type Subject } from "@gt/domain/event";
import { canonical, sha256Hex } from "./canonical.ts";
import type { Effects } from "./effects.ts";
import { append } from "./events.ts";
import { costOf } from "./pricing/receipts.ts";
import type { Quote, Usage } from "./pricing/quote.ts";

// DRY RUN - one server-side request mode, ON BY DEFAULT (plan §3.2).
//
// v1 had four dry mechanisms, each inventing the idea again for one producer:
//   1. the pipeline board's STUB/LIVE arm (app/foundry/pipeline/arm.ts): a
//      client switch, STUB by default and STUB when storage cannot be read,
//      enforced twice because one path bypassed the shell; a dry move came back
//      as `stubbedMove(item, wouldCall)` naming the route it did not call.
//   2. publish DRY (lib/publish/channels.ts PUBLISH_MODE, default dry): the
//      YouTube client recorded every request it would make into a plan file,
//      and its send() refused outside live mode.
//   3. SUNO_DRIVER=fake (lib/sound/suno/queue.ts): an env switch to a
//      deterministic stand-in driver that touched no browser and no vendor.
//   4. __setMvEngines (lib/sound/mv/queue.ts): a probe hook swapping the MV
//      worker's engines for fakes on a module-level singleton.
// What they shared, and is kept: the default is the side that does not spend;
// a dry act is a SUCCESS that names what it would have called (the receipt is
// the evidence - "a switch whose only evidence is that nothing happened is a
// switch nobody trusts"); and leaving dry is an explicit act.
//
// What replaces all four is one wrapper over the Effects port. Every external
// call a driver makes already goes through `Effects.call`, so dry mode is a
// property of the port the driver is handed, not of the driver: no driver can
// forget it, and none needs a fake of its own. A paid call DECLARES its intent
// (`paid`) - provider, model, usage, quote, the exact payload - and in dry mode:
//   - the vendor function is never invoked;
//   - a `wouldCall` receipt is returned and booked on the ledger as a
//     `dryrun.would-call` event whose cost is `src: "model"`, never `real`;
//   - the driver either continues on the intent's declared stand-in (what the
//     Suno fake and the MV engine fakes were for) or stops with `isDryStop`.
// A call that declared nothing is refused in dry mode rather than made: an
// undeclared external call is exactly the path v1's arm comment warned about
// ("one path does not come through it"), and here it fails closed.
//
// Leaving dry needs a LiveArm: who armed it, when, and why - so every live
// spend carries its authority. A request that states no mode is dry; one that
// states a malformed mode is refused, never guessed in either direction.

export const liveArmSchema = z.object({ by: actorSchema, at: z.iso.datetime(), reason: z.string().trim().min(1) });
export type LiveArm = z.output<typeof liveArmSchema>;

export const runModeSchema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("dry") }), z.object({ kind: z.literal("live"), arm: liveArmSchema })]);
export type RunMode = z.output<typeof runModeSchema>;

export const DRY: RunMode = Object.freeze({ kind: "dry" });

/** The mode a request asked for. Absent is dry; malformed is `invalid`. */
export function runModeFrom(input: unknown): Result<RunMode> {
  if (input === undefined || input === null) return ok(DRY);
  return parseAt("run mode", runModeSchema, input);
}

/** The one way out of dry: an explicit, attributed act. */
export function armLive(by: Actor, at: string, reason: string): Result<RunMode> {
  return parseAt("live arm", runModeSchema, { kind: "live", arm: { by, at, reason } });
}

/** What a paid call is, stated before it is made. */
export type CallIntent<T> = {
  readonly provider: string;
  readonly model: string;
  readonly usage: Usage;
  readonly quote: Quote;
  readonly estimate?: Estimate;
  /** The exact request as it would go on the wire; plain JSON. Its digest is
   *  what makes two would-calls comparable. */
  readonly payload: unknown;
  /** What the call is for: the job, run or part it serves. */
  readonly subject: Subject;
  /** In dry mode, what the driver continues with. Absent: the driver stops here. */
  readonly stand?: () => T;
};

export type WouldCall = {
  readonly name: string;
  readonly provider: string;
  readonly model: string;
  readonly usage: Usage;
  readonly quote: Quote;
  readonly estimate?: Estimate;
  readonly payloadDigest: string;
  readonly subject: Subject;
};

type Declared = Omit<CallIntent<unknown>, "stand"> & { readonly stops: boolean };

/** Every declared paid call, keyed by its function. No type parameter survives
 *  here, and none is needed: the port reads only what it books. */
const declared = new WeakMap<object, Declared>();
/** Set by the dry port for exactly one synchronous entry into a declared call. */
const dryEntry = new WeakSet<object>();

const DRY_STOP = "dry-run";

export function isDryStop(e: unknown): boolean {
  return e instanceof AppError && e.code === "refused" && e.detail === DRY_STOP;
}

/**
 * Declare a paid call. The returned function is what a driver passes to
 * `fx.call`: under a live port it runs `live`; under the dry port it answers
 * with the stand-in, or stops, and never touches `live`.
 */
export function paid<T>(intent: CallIntent<T>, live: () => Promise<T>): () => Promise<T> {
  const fn = (): Promise<T> => {
    if (!dryEntry.delete(fn)) return live();
    const stand = intent.stand;
    if (stand === undefined) {
      return Promise.reject(new AppError("refused", `dry run: ${intent.provider}/${intent.model} was not called`, { detail: DRY_STOP }));
    }
    return Promise.resolve().then(stand);
  };
  const { stand, ...rest } = intent;
  declared.set(fn, { ...rest, stops: stand === undefined });
  return fn;
}

export type DryRunPort = {
  readonly effects: Effects;
  readonly mode: RunMode;
  /** The would-calls this port answered, in order: what the launch confirm shows. */
  readonly wouldCalls: readonly WouldCall[];
};

/** Wrap a port so that, unless `mode` is live, no external call is made. */
export function withDryRun(inner: Effects, mode: RunMode, actor: Actor): DryRunPort {
  if (mode.kind === "live") return { effects: inner, mode, wouldCalls: [] };
  const wouldCalls: WouldCall[] = [];
  const effects: Effects = {
    tx: (name, fn) => inner.tx(name, fn),
    blob: (bytes, mime) => inner.blob(bytes, mime),
    async call(name, fn) {
      const d = declared.get(fn);
      if (d === undefined) {
        throw new AppError("refused", `dry run: "${name}" is an external call with no declared intent; it was not made`, { detail: DRY_STOP });
      }
      const w: WouldCall = {
        name,
        provider: d.provider,
        model: d.model,
        usage: d.usage,
        quote: d.quote,
        ...(d.estimate === undefined ? {} : { estimate: d.estimate }),
        payloadDigest: sha256Hex(canonical(d.payload)),
        subject: d.subject,
      };
      const booked = inner.tx(`would-call:${name}`, (t) => {
        const cost = costOf(d.quote, "dry");
        const data = { name, provider: w.provider, model: w.model, usage: { ...w.usage }, basis: d.quote.basis, note: d.quote.note, payloadDigest: w.payloadDigest };
        append(t, cost === undefined ? { actor, type: "dryrun.would-call", subject: d.subject, data } : { actor, type: "dryrun.would-call", subject: d.subject, cost, data });
      });
      if (!booked.ok) throw booked.error;
      wouldCalls.push(w);
      // The vendor function itself is entered only to read the stand-in; the
      // mark is taken back synchronously at its first line.
      dryEntry.add(fn);
      try {
        return await inner.call(name, fn);
      } finally {
        dryEntry.delete(fn);
      }
    },
  };
  return { effects, mode, wouldCalls };
}
