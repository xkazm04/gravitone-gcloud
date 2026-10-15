import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AppError, err, ok } from "@gt/domain/errors";

import { ACCESS_SECRET_VAR, __resetRateLimit, RATE_CAPACITY_VAR } from "../../lib/apiAuth.ts";
import { CLIENT_GONE, readJson, sameOrigin } from "../../app/_server/http.ts";
import { route } from "../../app/_server/route.ts";
import { SESSION_COOKIE } from "../../app/_server/session.ts";
import { installSigner, uninstallSigner, type Signer } from "./tokens.ts";

// route(): the guard runs before the body, the session cookie is a credential
// only when the request presented none, every failure is the one envelope, and
// `internal` never leaves the server in words.

const ENV = [ACCESS_SECRET_VAR, RATE_CAPACITY_VAR, "PRINCIPAL_MODE", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_DEV_AUTH", "NEXT_PUBLIC_LOCAL_MODE"];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
let signer: Signer;

beforeAll(async () => {
  for (const k of ENV) delete process.env[k];
  signer = await installSigner();
});
afterEach(() => {
  __resetRateLimit();
  delete process.env[ACCESS_SECRET_VAR];
  delete process.env[RATE_CAPACITY_VAR];
  delete process.env["PRINCIPAL_MODE"];
  vi.restoreAllMocks();
});
afterAll(() => {
  uninstallSigner();
  for (const k of ENV) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const URL0 = "http://127.0.0.1:3181/api/thing";
const req = (init: RequestInit & { url?: string } = {}): Request => new Request(init.url ?? URL0, init);
const json = async (r: Response): Promise<Record<string, unknown>> => z.record(z.string(), z.unknown()).parse(await r.json());

describe("route() guard", () => {
  const echo = route({ guard: "access", bodyCap: 0 }, async ({ who }) => ok({ kind: who?.kind ?? "none" }));

  it("answers a caller with no credential 401 unauthenticated, in the one envelope", async () => {
    const r = await echo(req());
    expect(r.status).toBe(401);
    const body = await json(r);
    expect(body).toMatchObject({ code: "unauthenticated", detail: "no-config" });
    expect(typeof body["error"]).toBe("string");
  });

  it("admits the session cookie when nothing else was presented", async () => {
    const token = await signer.sign();
    const r = await echo(req({ headers: { cookie: `a=b; ${SESSION_COOKIE}=${token}` } }));
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ kind: "firebase" });
  });

  it("judges a presented credential alone: a wrong secret never falls through to a good cookie", async () => {
    process.env[ACCESS_SECRET_VAR] = "right";
    const token = await signer.sign();
    const r = await echo(req({ headers: { authorization: "Bearer wrong", cookie: `${SESSION_COOKIE}=${token}` } }));
    expect(r.status).toBe(401);
    expect(await json(r)).toMatchObject({ detail: "wrong" });
  });

  it("refuses an expired cookie as expired", async () => {
    const token = await signer.sign({ exp: Math.floor(Date.now() / 1000) - 5 });
    const r = await echo(req({ headers: { cookie: `${SESSION_COOKIE}=${token}` } }));
    expect(r.status).toBe(401);
    expect(await json(r)).toMatchObject({ code: "unauthenticated", detail: "expired" });
  });

  it("refuses a cookie-authenticated write from another origin, admits it from this one", async () => {
    const write = route({ guard: "access", bodyCap: 100 }, async () => ok({ wrote: true }));
    const cookie = `${SESSION_COOKIE}=${await signer.sign()}`;
    const cross = await write(req({ method: "POST", headers: { cookie, origin: "https://evil.example", host: "127.0.0.1:3181" } }));
    expect(cross.status).toBe(403);
    expect(await json(cross)).toMatchObject({ code: "refused", detail: "cross-origin" });
    const same = await write(req({ method: "POST", headers: { cookie, origin: "http://127.0.0.1:3181", host: "127.0.0.1:3181" } }));
    expect(same.status).toBe(200);
  });

  it("money: the rate bucket answers before the refusal, as unavailable with Retry-After", async () => {
    process.env[RATE_CAPACITY_VAR] = "1";
    const money = route({ guard: "money", bodyCap: 0 }, async () => ok({}));
    const first = await money(req({ headers: { "x-forwarded-for": "10.0.0.9" } }));
    expect(first.status).toBe(401);
    const second = await money(req({ headers: { "x-forwarded-for": "10.0.0.9" } }));
    expect(second.status).toBe(503);
    expect(second.headers.get("retry-after")).not.toBeNull();
    expect(await json(second)).toMatchObject({ code: "unavailable", detail: "rate-limited" });
  });

  it("never parses the body of a caller it refused", async () => {
    const parse = vi.fn((v: unknown) => v);
    const guarded = route({ guard: "access", bodyCap: 1000, input: z.unknown().transform(parse) }, async () => ok({}));
    const r = await guarded(req({ method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
    expect(r.status).toBe(401);
    expect(parse).not.toHaveBeenCalled();
  });
});

describe("route() input and answers", () => {
  const pub = <S extends z.ZodType>(input: S, cap = 64) => route({ guard: "public", bodyCap: cap, input }, async ({ input: v }) => ok({ got: v }));

  it("parses a JSON body through the door; a bad one is invalid, field-located", async () => {
    const r = await pub(z.object({ n: z.number() }))(req({ method: "POST", body: JSON.stringify({ n: "x" }) }));
    expect(r.status).toBe(400);
    expect(String((await json(r))["error"])).toContain("n:");
    const good = await pub(z.object({ n: z.number() }))(req({ method: "POST", body: JSON.stringify({ n: 2 }) }));
    expect(await json(good)).toEqual({ got: { n: 2 } });
  });

  it("caps the body: a declared length over the cap, and a streamed one, are both refused", async () => {
    const declared = await pub(z.unknown(), 10)(req({ method: "POST", body: "[1,2,3,4,5,6,7,8]", headers: { "content-length": "17" } }));
    expect(await json(declared)).toMatchObject({ code: "invalid", detail: "body-too-large" });
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('["aaaaaaaa",'));
        c.enqueue(new TextEncoder().encode('"bbbbbbbb"]'));
        c.close();
      },
    });
    const streamed = await readJson(new Request(URL0, { method: "POST", body, duplex: "half" } as RequestInit), 15, z.unknown(), "t");
    expect(streamed.ok).toBe(false);
  });

  it("refuses a body sent to a route that takes none", async () => {
    const none = route({ guard: "public", bodyCap: 0 }, async () => ok({}));
    const r = await none(req({ method: "POST", body: "{}" }));
    expect(await json(r)).toMatchObject({ code: "invalid", detail: "body-too-large" });
  });

  it("reads a GET's input from the query string", async () => {
    const r = await pub(z.object({ after: z.coerce.number() }))(req({ url: `${URL0}?after=41` }));
    expect(await json(r)).toEqual({ got: { after: 41 } });
  });

  it("answers an err Result with its own code's status", async () => {
    const conflict = route({ guard: "public", bodyCap: 0 }, async () => err("conflict", "rev moved", { detail: "rev 7" }));
    const r = await conflict(req());
    expect(r.status).toBe(409);
    expect(await json(r)).toEqual({ error: "rev moved", code: "conflict", detail: "rev 7" });
  });

  it("an unclassified throw is internal: logged in full, answered opaquely", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const boom = route({ guard: "public", bodyCap: 0 }, async () => {
      throw new Error("SQLITE_CANTOPEN C:/secret/path/gravitone.sqlite");
    });
    const r = await boom(req());
    expect(r.status).toBe(500);
    const body = await json(r);
    expect(body["code"]).toBe("internal");
    expect(String(body["error"])).not.toContain("secret");
    const ref = /ref ([0-9a-f]{8})/.exec(String(body["error"]))?.[1];
    expect(ref).toBeDefined();
    expect(String(log.mock.calls[0]?.[0])).toContain(`ref=${ref ?? "?"}`);
    expect(String(log.mock.calls[0]?.[0])).toContain("secret/path");
  });

  it("a thrown AppError keeps its code and words", async () => {
    const r = await route({ guard: "public", bodyCap: 0 }, async () => {
      throw new AppError("not-found", "no packet p9");
    })(req());
    expect(r.status).toBe(404);
    expect(await json(r)).toEqual({ error: "no packet p9", code: "not-found" });
  });

  it("a caller who left gets 499 with no body and no log line", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ac = new AbortController();
    const slow = route({ guard: "public", bodyCap: 0 }, async ({ signal }) => {
      ac.abort();
      if (signal.aborted) throw new Error("aborted read");
      return ok({});
    });
    const r = await slow(new Request(URL0, { signal: ac.signal }));
    expect(r.status).toBe(CLIENT_GONE);
    expect(await r.text()).toBe("");
    expect(log).not.toHaveBeenCalled();
  });
});

describe("sameOrigin", () => {
  const at = (h: Record<string, string>): boolean => sameOrigin(new Request(URL0, { headers: h }));
  it("matches Origin against Host, honours X-Forwarded-Host, and refuses the opaque origin", () => {
    expect(at({ origin: "http://127.0.0.1:3181", host: "127.0.0.1:3181" })).toBe(true);
    expect(at({ origin: "https://studio.example", host: "10.0.0.2:8080", "x-forwarded-host": "studio.example" })).toBe(true);
    expect(at({ origin: "https://evil.example", host: "127.0.0.1:3181" })).toBe(false);
    expect(at({ origin: "null", host: "127.0.0.1:3181" })).toBe(false);
    expect(at({ "sec-fetch-site": "cross-site" })).toBe(false);
    expect(at({})).toBe(true);
  });
});
