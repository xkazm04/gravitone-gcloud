import { afterAll, describe, expect, it } from "vitest";
import { SPEND_REQUEST_STATES, SPEND_TRANSITIONS, type SpendRequestState } from "@gt/domain/mcp";
import type { Receipt, ReceiptLine } from "@gt/domain/produce";
import { eventsMigrations } from "../src/events.ts";
import { spendRequestMigrations } from "../src/spend-requests/schema.ts";
import { decideSpendRequest, fileSpendRequest, listSpendRequests, markSpendFailed, markSpendLaunched, readSpendRequest, type FileInput } from "../src/spend-requests/store.ts";
import type { Store } from "../src/store.ts";
import { must, templateStores } from "./helpers.ts";

const T0 = "2026-10-24T23:59:58.000Z";
/** The store clock, set by a test that needs a particular instant. */
let now = T0;
const tpl = templateStores([eventsMigrations, spendRequestMigrations], { clock: () => new Date(now) });
afterAll(() => tpl.dispose());

const AGENT = { kind: "agent", id: "athena" } as const;
const OPERATOR = { kind: "operator", id: "owner" } as const;

const line: ReceiptLine = {
  key: "still",
  label: "Leonardo · still",
  lane: "cloud.leonardo",
  provider: "leonardo",
  model: "phoenix",
  units: 4,
  seconds: 120,
  usd: 0.36,
  src: "real",
  queuePos: 1,
  start: "2026-10-24T23:59:58.000Z",
  end: "2026-10-25T00:01:58.000Z",
};
const receipt: Receipt = {
  token: "rcpt-1",
  subject: { kind: "run", lane: "image" },
  mode: "live",
  lines: [line],
  totals: { seconds: 120, usd: 0.36, unpriced: 0, src: "real" },
  queuePos: 1,
  etaAt: "2026-10-25T00:01:58.000Z",
  overCeiling: false,
  readAt: "2026-10-24T23:59:58.000Z",
};
const RUN: FileInput = { subject: { kind: "run", input: { lane: "image", text: "a lighthouse at dusk", mechanisms: ["text"], styleId: "st_ink" } }, receipt };
const PROJECT: FileInput = { subject: { kind: "project", id: "pj_1", rev: 3 }, receipt: { ...receipt, subject: { kind: "project", id: "pj_1", rev: 3 } } };

const file = (s: Store, input: FileInput = RUN, actor: { kind: "agent" | "operator"; id: string } = AGENT) => must(s.tx((t) => fileSpendRequest(t, input, actor)));
const events = (s: Store) => must(s.read((r) => r.all("SELECT actor_kind, actor_id, type, subject_kind, subject_id, data FROM events ORDER BY seq")));
const codeOf = (r: { ok: boolean; error?: { code: string; message: string } }) => (r.ok ? "ok" : `${r.error?.code}: ${r.error?.message}`);

/** Drive a fresh request to `state` along the legal path. */
function at(s: Store, state: SpendRequestState): string {
  const { id } = file(s);
  if (state === "requested") return id;
  if (state === "refused") must(s.tx((t) => decideSpendRequest(t, id, { verdict: "refused", reasons: ["too dear"] }, OPERATOR)));
  else must(s.tx((t) => decideSpendRequest(t, id, { verdict: "confirmed" }, OPERATOR)));
  if (state === "launched") must(s.tx((t) => markSpendLaunched(t, id, ["job_1"], OPERATOR)));
  if (state === "failed") must(s.tx((t) => markSpendFailed(t, id, "ceiling stop", OPERATOR)));
  return id;
}

/** Try to move `id` to `next` through the store's verbs. */
function move(s: Store, id: string, next: SpendRequestState) {
  return s.tx((t) => {
    if (next === "confirmed" || next === "refused") return decideSpendRequest(t, id, next === "confirmed" ? { verdict: "confirmed" } : { verdict: "refused", reasons: ["no"] }, OPERATOR);
    if (next === "launched") return markSpendLaunched(t, id, ["job_2"], OPERATOR);
    if (next === "failed") return markSpendFailed(t, id, "stale plan", OPERATOR);
    throw new Error("requested is filed, never moved to");
  });
}

