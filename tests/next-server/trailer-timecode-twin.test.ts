// atSeconds (lib/script/trailer) and secondsAt (kernel digest) are one parser in two
// packages; a field past 59 is a typo, reported as null by both.
import { describe, expect, it } from "vitest";
import { atSeconds } from "@/lib/script/trailer/types";
import { secondsAt } from "../../packages/kernel/src/records/digest.ts";

const CASES: ReadonlyArray<readonly [string, number | null]> = [
  ["0:75", null],
  ["1:5", null],
  ["1:60:00", null],
  ["1:02", 62],
  ["1:00:00", 3600],
  ["0:00", 0],
  ["12:34", 754],
];

describe("timecode parsers", () => {
  for (const [at, want] of CASES) {
    it(`reads ${at} as ${String(want)} in both copies`, () => {
      expect(atSeconds(at)).toBe(want);
      expect(secondsAt(at)).toBe(want);
    });
  }
});
