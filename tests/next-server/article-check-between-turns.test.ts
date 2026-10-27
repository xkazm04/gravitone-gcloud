// THE BETWEEN-TURN CHECK TAKES NO PICTURES (lib/articles/checksRendered.ts). checkLoop runs the
// deterministic check after every writer turn (up to 9 passes a run) and reads only its
// numbers; the check step deletes check/ before the run whose screenshots the human sees. The
// three full-page PNGs each pass wrote were written to be deleted. `screenshots: false` keeps
// every measurement and writes nothing; the default still writes the three.
// B08C_TIMING=1 prints the wall time of both arms over a long post.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { runCheck } from "../../lib/articles/checks.ts";
import { renderedItems } from "../../lib/articles/checksRendered.ts";

const root = mkdtempSync(path.join(tmpdir(), "gt-check-shots-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const paras = Array.from({ length: Number(process.env.B08C_PARAS ?? 6) }, (_, i) => `<p>Paragraph ${i} of the post, set at a readable size so the measurement passes. ${"word ".repeat(60)}</p>`).join("\n");
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 600" width="1400" height="600"><rect width="1400" height="600" fill="#eee"/><text x="40" y="80" font-size="28">Figure</text></svg>';
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font:20px/1.6 Georgia,serif;max-width:700px;margin:0 auto}figcaption{font-size:16px}</style></head><body><article>${paras}<figure>${svg}<figcaption>Figure 1</figcaption></figure></article></body></html>`;
const post = path.join(root, "post");
mkdirSync(post, { recursive: true });
writeFileSync(path.join(post, "index.html"), html);

describe("renderedItems screenshots option", () => {
  it("screenshots: false takes every measurement and writes no picture", async () => {
    const shots = path.join(root, "off");
    const r = await renderedItems(post, shots, { screenshots: false });
    expect(r.screenshots).toEqual([]);
    expect(existsSync(shots), "no screenshot directory").toBe(false);
    expect(r.items.map((i) => i.id).sort()).toEqual(["body-font-1440", "body-font-390", "chrome-font", "no-overflow-390", "offline-rendered"]);
  }, 60_000);

  it("the default still writes the three screenshots, with the same items", async () => {
    const shots = path.join(root, "on");
    const r = await renderedItems(post, shots);
    expect(readdirSync(shots).sort()).toEqual(["screenshot-1440-dark.png", "screenshot-1440.png", "screenshot-390.png"]);
    expect(r.screenshots).toHaveLength(3);
    const off = await renderedItems(post, path.join(root, "off2"), { screenshots: false });
    expect(off.items).toEqual(r.items);
  }, 60_000);

  it("runCheck passes the option through: screenshots: false leaves no check/ directory", async () => {
    const run = path.join(root, "run");
    mkdirSync(path.join(run, "post"), { recursive: true });
    writeFileSync(path.join(run, "post", "index.html"), html);
    const r = await runCheck(run, { screenshots: false });
    expect(r.screenshots).toEqual([]);
    expect(existsSync(path.join(run, "check"))).toBe(false);
    expect(r.items.some((i) => i.id === "body-font-1440")).toBe(true);
  }, 60_000);

  it("the between-turn check asks for no screenshots and the check step still does", () => {
    const code = (f: string) => readFileSync(path.join(import.meta.dirname, "../../lib/articles", f), "utf8").replace(/\/\*[^]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code("checkLoop.ts")).toMatch(/runCheck\(dir, \{[^}]*screenshots: false/);
    expect(code("checkStep.ts")).not.toMatch(/screenshots: false/);
  });

  it.runIf(process.env.B08C_TIMING === "1")("timing", async () => {
    const t = { on: [] as number[], off: [] as number[] };
    for (let i = 0; i < 8; i++) {
      let a = performance.now();
      await renderedItems(post, path.join(root, `t-on-${i}`));
      t.on.push(performance.now() - a);
      a = performance.now();
      await renderedItems(post, path.join(root, `t-off-${i}`), { screenshots: false });
      t.off.push(performance.now() - a);
    }
    const med = (xs: number[]) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
    const line = `B08C_TIMING paras=${process.env.B08C_PARAS ?? 6} on=${med(t.on).toFixed(0)}ms off=${med(t.off).toFixed(0)}ms min-on=${Math.min(...t.on).toFixed(0)} min-off=${Math.min(...t.off).toFixed(0)} ${JSON.stringify(t.on.map(Math.round))} ${JSON.stringify(t.off.map(Math.round))}
`;
    writeFileSync(process.env.B08C_OUT ?? path.join(root, "timing.log"), line, { flag: "a" });
  }, 300_000);
});
