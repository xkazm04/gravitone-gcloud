import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { eventsMigrations } from "../src/events.ts";
import { migrate } from "../src/migrate.ts";
import { openStore, type Store } from "../src/store.ts";
import { listTokens, mintToken, revokeToken, tokenMigrations, verifyToken } from "../src/token.ts";
import { fixedClock, must, scratch } from "./helpers.ts";

// tokens v1 -> v2 (the `act` scope): a table rebuild, so every row must survive it and every rule the
// v1 triggers held must still hold on the rebuilt table.

const NOW = "2026-10-15T12:00:00.000Z";
const OPERATOR = { kind: "operator", id: "owner" } as const;
const tmp = scratch("token-v2");
afterAll(() => tmp.dispose());
let n = 0;

const V1 = { module: "token", steps: tokenMigrations.steps.slice(0, 1) };

function v1Store(): { s: Store; money: { id: string; token: string }; read: { id: string; token: string } } {
  const s = must(openStore(path.join(tmp.dir, `t-${++n}.sqlite`), { clock: fixedClock(NOW) }));
  must(migrate(s, [eventsMigrations, V1], { snapshotDir: tmp.dir }));
  const mint = (name: string, scope: "money" | "read") => {
    const m = must(s.tx((t) => mintToken(t, { name, scope }, OPERATOR)));
    return { id: m.record.id, token: m.token };
  };
  const money = mint("dojo-skill", "money");
  const read = mint("ci-reader", "read");
  must(s.tx((t) => revokeToken(t, money.id, OPERATOR, "rotated")));
  must(s.tx((t) => t.run("UPDATE tokens SET last_used_at = ? WHERE id = ?", NOW, read.id)));
  return { s, money, read };
}

const raw = (s: Store) => must(s.read((r) => r.all("SELECT * FROM tokens ORDER BY id")));

describe("tokens v1 -> v2", () => {
  it("v1 refuses an act token; v2 keeps every row, revoked included, byte for byte", () => {
    const { s } = v1Store();
    const early = s.tx((t) => mintToken(t, { name: "athena", scope: "act" }, OPERATOR));
    expect(early.ok).toBe(false);
    const before = raw(s);
    expect(before).toHaveLength(2);
    const report = must(migrate(s, [eventsMigrations, tokenMigrations], { snapshotDir: tmp.dir }));
    expect(report.applied).toEqual([{ module: "token", version: 2 }]);
    expect(raw(s)).toEqual(before);
    expect(must(s.read((r) => listTokens(r))).map((t) => [t.name, t.scope, t.revokedAt !== undefined]).sort()).toEqual([
      ["ci-reader", "read", false],
      ["dojo-skill", "money", true],
    ]);
    s.close();
  });

  it("after the rebuild a revoked token stays refused, a live one verifies, and an act token mints", () => {
    const { s, money, read } = v1Store();
    must(migrate(s, [eventsMigrations, tokenMigrations], { snapshotDir: tmp.dir }));
    const at = Date.parse(NOW);
    expect(must(verifyToken(s, money.token, at))).toEqual({ ok: false, why: "revoked" });
    expect(must(verifyToken(s, read.token, at)).ok).toBe(true);
    const act = must(s.tx((t) => mintToken(t, { name: "athena", scope: "act" }, OPERATOR)));
    expect(act.record.scope).toBe("act");
    expect(must(verifyToken(s, act.token, at))).toMatchObject({ ok: true, token: { name: "athena", scope: "act" } });
    s.close();
  });

  it("the rebuilt table keeps v1's rules: scope fixed at mint, revocation final, nothing deleted", () => {
    const { s, money, read } = v1Store();
    must(migrate(s, [eventsMigrations, tokenMigrations], { snapshotDir: tmp.dir }));
    const triggers = must(s.read((r) => r.all("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'tokens' ORDER BY name"))).map((r) => r["name"]);
    expect(triggers).toEqual(["tokens_fixed_at_mint", "tokens_never_deleted", "tokens_revocation_final"]);
    for (const sql of [`UPDATE tokens SET scope = 'act' WHERE id = '${read.id}'`, `DELETE FROM tokens WHERE id = '${read.id}'`, `UPDATE tokens SET revoked_at = NULL WHERE id = '${money.id}'`]) {
      const r = s.tx((t) => t.run(sql));
      expect(!r.ok && r.error.message, sql).toMatch(/fixed at mint|never deleted|revocation is final/);
    }
    const bad = s.tx((t) => t.run("INSERT INTO tokens (id, name, scope, hash, created_at, expires_at) VALUES ('aaaaaaaaaaaa', 'x', 'admin', ?, ?, ?)", "f".repeat(64), NOW, "2026-11-01T00:00:00.000Z"));
    expect(bad.ok).toBe(false);
    s.close();
  });
});
