import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { blobStore, type BlobStore } from "../src/blob.ts";
import { enumerateCrashes, type CrashSpec } from "../src/crash.ts";
import { liveEffects, type Effects } from "../src/effects.ts";
import { append, eventsMigrations, verify } from "../src/events.ts";
import { migrate, type ModuleMigrations } from "../src/migrate.ts";
import { openStore, type Store, type Tx } from "../src/store.ts";
import { must, scratch } from "./helpers.ts";

// The one real scenario the harness ships with (Director decision 7): "append
// a state change and its event". After ANY crash prefix, either both are
// visible or neither is; after recovery, exactly one of each and the chain
// verifies. The scenario has the effects a real driver has - a provider call,
// a blob write, a transaction - so the enumeration has places to cut.

const tmp = scratch("crash");
afterAll(() => tmp.dispose());
let n = 0;

const widgets: ModuleMigrations = {
  module: "widgets",
  steps: [{ version: 1, sql: "CREATE TABLE widgets (id TEXT PRIMARY KEY, media TEXT NOT NULL);" }],
};

type World = { file: string; store: Store; blobs: BlobStore; calls: number };

function count(s: Store, sql: string): number {
  const v = must(s.read((r) => r.get(sql)?.["n"]));
  return typeof v === "number" ? v : -1;
}

/** The driver under test: render a widget, keep its media, record it. Resumable:
 *  a widget already recorded is not recorded again. */
async function renderWidget(fx: Effects, w: World, split: boolean): Promise<void> {
  const done = must(w.store.read((r) => r.get("SELECT 1 AS n FROM widgets WHERE id = 'w1'")));
  if (done !== undefined) return;
  const out = await fx.call("provider", async () => {
    w.calls++;
    return new TextEncoder().encode("rendered pixels");
  });
  const media = must(await fx.blob(out, "image/png"));
  const record = (t: Tx) => t.run("INSERT INTO widgets VALUES ('w1', ?)", media.sha256);
  const event = (t: Tx) => {
    append(t, { actor: { kind: "machine", id: "box.render" }, type: "widget.render", subject: { kind: "widget", id: "w1" }, data: { media: media.sha256 } });
  };
  if (split) {
    // The defect the outbox rule exists to prevent: state and event in two transactions.
    must(fx.tx("record", (t) => void record(t)));
    must(fx.tx("event", (t) => event(t)));
  } else {
    must(fx.tx("record+event", (t) => {
      record(t);
      event(t);
    }));
  }
}

function spec(split: boolean): CrashSpec<World> {
  const open = (file: string, calls: number): World => {
    const store = must(openStore(file));
    must(migrate(store, [eventsMigrations, widgets], { snapshotDir: tmp.dir }));
    return { file, store, blobs: blobStore(`${file}.blobs`), calls };
  };
  return {
    open: () => open(path.join(tmp.dir, `w-${++n}.sqlite`), 0),
    reopen: (w) => {
      w.store.close();
      return open(w.file, w.calls);
    },
    close: (w) => w.store.close(),
    effects: (w) => liveEffects(w.store, w.blobs),
    scenario: (fx, w) => renderWidget(fx, w, split),
    recover: (fx, w) => renderWidget(fx, w, split),
    invariant: (w, phase) => {
      const state = count(w.store, "SELECT count(*) AS n FROM widgets");
      const events = count(w.store, "SELECT count(*) AS n FROM events WHERE subject_kind = 'widget'");
      if (state !== events) return `${state} widget row(s) but ${events} widget event(s)`;
      if (phase === "recovered" && state !== 1) return `recovery left ${state} widgets`;
      const chain = must(verify(w.store));
      return chain.state === "intact" ? undefined : `chain broken at ${chain.seq}: ${chain.reason}`;
    },
  };
}

describe("crash-prefix enumeration", () => {
  it("state change and its event: every prefix shows both or neither, and recovery converges", async () => {
    const report = await enumerateCrashes(spec(false));
    expect(report.effects).toEqual(["call:provider", "blob", "tx:record+event"]);
    expect(report.prefixes).toBe(3);
    expect(report.violations).toEqual([]);
  });

  it("negative control: the same driver with state and event in two transactions is caught", async () => {
    const report = await enumerateCrashes(spec(true));
    expect(report.effects).toEqual(["call:provider", "blob", "tx:record", "tx:event"]);
    // Caught twice: a reader sees the orphan state, and the resume - which
    // trusts the state row as proof of completion - never writes the event.
    expect(report.violations).toEqual([
      { k: 3, phase: "crashed", after: "tx:record", reason: "1 widget row(s) but 0 widget event(s)" },
      { k: 3, phase: "recovered", after: "tx:record", reason: "1 widget row(s) but 0 widget event(s)" },
    ]);
  });

  it("reports a scenario that swallows the crash and carries on", async () => {
    const base = spec(false);
    const swallowing: CrashSpec<World> = {
      ...base,
      scenario: async (fx, w) => {
        try {
          await renderWidget(fx, w, false);
        } catch (e) {
          // The bug under test: a driver that eats every throw.
          void e;
        }
      },
    };
    const report = await enumerateCrashes(swallowing);
    expect(report.violations.length).toBeGreaterThan(0);
    expect(report.violations.every((v) => v.phase === "scenario")).toBe(true);
  });
});
