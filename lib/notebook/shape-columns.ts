// THE `dimensions[]` AND `conclusions[]` CHECKS of the shape half.
//
// Split out of shape.ts so that file stays under the 200-line limit. Both are
// optional, additive fields, so their checks are kept together and run at the
// same point in the order of findings as before (after engineFit, before gaps).
// `say` is the shape half's own finding sink, passed in unchanged.

import { arr, isObj, LEAPS, str, USES } from "./shape-helpers";

/**
 * Check the optional `dimensions` and `conclusions` fields, appending each
 * finding through `say`.
 */
export function columnFindings(
  nb: Record<string, unknown>,
  say: (path: string, rule: string, observed?: string) => void,
): void {
  /* dimensions[] and conclusions[] - optional, additive (schema: Dimensions and conclusions) */
  const declaredColumns = new Set<string>();
  if (nb.dimensions !== undefined) {
    if (!arr(nb.dimensions)) say("dimensions", "`dimensions` must be an array of columns when present.");
    else {
      nb.dimensions.forEach((raw, i) => {
        const at = `dimensions[${i}]`;
        if (!isObj(raw)) return say(at, `${at} is not an object.`, "not an object");
        for (const k of ["id", "label", "purpose", "emptyByOmission", "notApplicable"])
          if (!str(raw[k])) say(`${at}.${k}`, `${at}.${k} is missing. A column that cannot say what its emptiness means is not finished.`);
        if (str(raw.id)) {
          if (declaredColumns.has(raw.id)) say(`${at}.id`, `${at}.id "${raw.id}" is declared twice.`, "declared twice");
          declaredColumns.add(raw.id);
        }
      });
      // A card tagged to a column nobody declared renders nowhere.
      for (const key of ["facts", "mechanisms", "reversals"] as const) {
        const rows = nb[key];
        if (!arr(rows)) continue;
        rows.forEach((row, i) => {
          if (isObj(row) && row.dimension !== undefined && !(str(row.dimension) && declaredColumns.has(row.dimension)))
            say(
              `${key}[${i}].dimension`,
              `${key}[${i}].dimension "${String(row.dimension)}" is not one of the declared dimensions (${[...declaredColumns].join(", ")}).`,
              String(row.dimension),
            );
        });
      }
    }
  }
  if (nb.conclusions !== undefined) {
    if (!arr(nb.conclusions)) say("conclusions", "`conclusions` must be an array when present.");
    else
      nb.conclusions.forEach((raw, i) => {
        const at = `conclusions[${i}]`;
        if (!isObj(raw)) return say(at, `${at} is not an object.`, "not an object");
        for (const k of ["id", "claim", "reasoning"]) if (!str(raw[k])) say(`${at}.${k}`, `${at}.${k} is missing.`);
        if (!LEAPS.includes(raw.leap as string)) say(`${at}.leap`, `${at}.leap must be one of ${LEAPS.join(", ")}.`, String(raw.leap));
        if (!arr(raw.restsOn)) say(`${at}.restsOn`, `${at}.restsOn must be an array of fact ids.`);
        if (!(str(raw.falsifiableBy) || isObj(raw.falsifiableBy)))
          say(`${at}.falsifiableBy`, `${at}.falsifiableBy is missing. A conclusion that cannot be wrong is a vibe.`);
        if (!USES.includes(raw.useFor as string)) say(`${at}.useFor`, `${at}.useFor must be one of ${USES.join(", ")}.`, String(raw.useFor));
      });
  }
}
