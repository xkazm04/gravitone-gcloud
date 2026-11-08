// The Codex image adapter (lib/imaging/local/codex.ts) and its provider: the turn it asks for, what it returns, and
// every way it refuses. No real codex runs here: a fake child writes the output file a real turn would.
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CODEX_MODEL, CODEX_REFS_MAX, drawCodex, pngSize, type CodexDeps } from "../../lib/imaging/local/codex.ts";
import { codexProvider } from "../../lib/imaging/providers/codex.ts";

/** A minimal PNG header declaring width x height: enough for `pngSize`. */
function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

type Seen = { args: readonly string[]; cwd: string; stdin: string };

/** A fake codex: records what it was asked and ends with `code`, having written `out` (null: writes nothing). */
function fake(seen: Seen[], out: Buffer | null = png(1672, 941), code = 0, stderr = ""): NonNullable<CodexDeps["spawn"]> {
  return (_cmd, args, opts) => {
    const ends: Array<(c: number | null) => void> = [];
    const entry: Seen = { args, cwd: opts.cwd, stdin: "" };
    seen.push(entry);
    return {
      pid: undefined,
      kill: () => undefined,
      stderr: {
        on: (_e, f) => {
          if (stderr !== "") f(stderr);
        },
      },
      stdin: {
        end(s: string) {
          entry.stdin = s;
          setImmediate(() => {
            if (out !== null) writeFileSync(path.join(opts.cwd, "still.png"), out);
            for (const f of ends) f(code);
          });
        },
      },
      on(ev: string, f: (x: never) => void) {
        if (ev === "close") ends.push(f as unknown as (c: number | null) => void);
      },
    };
  };
}

describe("drawCodex", () => {
  it("asks for one image in the aspect's words over stdin and returns the file's bytes and measured size", async () => {
    const seen: Seen[] = [];
    const r = await drawCodex({ prompt: "a red door", aspect: "9:16", seed: 41 }, { spawn: fake(seen, png(941, 1672)) });
    expect(r).toMatchObject({ seed: 41, model: CODEX_MODEL, width: 941, height: 1672 });
    expect(seen[0]?.stdin).toContain("tall 9:16 portrait");
    expect(seen[0]?.stdin).toContain("a red door");
    expect(seen[0]?.args).not.toContain("a red door");
    expect(seen[0]?.args.slice(0, 2)).toEqual(["exec", "--skip-git-repo-check"]);
    expect(existsSync(seen[0]?.cwd ?? "")).toBe(false);
  });

  it("attaches each reference with -i, written into the workspace", async () => {
    const seen: Seen[] = [];
    await drawCodex({ prompt: "her again", refs: [new Uint8Array([1]), new Uint8Array([2])] }, { spawn: fake(seen) });
    expect(seen[0]?.args.filter((a) => a === "-i")).toHaveLength(2);
    expect(seen[0]?.args.some((a) => a.includes("ref-2.png"))).toBe(true);
  });

  it("refuses an empty prompt and too many references before spawning anything", async () => {
    const seen: Seen[] = [];
    await expect(drawCodex({ prompt: "  " }, { spawn: fake(seen) })).rejects.toThrow(/needs a prompt/);
    await expect(drawCodex({ prompt: "x", refs: Array.from({ length: CODEX_REFS_MAX + 1 }, () => new Uint8Array()) }, { spawn: fake(seen) })).rejects.toThrow(/at most/);
    expect(seen).toHaveLength(0);
  });

  it("keeps the CLI's own sentence when it exits non-zero", async () => {
    await expect(drawCodex({ prompt: "x" }, { spawn: fake([], null, 1, "seat is signed out") })).rejects.toThrow(/codex exited 1: seat is signed out/);
  });

  it("refuses a clean exit that wrote no file, or wrote something that is not a PNG", async () => {
    await expect(drawCodex({ prompt: "x" }, { spawn: fake([], null) })).rejects.toThrow(/wrote no still\.png/);
    await expect(drawCodex({ prompt: "x" }, { spawn: fake([], Buffer.from("<html>not an image at all, sorry</html>")) })).rejects.toThrow(/not a PNG/);
  });

  it("ends a turn that outlives the cap with its own sentence", async () => {
    const hung: NonNullable<CodexDeps["spawn"]> = () => ({ pid: undefined, kill: () => undefined, stdin: { end: () => undefined }, stderr: null, on: () => undefined });
    await expect(drawCodex({ prompt: "x" }, { spawn: hung, timeoutMs: 20 })).rejects.toThrow(/did not finish its image turn/);
  });

  it("pngSize: reads the header, refuses other bytes", () => {
    expect(pngSize(png(3, 2))).toEqual({ width: 3, height: 2 });
    expect(pngSize(new Uint8Array(40))).toBeNull();
  });
});

describe("codexProvider", () => {
  const stillOf = { png: new Uint8Array(png(1672, 941)), seed: 3, model: CODEX_MODEL, width: 1672, height: 941, wallMs: 5 } as const;

  it("draws one still, a negative riding in the prompt, and books it at $0", async () => {
    const calls: unknown[] = [];
    const p = codexProvider({
      draw: async (r) => {
        calls.push(r);
        return stillOf;
      },
    });
    const out = await p.generate?.({ prompt: "a door", negativePrompt: "text", aspect: "16:9", count: 1, seed: 3 } as never);
    expect(calls).toEqual([{ prompt: "a door Avoid: text.", aspect: "16:9", seed: 3 }]);
    expect(out?.provenance).toMatchObject({ provider: "codex", model: CODEX_MODEL, costUsd: 0, negativePromptChannel: "prose" });
    expect(out?.images[0]).toMatchObject({ mime: "image/png", width: 1672, height: 941 });
  });

  it("maps a 4:5 request to portrait and refuses a count above one", async () => {
    const calls: Array<{ aspect?: string }> = [];
    const p = codexProvider({
      draw: async (r) => {
        calls.push(r);
        return stillOf;
      },
    });
    await p.generate?.({ prompt: "x", aspect: "4:5", count: 1 } as never);
    expect(calls[0]?.aspect).toBe("9:16");
    await expect(p.generate?.({ prompt: "x", aspect: "16:9", count: 2 } as never)).rejects.toThrow(/one image per request/);
  });
});
