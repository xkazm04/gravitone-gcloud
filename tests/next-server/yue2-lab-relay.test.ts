// THE SONG LAB'S RELAY (spark yue2-song-lab S2, WP-B; lib/yue2/labRelay.ts) over a temp kernel: the owner's
// direction is an `audio.lab.say`, the agent's answer an `audio.lab.turn` read through the lab door (a bad
// proposal is dropped and named, a bad envelope refuses the turn), the inbox long-polls for unanswered
// says, and NOTHING the lab writes appears in the compose studio's read (its page reads audio.say /
// audio.turn by type with no subject filter, so the lab must never write those).

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-yue2-relay-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

import { rmSync } from "node:fs";
import path from "node:path";

import { LAB_SAY_EVENT, LAB_TURN_EVENT } from "@gt/domain/audio.yue2.lab";
import type { Result } from "@gt/domain/errors";
import { queryEvents } from "@gt/kernel/events-query";
import { openKernel } from "@gt/kernel/kernel";

import { foldStudioEvents, readLedger } from "../../app/(studio)/audio/studio/_port/ledger.ts";
import { appendLabSay, appendLabTurn, labInbox, labThread } from "../../lib/yue2/labRelay.ts";

const OWNER = { kind: "operator", id: "owner" } as const;
const AGENT = { kind: "agent", id: "lab-agent" } as const;

const k = openKernel(path.join(ROOT, "kernel.sqlite"));
if (!k.ok) throw k.error;
const store = k.value.store;
afterAll(() => {
  k.value.close();
  rmSync(ROOT, { recursive: true, force: true });
});

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

const LAUNCH = { id: "p-launch-1", kind: "launch", label: "8 seeds at the recipe", why: "a fresh field under the new rule", launch: { style: "dream pop", lyrics: "[verse]\nhold the line", seeds: [1, 2, 3, 4, 5, 6, 7, 8], cot: "off", cfg: 1.5 } };

describe("the lab say", () => {
  it("files an audio.lab.say under a minted session and a u-<time36>-<4> turn id", () => {
    const say = must(appendLabSay(store, { session: "", text: "less chorus looping" }, OWNER, new Date("2026-11-04T10:00:00.000Z")));
    expect(say.session).toMatch(/^lab-[a-z0-9]{4}-20261104$/);
    expect(say.turnId).toMatch(/^u-[a-z0-9]+-[a-z0-9]{4}$/);
    const ev = must(queryEvents(store, { type: [LAB_SAY_EVENT], limit: 10 })).events;
    expect(ev.at(-1)).toMatchObject({ type: LAB_SAY_EVENT, lane: "audio", subject: { kind: "songlab-session", id: say.session }, key: `audio-lab-say:${say.turnId}` });
  });

  it("refuses words the door refuses", () => {
    expect(appendLabSay(store, { session: "lab-x", text: "   " }, OWNER).ok).toBe(false);
    expect(appendLabSay(store, { session: "Bad Session", text: "hi" }, OWNER).ok).toBe(false);
  });
});

