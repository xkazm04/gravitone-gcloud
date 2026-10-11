// THE FAILURE: what a model returned when it answered and the answer is not a notebook.
//
// Split out of validate.ts so the door can stay a short file. It has no imports
// and no dependencies on the shape, graph or retrieval halves.

/* ──────────────────────────────── the failure ────────────────────────────── */

/**
 * A model answered, and what came back is not a notebook.
 *
 * Carries EVERY finding rather than the first, because the fix is a prompt
 * change and one finding at a time is a prompt edited five times for one run's
 * worth of information. The route turns this into `code: "bad-response"` —
 * lib/text/errors.ts's own word for "it answered, and we could not use what came
 * back" — rather than inventing a second vocabulary for the same event.
 */
export class NotebookError extends Error {
  constructor(readonly findings: string[]) {
    super(
      findings.length === 1
        ? findings[0]
        : `${findings.length} problems with the returned notebook: ${findings.join(" · ")}`,
    );
    this.name = "NotebookError";
  }
}
