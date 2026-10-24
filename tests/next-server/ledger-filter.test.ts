import { describe, expect, it } from "vitest";

import type { Event } from "@gt/domain/event";

import { ledgerFor, sourceOf, subjectLink } from "../../app/(studio)/_shell/links.ts";
import { settled } from "../../app/(studio)/ledger/_ledger/Detail.tsx";
import { rowsOf, withOlder } from "../../app/(studio)/ledger/_ledger/Ledger.tsx";
import { EMPTY, identity, matchesPost, parseParams, parseQuery, splitFilter, toSearch, windowOf, type LedgerFilter } from "../../app/(studio)/ledger/_ledger/filter.ts";
import { backoff, parseFrames } from "../../app/(studio)/ledger/_ledger/sse.ts";
import { costOf, relative, toneOf, trailOf } from "../../app/(studio)/ledger/_ledger/vocab.ts";

// The Ledger's pure rules: the URL round trip, the query grammar, what goes to the kernel
// and what is checked against its rows, where each subject links, and the stream's wire.

const e = (over: Partial<Event> = {}): Event => ({
  seq: 7,
  at: "2026-10-15T10:00:00.000Z",
  occurredAt: "2026-08-26T12:00:00.000Z",
  atSrc: "recorded",
  actor: { kind: "machine", id: "forge" },
  type: "run.log",
  subject: { kind: "run", id: "2026-08-26-sweep-01" },
  data: { runId: "2026-08-26-sweep-01", note: "plate 3 of 20 written", src: "real" },
  key: "forge:2026-08-26-sweep-01:log.abc.0",
  prevHash: "0".repeat(64),
  hash: "1".repeat(64),
  ...over,
});

describe("the URL", () => {
  it("round-trips every field through the prototype's names, in its order", () => {
    const f: LedgerFilter = { q: "actor:agent lease", actor: "operator", type: ["verdict", "run.end"], lane: ["gpu.local"], project: ["p1"], src: ["forge", "dojo"], from: "2026-10-01", to: "2026-10-03", ev: 42, order: "asc", view: "jsonl" };
    const s = toSearch(f);
    expect(s).toBe("q=actor:agent%20lease&actor=operator&type=verdict,run.end&lane=gpu.local&project=p1&src=forge,dojo&from=2026-10-01&to=2026-10-03&ev=42&order=asc&view=jsonl");
    expect(parseParams(Object.fromEntries(new URLSearchParams(s)))).toEqual(f);
    expect(toSearch(EMPTY)).toBe("");
  });

  it("drops what it cannot read instead of refusing the page", () => {
    const f = parseParams({ actor: "robot", from: "2026-13-40", ev: "-3", order: "sideways", view: "pdf", type: ",,verdict,verdict" });
    expect(f).toEqual({ ...EMPTY, type: ["verdict"] });
  });

  it("a lone from or to is that one day; a reversed range is put the right way round", () => {
    expect(parseParams({ to: "2026-10-02" })).toMatchObject({ from: "2026-10-02", to: "2026-10-02" });
    expect(parseParams({ from: "2026-10-05", to: "2026-10-01" })).toMatchObject({ from: "2026-10-01", to: "2026-10-05" });
  });

  it("identity ignores selection, view and order (the windowing params)", () => {
    expect(identity({ ...EMPTY, q: "x", ev: 3, view: "jsonl", order: "asc" })).toBe(identity({ ...EMPTY, q: "x" }));
    expect(identity({ ...EMPTY, q: "x" })).not.toBe(identity({ ...EMPTY, q: "y" }));
  });

  it("to is inclusive: the kernel's window ends at the start of the next day", () => {
    expect(windowOf("2026-10-01", "2026-10-31")).toEqual({ since: "2026-10-01T00:00:00.000Z", until: "2026-11-01T00:00:00.000Z" });
  });
});

