// LANE — A LIST THAT HAS NOT ANSWERED IS DRAWN. The Cull and Dojo tabs rendered
// nothing while their run / cycle list was unanswered (and forever if it hung);
// Styles and the detail panes already drew <Loading>.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const read = (f: string) => stripComments(readFileSync(resolve(__dirname, "../../app/foundry", f), "utf8"));

test("foundry: the Cull tab draws Loading while the run list is unanswered", () => {
  expect(read("FoundryView.tsx")).toMatch(/runs === null && !runsError && <Loading/);
});

test("foundry: the Dojo tab draws Loading while the cycle list is unanswered", () => {
  expect(read("DojoView.tsx")).toMatch(/cycles === null && !listError && <Loading/);
});
