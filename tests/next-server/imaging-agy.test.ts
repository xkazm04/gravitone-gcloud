// THE AGY ADAPTER, OFFLINE - lib/imaging/providers/agy.ts over a mocked node:child_process: no
// `agy` binary, no agent, no plan quota spent. The fake child writes the file it was asked to (or
// exits non-zero) and closes; what this pins is the adapter's own bookkeeping around that spawn:
// the per-call workspace never outlives the call, whatever the call's outcome.

import { existsSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Mode = "ok" | "exit1";
const fake = vi.hoisted(() => ({ modes: [] as string[], workspaces: [] as string[] }));

/** A 1x1 PNG's first bytes: enough for the adapter's sniff. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

vi.mock("node:child_process", async (orig) => {
  const real = await orig<typeof import("node:child_process")>();
  return {
    ...real,
    spawnSync: () => ({ status: 0, error: undefined }),
    spawn: (_bin: string, args: string[], opts: { cwd: string }) => {
      fake.workspaces.push(opts.cwd);
      const mode = (fake.modes.shift() ?? "ok") as Mode;
      const child = Object.assign(new EventEmitter(), { pid: undefined, stderr: new EventEmitter(), kill: () => true });
      const out = /absolute path (\S+) exactly/.exec(args[1] ?? "")?.[1];
      setTimeout(() => {
        if (mode === "ok" && out) writeFileSync(out, PNG);
        if (mode === "exit1") child.stderr.emit("data", "agy: not authenticated");
        child.emit("close", mode === "ok" ? 0 : 1);
      }, 1);
      return child;
    },
  };
});

const { agyProvider } = await import("../../lib/imaging/providers/agy.ts");
const { ImagingError } = await import("../../lib/imaging/errors.ts");

const saved = process.env.LOCAL_BINARIES;
beforeEach(() => {
  process.env.LOCAL_BINARIES = "on";
  fake.modes = [];
  fake.workspaces = [];
});
afterEach(() => {
  if (saved === undefined) delete process.env.LOCAL_BINARIES;
  else process.env.LOCAL_BINARIES = saved;
});

const REQ = { prompt: "a lighthouse at dusk, flat colour poster", aspect: "16:9" as const, count: 1 };

describe("the agy workspace", () => {
  it("is removed after a served call", async () => {
    const out = await agyProvider().generate!(REQ);
    expect(out.images).toHaveLength(1);
    expect(out.images[0]?.mime).toBe("image/png");
    expect(fake.workspaces).toHaveLength(1);
    await vi.waitFor(() => expect(existsSync(fake.workspaces[0]!)).toBe(false));
  });

  it("is removed when agy exits non-zero, and the stderr tail is the error", async () => {
    fake.modes = ["exit1"];
    const e = await agyProvider().generate!(REQ).then(
      () => null,
      (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(ImagingError);
    expect((e as InstanceType<typeof ImagingError>).message).toMatch(/agy exited 1\. stderr: agy: not authenticated/);
    expect(fake.workspaces).toHaveLength(1);
    await vi.waitFor(() => expect(existsSync(fake.workspaces[0]!), "the failed call's workspace was left in tmp").toBe(false));
  });
});
