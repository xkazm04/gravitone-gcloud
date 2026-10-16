import { describe, expect, it } from "vitest";
import { route } from "../src/router/route.ts";
import { AUDIO_TABLE, IMAGE_TABLE, TABLES, tableProblems, TEXT_TABLE, VIDEO_TABLE } from "../src/router/tables.ts";
import type { Availability, Facts, MediumTable, Posture, RouteOutcome, RouteRequest } from "../src/router/types.ts";

const LOCAL: Posture = { plan: { image: "dev", text: "local", audio: "local", video: "local" }, local: "available", retrieval: false };
const HOSTED: Posture = { plan: { image: "prod", text: "cloud", audio: "hosted", video: "hosted" }, local: "managed-platform", retrieval: false };
const NOW = "2026-10-15T12:00:00.000Z";
const OK: Availability = { ok: true };

const facts = (ids: readonly string[], extra: Partial<Facts> = {}): Facts => ({ availability: Object.fromEntries(ids.map((id) => [id, OK])), now: NOW, ...extra });
const gen = (extra: Partial<RouteRequest> = {}): RouteRequest => ({ medium: "image", capability: "generate", units: 1, size: "1K", ...extra });

function routed(o: RouteOutcome) {
  if (o.kind !== "routed") throw new Error(`expected a route, got ${o.reason}: ${o.message}`);
  return o;
}
function refused(o: RouteOutcome) {
  if (o.kind !== "refused") throw new Error(`expected a refusal, got ${o.choice.provider}`);
  return o;
}
const whys = (o: RouteOutcome) => o.trail.map((e) => `${e.provider}:${e.why}`);

describe("the tables", () => {
  it("every seeded table is sound", () => {
    for (const t of Object.values(TABLES)) expect(tableProblems(t)).toEqual([]);
  });

  it("names a prefer-only provider inside a plan row and a first entry that cannot do the job", () => {
    const bad: MediumTable = { ...IMAGE_TABLE, plans: { dev: { generate: ["leonardo-studio", "google"], edit: ["qwen"] } } };
    expect(tableProblems(bad)).toEqual(["image dev generate: leonardo-studio is prefer-only and may not sit in a plan row", "image dev edit: the first entry qwen cannot edit", "image dev edit: qwen names no model for it"]);
  });
});

