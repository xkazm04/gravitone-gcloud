#!/usr/bin/env node
// A STAND-IN FOR `gh` — the article write-back probes set ARTICLES_GH_BIN to
// this, so `gh pr create` opens nothing and contacts nothing. It prints a URL
// shaped like the real command's output and, with STUB_GH_LOG set, records the
// argv it was given.
import fs from "node:fs";

if (process.env.STUB_GH_LOG) fs.appendFileSync(process.env.STUB_GH_LOG, `${JSON.stringify(process.argv.slice(2))}\n`);
if (process.env.STUB_GH_FAIL === "1") {
  console.error("stub gh: told to fail");
  process.exit(1);
}
console.log("https://example.invalid/xkazm04/ai-registry/pull/1");