describe("spend requests: filing and reading", () => {
  it("file -> read round-trips; the id is sr_ + 12 hex; the day is t.at's UTC date; absent fields are absent keys", () => {
    now = T0;
    const s = tpl.fresh();
    const filed = file(s);
    expect(filed.id).toMatch(/^sr_[0-9a-f]{12}$/);
    expect(filed).toEqual({ id: filed.id, day: "2026-10-24", actor: AGENT, subject: RUN.subject, receipt, state: "requested", filedAt: "2026-10-24T23:59:58.000Z" });
    expect(must(s.read((r) => readSpendRequest(r, filed.id)))).toEqual(filed);
    expect(must(s.read((r) => readSpendRequest(r, "sr_000000000000")))).toBeUndefined();
  });

  it("filing appends one spend.requested with the agent as actor and the ask's money", () => {
    const s = tpl.fresh();
    const a = file(s);
    const b = file(s, PROJECT);
    expect(events(s)).toEqual([
      { actor_kind: "agent", actor_id: "athena", type: "spend-request.requested", subject_kind: "spend-request", subject_id: a.id, data: JSON.stringify({ kind: "run", lane: "image", unpriced: 0, usd: 0.36 }) },
      { actor_kind: "agent", actor_id: "athena", type: "spend-request.requested", subject_kind: "spend-request", subject_id: b.id, data: JSON.stringify({ kind: "project", projectId: "pj_1", rev: 3, unpriced: 0, usd: 0.36 }) },
    ]);
  });

  it("the id comes from the injected random source", () => {
    const s = tpl.fresh();
    const r = must(s.tx((t) => fileSpendRequest(t, RUN, AGENT, (n) => new Uint8Array(n).fill(0xab))));
    expect(r.id).toBe("sr_abababababab");
    const short = s.tx((t) => fileSpendRequest(t, RUN, AGENT, () => new Uint8Array(2)));
    expect(codeOf(short)).toMatch(/^internal:/);
  });

  it("a subject or receipt that does not pass the door is refused and nothing is written", () => {
    const s = tpl.fresh();
    const bad = s.tx((t) => fileSpendRequest(t, { ...RUN, receipt: { ...receipt, totals: { ...receipt.totals, usd: Number.NaN } } }, AGENT));
    expect(codeOf(bad)).toMatch(/^invalid:/);
    expect(events(s)).toEqual([]);
  });

  it("list filters by day, state and actor, newest first, and honours a limit", () => {
    const s = tpl.fresh();
    now = T0;
    const a = file(s);
    now = "2026-10-24T23:59:59.000Z";
    const b = file(s, RUN, { kind: "operator", id: "owner" });
    now = "2026-10-25T00:00:00.000Z";
    const c = file(s);
    now = T0;
    must(s.tx((t) => decideSpendRequest(t, a.id, { verdict: "confirmed" }, OPERATOR)));
    const ids = (f: Parameters<typeof listSpendRequests>[1]) => must(s.read((r) => listSpendRequests(r, f))).map((x) => x.id);
    expect(ids({})).toEqual([c.id, b.id, a.id]);
    expect(c.day).toBe("2026-10-25");
    expect(ids({ day: "2026-10-24" })).toEqual([b.id, a.id]);
    expect(ids({ state: "requested" })).toEqual([c.id, b.id]);
    expect(ids({ actorId: "athena" })).toEqual([c.id, a.id]);
    expect(ids({ day: "2026-10-24", state: "confirmed", actorId: "athena" })).toEqual([a.id]);
    expect(ids({ limit: 1 })).toEqual([c.id]);
    expect(codeOf(s.read((r) => listSpendRequests(r, { limit: 0 })))).toMatch(/^invalid:/);
  });
});

