// The error taxonomy for the music vendor — same shape as lib/imaging/errors.ts
// and lib/claudeCli.ts on purpose: one class, a `kind` the caller switches on,
// a message already written for a human. The route maps `kind` → HTTP status.
//
// `refused` stays distinct from `failed` here for the same field-tested reason
// as in imaging: a refusal is a routing/spotting decision (the cue reverts to
// refused-silence and the cut says so — see app/_studio/score.ts's cue-2),
// never a retry loop. A music model declining a brief is a first-class outcome
// the Score surface already knows how to render.

export type MusicErrorKind =
  | "no-key"
  | "refused"
  | "rate-limited"
  | "timeout"
  | "bad-response"
  | "bad-request"
  | "failed";

export class MusicError extends Error {
  readonly kind: MusicErrorKind;
  constructor(kind: MusicErrorKind, message: string) {
    super(message);
    this.name = "MusicError";
    this.kind = kind;
  }
}

export function statusFor(kind: MusicErrorKind): number {
  switch (kind) {
    case "no-key":
      return 503;
    case "bad-request":
      return 400;
    case "refused":
      return 422;
    case "rate-limited":
      return 429;
    case "timeout":
      return 504;
    default:
      return 502;
  }
}
