// LANE — THE REASONING LADDER'S SKELETON, WITHOUT A VENDOR (dynamic).
//
// Registry: agent-cli-transport / fallback-ladder, model-routing / model-identity.
//
// `.ai/manifest.yaml` names lib/text/router.ts as this repo's text chokepoint —
// every reasoning turn in the app enters there — and until this file no probe in
// the lane imported a single module under lib/text/. The only thing exercising it
// was `npm run verify:text`, which is correctly kept OUT of `npm test` because it
// talks to a vendor. So the parts that need no vendor at all were unguarded too,
// and the transport defect fixed in f59c27a (an unhandled stdin error taking the
// server down instead of letting the ladder descend) lived on the ladder's first
// rung where nothing could see it.
//
// WHAT IS DRIVEN HERE, all of it against the REAL router:
//   · the plan table, per posture and per turn class;
//   · the steer rules — `avoid` removes, `prefer` only reorders, and a
//     preference that cannot be honoured is dropped rather than raised;
//   · the cheap gate, through the deployment posture rather than a mock;
//   · the bottom of the ladder: with every candidate blocked, the refusal names
//     each one and why, and carries the kind of the engine we MEANT to use.
//
// WHAT IT DOES NOT REACH, and where that lives now: a SUCCESSFUL serve, and
// therefore the rung labelling, `reroutedFrom` and the schemaEnforcement
// downgrade. `PROVIDERS` is a module-private const, so there is no seam to hand
// this file a fake — and none was added. engine-door.probe.spec.ts reaches all
// three WITHOUT one: `withFakeEngine` puts a stand-in `claude` first on PATH,
// so the router's real first rung serves (preferred, "prompted", no
// `reroutedFrom`), refuses to descend after a dispatched failure, and descends
// with `reroutedFrom: claude-cli` when nothing is on PATH (CIP-A).
//
// NO VENDOR, NO SPAWN, NO SPEND: every case forces a posture in which the local
// transport is blocked BEFORE its probe would spawn anything, and leaves the
// Google key unset so its adapter is refused at the cheap gate.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { TextError } from "@/lib/text/errors";
import { orderFor, planFor, reason, engineStatus } from "@/lib/text/router";
import type { TurnClass } from "@/lib/text/types";

import { keepEnv, stripComments } from "./_helpers";

/** Every production turn class, walked off lib/text/types.ts's TurnClass union
 *  (comments stripped) rather than listed here: a hand list stood at 11 of the
 *  14 while `compose`, `research` and `repair` went unpinned. `probe` is the
 *  one class with its own plan, asserted below. */
const TURN_UNION = /export type TurnClass =([^;]+);/.exec(stripComments(readFileSync(resolve("lib/text/types.ts"), "utf8")))?.[1] ?? "";
const REAL_TURNS = [...TURN_UNION.matchAll(/"([a-z-]+)"/g)].map((m) => m[1] as TurnClass).filter((t) => t !== "probe");

test("plan: the turn walk read the union", () => {
  expect(REAL_TURNS.length, "TurnClass was not read from lib/text/types.ts").toBeGreaterThanOrEqual(14);
  expect(REAL_TURNS).toEqual(expect.arrayContaining(["compose", "research", "repair"]));
});

keepEnv(["TEXT_ENV", "LOCAL_BINARIES", "GOOGLE_AI_API_KEY"]);

test.beforeEach(() => {
  // Every case runs with no cloud credential and no permission to spawn, so
  // nothing here can reach a vendor or start a process even if a rule regressed.
  delete process.env.GOOGLE_AI_API_KEY;
  process.env.LOCAL_BINARIES = "off";
});

/* ── the plan table ───────────────────────────────────────────────────────── */

test("plan: local tries the seat first and the cloud behind it; cloud is Google alone", () => {
  // `draft` is the one turn the local daemon leads (spark scout-vision S6), and `suno-listen` carries
  // audio only google hears (spark suno-advisor) - each held by its own case below.
  for (const turn of REAL_TURNS.filter((t) => t !== "draft" && t !== "suno-listen")) {
    expect(planFor(turn, "local"), `${turn} in local posture`).toEqual(["claude-cli", "google"]);
    expect(planFor(turn, "cloud"), `${turn} in cloud posture`).toEqual(["google"]);
  }
  console.log(`[ladder] local plan: ${planFor("edit-plan", "local").join(" -> ")}`);
});

test("plan: a draft is the local daemon's, the seat behind it, and never a metered key", () => {
  expect(planFor("draft", "local")).toEqual(["ollama", "claude-cli"]);
  expect(planFor("draft", "cloud")).toEqual(["ollama"]);
});

