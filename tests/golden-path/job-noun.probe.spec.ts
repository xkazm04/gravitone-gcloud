// LANE — ONE JOB, ONE NAME ACROSS THE BELL'S CARDS.
// The running and interrupted cards printed the raw JobKind id
// ("poster-generate running") while the event card for the same job used the
// curated noun ("Poster generation returned"). JOB_NOUN is the single source.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const read = (f: string) => stripComments(readFileSync(join(process.cwd(), f), "utf8"));

test("the bell never renders the raw JobKind id as a job's name", () => {
  const bell = read("components/ui/NotificationBell.tsx");
  expect(bell.length).toBeGreaterThan(0);
  expect(bell.match(/[{]j\.kind[}]\s*(running|interrupted)/g) ?? []).toEqual([]);
  expect(bell).toMatch(/jobNoun\(j\.kind\)/);
});

test("lib/jobs exports jobNoun over the exhaustive JOB_NOUN table", () => {
  const jobs = read("lib/jobs.tsx");
  expect(jobs.length).toBeGreaterThan(0);
  expect(jobs).toMatch(/export function jobNoun\(kind: JobKind\): string [{]\s*return JOB_NOUN\[kind\]/);
});