describe("the query grammar", () => {
  it("reads the closed token set and keeps an unknown prefix as a word", () => {
    expect(parseQuery("actor:agent TYPE:run.end kind:pair weird:thing Lease")).toEqual({ tokens: { actor: "agent", type: "run.end", subject: "pair" }, words: ["weird:thing", "lease"] });
  });

  it("caps the words a query may carry", () => {
    expect(parseQuery(Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ")).words).toHaveLength(8);
  });

  it("sends indexed predicates to the kernel and the rest to the rows; the URL facet wins over a token", () => {
    const { kernel, post, ignored } = splitFilter({ ...EMPTY, q: "type:job.fail actor:nobody run:r9 id:x1 lease", type: ["verdict"], lane: ["gpu"], src: ["Bad Name"], project: ["a", "b"], from: "2026-10-01", to: "2026-10-01" });
    expect(kernel).toEqual({ type: ["verdict.*"], lane: ["gpu", "gpu.*"], run: "r9", since: "2026-10-01T00:00:00.000Z", until: "2026-10-02T00:00:00.000Z" });
    expect(post).toEqual({ words: ["lease"], id: "x1", projects: ["a", "b"] });
    expect(ignored).toEqual(["actor:nobody", "src:Bad Name"]);
  });

  it("a type written as a group, a star or exactly maps to the kernel's pattern", () => {
    const types = (t: string[]) => splitFilter({ ...EMPTY, type: t }).kernel.type;
    expect(types(["commit"])).toEqual(["commit.*"]);
    expect(types(["job*"])).toEqual(["job.*"]);
    expect(types(["job.*", "run.end"])).toEqual(["job.*", "run.end"]);
  });
});

describe("matchesPost", () => {
  it("a word equal to one of the act's ids matches it; any other word is a substring of its text", () => {
    expect(matchesPost(e(), { words: ["2026-08-26-sweep-01"] })).toBe(true);
    expect(matchesPost(e(), { words: ["plate", "written"] })).toBe(true);
    expect(matchesPost(e(), { words: ["plate", "lost"] })).toBe(false);
    expect(matchesPost(e(), { words: ["forge"] })).toBe(true);
  });

  it("id: matches any of the act's ids exactly, never a substring", () => {
    expect(matchesPost(e(), { words: [], id: "2026-08-26-sweep-01" })).toBe(true);
    expect(matchesPost(e(), { words: [], id: "2026-08-26" })).toBe(false);
  });
});

describe("subjectLink", () => {
  // v1's /foundry and /articles pages retired in Phase 6 wave C: a v1 run's acts open the run's
  // history, never a redirect to a page that is gone or a Board that would refuse an old run.
  it("v1 foundry records open their run's history, named by their own id inside the run", () => {
    expect(subjectLink(e())).toEqual({ label: "2026-08-26-sweep-01", href: "/ledger?q=2026-08-26-sweep-01" });
    expect(subjectLink(e({ subject: { kind: "candidate", id: "2026-08-26-sweep-01/s03" } }))).toEqual({ label: "s03", href: "/ledger?q=2026-08-26-sweep-01" });
    // An act that carries no run id is about the run it names.
    expect(subjectLink(e({ data: {} })).href).toBe("/ledger?q=2026-08-26-sweep-01");
  });

  it("an article step opens its run's history; publish facts the calendar; a sync source its own events", () => {
    expect(subjectLink(e({ key: "articles:run_1:step.0", subject: { kind: "step", id: "run_1/research" }, data: { runId: "run_1" } }))).toEqual({ label: "research", href: "/ledger?q=run_1" });
    expect(subjectLink(e({ key: "publish:s1:slot.scheduled", subject: { kind: "slot", id: "s1" } })).href).toBe("/floor?cal=1&slot=s1");
    expect(subjectLink(e({ key: "ingest:forge:fail.read.x", subject: { kind: "source", id: "forge" } })).href).toBe("/ledger?src=forge");
  });

  it("a decision packet opens its Board, open or decided", () => {
    expect(subjectLink(e({ key: undefined, subject: { kind: "packet", id: "pkt:audio:audio/triage/17" } }))).toEqual({ label: "pkt:audio:audio/triage/17", href: "/board/pkt%3Aaudio%3Aaudio%2Ftriage%2F17" });
  });

  it("a subject nobody mapped opens its own history in the Ledger, never a guessed route", () => {
    expect(subjectLink(e({ key: "turns:t1:x", subject: { kind: "turn", id: "t 1/x" } }))).toEqual({ label: "t 1/x", href: ledgerFor("t 1/x") });
    expect(ledgerFor("t 1/x")).toBe("/ledger?q=t%201%2Fx");
  });

  it("the source is the key's first segment, as the kernel's column computes it", () => {
    expect(sourceOf(e())).toBe("forge");
    expect(sourceOf({})).toBeNull();
  });
});

describe("how an act reads", () => {
  it("tones by the table, else by the prototype's keyword rule", () => {
    expect([toneOf("verdict.keep"), toneOf("publish.fail"), toneOf("gate.open"), toneOf("card.status")]).toEqual(["emerald", "rose", "amber", "neutral"]);
  });

  it("the trail is the error verbatim before any note", () => {
    expect(trailOf({ data: { error: "boom", note: "n" } })).toEqual({ text: "boom", error: true });
    expect(trailOf({ data: { note: "n" } })).toEqual({ text: "n", error: false });
    expect(trailOf({ data: {} })).toBeUndefined();
  });

  it("cost is split by where each figure came from", () => {
    expect(costOf([{ cost: { usd: 1, src: "real" } }, { cost: { usd: 2, src: "model" } }, {}])).toEqual({ total: 3, priced: 2, bySrc: { real: 1, model: 2 } });
  });

  it("relative time reads from the clock the page was drawn at", () => {
    const now = Date.parse("2026-10-15T12:00:00.000Z");
    expect(relative("2026-10-13T09:00:00.000Z", now)).toBe("2d 3h before NOW");
    expect(relative("2026-10-15T12:30:00.000Z", now)).toBe("30m after NOW");
  });
});

describe("the stream's wire", () => {
  it("splits frames at blank lines and keeps the incomplete tail", () => {
    const { frames, rest } = parseFrames('retry: 2000\n\nid: 5\ndata: {"seq":5}\n\n: hb\n\nevent: rotate\ndata: {"after":5}\n\nid: 6\nda');
    expect(frames).toEqual([{ kind: "retry", ms: 2000 }, { kind: "event", id: 5, data: '{"seq":5}' }, { kind: "comment" }, { kind: "control", name: "rotate", data: '{"after":5}' }]);
    expect(rest).toBe("id: 6\nda");
  });

  it("the heartbeat comment is a frame - an EventSource would have dropped it", () => {
    expect(parseFrames(": hb\r\n\r\n").frames).toEqual([{ kind: "comment" }]);
  });

  it("backs off from the server's hint, doubling, capped", () => {
    expect([1, 2, 3, 10].map((n) => backoff(n, 2000))).toEqual([2000, 4000, 8000, 30000]);
  });
});

describe("the rows drawn", () => {
  const ev = (seq: number): Event => e({ seq, key: `k${seq}` });
  const run = (hi: number, lo: number): Event[] => Array.from({ length: hi - lo + 1 }, (_, i) => ev(hi - i));
  const page = (events: Event[]) => ({ events, capped: true, scanned: events.length, exhausted: false, byId: false });

  it("a refresh that shifts the first page leaves no gap before the older pages read since", () => {
    // Newest first: rows 1000..501, then "older" read 500..1. Three acts land and the
    // refreshed first page is 1003..504 - rows 503..501 left it, and must still be drawn.
    const more = withOlder(null, run(1000, 501), page(run(500, 1)));
    const seqs = rowsOf(run(1003, 504), more).map((x) => x.seq);
    expect(seqs).toEqual(Array.from({ length: 1003 }, (_, i) => 1003 - i));
  });

  it("draws each act once, in the first page's place", () => {
    const more = withOlder(withOlder(null, run(10, 6), page(run(5, 3))), run(10, 6), page(run(2, 1)));
    expect(rowsOf(run(10, 6), more).map((x) => x.seq)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(rowsOf(run(10, 6), null).map((x) => x.seq)).toEqual([10, 9, 8, 7, 6]);
  });
});

describe("the page's two reads after render", () => {
  it("a Server Action that rejects answers as a refusal with its words, never as a rejection", async () => {
    // A request that never came back (a dropped connection, a redeploy) REJECTS; it does not
    // answer ok: false. Unsettled, "older" stays disabled on "reading" and related never draws.
    const r = await settled(Promise.reject(new TypeError("Failed to fetch")));
    expect(r).toEqual({ ok: false, error: { error: "Failed to fetch", code: "unavailable" } });
    const fine = await settled(Promise.resolve({ ok: true as const, value: 3 }));
    expect(fine).toEqual({ ok: true, value: 3 });
  });
});
