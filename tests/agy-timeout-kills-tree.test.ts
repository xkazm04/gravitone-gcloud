// agyProvider().generate (lib/imaging/providers/agy.ts): a generation that outlives its timeout
// rejects with an ImagingError of kind "timeout" and the spawned process tree is killed (killTree),
// grandchildren included. The provider resolves `agy` through PATH only, so the stub is a copy of
// this node binary named `agy` in a temp dir put first on PATH; a --require preload (NODE_OPTIONS)
// makes the `-p` invocation spawn a grandchild and block. `--version` exits before any preload runs,
// so the availability probe passes. No vendor is called and the store path is a temp file.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-agy-timeout-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  process.env["LOCAL_BINARIES"] = "on";
  return dir;
});

import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

import { ImagingError } from "../lib/imaging/errors.ts";
import { agyProvider } from "../lib/imaging/providers/agy.ts";

const SHORT_TIMEOUT_MS = 1_500;
const PROVIDER_TIMEOUT_MS = 180_000;

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitFor = async (what: string, ok: () => boolean, ms = 20_000): Promise<void> => {
  const deadline = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
};

const savedEnv = { PATH: process.env["PATH"], NODE_OPTIONS: process.env["NODE_OPTIONS"] };

afterEach(() => {
  vi.restoreAllMocks();
  if (savedEnv.PATH === undefined) delete process.env["PATH"];
  else process.env["PATH"] = savedEnv.PATH;
  if (savedEnv.NODE_OPTIONS === undefined) delete process.env["NODE_OPTIONS"];
  else process.env["NODE_OPTIONS"] = savedEnv.NODE_OPTIONS;
});

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe("agy generation timeout", () => {
  it("rejects with a timeout error and kills the process tree", async () => {
    const bin = join(ROOT, "bin");
    const childFile = join(ROOT, "child.pid");
    const grandFile = join(ROOT, "grand.pid");
    const preload = join(bin, "stub.cjs");
    rmSync(bin, { recursive: true, force: true });
    const { mkdirSync } = await import("node:fs");
    mkdirSync(bin, { recursive: true });
    copyFileSync(process.execPath, join(bin, process.platform === "win32" ? "agy.exe" : "agy"));
    writeFileSync(
      preload,
      [
        'const { spawn } = require("node:child_process");',
        'const { writeFileSync } = require("node:fs");',
        'if (process.execArgv.includes("-p")) {',
        "  const env = { ...process.env };",
        "  delete env.NODE_OPTIONS;",
        '  const g = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { env, stdio: "ignore" });',
        `  writeFileSync(${JSON.stringify(grandFile)}, String(g.pid));`,
        `  writeFileSync(${JSON.stringify(childFile)}, String(process.pid));`,
        "  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000);",
        "}",
      ].join("\n"),
    );

    process.env["PATH"] = `${bin}${delimiter}${savedEnv.PATH ?? ""}`;
    process.env["NODE_OPTIONS"] = `--require ${JSON.stringify(preload)}`;

    // Shrink only the provider's 180s generation timer; every other timer keeps its delay.
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) =>
      realSetTimeout(fn, ms === PROVIDER_TIMEOUT_MS ? SHORT_TIMEOUT_MS : ms, ...args)) as typeof setTimeout);

    const outcome = agyProvider()
      .generate?.({ prompt: "a poster", aspect: "16:9" })
      .then(
        () => null,
        (e: unknown) => e,
      );

    await waitFor("the stub to start", () => existsSync(childFile) && existsSync(grandFile));
    const childPid = Number(readFileSync(childFile, "utf8"));
    const grandPid = Number(readFileSync(grandFile, "utf8"));
    expect(alive(childPid)).toBe(true);
    expect(alive(grandPid)).toBe(true);

    const err = await outcome;
    expect(err).toBeInstanceOf(ImagingError);
    expect((err as ImagingError).kind).toBe("timeout");
    expect((err as ImagingError).provider).toBe("agy");

    await waitFor("the agy process to die", () => !alive(childPid));
    // killTree only reaches grandchildren through taskkill /T; elsewhere it is child.kill().
    if (process.platform === "win32") await waitFor("the grandchild to die", () => !alive(grandPid));
    else if (alive(grandPid)) process.kill(grandPid, "SIGKILL");
  }, 60_000);
});
