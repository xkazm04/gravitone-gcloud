import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { copyText } from "../../app/(studio)/_shell/clipboard.ts";

// The copy act: outside a secure context navigator.clipboard is undefined, and the studio's
// copy sites used to throw a TypeError in the click handler instead of saying why.

afterEach(() => vi.unstubAllGlobals());

describe("copyText", () => {
  it("answers a refusal, not a throw, when there is no clipboard", async () => {
    vi.stubGlobal("navigator", {});
    const r = await copyText("x");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("https") });
  });

  it("answers a refusal when the write rejects, and ok when it lands", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
    expect(await copyText("x")).toEqual({ ok: false, error: "denied" });
    const seen: string[] = [];
    vi.stubGlobal("navigator", { clipboard: { writeText: (t: string) => (seen.push(t), Promise.resolve()) } });
    expect(await copyText("hello")).toEqual({ ok: true });
    expect(seen).toEqual(["hello"]);
  });
});

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
  });

describe("every copy site goes through copyText", () => {
  it("no file under app/ writes navigator.clipboard directly, comments aside", () => {
    const bare = walk("app")
      // the helper itself, and the dev inspector, which guards with `navigator.clipboard?.writeText`
      .filter((p) => !/(_shell.clipboard|_dev-inspector.DevInspector)\.tsx?$/.test(p))
      .filter((p) => {
        const code = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        return /navigator\.clipboard\.writeText/.test(code);
      });
    expect(bare).toEqual([]);
  });
});
