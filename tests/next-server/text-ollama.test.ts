// THE LOCAL WRITER (lib/text/providers/ollama.ts) AND THE TURN IT LEADS (router.ts PLAN `draft`): a set
// OLLAMA_HOST is the provider's whole configuration, the daemon is a fake fetch, and every failure that
// means "the engine is absent" walks on while a timeout or a 500 does not. No daemon is started or asked:
// fetch is stubbed, the spend ledger is in memory, and the claude CLI is forbidden by LOCAL_BINARIES=off
// so a walk past the daemon ends in a refusal naming both candidates instead of spawning a seat turn.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TextError } from "../../lib/text/errors.ts";

const { ollamaProvider, ollamaTags, hasModel } = await import("../../lib/text/providers/ollama.ts");
const { DRAFT_TURN, orderFor, planFor, reason } = await import("../../lib/text/router.ts");
const { TEXT_TABLE, tableProblems } = await import("../../packages/kernel/src/router/tables.ts");

const VARS = ["OLLAMA_HOST", "OLLAMA_TEXT_MODEL", "TEXT_ENV", "LOCAL_BINARIES", "SPEND_STORE", "LIGHTTRACK_URL"] as const;
const saved: Record<string, string | undefined> = {};
type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];

beforeEach(() => {
  for (const v of VARS) saved[v] = process.env[v];
  for (const v of VARS) delete process.env[v];
  process.env.OLLAMA_HOST = "http://ollama.test:11434/";
  process.env.SPEND_STORE = "memory";
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

/** The daemon, answering each /api/chat with `answer(body, n)`. */
function daemon(answer: (body: Record<string, unknown>, n: number) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    return answer(body, calls.length);
  });
}
const chat = (content: string) => Response.json({ model: "qwen3.8:27b", message: { role: "assistant", content }, done: true, done_reason: "stop", prompt_eval_count: 41, eval_count: 120 });
/** The error a call that must fail threw; a call that served fails the test. */
const fails = (p: Promise<unknown>): Promise<TextError> => p.then(() => { throw new Error("served"); }, (e: unknown) => e as TextError);
const ask = (prompt = "Draft three loglines.", extra: Record<string, unknown> = {}) =>
  ollamaProvider().reason({ turn: "draft", prompt, ...extra } as never, 30_000);

describe("the ollama text provider", () => {
  it("posts one non-streamed chat to the host and returns a $0 local receipt", async () => {
    daemon(() => chat("# Three loglines\n\n1. ..."));
    const out = await ask();
    expect(out.text).toBe("# Three loglines\n\n1. ...");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://ollama.test:11434/api/chat");
    expect(calls[0]?.body).toMatchObject({ model: "qwen3.8:27b", stream: false, think: false, messages: [{ role: "user", content: "Draft three loglines." }] });
    expect(out.provenance).toMatchObject({ provider: "ollama", model: "qwen3.8:27b", transport: "local-daemon", turn: "draft", costUsd: 0, costBasis: "estimated", inputTokens: 41, outputTokens: 120, schemaEnforcement: "none" });
  });

  it("names the model OLLAMA_TEXT_MODEL sets, read per call, and an unlisted one reads unpriced", async () => {
    daemon(() => chat("ok"));
    process.env.OLLAMA_TEXT_MODEL = "llama4:8b";
    const out = await ask();
    expect(calls[0]?.body["model"]).toBe("llama4:8b");
    expect(out.provenance.costBasis).toBe("unpriced");
    expect(out.provenance.costUsd).toBeUndefined();
  });

  it("hands a schema to the daemon as `format`", async () => {
    daemon(() => chat('{"title":"x"}'));
    const schema = { type: "object", properties: { title: { type: "string" } }, required: ["title"] };
    const out = await ask("p", { schema });
    expect(calls[0]?.body["format"]).toEqual(schema);
    expect(out.provenance.schemaEnforcement).toBe("native");
  });

  it("times out at the router's ceiling as `timeout`, dispatched, and not reroutable", async () => {
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const err = await fails(ollamaProvider().reason({ turn: "draft", prompt: "p" } as never, 40));
    expect(err).toBeInstanceOf(TextError);
    expect(err).toMatchObject({ kind: "timeout", provider: "ollama", dispatched: true });
    expect((err as TextError).reroutable).toBe(false);
  });

  it("a 500 is `failed` and stays put; a 404 for the model is absent, with the pull that fixes it", async () => {
    daemon(() => new Response('{"error":"llama runner process has terminated"}', { status: 500 }));
    const crashed = await fails(ask());
    expect(crashed).toMatchObject({ kind: "failed", dispatched: true, message: "ollama returned 500." });
    expect(crashed.reroutable).toBe(false);
    daemon(() => new Response('{"error":"model \\"qwen3.8:27b\\" not found, try pulling it first"}', { status: 404 }));
    const missing = await fails(ask());
    expect(missing).toMatchObject({ kind: "not-installed", provider: "ollama" });
    expect(missing.message).toBe("Ollama at http://ollama.test:11434 does not hold qwen3.8:27b: ollama pull qwen3.8:27b, or set OLLAMA_TEXT_MODEL.");
    expect(missing.reroutable).toBe(true);
  });

  it("a daemon that does not answer the socket is absent and undispatched, naming the script that starts it", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed"); });
    const err = await fails(ask());
    expect(err).toMatchObject({ kind: "not-installed", dispatched: false });
    expect(err.message).toBe("Ollama at http://ollama.test:11434 did not answer: start it with powershell -File pipeline/ollama-up.ps1, or unset OLLAMA_HOST.");
  });

  it("retries once without `think` when the daemon rejects the key, and only then", async () => {
    daemon((body) => ("think" in body ? new Response('{"error":"\\"qwen\\" does not support thinking"}', { status: 400 }) : chat("plain")));
    expect((await ask()).text).toBe("plain");
    expect(calls.map((c) => "think" in c.body)).toEqual([true, false]);
  });

  it("refuses an empty answer as bad-response, and a prompt past its window before dispatch", async () => {
    daemon(() => chat("   "));
    expect(await fails(ask())).toMatchObject({ kind: "bad-response", dispatched: true });
    calls = [];
    expect(await fails(ask("x".repeat(36_001)))).toMatchObject({ kind: "invalid-request" });
    expect(calls).toEqual([]);
  });

  it("lists the daemon's models from /api/tags, a bare name meaning :latest", async () => {
    const f = async () => Response.json({ models: [{ name: "qwen3.8:27b" }, { name: "llama4:latest" }] });
    const tags = await ollamaTags("http://ollama.test:11434/", f);
    expect(tags).toEqual(["qwen3.8:27b", "llama4:latest"]);
    expect([hasModel(tags, "qwen3.8:27b"), hasModel(tags, "llama4"), hasModel(tags, "qwen3.8:9b")]).toEqual([true, true, false]);
  });
});

