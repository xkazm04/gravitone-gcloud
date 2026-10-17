import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import { INTERRUPTED_TEXT } from "@gt/domain/slot";
import { listSlots } from "../src/slots/read.ts";
import { sweep } from "../src/slots/sweep.ts";
import { createSlot } from "../src/slots/write.ts";
import { must, scratch } from "./helpers.ts";
import { draft, facts, NOW, OP, world } from "./slots.fixture.ts";

// TWO PROCESSES, ONE CLAIM PER SLOT - v1's "two concurrent ticks publish a due slot exactly
// once" (publish.probe.spec.ts), across real processes as the store's no-lost-update test does
// it (store.file.test.ts), because the promise is about the worker's tick and the CLI's running
// at once, not two calls in one event loop. Then the children are gone with their claims held
// and no outcome recorded - the crash v1 met with a {pid, at} claim file - and the parent's
// sweep, judging by the lease's evidence, fails every one of them "interrupted" and claims none.

const tmp = scratch("slotproc");
afterAll(() => tmp.dispose());
const child = path.join(path.dirname(fileURLToPath(import.meta.url)), "slots.child.ts");

const childOut = z.object({ claimed: z.array(z.string()), interrupted: z.array(z.string()), failures: z.number(), pid: z.number() });
type ChildOut = z.output<typeof childOut>;

function run(db: string, times: number): Promise<ChildOut> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", child, db, String(times), new Date(NOW).toISOString()], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let errText = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (errText += d.toString()));
    p.on("exit", (code) => {
      const line = out.trim().split("\n").pop() ?? "";
      if (code !== 0 || line === "") reject(new Error(`child exited ${code}: ${out} ${errText}`));
      else {
        const v = parseJsonAt("slots.child output", childOut, line);
        if (v.ok) resolve(v.value);
        else reject(v.error);
      }
    });
  });
}

describe("the claim across processes", () => {
  it("two processes sweeping at once claim each due slot exactly once; their deaths leave every slot failed, none re-fired", async () => {
    const w = world(tmp.dir, "proc");
    const ids: string[] = [];
    for (let i = 0; i < 40; i++) ids.push(must(createSlot(w.k.store, draft({ libraryItemId: `video:export:e-${i}` }), OP)).slot.id);
    w.k.close();

    const [a, b] = await Promise.all([run(w.file, 15), run(w.file, 15)]);
    expect(a.failures + b.failures).toBe(0);
    const all = [...a.claimed, ...b.claimed];
    expect(all.length).toBe(40);
    expect(new Set(all).size).toBe(40);
    expect([...all].sort()).toEqual([...ids].sort());

    // A child that outlived its sibling may already have judged the sibling's claims; whoever
    // judged them, each slot is interrupted exactly once and claimed by nobody again.
    const again = world(tmp.dir, "proc");
    try {
      const r = must(sweep(again.k.store, facts(), { claim: true }));
      expect(r.claimed).toEqual([]);
      const judged = [...a.interrupted, ...b.interrupted, ...r.interrupted];
      expect([...judged].sort()).toEqual([...ids].sort());
      const slots = must(listSlots(again.k.store));
      expect(slots.every((s) => s.slot.state === "failed" && s.slot.error === INTERRUPTED_TEXT)).toBe(true);
      expect(must(sweep(again.k.store, facts(), { claim: true })).claimed).toEqual([]);
    } finally {
      again.k.close();
    }
  }, 60_000);
});
