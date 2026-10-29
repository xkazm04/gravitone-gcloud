// THE LISTENER (spark suno-advisor WP2): one priced, receipted, DRY-by-pin read of an uploaded take.
// Every dependency is stood in (lib/sound/suno/listen.ts ListenDeps): an in-memory kernel for the
// receipts, a fake take, and a fake provider - one that FAILS THE TEST if it is called where no vendor
// may be. Pinned: the quote for a 180 s take and its refusal when the audio rate is missing; the DRY
// stand-in, saved and marked; a valid read kept and its receipt settled at the vendor's counts; an
// invalid read refused naming its field, nothing saved, the claim released; a second press replayed,
// not re-bought; an oversize take refused before any claim; the prompt read whole from a CRLF copy;
// the google adapter's inline audio part and ceiling; a text-only adapter refusing audio.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { StudioListen, StudioTakeFacts } from "@gt/domain/audio.suno";
import { ok } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { queryEvents } from "@gt/kernel/events-query";
import { openKernel } from "@gt/kernel/kernel";
import { PRICE_TABLE } from "@gt/kernel/pricing/table";
import type { Store } from "@gt/kernel/store";

import { listenWith, LISTEN_SCOPE, type ListenDeps } from "../../lib/sound/suno/listen.ts";
import { AUDIO_TOKENS_PER_SECOND, LISTEN_SCHEMA, listenPrompt, listenQuote, OUTPUT_TOKEN_ALLOWANCE, PROMPT_TOKEN_ALLOWANCE, promptText, STAND_IN_MODEL } from "../../lib/sound/suno/listenPrompt.ts";
import { GOOGLE_INLINE_REQUEST_MAX_BYTES, googleProvider, toResponseSchema } from "../../lib/text/providers/google.ts";
import { claudeCliProvider } from "../../lib/text/providers/claudeCli.ts";
import { ollamaProvider } from "../../lib/text/providers/ollama.ts";
import { planFor } from "../../lib/text/router.ts";
import type { TextRequest, TextResult } from "../../lib/text/types.ts";

const ON = "2026-10-29T10:00:00.000Z";
const ACTOR: Actor = { kind: "operator", id: "operator" };
const FACTS: StudioTakeFacts = { takeId: "st-take1", name: "night drive (a).mp3", durationS: 180, href: "/api/sound/takes/st-take1/file", measured: { bpm: 96, key: "F minor" } };
const READ = {
  genre: ["synthwave"], mood: ["nocturnal"], bpm: 96, key: "F minor",
  vocals: { heard: true, character: "breathy low male" },
  instruments: [{ name: "analog bass synth", role: "holds the groove", prominence: "lead" }],
  sections: [{ name: "intro", startS: 0, endS: 12.5, says: "pads and a filtered kick" }, { name: "verse", startS: 12.5, endS: 180, says: "voice over bass" }],
};

function memStore(): Store {
  const k = openKernel(":memory:");
  if (!k.ok) throw k.error;
  return k.value.store;
}

const served = (json: unknown, tokens?: { in: number; out: number }): TextResult => ({
  text: JSON.stringify(json),
  json,
  provenance: { provider: "google", model: "gemini-3.8-flash", transport: "cloud-api", rung: "preferred", turn: "suno-listen", schemaEnforcement: "native", durationMs: 1, costBasis: "estimated", promptChars: 1, ...(tokens ? { inputTokens: tokens.in, outputTokens: tokens.out } : {}) },
});

const NEVER = async (): Promise<TextResult> => {
  throw new Error("the vendor was called where no vendor may be");
};

function deps(over: Partial<ListenDeps> = {}): ListenDeps & { saved: StudioListen[]; store: () => ReturnType<ListenDeps["store"]>; mem: Store } {
  const mem = memStore();
  const saved: StudioListen[] = [];
  return {
    mem,
    saved,
    store: () => ok(mem),
    facts: async () => ok(FACTS),
    audio: async () => ok({ bytes: new Uint8Array(3_000_000), mimeType: "audio/mp3" }),
    save: async (_id, l) => {
      saved.push(l);
      return ok({ ...FACTS, listened: l });
    },
    reason: NEVER,
    prompt: async () => ok("Listen. It lasts {{DURATION_S}} seconds."),
    quote: (s, on) => listenQuote(s, on),
    dryOnly: false,
    now: () => new Date(ON),
    actor: ACTOR,
    ...over,
  };
}

const events = (s: Store, type: string) => {
  const r = queryEvents(s, { type: [type], order: "asc", limit: 100 });
  if (!r.ok) throw r.error;
  return r.value.events;
};

