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

export const acceptKeyOf = (sha: string, profile: string): string => `audio.accept:${sha}:${profile}`;

export type AcceptInput = {
  readonly sha: string;
  /** `voice-take` / `<projectId>:<lineId>:<takeId>` for a narration take. */
  readonly subject: { readonly kind: string; readonly id: string };
  readonly measure: AudioMeasureFull;
  readonly acceptance: Acceptance;
  readonly actor: Actor;
};

export function recordAcceptance(kernel: Store, input: AcceptInput): Result<{ readonly recorded: boolean }> {
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
