// THE DISPATCH MANIFEST — what one turn's prompt is made of, before it is sent.
// SERVER ONLY. (AIO-B.)
//
// The two expensive routes (/api/recalibrate, /api/frames) decide, before a
// minutes-long paid turn, which material the engine reads and which it does
// not. The manifest is that decision as data: the prompt's named blocks and
// their sizes, and — for the turn that scopes material — what was sent and what
// was withheld by name. It is built by the same code that builds the prompt, in
// the same pass, so it cannot describe a payload other than the one dispatched.
//
// It carries sizes and ids, never text. The prompt is the creator's notebook
// and script (lib/text/log.ts's rule), and a manifest is meant to travel: to a
// preview, onto a version's receipt.

export interface ManifestBlock {
  /** A stable slug ("system", "notebook", "renders-not-sent", …). */
  name: string;
  /** Characters this block contributes to the prompt, including the newline
   *  that separates it from the next — so the blocks sum to `totalChars`. */
  chars: number;
}

export interface TurnManifest {
  blocks: ManifestBlock[];
  /** Recalibrate only: render ids whose beat chains go in, and those named as
   *  RENDERS NOT SENT. */
  renders?: { sent: string[]; notSent: string[] };
  /** Recalibrate only: conclusions sent whole, and those named as CONCLUSIONS
   *  NOT SENT. */
  conclusions?: { whole: string[]; held: string[] };
  /** Recalibrate only: how many notes the run answers. */
  notes?: number;
  /** The assembled prompt's length — what is billed. */
  totalChars: number;
  /** The ceiling the route holds this run to. For recalibrate it bounds the
   *  caller's material; for frames, the assembled prompt. */
  ceilingChars: number;
}

/** A request the route would refuse before assembling anything — the same
 *  status and the same sentence, so a preview and a run cannot disagree. */
export interface Refusal {
  status: 400 | 413;
  detail: string;
  code?: "too-large";
}

/** The refusal as the route answers it. Key order matches the routes' original
 *  inline bodies (`{ detail, code }`). */
export function refusalResponse(r: Refusal): Response {
  return Response.json(r.code ? { detail: r.detail, code: r.code } : { detail: r.detail }, { status: r.status });
}

/**
 * A prompt built as named blocks of lines, joined exactly as the routes always
 * joined theirs: every line of every block, in order, with "\n".
 *
 * `undefined` lines are kept, not filtered — `Array.prototype.join` renders them
 * as the empty string, and the routes have always relied on that (an absent
 * `scope` serialises to `undefined` and leaves an empty line). Filtering them
 * would delete a newline and move every byte after it.
 */
export function joinBlocks(blocks: { name: string; lines: (string | undefined)[] }[]): {
  prompt: string;
  blocks: ManifestBlock[];
} {
  const live = blocks.filter((b) => b.lines.length > 0);
  const prompt = live.flatMap((b) => b.lines).join("\n");
  const sized = live.map((b, i) => ({
    name: b.name,
    chars:
      b.lines.reduce((n, l) => n + (l ?? "").length, 0) +
      // One separator after each line, except the very last line of the prompt.
      b.lines.length -
      (i === live.length - 1 ? 1 : 0),
  }));
  return { prompt, blocks: sized };
}
