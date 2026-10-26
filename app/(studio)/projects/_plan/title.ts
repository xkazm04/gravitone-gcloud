// THE PLAN TITLE'S COMMIT. Two gestures end the field and each ends in a blur, which commits too:
// ⏎ commits and then blurs (so the blur would send the same rename again, on the same revision,
// and the server's answer to the second is a conflict drawn under a rename that worked), and Esc
// reverts and then blurs (so the blur must not commit what Esc just put back). Pure, so a test
// drives both gestures without a DOM; Plan.tsx holds one per page.

export type TitleGate = {
  /** The title to send now, or null: empty, unchanged, the one already in flight, or the blur after an Esc. */
  readonly take: (typed: string, current: string) => string | null;
  /** Its rename answered (either way): the same words may be sent again. */
  readonly settle: () => void;
  /** Esc in the field: the next take - the blur the revert causes - sends nothing. */
  readonly cancel: () => void;
};

export function titleGate(): TitleGate {
  let inflight: string | null = null;
  let skip = false;
  return {
    take: (typed, current) => {
      if (skip) {
        skip = false;
        return null;
      }
      const t = typed.trim();
      if (t === "" || t === current || t === inflight) return null;
      inflight = t;
      return t;
    },
    settle: () => {
      inflight = null;
    },
    cancel: () => {
      skip = true;
    },
  };
}
