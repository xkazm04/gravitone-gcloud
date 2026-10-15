import { afterAll, describe, expect, it } from "vitest";
import { eventsMigrations } from "../src/events.ts";
import type { Store } from "../src/store.ts";
import {
  DEFAULT_TTL_MS,
  MAX_TTL_MS,
  judge,
  listTokens,
  mintPlan,
  mintToken,
  needsTouch,
  parseToken,
  parseTtl,
  readToken,
  revokeToken,
  scopeAdmits,
  tokenMigrations,
  touchToken,
  verifyToken,
  type MintInput,
} from "../src/token.ts";
import { fixedClock, must, templateStores } from "./helpers.ts";

const NOW = "2026-10-15T12:00:00.000Z";
const tpl = templateStores([eventsMigrations, tokenMigrations], { clock: fixedClock(NOW) });
afterAll(() => tpl.dispose());

const OPERATOR = { kind: "operator", id: "owner" } as const;
const MONEY: MintInput = { name: "dojo-skill", scope: "money" };
const t0 = Date.parse(NOW);

const mint = (s: Store, input: MintInput = MONEY) => must(s.tx((t) => mintToken(t, input, OPERATOR)));
const verdict = (s: Store, token: string, at = t0) => must(verifyToken(s, token, at));
const events = (s: Store) => must(s.read((r) => r.all("SELECT type, subject_id, data FROM events ORDER BY seq")));

/** A random source that counts up, so a plan is reproducible. */
const counting = (): ((n: number) => Uint8Array) => {
  let k = 0;
  return (n) => Uint8Array.from({ length: n }, () => k++ % 256);
};

describe("token mint", () => {
  it("prints gt_<id>_<secret> once; the store keeps the hash, the ledger keeps neither", () => {
    const s = tpl.fresh();
    const { record, token } = mint(s);
    const parts = parseToken(token);
    expect(parts?.id).toBe(record.id);
    expect(parts?.secret).toHaveLength(43);
    expect(record).toEqual({ id: record.id, name: "dojo-skill", scope: "money", createdAt: NOW, expiresAt: new Date(t0 + DEFAULT_TTL_MS).toISOString() });
    const stored = must(s.read((r) => r.get("SELECT hash FROM tokens WHERE id = ?", record.id)));
    expect(String(stored?.["hash"])).toMatch(/^[0-9a-f]{64}$/);
    const log = events(s);
    expect(log).toEqual([{ type: "token.mint", subject_id: record.id, data: JSON.stringify({ expiresAt: record.expiresAt, name: "dojo-skill", scope: "money" }) }]);
    const text = JSON.stringify(log);
    expect(text).not.toContain(parts?.secret);
    expect(text).not.toContain(String(stored?.["hash"]));
  });

  it("a plan is pure over its clock and random source", () => {
    const a = must(mintPlan(MONEY, NOW, counting()));
    const b = must(mintPlan(MONEY, NOW, counting()));
    expect(a).toEqual(b);
    expect(a.token).toBe(`gt_000102030405_${Buffer.from(Uint8Array.from({ length: 32 }, (_, i) => i + 6)).toString("base64url")}`);
  });

  it("refuses a life past the bound, or under an hour, rather than clamping it", () => {
    const long = mintPlan({ ...MONEY, ttlMs: MAX_TTL_MS + 1 }, NOW, counting());
    expect(!long.ok && long.error.code).toBe("invalid");
    expect(mintPlan({ ...MONEY, ttlMs: MAX_TTL_MS }, NOW, counting()).ok).toBe(true);
    const short = mintPlan({ ...MONEY, ttlMs: 60_000 }, NOW, counting());
    expect(!short.ok && short.error.code).toBe("invalid");
    expect(must(parseTtl("30d"))).toBe(DEFAULT_TTL_MS);
    expect(must(parseTtl("12h"))).toBe(12 * 3_600_000);
    expect(parseTtl("30").ok).toBe(false);
    expect(parseTtl("1w").ok).toBe(false);
  });

  it("refuses a name that is not a caller name, a scope that is not money|read, and a short random source", () => {
    expect(mintPlan({ ...MONEY, name: "Has Spaces" }, NOW, counting()).ok).toBe(false);
    expect(mintPlan({ ...MONEY, name: "" }, NOW, counting()).ok).toBe(false);
    const short = mintPlan(MONEY, NOW, () => new Uint8Array(0));
    expect(short.ok).toBe(false);
  });
});

