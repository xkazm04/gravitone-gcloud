// THE RUBRIC'S DOOR - a judged take scored 1-10 per dimension, written through v1's own store
// transaction (lib/sound/store.ts `withStore` + lib/sound/takes.ts `patchTakeTx`, which merges
// the bag and re-syncs the take's ledger row with its new `score` in the same transaction), then
// recorded as ONE ledger event - lib/sound/arrange.ts's order and keying, for its reasons.
//
// WHY IT EXISTS AGAIN (scout A.1 item 2). The Board's audio cull dropped the rubric (lib/decision/
// v1/sources/audio.ts "Dropped: the rubric"), so nothing new wrote a rating: "proven" on /audio
// (kept with a mean of 7) and the per-provider mean in the strengths starved quietly. v1 scored
// in the judge, one key per dimension (app/playground/triage/Judge.tsx). The Board's verdict has
// no field for a score (@gt/domain decision.ts carries verdict, reasons, note), so the score is
// written HERE, on the judged take - the Board judges, the desk scores - and the ledger row the
// Board's commit wrote is the row this updates.
//
// Upgraded from v1:
//   · the door holds the bag to the take's OWN dimensions, whole scores 1-10 (@gt/ui rubric.ts
//     `checkRatings`); v1 took any `[a-z_]` key and rounded to a tenth, so a typo was a silent
//     extra number in the mean;
//   · an unjudged take is refused: a score with no verdict reaches no ledger row (verdictRow),
//     so it would be a number that teaches nothing - judge it on the Board first;
//   · a fixture is refused (the ledger refuses it too, so its score would teach nothing either);
//   · every write carries the client's op id, which keys its event (appendOnce): a retried
//     score records once.
import { err, errorMessage, ok, type AppErrorCode, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { appendOnce } from "@gt/kernel/ingest";
import type { Store } from "@gt/kernel/store";
import { checkRatings, rubricMean, type Ratings } from "@gt/ui/components/audio/rubric.ts";

import { SoundError, withStore } from "./store.ts";
import { patchTakeTx } from "./takes.ts";
import type { SoundTake } from "./types.ts";

const STATUS_CODE: Readonly<Record<number, AppErrorCode>> = { 400: "invalid", 403: "refused", 404: "not-found", 409: "refused", 503: "unavailable" };

export const RATE_OP_RE = /^[a-z0-9]{6,40}$/;

export type RateInput = { readonly id: string; readonly ratings: Ratings; readonly opId: string };
export type Rated = { readonly take: SoundTake; readonly mean: number | null; readonly recorded: boolean };

export async function rateTake(kernel: Store, input: RateInput, actor: Actor, now: Date): Promise<Result<Rated>> {
  let landed: Result<SoundTake>;
  try {
    landed = await withStore(async (tx): Promise<Result<SoundTake>> => {
      const { takes } = await tx.get("takes");
      const t = takes.find((x) => x.id === input.id);
      if (t === undefined) return err("not-found", `no take ${input.id} in the sound store`);
      if (t.origin === "fixture") return err("refused", `${t.title} is a demo take; its score would reach no ledger`);
      if (t.verdict === "unjudged") return err("refused", `${t.title} is unjudged; keep or reject it on the Board first`);
      const checked = checkRatings(t, input.ratings);
      if (!checked.ok) return err("invalid", checked.error);
      return ok(await patchTakeTx(tx, t.id, { ratings: { ...checked.ratings } }, now));
    });
  } catch (e) {
    if (e instanceof SoundError) return err(STATUS_CODE[e.status] ?? "internal", e.message);
    return err("internal", errorMessage(e), { cause: e });
  }
  if (!landed.ok) return landed;
  const take = landed.value;
  const mean = rubricMean(take.kind, take.ratings);
  // The store committed first (its rule): a crash loses an event, never records a score the store does not hold.
  const ev = kernel.tx((t) =>
    appendOnce(t, {
      actor,
      type: "take.rated",
      subject: { kind: "take", id: take.id },
      lane: "audio",
      key: `audio-rubric:${input.opId}`,
      data: { title: take.title, kind: take.kind, ratings: { ...input.ratings }, mean },
    }),
  );
  if (!ev.ok) return err(ev.error.code, `the store took the score, the ledger did not: ${ev.error.message} - retry it to record it`);
  return ok({ take, mean, recorded: ev.value.appended });
}
