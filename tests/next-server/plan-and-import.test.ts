// THE PLAN, THE RECEIPT AND THE IMPORT, THEIR REQUEST POSTURE. These are client islands and the
// Node lane has no DOM to press them in, so what is held here is (a) the pure waits and gates the
// islands go through, driven directly, and (b) a comment-stripped source ratchet that each island
// actually goes through them.
//
// A Server Action whose round trip fails REJECTS rather than answering `ok: false`; an island
// that only awaits it without a settle leaves the busy flag it raised up until a reload.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { onOpen, settledOutcome } from "../../app/(studio)/projects/_plan/receipt.tsx";
import { clock } from "../../app/(studio)/projects/_plan/shelf.ts";
import { titleGate } from "../../app/(studio)/projects/_plan/title.ts";
import { commitAll, lastDoor, post, type Answer, type Source } from "../../app/(studio)/projects/import/answer.ts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const PROJECTS = path.join(ROOT, "app", "(studio)", "projects");
// Full-line comments only: these islands' prose is all `//` lines and block headers.
const code = (rel: string): string =>
  readFileSync(path.join(PROJECTS, rel), "utf8")
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join("\n");

describe("the receipt flow - every await settles", () => {
  it("a confirm's answer is its answer", async () => {
    expect(await settledOutcome(Promise.resolve({ kind: "done" as const, note: "launched" }))).toEqual({ kind: "done", note: "launched" });
  });

  it("a confirm whose round trip rejects is an error with its words, never a rejection", async () => {
    const r = await settledOutcome(Promise.reject(new Error("Failed to fetch"))).catch((e: unknown) => ({ rejected: String(e) }));
    expect(r).toEqual({ kind: "error", message: "the studio did not answer: Failed to fetch" });
  });

  it("useReceipt's two reads and its confirm go through a settle", () => {
    const src = code("_plan/receipt.tsx");
    expect(src.length).toBeGreaterThan(1000);
    expect(src.match(/await (st\.)?spec\.(read|confirm)\(/g) ?? []).toEqual([]);
    expect(src.match(/await settled\((st\.)?spec\.read\(/g) ?? []).toHaveLength(2);
    expect(src.match(/await settledOutcome\(st\.spec\.confirm\(/g) ?? []).toHaveLength(1);
  });
});

describe("the Plan's and Compose's writes go through settled", () => {
  // A rejected setPart left Plan's `busy` ref up for good: every later model or units change
  // queued behind it and was never sent, with nothing on screen.
  it("Plan: the units/model queue, rename and discard", () => {
    const src = code("_plan/Plan.tsx");
    expect(src.length).toBeGreaterThan(1000);
    // launchPlan is awaited inside the receipt's confirm, which settles it (settledOutcome).
    expect(src.match(/(await|void) port\.(?!launchPlan\()\w+\(/g) ?? []).toEqual([]);
    expect((src.match(/settled\(port\.(setPart|rename|discard)\(/g) ?? []).sort()).toEqual(["settled(port.discard(", "settled(port.rename(", "settled(port.setPart("]);
  });

  it("Compose: the recipe pick", () => {
    const src = code("_plan/compose.tsx");
    expect(src.match(/void port\s*\.\s*compose\(/g) ?? []).toEqual([]);
    expect(src.match(/settled\(\s*port\.compose\(/g) ?? []).toHaveLength(1);
  });
});

describe("the Plan's runtime reads through the shelf's one clock", () => {
  // Plan.tsx had its own m:ss that split before it rounded: a 179.5 s take read "2:60".
  it("a fractional second rounds before it splits", () => {
    expect([59.6, 119.7, 179.5, 90, 61.2].map(clock)).toEqual(["1:00", "2:00", "3:00", "1:30", "1:01"]);
  });

  it("Plan.tsx draws its sub-line's runtime with shelf.ts clock, not a second formatter", () => {
    const src = code("_plan/Plan.tsx");
    expect(src.match(/%\s*60/g) ?? []).toEqual([]);
    expect(src.match(/clock\(p\.runtimeS\)/g) ?? []).toHaveLength(1);
  });
});

describe("the Plan title - one rename per ⏎, none on Esc", () => {
  // ⏎ runs the commit and then blurs the field; the blur runs it again in the same tick.
  const enter = (take: (typed: string, current: string) => string | null): string[] => {
    const sent: string[] = [];
    for (const _ of ["rename verb", "the blur it causes"]) {
      const t = take("Glass Harbor", "Untitled film");
      if (t !== null) sent.push(t);
    }
    return sent;
  };

  it("control: HEAD's guard (empty or unchanged) sends ⏎'s rename twice", () => {
    const head = (typed: string, current: string): string | null => {
      const t = typed.trim();
      return t === "" || t === current ? null : t;
    };
    expect(enter(head)).toEqual(["Glass Harbor", "Glass Harbor"]);
  });

  it("the gate sends it once, and again only after it settled", () => {
    const g = titleGate();
    expect(enter(g.take)).toEqual(["Glass Harbor"]);
    g.settle();
    expect(g.take("Glass Harbor", "Untitled film")).toBe("Glass Harbor");
  });

  it("Esc's blur sends nothing, and the next real commit still sends", () => {
    const g = titleGate();
    g.cancel();
    expect(g.take("half typed", "Untitled film")).toBeNull();
    expect(g.take("Glass Harbor", "Untitled film")).toBe("Glass Harbor");
  });

  it("empty and unchanged send nothing", () => {
    const g = titleGate();
    expect(g.take("   ", "Untitled film")).toBeNull();
    expect(g.take(" Untitled film ", "Untitled film")).toBeNull();
  });

  it("Plan.tsx commits through the gate, cancels it on Esc, and sends the queue's revision", () => {
    const src = code("_plan/Plan.tsx");
    expect(src.match(/titles\.take\(title, p\.title\)/g) ?? []).toHaveLength(1);
    expect(src.match(/titles\.cancel\(\)/g) ?? []).toHaveLength(1);
    expect(src.match(/rev: p\.rev\b/g) ?? []).toEqual([]);
    expect(src.match(/rev: rev\.current/g) ?? []).toHaveLength(4);
  });
});

describe("the import door's answer never rejects", () => {
  const body = new Blob(["x"]);
  const answering = (status: number, text: () => Promise<string>) => async () => ({ status, text }) as unknown as Response;

  it("an answer is its status and its JSON", async () => {
    expect(await post("/api/import?act=preview", body, answering(200, async () => '{"token":"t"}'))).toEqual({ status: 200, json: { token: "t" } });
  });

  it("a request that never reaches the route is a 503 in the route's envelope", async () => {
    const r = await post("/api/import?act=preview", body, async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(r).toEqual({ status: 503, json: { error: "the import could not be reached: Failed to fetch", code: "unavailable" } });
  });

  it("an answer whose body breaks off while it is read is a 503 too, never a rejection", async () => {
    const r = await post(
      "/api/import?act=commit&token=t",
      body,
      answering(200, async () => {
        throw new TypeError("network error");
      }),
    ).catch((e: unknown) => ({ rejected: String(e) }));
    expect(r).toEqual({ status: 503, json: { error: "the import's answer (200) broke off: network error", code: "unavailable" } });
  });

  it("a body that is not JSON is the route's words, trimmed", async () => {
    expect(await post("/api/import?act=preview", body, answering(502, async () => "Bad Gateway"))).toEqual({ status: 502, json: { error: "Bad Gateway", code: "internal" } });
  });
});

describe("the import confirm keeps what landed", () => {
  const src = (name: string, token: string) => ({ name, bytes: new Blob([name]), preview: { token, projects: [], themes: [], items: [] } }) as unknown as Source;
  const outcome = (v1Id: string) => ({ v1Id, id: `p-${v1Id}`, title: v1Id, outcome: "imported" });
  const landedOf = (v1Id: string) => ({ outcomes: [outcome(v1Id)], styles: [], items: [] });
  // One answer per source, by the token in the path.
  const route =
    (answers: Record<string, Answer>) =>
    async (path: string): Promise<Answer> =>
      answers[new URL(path, "http://x").searchParams.get("token") ?? ""] ?? { status: 500, json: {} };

  it("a later source's refusal is named beside the earlier source's outcomes, not instead of them", async () => {
    const c = await commitAll([src("acct-a", "ta"), src("acct-b", "tb")], route({ ta: { status: 200, json: landedOf("a1") }, tb: { status: 503, json: { error: "the import could not be reached: Failed to fetch" } } }));
    expect(c.landed.outcomes.map((o) => o.v1Id)).toEqual(["a1"]);
    expect(c.failed).toEqual({ name: "acct-b", message: "the import could not be reached: Failed to fetch" });
  });

  it("a stale source comes back fresh while the source that committed keeps its outcomes", async () => {
    const fresh = { fresh: [], themes: [], items: [], token: "tb2" };
    const c = await commitAll([src("acct-a", "ta"), src("acct-b", "tb")], route({ ta: { status: 200, json: landedOf("a1") }, tb: { status: 409, json: { error: "stale", fresh } } }));
    expect(c.landed.outcomes.map((o) => o.v1Id)).toEqual(["a1"]);
    expect(c.fresh.map((x) => [x.name, x.preview.token])).toEqual([["acct-b", "tb2"]]);
    expect(c.failed).toBeUndefined();
    // The second round adds to what the first landed.
    const again = await commitAll(c.fresh, route({ tb2: { status: 200, json: landedOf("b1") } }), c.landed);
    expect(again.landed.outcomes.map((o) => o.v1Id)).toEqual(["a1", "b1"]);
  });

  it("a 409 with no fresh preview is a refusal in its words, not a source that disappears", async () => {
    const c = await commitAll([src("acct-a", "ta")], route({ ta: { status: 409, json: { error: "the archive or the studio changed since this preview" } } }));
    expect(c.fresh).toEqual([]);
    expect(c.failed).toEqual({ name: "acct-a", message: "the archive or the studio changed since this preview" });
  });

  it("ImportView confirms through commitAll and draws what landed in every phase that carries it", () => {
    const view = code("import/ImportView.tsx");
    expect(view.match(/commitAll\(sources, post, prior\)/g) ?? []).toHaveLength(1);
    expect(view.match(/act=commit/g) ?? []).toEqual([]);
    expect(view.match(/<Outcomes landed=\{landed\} \/>/g) ?? []).toHaveLength(1);
  });
});

describe("the import's doors - only the newest one lands", () => {
  const later = <T,>(v: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(v), ms));

  it("a slow browser read that answers after a picked file does not replace the file's preview", async () => {
    const landed: string[] = [];
    const doors = lastDoor<string>((v) => landed.push(v));
    doors.open(later("this browser", 20));
    doors.open(later("picked file", 1));
    await later(null, 40);
    expect(landed).toEqual(["picked file"]);
  });

  it("an answer still travelling when the screen closes lands nowhere", async () => {
    const landed: string[] = [];
    const doors = lastDoor<string>((v) => landed.push(v));
    doors.open(later("this browser", 5));
    doors.close();
    await later(null, 20);
    expect(landed).toEqual([]);
  });

  it("ImportView opens every door through it", () => {
    const view = code("import/ImportView.tsx");
    expect(view.match(/\.then\(setPhase\)/g) ?? []).toEqual([]);
    // readThisBrowser awaits each account's previewOf inside its own door; the component awaits none.
    expect(view.match(/await (readThisBrowser\(|commitAll\(|previewOf\(f\.)/g) ?? []).toEqual([]);
    expect(view.match(/doors\.open\(/g) ?? []).toHaveLength(4);
  });
});

describe("the receipt flow - an answer lands on the sheet as it now reads", () => {
  type Sheet = NonNullable<Parameters<ReturnType<typeof onOpen>>[0]>;
  const sheet = { ceiling: "", busy: true } as unknown as Sheet;

  it("a ceiling typed while a re-read or a confirm was in flight survives its answer", () => {
    const typed = { ...sheet, ceiling: "2.50" };
    expect(onOpen({ busy: false, error: "refused" })(typed)).toMatchObject({ ceiling: "2.50", busy: false, error: "refused" });
  });

  it("a sheet closed while the answer travelled stays closed", () => {
    expect(onOpen({ busy: false })(null)).toBeNull();
  });

  it("no setSt after an await spreads the copy the await started from", () => {
    const src = code("_plan/receipt.tsx");
    expect(src.match(/setSt\(\{\s*\.\.\.(st|rest)\b/g) ?? []).toEqual([]);
    expect((src.match(/setSt\(onOpen\(/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
