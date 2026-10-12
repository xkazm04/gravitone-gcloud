// THE CHECK, ITEM CONSTRUCTORS — the two shapes every check item is built from.
//
// Split out of checks.ts (the door) for the 200-line limit. `item` builds a pass
// or fail row; `absent` builds a row that says the measurement was not taken and
// why. The static checks and the rendered checks both build rows, so the
// constructors sit in their own file rather than in either one.

import type { CheckDimension, CheckItem } from "./types";

export const item = (dimension: CheckDimension, id: string, label: string, pass: boolean, extra: Partial<CheckItem> = {}): CheckItem => ({
  id,
  dimension,
  label,
  status: pass ? "pass" : "fail",
  ...extra,
});

export const absent = (dimension: CheckDimension, id: string, label: string, why: string): CheckItem => ({
  id,
  dimension,
  label,
  status: "not-measured",
  detail: [why],
});