test("plan: a Suno listen is google's alone in both postures - no other engine here hears audio", () => {
  expect(planFor("suno-listen", "local")).toEqual(["google"]);
  expect(planFor("suno-listen", "cloud")).toEqual(["google"]);
});

test("plan: a probe turn is single-entry in BOTH postures", () => {
  // A health check that walks a chain reports the CHAIN's health, not the
  // engine's, and is therefore useless for deciding whether the engine is up.
  expect(planFor("probe", "local")).toEqual(["claude-cli"]);
  expect(planFor("probe", "cloud")).toEqual(["google"]);
});

test("plan: the cloud posture never lists the local engine", () => {
  // Listing a candidate that is structurally impossible would put a guaranteed
  // elimination in every trail — noise that teaches a reader to stop reading
  // trails. This is the assertion that keeps the table honest as it grows.
  for (const turn of [...REAL_TURNS, "probe" as TurnClass]) {
    expect(planFor(turn, "cloud")).not.toContain("claude-cli");
  }
});

/* ── the steer rules ──────────────────────────────────────────────────────── */

test("steer: `avoid` REMOVES, and empties the chain rather than serving the avoided engine", () => {
  expect(orderFor("edit-plan", { avoid: "claude-cli" }, "local")).toEqual(["google"]);
  // Cloud has one candidate, so avoiding it leaves nothing — and that refuses
  // rather than quietly serving the engine the caller ruled out.
  expect(() => orderFor("edit-plan", { avoid: "google" }, "cloud")).toThrow(TextError);
  try {
    orderFor("edit-plan", { avoid: "google" }, "cloud");
  } catch (e) {
    expect((e as TextError).kind).toBe("no-alternative");
  }
});

test("steer: `prefer` only REORDERS, and only when it can be honoured", () => {
  process.env.GOOGLE_AI_API_KEY = "probe-key";
  expect(orderFor("edit-plan", { prefer: "google" }, "local")).toEqual(["google", "claude-cli"]);
  // Same chain, same members — a preference must never add or remove.
  expect([...orderFor("edit-plan", { prefer: "google" }, "local")].sort()).toEqual(
    [...planFor("edit-plan", "local")].sort(),
  );
});

test("steer: a preference that cannot be honoured is DROPPED, not raised", () => {
  // No key, so google is not configured. The caller asked for a better first
  // try, not for a failure — and which engine actually served is on the
  // provenance, so a dropped preference is visible after the fact.
  expect(orderFor("edit-plan", { prefer: "google" }, "local")).toEqual(["claude-cli", "google"]);
  // A preference for an engine that is not in this posture's chain at all.
  expect(orderFor("edit-plan", { prefer: "claude-cli" }, "cloud")).toEqual(["google"]);
});

test("steer: the LOCAL engine is preferable when the posture allows spawning", () => {
  // `isConfigured` cannot mean "has a credential" for a keyless provider, so it
  // answers whether this deployment may spawn at all. If that ever regressed to
  // a key lookup, `prefer: "claude-cli"` would be silently undroppable-into-
  // first-place forever, and no existing assertion would notice.
  process.env.LOCAL_BINARIES = "on";
  process.env.GOOGLE_AI_API_KEY = "probe-key";
  expect(orderFor("edit-plan", { prefer: "claude-cli" }, "local")).toEqual(["claude-cli", "google"]);
  expect(orderFor("edit-plan", { prefer: "claude-cli", avoid: "google" }, "local")).toEqual(["claude-cli"]);
});

/* ── the bottom of the ladder ─────────────────────────────────────────────── */

test("refusal: with every candidate blocked, the error names each one and why", async () => {
  process.env.TEXT_ENV = "local";
  const err = await reason({ turn: "edit-plan", prompt: "unreachable" }).then(
    () => null,
    (e: unknown) => e as TextError,
  );

  expect(err, "the ladder resolved a turn with no engine available").toBeInstanceOf(TextError);
  console.log(`[ladder] refusal -> ${err!.kind}: ${err!.message.slice(0, 150)}`);

  // Rung 4: refusal, carrying the whole descent record. Both candidates are
  // named, with a reason each — "the model could not be reached" is precisely
  // the sentence that sends an operator to look where the fault is not.
  expect(err!.message).toContain("claude-cli");
  expect(err!.message).toContain("google");
  expect(err!.message).toMatch(/policy-forbidden|managed-platform/);
  expect(err!.message).toContain("no-key");
  // And it says the state was not changed, because a refusal that leaves a
  // caller guessing about side effects is a worse refusal.
  expect(err!.message).toContain("Nothing was changed.");
});

