import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Result } from "@gt/domain/errors";
import { enqueue, loadJob, putJob } from "@gt/kernel/job";
import { holdLaneIn } from "@gt/kernel/job-queue";
import { openKernel } from "@gt/kernel/kernel";

// L45 (Phase 4 exit, WAVE-D item E): a `--once` drain over a HELD lane names the hold and the job
// waiting behind it, as it names an unbound head. Before, it exited 0 with nothing said: the drain
// found nothing it could start, never looked, and the operator read an empty run over a stuck line.

const ROOT = process.cwd();
const STUB = path.join(ROOT, "tests", "next-server", "fixtures", "worker-stub.mts");
const OP = { kind: "operator", id: "op" } as const;
const dir = mkdtempSync(path.join(tmpdir(), "gt-worker-held-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

const job = (id: string) => ({ id, of: { kind: "run" as const, id: id.slice(8) }, producer: "research", lane: "seat.text" as const });

describe("the --once drain names a held lane", () => {
  it("names the job that holds it, at its stage, and the head waiting behind; nothing is claimed", () => {
    const file = path.join(dir, "held.sqlite");
    const k = must(openKernel(file));
    must(enqueue(k.store, job("job:run:crashed"), OP));
    must(enqueue(k.store, job("job:run:behind"), OP));
    // The crash as recovery leaves it: the job interrupted at its step, its paid lane held.
    must(
      k.store.tx((t) => {
        const crashed = { ...loadJob(t, "job:run:crashed").job, state: "interrupted" as const, interruption: { at: t.at, holder: { bootId: "b", pid: 1, host: "h" }, stage: "turn" } };
        putJob(t, crashed);
        return holdLaneIn(t, crashed, OP);
      }),
    );
    k.close();
    const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", STUB, "--once", "--json", "--idle-ms", "50", "--lanes", "seat.text"], {
      cwd: ROOT,
      env: { ...process.env, GRAVITONE_STORE_PATH: file, GRAVITONE_DRY_ONLY: "1" },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe("");
    expect(r.stderr).toContain("seat.text is held by job job:run:crashed at turn: credits may be spent - look first, then acknowledge it; job:run:behind waits behind it");
  }, 60_000);
});
