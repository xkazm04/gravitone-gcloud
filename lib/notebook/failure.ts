// THE FAILURE: what a model returned when it answered and the answer is not a notebook.
//
// Split out of validate.ts so the door can stay a short file. It has no imports
// and no dependencies on the shape, graph or retrieval halves.

/* ──────────────────────────────── the failure ────────────────────────────── */

/**
 * ONE REASON A NOTEBOOK WAS REFUSED, ADDRESSED TO THE FIELD THAT CAUSED IT.
 *
 * `path` is a JSON path into the answer (`tension.strength`, `facts[2].sources[0].name`),
 * the address a repair turn is allowed to touch and a surface can pin the
 * finding to. `rule` is the requirement, in the validator's own words, and
 * `observed` is what the answer actually held. A finding about the answer as a
 * whole has an empty `path`.
 */
export interface NotebookFinding {
  path: string;
  rule: string;
  observed: string;
}

/**
 * A model answered, and what came back is not a notebook.
 *
 * Carries EVERY finding rather than the first, because the fix is a prompt
 * change and one finding at a time is a prompt edited five times for one run's
 * worth of information. The route turns this into `code: "bad-response"` —
 * lib/text/errors.ts's own word for "it answered, and we could not use what came
 * back" — rather than inventing a second vocabulary for the same event.
 *
 * `findings` are the path-addressed findings; `messages` is the derived list of
 * their sentences (what `.message` is built from) for a caller that only prints
 * them. A bare string is accepted and becomes a finding with no path. `draft` is
 * the refused answer itself when the caller has it, so the paid-for object can
 * be repaired instead of discarded.
 */
export class NotebookError extends Error {
  readonly findings: NotebookFinding[];
  readonly messages: string[];
  constructor(
    found: readonly (string | NotebookFinding)[],
    readonly draft?: unknown,
  ) {
    const findings = found.map((f): NotebookFinding => (typeof f === "string" ? { path: "", rule: f, observed: "" } : f));
    const messages = findings.map((f) => f.rule);
    super(
      messages.length === 1
        ? messages[0]
        : `${messages.length} problems with the returned notebook: ${messages.join(" · ")}`,
    );
    this.name = "NotebookError";
    this.findings = findings;
    this.messages = messages;
  }
}