describe("image routing (lib/imaging/router.ts, kept)", () => {
  it("walks the dev chain past an unconfigured provider, naming it, and labels the rung", () => {
    const o = routed(route(gen(), LOCAL, facts(["google", "leonardo"])));
    expect(o.chain).toEqual(["agy", "google", "leonardo"]);
    expect(o.choice).toMatchObject({ provider: "google", model: "gemini-3.1-flash-image", lane: "cloud.google", rung: "alternate" });
    expect(o.trail).toEqual([{ provider: "agy", why: "no-key", detail: "agy is not configured: the `agy` CLI, installed and authenticated (presence-probed)" }]);
    expect(o.choice.quote).toMatchObject({ usd: 0.045, basis: "estimated" });
    expect(o.choice.estimate).toEqual({ seconds: 21, usd: 0.045 });
  });

  it("a request carrying references never lands on a provider that ignores them", () => {
    const o = routed(route(gen({ needs: ["references"] }), LOCAL, facts(["agy", "google", "leonardo"])));
    expect(o.choice.provider).toBe("google");
    expect(whys(o)).toEqual(["agy:constraint"]);
    const none = refused(route(gen({ needs: ["references"] }), LOCAL, facts(["agy", "leonardo"])));
    expect(none.message).toMatch(/^this request needs a provider that supports reference images; for image generate that is google, which could not serve it/);
    expect(whys(none)).toEqual(["agy:constraint", "google:no-key", "leonardo:constraint"]);
  });

  it("prefer reorders when it can serve, and a preference it cannot honour is dropped out loud", () => {
    const o = routed(route(gen({ steer: { prefer: "leonardo" } }), LOCAL, facts(["agy", "google", "leonardo"])));
    expect(o.chain).toEqual(["leonardo", "agy", "google"]);
    expect(o.choice).toMatchObject({ provider: "leonardo", rung: "preferred" });
    const dropped = routed(route(gen({ steer: { prefer: "leonardo" } }), LOCAL, facts(["agy", "google"])));
    expect(dropped.choice.provider).toBe("agy");
    expect(dropped.steerDropped).toBe("leonardo cannot serve this request (no-key); the preference was dropped");
  });

  it("exclude removes with a trail entry, and an exclusion that empties the chain is no-alternative", () => {
    const o = routed(route(gen({ steer: { exclude: ["agy"] } }), LOCAL, facts(["agy", "google"])));
    expect(o.choice.provider).toBe("google");
    expect(whys(o)).toEqual(["agy:steered-out"]);
    const r = refused(route(gen({ steer: { exclude: ["google"] } }), HOSTED, facts(["google"])));
    expect(r).toMatchObject({ reason: "no-alternative", code: "refused" });
  });

  it("a prefer-only provider is reached only by name, and then alone", () => {
    expect(routed(route(gen(), LOCAL, facts(["leonardo-studio", "google"]))).chain).not.toContain("leonardo-studio");
    const o = routed(route(gen({ steer: { prefer: "leonardo-studio" } }), LOCAL, facts(["leonardo-studio", "google"])));
    expect(o.chain).toEqual(["leonardo-studio"]);
    const closed = refused(route(gen({ steer: { prefer: "leonardo-studio" } }), LOCAL, facts(["google"])));
    expect(whys(closed)).toEqual(["leonardo-studio:no-key"]);
  });

  it("a pin outside the posture's plan is refused, naming what the plan permits", () => {
    const r = refused(route(gen({ steer: { pin: "leonardo" } }), HOSTED, facts(["leonardo", "google"])));
    expect(r).toMatchObject({ reason: "not-permitted", message: "leonardo is not permitted for image generate in the prod posture (it permits google)" });
  });

  it("a refusal walks to the next provider; a timeout stops the request", () => {
    const after = (kind: "refused" | "timeout") => route(gen(), LOCAL, facts(["agy", "google", "leonardo"], { attempts: [{ provider: "agy", kind, detail: `agy: ${kind}` }] }));
    const o = routed(after("refused"));
    expect(o.choice.provider).toBe("google");
    expect(whys(o)).toEqual(["agy:refused"]);
    expect(refused(after("timeout"))).toMatchObject({ reason: "stopped", code: "unavailable", trail: [{ provider: "agy", why: "timeout" }] });
  });

  it("a plan whose first entry cannot do the job is a table bug, not a re-route", () => {
    const bad: MediumTable = { ...IMAGE_TABLE, plans: { dev: { generate: ["qwen", "google"] } } };
    expect(refused(route(gen(), LOCAL, facts(["qwen", "google"]), bad))).toMatchObject({ reason: "table-bug", code: "internal" });
  });

  it("an unpriced choice stays unpriced, and an unknown pace stays unknown", () => {
    const o = routed(route(gen({ size: "2K" }), HOSTED, facts(["google"])));
    expect(o.choice.quote.usd).toBeNull();
    expect(o.choice.estimate).toMatchObject({ usd: null, unpricedReason: expect.stringContaining("measured at size 1K") });
    const agy = routed(route(gen(), LOCAL, facts(["agy"])));
    expect(agy.choice.seconds).toBeNull();
    expect("estimate" in agy.choice).toBe(false);
  });

  it("a steered decision carries its cost and time delta against the unsteered one", () => {
    const o = routed(route(gen({ units: 4, steer: { prefer: "leonardo" } }), LOCAL, facts(["google", "leonardo"])));
    expect(o.delta?.vs).toBe("google");
    expect(o.delta?.usd).toBeCloseTo(4 * (0.0257 - 0.045), 10);
    expect(o.delta?.seconds).toBe(4 * (30 - 21));
    expect("note" in (o.delta ?? {})).toBe(false);
    const unsteered = routed(route(gen(), LOCAL, facts(["google", "leonardo"])));
    expect("delta" in unsteered).toBe(false);
  });
});

