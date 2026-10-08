// P1 proof: the seek gate must FAIL a strip that carries state between calls
// (invisible to the lint) and PASS the same strip computed from i alone.
// Run: npx tsx pipeline/strips/fixtures/prove-gates.mts
import path from "node:path";
import { lintStrip } from "../lint.mjs";
import { launchHeadless, renderStrip } from "../render.mjs";
import { readFileSync } from "node:fs";

const here = path.join(process.cwd(), "pipeline", "strips", "fixtures");
const out = path.join(process.cwd(), "foundry-out", "strips", "_prove-gates");
const browser = await launchHeadless();
try {
  const res: Record<string, unknown> = {};
  for (const name of ["hand", "impure"]) {
    const html = path.join(here, `${name}.html`);
    const lint = lintStrip(readFileSync(html, "utf8"));
    const r = await renderStrip({ browser, htmlPath: html, outDir: path.join(out, name), lane: "stat" });
    res[name] = { lint: lint.map((l) => l.rule), ok: r.ok, error: r.error, renderMs: r.renderMs, gates: r.gates };
  }
  console.log(JSON.stringify(res, null, 2));
  const h = res.hand as { gates?: { seek: { ok: boolean } } };
  const im = res.impure as { gates?: { seek: { ok: boolean } } };
  const pass = h.gates?.seek.ok === true && im.gates?.seek.ok === false;
  console.log(pass ? "PAIRED PROOF OK: seek gate passes pure, fails carried state" : "PAIRED PROOF FAILED");
  process.exitCode = pass ? 0 : 1;
} finally {
  await browser.close();
}
