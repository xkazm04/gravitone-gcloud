import { z } from "zod";

import { blobRefSchema } from "./blob.ts";
import { candidateIdSchema, jobIdSchema } from "./ids.ts";

// A CANDIDATE: one thing a job made that waits for the operator's verdict
// (plan §2.2), with the machine's grades on it.
//
// THE GRADE CARRIES ITS OWN CALIBRATION, AND CANNOT OMIT IT. v1 measured that
// its craft score ranks kept against rejected BACKWARDS (AUC 0.29) and its
// style score at chance (lib/foundry/calibration.ts), and still drew both as
// meters until `cullOrder` learned to skip them. A grade without its status is
// a number that looks like a measurement; here the status is a required,
// discriminated field, so a reader cannot get the value without passing the
// status, and only `calibrated` may be drawn.
//
// The four statuses are v1's, kept rather than folded into a tidier three:
// `insufficient` has NO AUC (too few keeps or rejects, or the field never
// varied) and `chance` has one that says nothing. Folding them into one
// "uncalibrated" would put a number on a status that v1 refused to number.

/** One AUC with its bootstrap CI (v1 `FieldCalibration`, measured per grader series). */
const measured = {
  auc: z.number().min(0).max(1),
  ci: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  nKeep: z.number().int().nonnegative(),
  nReject: z.number().int().nonnegative(),
};

export const calibrationSchema = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("calibrated"), ...measured }),
    z.object({ status: z.literal("inverted"), ...measured }),
    z.object({ status: z.literal("chance"), ...measured }),
    z.object({
      status: z.literal("insufficient"),
      /** Below the keep/reject floor, or the field never varied. */
      short: z.enum(["floor", "constant"]),
      nKeep: z.number().int().nonnegative(),
      nReject: z.number().int().nonnegative(),
    }),
  ])
  .superRefine((c, ctx) => {
    if (c.status === "insufficient") return;
    const [lo, hi] = c.ci;
    if (lo > hi) ctx.addIssue({ code: "custom", path: ["ci"], message: "a CI runs low to high" });
    // The CI side of v1's rule; the margin on the AUC is the method's, not the record's.
    if (c.status === "calibrated" && !(lo > 0.5))
      ctx.addIssue({ code: "custom", path: ["ci"], message: "calibrated means the whole CI sits above 0.5" });
    if (c.status === "inverted" && !(hi < 0.5))
      ctx.addIssue({ code: "custom", path: ["ci"], message: "inverted means the whole CI sits below 0.5" });
  });
export type Calibration = z.output<typeof calibrationSchema>;

export const gradeSchema = z.object({
  /** The graded field ("craft", "style_score", "has_text", "dojo_judge"). */
  field: z.string().regex(/^[a-z][a-z0-9_]*$/),
  value: z.number(),
  /** The grader series: model @ schema/prompt digest (v1 `seriesKey`).
   *  Grades from another series are another instrument and never pooled. */
  series: z.string().min(1),
  calibration: calibrationSchema,
});
export type Grade = z.output<typeof gradeSchema>;

export const candidateSchema = z
  .object({
    id: candidateIdSchema,
    jobId: jobIdSchema,
    media: blobRefSchema,
    /** The matrix row (a scene) or the blind pair this candidate belongs to;
     *  the Board's ⇧K/⇧X act on a row, and a pair is a row of two. */
    row: z.string().min(1).optional(),
    grades: z.array(gradeSchema),
  })
  .superRefine((c, ctx) => {
    const fields = c.grades.map((g) => g.field);
    if (new Set(fields).size !== fields.length)
      ctx.addIssue({ code: "custom", path: ["grades"], message: "a candidate carries one grade per field" });
  });
export type Candidate = z.output<typeof candidateSchema>;

/** The grades a surface may draw. The only reader of a grade's value that the
 *  UI needs; an inverted or chance-level field contributes nothing. */
export function shownGrades(c: Pick<Candidate, "grades">): Grade[] {
  return c.grades.filter((g) => g.calibration.status === "calibrated");
}