describe("the quote", () => {
  it("a 180 s take is 5760 audio tokens plus the stated allowances, at the kernel's rates", () => {
    const q = listenQuote(180, ON);
    const want = (180 * AUDIO_TOKENS_PER_SECOND * 0.75 + PROMPT_TOKEN_ALLOWANCE * 0.75 + OUTPUT_TOKEN_ALLOWANCE * 3.75) / 1_000_000;
    expect(q.basis).toBe("estimated");
    expect(q.usd).toBeCloseTo(want, 10);
    expect(q.usd).toBeCloseTo(0.03582, 10);
    expect(q.note).toContain("5760 audio-input-token");
  });

  it("is unpriced past the introductory rate's last day, and for a take with no length", () => {
    expect(listenQuote(180, "2027-01-01").usd).toBeNull();
    expect(listenQuote(0, ON).usd).toBeNull();
  });
});

describe("listen", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuses an unpriced listen naming the missing rate, and calls nothing", async () => {
    const noAudioRate = PRICE_TABLE.filter((r) => r.unit !== "audio-input-token");
    const d = deps({ quote: (s, on) => listenQuote(s, on, noAudioRate) });
    const r = await listenWith("st-take1", d);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error.message).toMatch(/^listen is unpriced, so it is not run: no audio-input-token price is declared for google\/gemini-3\.8-flash/);
    expect(d.saved).toEqual([]);
    expect(events(d.mem, "receipt.claimed")).toEqual([]);
  });

  it("under DRY returns the stand-in, marked, saved through save, its receipt settled at the quote - no vendor", async () => {
    const d = deps({ dryOnly: true, reason: NEVER });
    const r = await listenWith("st-take1", d);
    expect(r.ok && r.value.listened).toMatchObject({ standIn: true, model: STAND_IN_MODEL, vocals: { heard: false } });
    expect(d.saved).toHaveLength(1);
    const settled = events(d.mem, "receipt.settled");
    expect(settled).toHaveLength(1);
    expect(settled[0]?.subject.id).toBe(`dry:${LISTEN_SCOPE}/st-take1`);
    expect(settled[0]?.cost?.usd).toBeCloseTo(0.03582, 10);
    expect(JSON.stringify(settled[0]?.data)).toContain("5760 audio-input-token");
  });

  it("keeps a valid read from the provider with the provider's model, the audio inline, settled at the vendor's counts", async () => {
    const asked: TextRequest[] = [];
    const d = deps({ reason: async (req) => (asked.push(req), served(READ, { in: 7000, out: 3000 })) });
    const r = await listenWith("st-take1", d);
    expect(r.ok).toBe(true);
    expect(d.saved[0]).toMatchObject({ model: "gemini-3.8-flash", at: ON, bpm: 96 });
    expect(d.saved[0]?.standIn).toBeUndefined();
    expect(asked[0]).toMatchObject({ turn: "suno-listen", prompt: "Listen. It lasts 180 seconds.", audio: { mimeType: "audio/mp3" } });
    expect(asked[0]?.schema).toBe(LISTEN_SCHEMA);
    const settled = events(d.mem, "receipt.settled");
    expect(settled[0]?.cost?.usd).toBeCloseTo((5760 * 0.75 + 1240 * 0.75 + 3000 * 3.75) / 1_000_000, 10);
  });

  it("refuses an invalid read naming the bad field; nothing is saved and the claim is released", async () => {
    const d = deps({ reason: async () => served({ ...READ, instruments: [{ name: "bass", role: "groove", prominence: "loud" }] }) });
    const r = await listenWith("st-take1", d);
    expect(r.ok ? "" : r.error.message).toMatch(/^listen: instruments\.0\.prominence: /);
    expect(d.saved).toEqual([]);
    expect(events(d.mem, "receipt.released")).toHaveLength(1);
    expect(events(d.mem, "receipt.settled")).toEqual([]);
  });

  it("inside the drift window trims an end past the take and drops a section starting past it (live 2026-10-29)", async () => {
    const sections = [{ name: "outro", startS: 150, endS: 185, says: "fades" }, { name: "ghost", startS: 181, endS: 186, says: "nothing" }];
    const near = await listenWith("st-take1", deps({ reason: async () => served({ ...READ, sections }) }));
    expect(near.ok && near.value.listened?.sections).toEqual([{ name: "outro", startS: 150, endS: 180, says: "fades" }]);
    const far = await listenWith("st-take1", deps({ reason: async () => served({ ...READ, sections: [{ name: "ghost", startS: 200, endS: 210, says: "nothing" }] }) }));
    expect(far.ok ? "" : far.error.message).toMatch(/^listen: sections\.0\.endS: /);
  });

  it("refuses an answer that sets what code sets, and a section past the take", async () => {
    const stand = await listenWith("st-take1", deps({ reason: async () => served({ ...READ, standIn: true }) }));
    expect(stand.ok ? "" : stand.error.message).toMatch(/^listen: standIn: /);
    const past = await listenWith("st-take1", deps({ reason: async () => served({ ...READ, sections: [{ name: "all", startS: 0, endS: 400, says: "the song" }] }) }));
    expect(past.ok ? "" : past.error.message).toMatch(/^listen: sections\.0\.endS: /);
  });

  it("a router refusal is the press's answer, released, not retried", async () => {
    let calls = 0;
    const d = deps({ reason: async () => { calls++; throw new Error("No reasoning engine could serve this suno-listen turn. Tried: google (no-key)."); } });
    const r = await listenWith("st-take1", d);
    expect(r.ok ? "" : r.error.message).toContain("google (no-key)");
    expect(calls).toBe(1);
    expect(events(d.mem, "receipt.released")).toHaveLength(1);
  });

  it("a second press inside the receipt window replays the first read and buys nothing", async () => {
    let calls = 0;
    const d = deps({ reason: async () => (calls++, served(READ)) });
    expect((await listenWith("st-take1", d)).ok).toBe(true);
    expect((await listenWith("st-take1", d)).ok).toBe(true);
    expect(calls).toBe(1);
    expect(d.saved).toHaveLength(2);
    expect(d.saved[1]).toEqual(d.saved[0]);
  });

  it("refuses a take too large for one inline request before any claim", async () => {
    const d = deps({ audio: async () => ok({ bytes: new Uint8Array(15_500_000), mimeType: "audio/mp3" }) });
    const r = await listenWith("st-take1", d);
    expect(r.ok ? "" : r.error.message).toMatch(/past the 20 MB Google takes in one request/);
    expect(events(d.mem, "receipt.claimed")).toEqual([]);
  });
});