describe("token verify", () => {
  it("the minted token verifies, and carries its scope", () => {
    const s = tpl.fresh();
    const { record, token } = mint(s);
    expect(verdict(s, token)).toEqual({ ok: true, token: record });
  });

  it("an unknown id, a wrong secret and a malformed string are one refusal: no half is confirmed", () => {
    const s = tpl.fresh();
    const { token } = mint(s);
    const p = parseToken(token);
    const wrongSecret = `gt_${p?.id}_${"A".repeat(43)}`;
    const wrongId = `gt_ffffffffffff_${p?.secret}`;
    for (const t of [wrongSecret, wrongId, "gt_short", "probe-shared-secret", `${token}x`, ""]) {
      expect(verdict(s, t), t).toEqual({ ok: false, why: "unknown" });
    }
  });

  it("expires at expiresAt exactly, not a millisecond later", () => {
    const s = tpl.fresh();
    const { record, token } = mint(s);
    const end = Date.parse(record.expiresAt);
    expect(verdict(s, token, end - 1).ok).toBe(true);
    expect(verdict(s, token, end)).toEqual({ ok: false, why: "expired" });
  });

  it("a revoked token is refused at once, whatever its expiry", () => {
    const s = tpl.fresh();
    const { record, token } = mint(s);
    const done = must(s.tx((t) => revokeToken(t, record.id, OPERATOR, "rotated")));
    expect(done).toMatchObject({ state: "revoked", token: { revokedAt: NOW } });
    expect(verdict(s, token)).toEqual({ ok: false, why: "revoked" });
  });

  it("revoke is idempotent (one event), and an id never minted is not-found", () => {
    const s = tpl.fresh();
    const { record } = mint(s);
    must(s.tx((t) => revokeToken(t, record.id, OPERATOR)));
    expect(must(s.tx((t) => revokeToken(t, record.id, OPERATOR))).state).toBe("already-revoked");
    expect(events(s).map((e) => e["type"])).toEqual(["token.mint", "token.revoke"]);
    const ghost = s.tx((t) => revokeToken(t, "ffffffffffff", OPERATOR));
    expect(!ghost.ok && ghost.error.code).toBe("not-found");
  });

  it("a read token admits a read door only; a money token admits both", () => {
    expect(scopeAdmits("money", "money")).toBe(true);
    expect(scopeAdmits("money", "read")).toBe(true);
    expect(scopeAdmits("read", "read")).toBe(true);
    expect(scopeAdmits("read", "money")).toBe(false);
  });

  it("a corrupt row refuses (err), it never reads as a token with no limits", () => {
    const s = tpl.fresh();
    const { record, token } = mint(s);
    // A hash of the right length but not lowercase hex: past the CHECK, refused by the door.
    must(s.tx((t) => t.exec(`DROP TRIGGER tokens_fixed_at_mint; UPDATE tokens SET hash = '${"Z".repeat(64)}' WHERE id = '${record.id}';`)));
    const r = verifyToken(s, token, t0);
    expect(r.ok).toBe(false);
  });

  it("judge is pure over the stored record, the secret and the clock", () => {
    const plan = must(mintPlan(MONEY, NOW, counting()));
    const secret = parseToken(plan.token)?.secret ?? "";
    expect(judge(plan.record, secret, t0).ok).toBe(true);
    expect(judge(undefined, secret, t0)).toEqual({ ok: false, why: "unknown" });
    expect(judge({ ...plan.record, revokedAt: NOW }, secret, t0 - 1)).toEqual({ ok: false, why: "revoked" });
  });
});

describe("token store rules", () => {
  it("identity, scope, hash and life are fixed at mint; a revocation is final; nothing is deleted", () => {
    const s = tpl.fresh();
    const { record } = mint(s);
    for (const sql of [
      `UPDATE tokens SET scope = 'money', hash = hash WHERE id = '${record.id}'`,
      `UPDATE tokens SET expires_at = '2099-01-01T00:00:00.000Z' WHERE id = '${record.id}'`,
      `DELETE FROM tokens WHERE id = '${record.id}'`,
    ]) {
      const r = s.tx((t) => t.run(sql));
      expect(r.ok, sql).toBe(false);
    }
    must(s.tx((t) => revokeToken(t, record.id, OPERATOR)));
    const unrevoke = s.tx((t) => t.run("UPDATE tokens SET revoked_at = NULL WHERE id = ?", record.id));
    expect(unrevoke.ok).toBe(false);
  });

  it("list is an inventory: revoked tokens stay, no secret and no hash leave the store", () => {
    const s = tpl.fresh();
    const a = mint(s);
    const b = mint(s, { name: "ci-reader", scope: "read", ttlMs: 3_600_000 });
    must(s.tx((t) => revokeToken(t, a.record.id, OPERATOR)));
    const all = must(s.read((r) => listTokens(r)));
    expect(all.map((t) => [t.name, t.scope, t.revokedAt !== undefined]).sort()).toEqual([
      ["ci-reader", "read", false],
      ["dojo-skill", "money", true],
    ]);
    expect(b.record.scope).toBe("read");
    expect(JSON.stringify(all)).not.toMatch(/hash|[0-9a-f]{64}/);
  });

  it("lastUsedAt moves at most once a minute", () => {
    const s = tpl.fresh();
    const { record } = mint(s);
    expect(must(touchToken(s, record.id, t0))).toBe(true);
    const seen = must(s.read((r) => readToken(r, record.id)));
    expect(seen?.lastUsedAt).toBe(NOW);
    expect(seen && needsTouch(seen, t0 + 59_999)).toBe(false);
    expect(seen && needsTouch(seen, t0 + 60_000)).toBe(true);
  });
});
