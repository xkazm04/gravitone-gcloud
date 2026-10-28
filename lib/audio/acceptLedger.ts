import type { Acceptance, AudioMeasureFull } from "@gt/domain/audio.accept";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { appendOnce } from "@gt/kernel/ingest";
import type { Store } from "@gt/kernel/store";

// THE ACCEPTANCE ROW - one append-only `audio.accept` event per measured blob per profile,
// which is what the Ledger screen reads (app/(studio)/ledger, the kernel events table). Keyed
// by the bytes and the destination, so a re-landed take, a resumed job or a retried act writes
// nothing new: the same audio judged against the same profile is one fact. Advisory: nothing
// reads the verdict to block a cut (operator decision, 2026-10-24).

// The key's prefix is `audio-accept`, not the event type: an event key is `<kind>:<rest>` with a
// kind of [a-z0-9-] (@gt/domain/event `eventKeySchema`), so `audio.accept:` is refused by the door
// and every row would fail to write.
export const acceptKeyOf = (sha: string, profile: string): string => `audio-accept:${sha}:${profile}`;

export type AcceptInput = {
  readonly sha: string;
  /** `voice-take` / `<projectId>:<lineId>:<takeId>` for a narration take. */
  readonly subject: { readonly kind: string; readonly id: string };
  readonly measure: AudioMeasureFull;
  readonly acceptance: Acceptance;
  readonly actor: Actor;
};

/** `kernel`: anything that runs a store transaction - the Store, or a producer step's effect port
 *  (lib/producers/voice.ts lands takes through `ctx.fx`, which has no Store to hand). */
export function recordAcceptance(kernel: Pick<Store, "tx">, input: AcceptInput): Result<{ readonly recorded: boolean }> {
  if (input.sha === "") return err("invalid", "an acceptance row names the blob it measured");
  const { acceptance: a, measure: m } = input;
  const r = kernel.tx((t) =>
    appendOnce(t, {
      actor: input.actor,
      type: "audio.accept",
      subject: input.subject,
      lane: "audio",
      key: acceptKeyOf(input.sha, a.profile),
      data: { sha: input.sha, profile: a.profile, verdict: a.verdict, reasons: [...a.reasons], ...m, ...(a.verdict === "fail" ? { reason: a.reasons.join("; ") } : {}) },
    }),
  );
  if (!r.ok) return err(r.error.code, `the take landed, its acceptance row did not: ${r.error.message}`);
  return ok({ recorded: r.value.appended });
}
