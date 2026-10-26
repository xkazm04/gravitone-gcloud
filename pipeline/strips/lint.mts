// THE FRAME-PURITY LINT lives in lib/foundry/strips/lint.ts since Phase 4 (L33): the
// strip job's lint step and this self-test read one copy.

import { lintStrip } from "../../lib/foundry/strips/lint.ts";

export { formatLint, lintStrip, stripFramesRule, type LintFinding, type LintOptions } from "../../lib/foundry/strips/lint.ts";

// Self-test: `npx tsx pipeline/strips/lint.mts --selftest`
if (process.argv.includes("--selftest")) {
  const bad = `<script>window.renderFrameAt=function(i){var x=Math.random();requestAnimationFrame(f);fetch("/x")};window.STRIP_READY=true;addEventListener("message",e=>{if(e.data.type==="strip-frame"){}})</script><style>.a{transition: opacity 1s}</style><img src="https://x.y/z.png">`;
  const good = `<svg xmlns="http://www.w3.org/2000/svg"></svg><style>.a{animation: spin 1s linear; animation-play-state: paused; transition: none}</style><script>window.renderFrameAt=function(i){};window.STRIP_READY=true;addEventListener("message",e=>{if(e.data&&e.data.type==="strip-frame")renderFrameAt(e.data.i)})</script>`;
  const b = lintStrip(bad).map((f) => f.rule);
  const g = lintStrip(good);
  const want = ["randomness: Math.random (use a seeded PRNG)", "scheduler: requestAnimationFrame", "network: fetch", "network: external src/href", "time: running CSS transition"];
  const missing = want.filter((w) => !b.includes(w));
  // The frame count is the brief's (spark scout-vision S5): 240 by default, a full cut's own when it says so.
  const long = good.replace("<script>", "<script>window.STRIP={width:1080,height:1920,fps:30,frames:900};");
  const frames = [lintStrip(good).length === 0, lintStrip(long, { frames: 900 }).length === 0, lintStrip(long).length === 1, lintStrip(good, { frames: 900 }).length === 1];
  if (missing.length || g.length || frames.includes(false)) {
    console.error("lint selftest FAILED", { missing, falsePositives: g, frames });
    process.exit(1);
  }
  console.log(`lint selftest ok: ${b.length} findings on the planted page, 0 on the clean page, the frame count followed`);
}