describe("the lab turn", () => {
  it("refuses a turn for a session with no say, and a bad envelope whole", () => {
    expect(appendLabTurn(store, { session: "lab-none-1", line: "hello" }, AGENT)).toMatchObject({ ok: false, error: { code: "not-found" } });
    const say = must(appendLabSay(store, { session: "lab-env-1", text: "go" }, OWNER));
    expect(appendLabTurn(store, { session: say.session, line: "", proposals: [] }, AGENT).ok).toBe(false);
    expect(appendLabTurn(store, { session: say.session, line: "ok", extra: 1 }, AGENT).ok).toBe(false);
    expect(appendLabTurn(store, { session: say.session, line: "ok", proposals: [LAUNCH, LAUNCH, LAUNCH, LAUNCH] }, AGENT).ok).toBe(false);
  });

  it("drops a bad proposal and names it; keeps the good one; check appends nothing", () => {
    const say = must(appendLabSay(store, { session: "lab-drop-1", text: "less chorus looping" }, OWNER));
    const bad = { id: "p-bad-1", kind: "launch", label: "no seeds", why: "broken", launch: { style: "x", lyrics: "y", seeds: [], cot: "off" } };
    const raw = { session: say.session, turnId: "a-drop-turn-1", answers: say.turnId, line: "on it", ran: ["read the takes"], learned: [], proposals: [LAUNCH, bad, { kind: "vote" }] };
    const before = must(queryEvents(store, { type: [LAB_TURN_EVENT], limit: 100 })).events.length;
    const checked = must(appendLabTurn(store, raw, AGENT, true));
    expect(must(queryEvents(store, { type: [LAB_TURN_EVENT], limit: 100 })).events.length).toBe(before);
    expect(checked.turn.proposals.map((p) => p.id)).toEqual(["p-launch-1"]);
    expect(checked.dropped).toHaveLength(2);
    expect(checked.dropped[0]).toMatch(/^p-bad-1 \(launch\.seeds/);
    expect(checked.dropped[1]).toMatch(/^proposal 3 /);
    const filed = must(appendLabTurn(store, raw, AGENT));
    expect(filed.turn).toMatchObject({ session: say.session, turnId: "a-drop-turn-1", answers: say.turnId, line: "on it" });
    // A retry of the same turn appends nothing twice; the same id with other words is a conflict.
    expect(appendLabTurn(store, raw, AGENT).ok).toBe(true);
    expect(must(queryEvents(store, { type: [LAB_TURN_EVENT], limit: 100 })).events.length).toBe(before + 1);
    expect(appendLabTurn(store, { ...raw, line: "other words" }, AGENT)).toMatchObject({ ok: false, error: { code: "conflict" } });
    // A proposal id another turn already holds is dropped and named.
    const reuse = must(appendLabTurn(store, { session: say.session, line: "again", proposals: [LAUNCH] }, AGENT, true));
    expect(reuse.turn.proposals).toEqual([]);
    expect(reuse.dropped[0]).toContain("a-drop-turn-1");
  });
});

describe("the inbox", () => {
  it("answers the unanswered says; a turn answering the newest answers the earlier ones too", async () => {
    const s = "lab-inbox-1";
    const one = must(appendLabSay(store, { session: s, text: "first" }, OWNER));
    const two = must(appendLabSay(store, { session: s, text: "second" }, OWNER));
    const waiting = must(await labInbox(store, { session: s }));
    expect(waiting.says.map((x) => x.turnId)).toEqual([one.turnId, two.turnId]);
    must(appendLabTurn(store, { session: s, line: "background work done" }, AGENT));
    expect(must(await labInbox(store, { session: s })).says).toHaveLength(2);
    must(appendLabTurn(store, { session: s, answers: two.turnId, line: "both heard" }, AGENT));
    const none = must(await labInbox(store, { session: s }));
    expect(none.says).toEqual([]);
    expect(none.next).toMatch(/^\d+$/);
  });

  it("long-polls: returns when a say lands, with next as the cursor", async () => {
    const s = "lab-poll-1";
    const head = must(await labInbox(store, { session: s }));
    const t0 = Date.now();
    setTimeout(() => void appendLabSay(store, { session: s, text: "now" }, OWNER), 300);
    const got = must(await labInbox(store, { session: s, waitS: 5, ...(head.next === undefined ? {} : { after: head.next }) }));
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(got.says.map((x) => x.text)).toEqual(["now"]);
    const quiet = must(await labInbox(store, { session: s, waitS: 1, ...(got.next === undefined ? {} : { after: got.next }) }));
    expect(quiet.says).toEqual([]);
    await expect(labInbox(store, { after: "seq-9" })).resolves.toMatchObject({ ok: false });
  });
});

describe("the thread", () => {
  it("reads one session's says and turns oldest first; none yet is not-found", () => {
    const t = must(labThread(store, "lab-drop-1"));
    expect(t.says.map((x) => x.text)).toEqual(["less chorus looping"]);
    expect(t.turns.map((x) => x.turnId)).toEqual(["a-drop-turn-1"]);
    expect(must(labThread(store)).session).toBe("lab-poll-1");
  });
});

describe("the compose studio's read", () => {
  it("never shows a lab say or turn", () => {
    const read = readLedger(store);
    expect(read.sessions).toEqual([]);
    expect(JSON.stringify(read)).not.toMatch(/less chorus looping|lab-drop-1/);
    const lab = must(queryEvents(store, { type: [LAB_SAY_EVENT, LAB_TURN_EVENT], limit: 100 })).events;
    expect(lab.length).toBeGreaterThan(0);
    expect(foldStudioEvents(lab.map((e) => ({ seq: e.seq, at: e.at, type: e.type, data: e.data }))).sessions).toEqual([]);
  });
});