describe("text routing (lib/text/router.ts, kept)", () => {
  const turn = (cls: string, extra: Partial<RouteRequest> = {}): RouteRequest => ({ medium: "text", capability: "reason", class: cls, units: 1, ...extra });

  it("descends from the CLI to the cloud rung when the posture forbids spawning, and says why", () => {
    const o = routed(route(turn("edit-plan"), { ...LOCAL, local: "policy-forbidden" }, facts(["claude-cli", "google"])));
    expect(o.choice).toMatchObject({ provider: "google", model: "gemini-3.1-pro-preview", rung: "alternate" });
    expect(o.trail).toEqual([{ provider: "claude-cli", why: "policy-forbidden", detail: "claude-cli cannot run here: LOCAL_BINARIES=off forbids spawning a local binary on this machine" }]);
    expect(o.choice.quote.basis).toBe("unpriced");
  });

  it("a probe never walks a chain, and an unclassified turn is a routing bug", () => {
    const r = refused(route(turn("probe"), LOCAL, facts(["google"], { availability: { "claude-cli": { ok: false, why: "not-logged-in", detail: "run claude login" }, google: OK } })));
    expect(whys(r)).toEqual(["claude-cli:not-logged-in"]);
    expect(refused(route(turn("chit-chat"), LOCAL, facts(["google"])))).toMatchObject({ reason: "misconfigured", code: "invalid" });
  });

  it("retrieval is refused policy-forbidden until the operator turns it on", () => {
    const req: RouteRequest = { medium: "text", capability: "retrieve", class: "research", units: 1 };
    expect(whys(refused(route(req, LOCAL, facts(["claude-cli-retrieve"]))))).toEqual(["claude-cli-retrieve:policy-forbidden"]);
    expect(routed(route(req, { ...LOCAL, retrieval: true }, facts(["claude-cli-retrieve"]))).choice.provider).toBe("claude-cli-retrieve");
    expect(refused(route(req, HOSTED, facts(["google"])))).toMatchObject({ reason: "misconfigured" });
  });
});

describe("audio and video (the prototype's providers, v1's capabilities)", () => {
  it("hosted has none of them: absent, refused with a sentence", () => {
    const r = refused(route({ medium: "audio", capability: "music", units: 1 }, HOSTED, facts(["elevenlabs"])));
    expect(r).toMatchObject({ reason: "absent", message: "audio music is not offered in the hosted posture" });
    expect(refused(route({ medium: "video", capability: "image-to-video", units: 1 }, HOSTED, facts(["wan"]))).reason).toBe("absent");
  });

  it("re-routing a score from Suno to ElevenLabs is a steer with a delta", () => {
    const o = routed(route({ medium: "audio", capability: "music", units: 2, usage: { "audio-second": 60 }, steer: { pin: "elevenlabs" } }, LOCAL, facts(["suno", "elevenlabs"])));
    expect(o.choice).toMatchObject({ provider: "elevenlabs", model: "music_v2/generate", rung: "preferred" });
    expect(o.delta).toMatchObject({ vs: "suno", usd: null, seconds: null });
    expect(o.delta?.note).toContain("elevenlabs is unpriced");
  });

  it("a provider v1 never declared a capability for cannot be pinned into one", () => {
    const r = refused(route({ medium: "audio", capability: "music", units: 1, steer: { pin: "local-tts" } }, LOCAL, facts(["local-tts"])));
    expect(r.reason).toBe("not-permitted");
    expect(AUDIO_TABLE.candidates.find((c) => c.provider === "local-tts")?.capabilities).toEqual([]);
  });

  it("a local GPU render routes on its own lane with an illustrative pace", () => {
    const o = routed(route({ medium: "video", capability: "image-to-video", units: 3 }, LOCAL, facts(["wan"])));
    expect(o.choice).toMatchObject({ provider: "wan", lane: "gpu.local", seconds: 1080 });
    // Every video pace is the prototype's illustrative figure but one: strips, measured on strips-r1.
    const measured = VIDEO_TABLE.candidates.flatMap((c) => Object.values(c.pace ?? {}).filter((p) => p.basis !== "illustrative").map((p) => [c.provider, p.secondsPerUnit]));
    expect(measured).toEqual([["strips", 1020]]);
  });

  it("a strips card-round routes on the text seat, its paid lane, at its measured pace", () => {
    const o = routed(route({ medium: "video", capability: "strip-render", units: 2 }, LOCAL, facts(["strips"])));
    expect(o.choice).toMatchObject({ provider: "strips", lane: "seat.text", seconds: 2040 });
  });
});

describe("misconfiguration never reaches a fallback", () => {
  it("refuses a posture column the table lacks, a steer naming nobody, and pin with prefer", () => {
    expect(refused(route(gen(), { ...LOCAL, plan: { ...LOCAL.plan, image: "staging" } }, facts(["google"]))).message).toMatch(/plan column "staging"/);
    expect(refused(route(gen({ steer: { exclude: ["dall-e"] } }), LOCAL, facts(["google"]))).message).toMatch(/dall-e/);
    expect(refused(route(gen({ steer: { pin: "google", prefer: "agy" } }), LOCAL, facts(["google"]))).reason).toBe("misconfigured");
    expect(refused(route(gen(), LOCAL, facts(["google"]), TEXT_TABLE)).reason).toBe("misconfigured");
  });
});