describe("spend requests: moves", () => {
  it("confirm, refuse, launch and fail each carry their fields and append one event with the operator", () => {
    const s = tpl.fresh();
    const refused = at(s, "requested");
    const r = must(s.tx((t) => decideSpendRequest(t, refused, { verdict: "refused", reasons: ["too dear", "wrong look"], note: "try the local lane" }, OPERATOR)));
    expect(r).toMatchObject({ state: "refused", reasons: ["too dear", "wrong look"], note: "try the local lane" });
    expect(r.decidedAt).toBeDefined();

    const launched = at(s, "requested");
    const c = must(s.tx((t) => decideSpendRequest(t, launched, { verdict: "confirmed" }, OPERATOR)));
    expect(c.state).toBe("confirmed");
    expect("reasons" in c || "note" in c || "jobIds" in c || "failure" in c).toBe(false);
    expect(must(s.tx((t) => markSpendLaunched(t, launched, ["job_a", "job_b"], OPERATOR)))).toMatchObject({ state: "launched", jobIds: ["job_a", "job_b"] });

    const failed = at(s, "confirmed");
    expect(must(s.tx((t) => markSpendFailed(t, failed, "a ceiling stop", OPERATOR)))).toMatchObject({ state: "failed", failure: "a ceiling stop" });

    const moves = events(s).filter((e) => e["type"] !== "spend-request.requested");
    expect(moves.every((e) => e["actor_kind"] === "operator" && e["actor_id"] === "owner" && e["subject_kind"] === "spend-request")).toBe(true);
    expect(moves.map((e) => [e["type"], e["data"]])).toEqual([
      ["spend-request.refused", JSON.stringify({ note: "try the local lane", reasons: ["too dear", "wrong look"] })],
      ["spend-request.confirmed", "{}"],
      ["spend-request.launched", JSON.stringify({ jobIds: ["job_a", "job_b"] })],
      ["spend-request.confirmed", "{}"],
      ["spend-request.failed", JSON.stringify({ failure: "a ceiling stop" })],
    ]);
  });

  it("every move SPEND_TRANSITIONS allows succeeds; every other is a conflict naming both states, and writes nothing", () => {
    const s = tpl.fresh();
    for (const from of SPEND_REQUEST_STATES) {
      for (const next of SPEND_REQUEST_STATES) {
        if (next === "requested") continue;
        const id = at(s, from);
        const before = events(s).length;
        const r = move(s, id, next);
        if (SPEND_TRANSITIONS[from].includes(next)) {
          expect(codeOf(r), `${from} -> ${next}`).toBe("ok");
          expect(events(s).length).toBe(before + 1);
        } else {
          expect(codeOf(r), `${from} -> ${next}`).toBe(`conflict: ${id} is ${from}; it cannot become ${next}`);
          expect(events(s).length).toBe(before);
        }
      }
    }
  });

  it("a refusal with no reason is invalid; an unknown id is not-found", () => {
    const s = tpl.fresh();
    const id = at(s, "requested");
    expect(codeOf(s.tx((t) => decideSpendRequest(t, id, { verdict: "refused", reasons: [] }, OPERATOR)))).toMatch(/^invalid:/);
    expect(must(s.read((r) => readSpendRequest(r, id)))?.state).toBe("requested");
    expect(codeOf(s.tx((t) => decideSpendRequest(t, "sr_ffffffffffff", { verdict: "confirmed" }, OPERATOR)))).toMatch(/^not-found:/);
  });
});

describe("spend requests: the table's own rules", () => {
  it("the moves trigger agrees with SPEND_TRANSITIONS; the asker is fixed; nothing is deleted", () => {
    const s = tpl.fresh();
    const id = at(s, "requested");
    for (const sql of [
      `UPDATE spend_requests SET state = 'launched', job_ids = '[]', decided_at = filed_at WHERE id = '${id}'`,
      `UPDATE spend_requests SET actor_id = 'someone' WHERE id = '${id}'`,
      `UPDATE spend_requests SET receipt = '{}' WHERE id = '${id}'`,
      `DELETE FROM spend_requests WHERE id = '${id}'`,
    ]) {
      expect(s.tx((t) => t.run(sql)).ok, sql).toBe(false);
    }
    const done = at(s, "launched");
    expect(s.tx((t) => t.run(`UPDATE spend_requests SET state = 'confirmed', job_ids = NULL WHERE id = '${done}'`)).ok).toBe(false);
  });

  it("a corrupt row refuses on read rather than reading as a smaller ask", () => {
    const s = tpl.fresh();
    const id = at(s, "requested");
    must(s.tx((t) => t.exec(`DROP TRIGGER spend_requests_fixed_at_filing; UPDATE spend_requests SET receipt = json_set(receipt, '$.totals.usd', 'free') WHERE id = '${id}';`)));
    expect(codeOf(s.read((r) => readSpendRequest(r, id)))).toMatch(/^invalid:/);
  });
});