describe("the draft turn", () => {
  it("is led by the daemon, the seat behind it, and no metered key in either posture", () => {
    expect(DRAFT_TURN).toBe("draft");
    expect(planFor("draft", "local")).toEqual(["ollama", "claude-cli"]);
    expect(planFor("draft", "cloud")).toEqual(["ollama"]);
    // `prefer` reorders only within the plan: google is not in it, so the preference is dropped.
    expect(orderFor("draft", { prefer: "google" }, "local")).toEqual(["ollama", "claude-cli"]);
  });

  it("changed no other turn's chain: the daemon leads nothing else and appears in no other row", () => {
    const others = ["edit-plan", "compose", "scene-direction", "style-synthesis", "research", "sound-hunt", "sound-lesson", "suno-propose", "suno-riff", "mv-treatment", "mv-metadata", "ad-ideas", "ad-scenarios", "repair"] as const;
    for (const t of others) {
      expect(planFor(t, "local")).toEqual(["claude-cli", "google"]);
      expect(planFor(t, "cloud")).toEqual(["google"]);
    }
    expect(planFor("probe", "local")).toEqual(["claude-cli"]);
    // The kernel's mirror says the same, and holds together.
    expect(TEXT_TABLE.plans["local"]?.["reason/draft"]).toEqual(["ollama", "claude-cli"]);
    expect(TEXT_TABLE.plans["local"]?.["reason/compose"]).toEqual(["claude-cli", "google"]);
    expect(tableProblems(TEXT_TABLE)).toEqual([]);
  });

  it("is served by the daemon through the router, on the preferred rung", async () => {
    process.env.TEXT_ENV = "local";
    daemon(() => chat("a draft"));
    const out = await reason({ turn: DRAFT_TURN, prompt: "p" });
    expect(out.provenance).toMatchObject({ provider: "ollama", rung: "preferred", costUsd: 0 });
    expect(out.provenance.reroutedFrom).toBeUndefined();
  });

  it("walks past a dead daemon to the CLI, and past an unset host with no call at all", async () => {
    process.env.TEXT_ENV = "local";
    process.env.LOCAL_BINARIES = "off";
    vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed"); });
    const dead = await fails(reason({ turn: DRAFT_TURN, prompt: "p" }));
    expect(dead.message).toMatch(/^No reasoning engine could serve this draft turn\. Tried: ollama \(not-installed\), claude-cli \(policy-forbidden\)\./);
    delete process.env.OLLAMA_HOST;
    daemon(() => chat("never"));
    const unset = await fails(reason({ turn: DRAFT_TURN, prompt: "p" }));
    expect(unset.message).toMatch(/Tried: ollama \(no-key\), claude-cli \(policy-forbidden\)\./);
    expect(calls).toEqual([]);
  });
});