describe("the prompt", () => {
  it("reads whole from a CRLF copy: comments gone, no carriage return, every slot filled", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "suno-listen-"));
    const lf = readFileSync(path.join(process.cwd(), "pipeline", "SUNO-LISTEN-PROMPT.md"), "utf8").replace(/\r\n/g, "\n");
    const at = path.join(dir, "SUNO-LISTEN-PROMPT.md");
    writeFileSync(at, lf.replace(/\n/g, "\r\n"));
    const crlf = await promptText(at);
    writeFileSync(at, lf);
    const plain = await promptText(at);
    expect(crlf.ok && plain.ok && crlf.value).toBe(plain.ok ? plain.value : "");
    const sent = crlf.ok ? listenPrompt(crlf.value, 180) : "";
    expect(sent).not.toContain("\r");
    expect(sent).not.toContain("<!--");
    expect(sent).not.toContain("{{");
    expect(sent).toContain("It lasts 180 seconds");
    expect(sent).toContain("## Never name an artist or a song");
  });

  it("the schema is one Gemini enforces natively (nothing lost in translation)", () => {
    expect(toResponseSchema(LISTEN_SCHEMA)).not.toBeNull();
  });
});

describe("the engine side", () => {
  const saved = process.env.GOOGLE_AI_API_KEY;
  afterEach(() => {
    vi.unstubAllGlobals();
    if (saved === undefined) delete process.env.GOOGLE_AI_API_KEY;
    else process.env.GOOGLE_AI_API_KEY = saved;
  });

  it("google sends the audio as an inline part beside the prompt, to the pinned listen model", async () => {
    process.env.GOOGLE_AI_API_KEY = "test-key";
    const sent: { url: string; body: { contents: { parts: Record<string, unknown>[] }[] } }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      sent.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] }, finishReason: "STOP" }] }), { status: 200 });
    });
    await googleProvider().reason({ turn: "suno-listen", prompt: "hear this", audio: { mimeType: "audio/mp3", bytes: Uint8Array.from([1, 2, 3]) } }, 5000);
    expect(sent[0]?.url).toContain("/models/gemini-3.8-flash:generateContent");
    expect(sent[0]?.body.contents[0]?.parts).toEqual([{ text: "hear this" }, { inlineData: { mimeType: "audio/mp3", data: "AQID" } }]);
  });

  it("google refuses past its inline ceiling before dispatch", async () => {
    process.env.GOOGLE_AI_API_KEY = "test-key";
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    const bytes = new Uint8Array(Math.ceil((GOOGLE_INLINE_REQUEST_MAX_BYTES * 3) / 4) + 3);
    await expect(googleProvider().reason({ turn: "suno-listen", prompt: "p", audio: { mimeType: "audio/mp3", bytes } }, 5000)).rejects.toMatchObject({ kind: "invalid-request" });
    expect(fetched).not.toHaveBeenCalled();
  });

  it("a text-only engine refuses audio; the turn is planned to google alone", async () => {
    const req = { turn: "suno-listen", prompt: "p", audio: { mimeType: "audio/mp3", bytes: new Uint8Array(1) } } as const;
    await expect(claudeCliProvider().reason({ ...req }, 5000)).rejects.toMatchObject({ kind: "invalid-request" });
    await expect(ollamaProvider().reason({ ...req }, 5000)).rejects.toMatchObject({ kind: "invalid-request" });
    expect(planFor("suno-listen", "local")).toEqual(["google"]);
    expect(planFor("suno-listen", "cloud")).toEqual(["google"]);
  });
});