test("refusal: the kind is the engine we MEANT to use, not a hardcoded default", async () => {
  // The first candidate in local posture is the seat, blocked here by
  // LOCAL_BINARIES=off — so the refusal's kind is that block, not google's
  // `no-key` and not a generic `not-installed`.
  process.env.TEXT_ENV = "local";
  const local = await reason({ turn: "edit-plan", prompt: "x" }).catch((e: TextError) => e);
  expect((local as TextError).kind).toBe("policy-forbidden");

  // In cloud posture the seat is not a candidate at all, so the headline kind
  // becomes the cloud engine's missing key.
  process.env.TEXT_ENV = "cloud";
  const cloud = await reason({ turn: "edit-plan", prompt: "x" }).catch((e: TextError) => e);
  expect((cloud as TextError).kind).toBe("no-key");
  expect((cloud as TextError).message).not.toContain("claude-cli");
  console.log(`[ladder] cloud refusal kind -> ${(cloud as TextError).kind}`);
});

/* ── the cancel ───────────────────────────────────────────────────────────── */

test("cancel: a cloud turn's in-flight request is aborted by the caller's signal, and reads as cancelled", async () => {
  process.env.TEXT_ENV = "cloud";
  process.env.GOOGLE_AI_API_KEY = "probe-google-key-0123456789";
  const real = globalThis.fetch;
  let sawCallerAbort = false;
  // A vendor that takes 3s to answer, unless the request's own signal aborts it first.
  globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const t = setTimeout(
        () => resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "late" }] } }] }), { status: 200 })),
        3_000,
      );
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        sawCallerAbort = true;
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    })) as typeof fetch;
  const ctl = new AbortController();
  const started = Date.now();
  try {
    setTimeout(() => ctl.abort(), 50);
    const out = await reason({ turn: "edit-plan", prompt: "x", signal: ctl.signal }).then(
      () => "served",
      (e: unknown) => e as TextError,
    );
    expect(out, "a cancelled cloud turn ran on and was served").toBeInstanceOf(TextError);
    expect((out as TextError).kind).toBe("cancelled");
    expect((out as TextError).dispatched).toBe(true);
    expect(sawCallerAbort).toBe(true);
    expect(Date.now() - started).toBeLessThan(2_000);
  } finally {
    globalThis.fetch = real;
  }
});

test("size cap: the prompt as SENT is held to it, schema instruction included", async () => {
  process.env.TEXT_ENV = "cloud";
  process.env.GOOGLE_AI_API_KEY = "probe-google-key-0123456789";
  const real = globalThis.fetch;
  let sent = 0;
  globalThis.fetch = (async () => {
    sent++;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }), { status: 200 });
  }) as typeof fetch;
  // `oneOf` keeps this schema off native enforcement, so its instruction is appended.
  const schema = { type: "object", required: ["a"], properties: { a: { oneOf: [{ type: "number" }, { type: "string" }] } } };
  const lines: string[] = [];
  const realErr = console.error;
  console.error = (...a: unknown[]) => void lines.push(a.join(" "));
  try {
    const out = await reason({ turn: "edit-plan", prompt: "x".repeat(900_000 - 10), schema }).catch((e: unknown) => e);
    expect(sent, "a prompt past the cap once its schema was appended went on the wire").toBe(0);
    expect((out as TextError).kind).toBe("invalid-request");
  } finally {
    console.error = realErr;
    globalThis.fetch = real;
  }
  // The descent record names the refusal as what it was, not as an engine fault.
  const line = lines.find((l) => l.includes("kind=invalid-request")) ?? "";
  expect(line, "no refusal line was logged").toContain("tried=google:");
  expect(line).toContain("tried=google:invalid-request");
});

/* ── the availability oracle ──────────────────────────────────────────────── */

test("engineStatus: reports the same posture and the same blocks the router acts on", async () => {
  process.env.TEXT_ENV = "local";
  const s = await engineStatus("edit-plan");
  expect(s.env).toBe("local");
  expect(s.serving, "nothing can serve with no key and no permission to spawn").toBeNull();
  expect(s.candidates.map((c) => c.provider)).toEqual(planFor("edit-plan", "local"));
  expect(s.candidates.every((c) => !c.ok)).toBe(true);
  // Every candidate carries a sentence naming its remedy, not just a boolean.
  for (const c of s.candidates) expect(c.detail.length, `${c.provider} has no detail`).toBeGreaterThan(20);

  process.env.GOOGLE_AI_API_KEY = "probe-key";
  const withKey = await engineStatus("edit-plan");
  expect(withKey.serving, "a configured cloud engine should be the one serving").toBe("google");
  console.log(`[ladder] serving with a key set -> ${withKey.serving}`);
});
