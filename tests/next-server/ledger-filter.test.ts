import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Event } from "@gt/domain/event";

import { ledgerFor, sourceOf, subjectLink } from "../../app/(studio)/_shell/links.ts";
import { settled } from "../../app/(studio)/ledger/_ledger/Detail.tsx";
import { coalescer, pastTail, rowsOf, withOlder, type Timers } from "../../app/(studio)/ledger/_ledger/Ledger.tsx";
import { EMPTY, identity, matchesPost, parseParams, parseQuery, SEARCH_MAX, splitFilter, toSearch, windowOf, type LedgerFilter } from "../../app/(studio)/ledger/_ledger/filter.ts";
import { readFrames } from "../../app/(studio)/ledger/_ledger/feed.ts";
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
  it("a CRLF split across two reads is one line end, not a frame boundary", () => {
    // The chunk boundary falls between the \r and the \n of one line end.
    const one = parseFrames("id: 1\r\ndata: a\r");
    expect(one.frames).toEqual([]);
    const two = parseFrames(`${one.rest}\ndata: b\r\n\r\n`);
    expect(two.frames).toEqual([{ kind: "event", id: 1, data: "a\nb" }]);
    expect(two.rest).toBe("");
  });

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

describe("arrivals in an oldest-first read", () => {
  const ev = (seq: number): Event => e({ seq, key: `k${seq}`, occurredAt: `2026-08-26T12:00:${String(seq % 60).padStart(2, "0")}.000Z` });
  const asc = (lo: number, hi: number): Event[] => Array.from({ length: hi - lo + 1 }, (_, i) => ev(lo + i));
  const page = (events: Event[], capped: boolean) => ({ events, capped, scanned: events.length, exhausted: !capped, byId: false });

  it("reads past the last drawn row once older has read to the end, and the arrival is drawn", () => {
    const first = asc(1, 500);
    const more = withOlder(null, first, page(asc(501, 800), false));
    const rows = rowsOf(first, more);
    const cursor = pastTail("asc", more, rows);
    expect(cursor).toEqual({ t: ev(800).occurredAt, seq: 800 });
    // The server's answer to that cursor is the act that landed; it is drawn last.
    const after = withOlder(more, first, page([ev(801)], false));
    expect(rowsOf(first, after).at(-1)?.seq).toBe(801);
  });

  it("reads nothing where the first page, a capped tail or the newest-first order already covers it", () => {
    const first = asc(1, 10);
    expect(pastTail("asc", null, rowsOf(first, null))).toBeNull();
    const capped = withOlder(null, first, page(asc(11, 20), true));
    expect(pastTail("asc", capped, rowsOf(first, capped))).toBeNull();
    const done = withOlder(null, first, page(asc(11, 20), false));
    expect(pastTail("desc", done, rowsOf(first, done))).toBeNull();
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

describe("the live flash", () => {
  // A hand-driven clock: handles are ids, advance() fires what is due in order.
  const clock = () => {
    let now = 0;
    let id = 0;
    const live = new Map<number, { at: number; fn: () => void }>();
    const timers: Timers = {
      set: (fn, ms) => {
        live.set(++id, { at: now + ms, fn });
        return id;
      },
      clear: (h) => void live.delete(h),
    };
    const advance = (to: number): void => {
      for (;;) {
        const due = [...live.entries()].filter(([, v]) => v.at <= to).sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        live.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = to;
    };
    return { timers, advance, pending: () => live.size, at: () => now };
  };

  it("a second burst's flash lasts its full 1300 ms, not what is left of the first burst's", () => {
    const c = clock();
    let fresh = new Set<number>();
    let freshSince = -1;
    let freshUntil = -1;
    const b = coalescer(c.timers, {
      flush: (a) => {
        fresh = new Set(a);
        freshSince = c.at();
      },
      clear: () => {
        fresh = new Set();
        freshUntil = c.at();
      },
    });
    b.push([1]);
    c.advance(1000);
    b.push([2]);
    c.advance(1999);
    expect([...fresh]).toEqual([2]); // the first burst's clear would have fired at 2000
    c.advance(2001);
    expect([...fresh]).toEqual([2]); // burst B flashes until 1700 + 1300
    c.advance(3000);
    expect(fresh.size).toBe(0);
    expect(freshUntil - freshSince).toBe(1300);
  });

  it("unmounting clears the wait and the flash", () => {
    const c = clock();
    const b = coalescer(c.timers, { flush: () => undefined, clear: () => undefined });
    b.push([1]);
    c.advance(700);
    expect(c.pending()).toBe(1);
    b.dispose();
    expect(c.pending()).toBe(0);
  });
});

describe("the URL and the older-page door read one filter", () => {
  //  A q the page rendered but the door refused (z.string().max(4000) on the page's own search
  //  string) left a Ledger whose 'older' never worked. parseParams holds the filter to the door.
  const asParams = (f: LedgerFilter) => parseParams(Object.fromEntries(new URLSearchParams(toSearch(f))));
  const doorAccepts = (f: LedgerFilter): boolean => toSearch({ ...f, ev: 9_999_999_999, order: "asc", view: "jsonl" }).length <= SEARCH_MAX;

  it("a 5000-character q is trimmed to what the door takes, and still pages", () => {
    const f = parseParams({ q: "x".repeat(5000), ev: "7" });
    expect(f.q.length).toBeGreaterThan(0);
    expect(doorAccepts(f)).toBe(true);
    expect(doorAccepts(asParams(f))).toBe(true);
  });

  it("encoded width counts: 3000 CJK characters and astral ones fit the door too, unbroken", () => {
    for (const q of ["\u6f22".repeat(3000), "\u{1F3B5}".repeat(1500)]) {
      const f = parseParams({ q });
      expect(doorAccepts(f)).toBe(true);
      expect(() => toSearch(f), "a trim through a surrogate pair would make encodeURIComponent throw").not.toThrow();
      expect(f.q).toBe(Array.from(f.q).join(""));
    }
  });

  it("long comma lists lose their tail, not the page", () => {
    const type = Array.from({ length: 400 }, (_, i) => `event.type.number${i}`).join(",");
    const f = parseParams({ type, lane: "gpu.local" });
    expect(doorAccepts(f)).toBe(true);
    expect(f.lane).toEqual(["gpu.local"]);
    expect(f.type[0]).toBe("event.type.number0");
  });

  it("a filter that already fits is read as before", () => {
    expect(parseParams({ q: "lease", type: "verdict" })).toEqual({ ...EMPTY, q: "lease", type: ["verdict"] });
  });

  it("the action's door takes exactly the number the parser holds to", () => {
    const code = readFileSync(path.join(import.meta.dirname, "../../app/(studio)/ledger/_ledger/actions.ts"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    expect(code).toMatch(/search:\s*z\.string\(\)\.max\(SEARCH_MAX\)/);
  });
});

describe("the live feed says what it refused", () => {
  //  An event frame whose seq the door refused, or a reset frame without a head, was skipped
  //  without a word while heartbeats kept the edge green: a renamed field left the page live-looking
  //  and never refreshing. Every refusal now yields one line; the cursor still does not move.
  it("a well-formed frame moves the cursor and logs nothing", () => {
    const r = readFrames(parseFrames('id: 5\ndata: {"seq":5}\n\nevent: reset\ndata: {"head":9}\n\n: hb\n\n').frames, 3, 2000);
    expect(r).toMatchObject({ cursor: 9, seqs: [5], acts: ["reset", "heartbeat"], logs: [] });
  });

  it("an event frame with a renamed field is logged, and the cursor stays", () => {
    const r = readFrames(parseFrames('id: 5\ndata: {"sequence":5}\n\n').frames, 3, 2000);
    expect(r.cursor).toBe(3);
    expect(r.seqs).toEqual([]);
    expect(r.logs).toHaveLength(1);
    expect(r.logs[0]).toContain("event frame refused");
  });

  it("a reset frame without a head is logged, still resets, and the cursor stays", () => {
    const r = readFrames(parseFrames('event: reset\ndata: {"seq":1}\n\n').frames, 3, 2000);
    expect(r.cursor).toBe(3);
    expect(r.acts).toEqual(["reset"]);
    expect(r.logs).toHaveLength(1);
    expect(r.logs[0]).toContain("reset frame refused");
  });

  it("the retry hint and the planned rotation come through", () => {
    const r = readFrames(parseFrames('retry: 1500\n\nevent: rotate\ndata: {"after":5}\n\n').frames, 5, 2000);
    expect(r).toMatchObject({ retryMs: 1500, rotated: true, logs: [] });
  });
});
