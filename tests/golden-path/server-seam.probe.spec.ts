// LANE - THE SERVER SEAM: /api/session and /api/events/stream, driven as the
// route modules Next loads (Phase 1 wave 3, lot 8).
//
// The session route is the bridge from a browser's Firebase sign-in to the
// server's renders; the stream route is the ledger as Server-Sent Events. Both
// are imported for real and called with real Requests: the token is verified by
// lib/principal.ts against a JWKS stub serving a key minted here (no network),
// and the stream reads a real kernel store in a temp file, opened through the
// app's own singleton (app/_server/kernel.ts).
//
// "server-only" resolves the way Next resolves it for server code, for the
// whole lane (playwright.config.ts).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { __resetJwksCache, __setJwksFetch, SECURETOKEN_JWKS_URL } from "@/lib/principal";

import { keepEnv } from "./_helpers";

type Handler = (req: Request) => Promise<Response>;
type Routes = { session: Record<"GET" | "POST" | "DELETE", Handler>; stream: { GET: Handler }; kernel: () => { ok: boolean; value?: { store: unknown } } };
let closeKernel: () => void = () => undefined;
let routes: Routes;
let append: (t: unknown, e: unknown) => unknown;

const PROJECT = "gravitone-seam-probe";
const ORIGIN = "http://127.0.0.1:3181";
const dir = mkdtempSync(join(tmpdir(), "gt-seam-"));

keepEnv(["GRAVITONE_STORE_PATH", "IMAGING_ACCESS_SECRET", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_DEV_AUTH", "NEXT_PUBLIC_LOCAL_MODE", "PRINCIPAL_MODE"]);

let sign: (claims?: Record<string, unknown>) => Promise<string>;

test.beforeAll(async () => {
  const RSA = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
  const pair = (await crypto.subtle.generateKey(RSA, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  __resetJwksCache();
  __setJwksFetch(async (url) => {
    if (url !== SECURETOKEN_JWKS_URL) throw new Error(`unexpected ${url}`);
    return Response.json({ keys: [{ ...jwk, kid: "seam-1", alg: "RS256", use: "sig" }] });
  });
  const b64u = (v: string | Uint8Array) => Buffer.from(v).toString("base64url");
  sign = async (claims = {}) => {
    const t = Math.floor(Date.now() / 1000);
    const h = b64u(JSON.stringify({ alg: "RS256", kid: "seam-1" }));
    const p = b64u(JSON.stringify({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: "uid-seam", iat: t - 5, auth_time: t - 5, exp: t + 3600, ...claims }));
    const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${h}.${p}`)));
    return `${h}.${p}.${b64u(sig)}`;
  };
  routes = {
    session: (await import("../../app/api/session/route.ts")) as unknown as Routes["session"],
    stream: (await import("../../app/api/events/stream/route.ts")) as unknown as Routes["stream"],
    kernel: ((await import("../../app/_server/kernel.ts")) as unknown as { kernel: Routes["kernel"] }).kernel,
  };
  closeKernel = ((await import("../../app/_server/kernel.ts")) as unknown as { closeKernel: () => void }).closeKernel;
  append = ((await import("@gt/kernel/events")) as unknown as { append: typeof append }).append;
});

test.afterAll(() => {
  __setJwksFetch(null);
  __resetJwksCache();
  // The app's singleton holds the store open (Windows will not delete an open file).
  closeKernel();
  rmSync(dir, { recursive: true, force: true });
});

test.beforeEach(() => {
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT;
  process.env.GRAVITONE_STORE_PATH = join(dir, "seam.sqlite");
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  delete process.env.NEXT_PUBLIC_LOCAL_MODE;
  delete process.env.IMAGING_ACCESS_SECRET;
  delete process.env.PRINCIPAL_MODE;
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/session`, { method: "POST", body: JSON.stringify(body), headers: { origin: ORIGIN, host: "127.0.0.1:3181", "content-type": "application/json", ...headers } });

const cookieOf = (r: Response): string => (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

test("session: a verified token becomes an httpOnly Lax cookie for the token's life, read back, then cleared", async () => {
  const token = await sign();
  const made = await routes.session.POST(post({ idToken: token }));
  expect(made.status).toBe(200);
  expect(await made.json()).toMatchObject({ uid: "uid-seam" });
  const set = made.headers.get("set-cookie") ?? "";
  expect(set).toContain("HttpOnly");
  expect(set).toContain("SameSite=Lax");
  expect(set).not.toContain("Secure"); // loopback
  const age = Number(/Max-Age=(\d+)/.exec(set)?.[1]);
  expect(age).toBeGreaterThan(3500);
  expect(age).toBeLessThanOrEqual(3600);

  const who = await routes.session.GET(new Request(`${ORIGIN}/api/session`, { headers: { cookie: cookieOf(made) } }));
  expect(await who.json()).toMatchObject({ kind: "firebase", uid: "uid-seam" });

  const gone = await routes.session.DELETE(new Request(`${ORIGIN}/api/session`, { method: "DELETE", headers: { origin: ORIGIN, host: "127.0.0.1:3181" } }));
  expect(await gone.json()).toEqual({ signedOut: true, evict: "identity" });
  expect(gone.headers.get("set-cookie")).toContain("Max-Age=0");
});

test("session: a cross-origin post sets nothing; an expired token is refused and clears the cookie", async () => {
  const cross = await routes.session.POST(post({ idToken: await sign() }, { origin: "https://evil.example" }));
  expect(cross.status).toBe(403);
  expect(cross.headers.get("set-cookie")).toBeNull();
  const old = await routes.session.POST(post({ idToken: await sign({ exp: Math.floor(Date.now() / 1000) - 1 }) }));
  expect(old.status).toBe(401);
  expect(await old.json()).toMatchObject({ code: "unauthenticated", detail: "expired" });
  expect(old.headers.get("set-cookie")).toContain("Max-Age=0");
  const anon = await routes.session.GET(new Request(`${ORIGIN}/api/session`));
  expect(anon.status).toBe(200);
  expect(await anon.json()).toEqual({ kind: "none", reason: "missing-token" });
});

test("stream: 401 without a credential; with the session cookie it carries the ledger after the cursor", async () => {
  const refused = await routes.stream.GET(new Request(`${ORIGIN}/api/events/stream`));
  expect(refused.status).toBe(401);
  expect(await refused.json()).toMatchObject({ code: "unauthenticated" });

  const k = routes.kernel();
  expect(k.ok).toBe(true);
  const store = k.value?.store as { tx(fn: (t: unknown) => unknown): { ok: boolean } };
  const add = (i: number) => store.tx((t) => append(t, { actor: { kind: "machine", id: "probe" }, type: "job.done", subject: { kind: "job", id: `p${i}` }, data: { i } }));
  expect(add(1).ok).toBe(true);
  expect(add(2).ok).toBe(true);

  const made = await routes.session.POST(post({ idToken: await sign() }));
  const ac = new AbortController();
  const res = await routes.stream.GET(new Request(`${ORIGIN}/api/events/stream`, { headers: { cookie: cookieOf(made), "last-event-id": "1" }, signal: ac.signal }));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  expect(res.headers.get("cache-control")).toContain("no-store");

  const reader = res.body!.getReader();
  let text = "";
  const deadline = Date.now() + 5000;
  setTimeout(() => add(3), 50);
  while (!text.includes("id: 3") && Date.now() < deadline) {
    const next = await reader.read();
    if (next.done) break;
    text += new TextDecoder().decode(next.value);
  }
  ac.abort();
  await reader.cancel();
  const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((m) => m[1]);
  expect(ids).toEqual(["2", "3"]);
});
