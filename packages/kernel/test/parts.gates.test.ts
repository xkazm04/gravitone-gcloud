import { afterAll, describe, expect, it } from "vitest";
import * as gates from "../src/parts/gates.ts";
import { gatePacketFact } from "../src/parts/gates.ts";
import type { Reader, Store } from "../src/store.ts";
import { MODULES } from "./decision.fixtures.ts";
import { must, steppingClock, templateStores } from "./helpers.ts";

// A GATE'S FACT, READ FROM THE PACKET TABLE: the newest attempt by NUMBER (`#10` after `#2`,
// though it sorts before it as text), never a sibling gate whose id merely shares the prefix,
// and read by an index seek - the plan reads it once per gate part per render, over a table
// that only grows (a packet is never deleted).

const tpl = templateStores(MODULES, { clock: steppingClock() });
afterAll(() => tpl.dispose());

const BASE = "pkt:step:p1/gate:cut";

function withPackets(rows: readonly (readonly [id: string, state: "open" | "committed" | "returned", mode?: string])[]): Store {
  const s = tpl.fresh();
  must(s.tx((t) => {
    for (const [id, state, mode] of rows) t.run("INSERT INTO packets (id, mode, state, rev, body, opened_at) VALUES (?, ?, ?, 0, '{}', ?)", id, mode ?? "packet-review", state, t.at);
  }));
  return s;
}

/** The reader, recording every statement it is handed. */
function spying(r: Reader, seen: { sql: string; params: unknown[] }[]): Reader {
  return {
    at: r.at,
    get: (sql, ...params) => (seen.push({ sql, params }), r.get(sql, ...params)),
    all: (sql, ...params) => (seen.push({ sql, params }), r.all(sql, ...params)),
  };
}

describe("kernel/parts - the gate read context", () => {
  it("has one spelling, gateFacts(now): no variant takes a reader it never uses", () => {
    expect("gateContext" in gates).toBe(false);
    expect(gates.gateFacts(7).now).toBe(7);
  });
});

describe("kernel/parts - gatePacketFact", () => {
  it("reads the newest attempt by number, and ignores a sibling gate that shares the prefix", () => {
    const s = withPackets([
      [BASE, "returned"],
      [`${BASE}#2`, "returned"],
      [`${BASE}#10`, "open"],
      [`${BASE}x`, "committed"],
      [`${BASE}s#11`, "committed"],
    ]);
    expect(must(s.read((r) => gatePacketFact(r, "p1/gate:cut")))).toBe("open");
    const t = withPackets([[BASE, "returned"], [`${BASE}#2`, "committed"], [`${BASE}x`, "open"]]);
    expect(must(t.read((r) => gatePacketFact(r, "p1/gate:cut")))).toBe("committed");
    expect(must(t.read((r) => gatePacketFact(r, "p1/gate:none")))).toBeUndefined();
  });

  it("finds its packets by an index seek, never a scan of every packet", () => {
    const s = withPackets([[BASE, "returned"], [`${BASE}#2`, "open"], ["pkt:forge:run-1", "open"]]);
    const seen: { sql: string; params: unknown[] }[] = [];
    must(s.read((r) => gatePacketFact(spying(r, seen), "p1/gate:cut")));
    const onPackets = seen.filter((q) => /\bFROM packets\b/.test(q.sql));
    expect(onPackets.length, "the read touched the packet table").toBeGreaterThan(0);
    for (const q of onPackets) {
      const plan = must(s.read((r) => r.all(`EXPLAIN QUERY PLAN ${q.sql}`, ...(q.params as never[])).map((x) => String(x["detail"]))));
      expect(plan.filter((d) => /^SCAN packets\b/.test(d)), plan.join(" | ")).toEqual([]);
    }
  });
});
