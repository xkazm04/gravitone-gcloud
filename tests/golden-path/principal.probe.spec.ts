// LANE — THE VERIFIED PRINCIPAL (dynamic + source-coupled). Card AUP-A, stage 1.
//
// Until this lane the server could not tell who was calling. The only
// credential was a shared secret shipped in the browser bundle (public by
// construction), and the rate limiter keyed on `x-forwarded-for`, which a
// caller sets. Stage 1 gives the server one resolved `Principal` per request:
// a Firebase ID token verified HERE, with no firebase-admin and no JOSE
// library - RS256 over WebCrypto against Google's securetoken JWKS - and the
// money routes' rate bucket keyed on that principal.
//
// The four acceptance cases come first, then the properties the operator
// decision added: `PRINCIPAL_MODE=legacy` (the default) answers exactly as
// before, a JWKS outage fails CLOSED for money and does not lock out reads, the
// fixture and local identities are named kinds rather than inferred, the client
// token cache never evicts, and nothing server-only reaches the client modules.
//
// NEVER REAL NETWORK. The JWKS fetcher is injected with a stub that serves a
// test RSA key minted in this file, and `globalThis.fetch` is replaced with a
// thrower for every case, so a path that slipped past the injection fails loudly
// instead of reaching Google.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { test, expect } from "@playwright/test";

import { keepEnv, stripComments } from "./_helpers";
import {
  ACCESS_SECRET_VAR,
  RATE_CAPACITY_VAR,
  RATE_WINDOW_SEC_VAR,
  guardAccessOnly,
  guardRequest,
  resolvePrincipal,
  __resetRateLimit,
} from "@/lib/apiAuth";
import {
  ID_TOKEN_HEADER as SERVER_ID_TOKEN_HEADER,
  PRINCIPAL_MODE_VAR,
  SECURETOKEN_JWKS_URL,
  __resetJwksCache,
  __setJwksFetch,
  verifyIdToken,
} from "@/lib/principal";
import { ID_TOKEN_HEADER, cacheSessionToken, currentIdToken, __resetSessionToken } from "@/lib/sessionToken";
import { accessHeader } from "@/lib/imagingClient";
import { DEV_UID, DEV_USER } from "@/lib/devAuth";
import { LOCAL_UID, LOCAL_USER } from "@/lib/localMode";

const PROJECT = "gravitone-probe";
const SECRET = "probe-shared-secret";
const KID = "probe-key-1";

keepEnv([
  PRINCIPAL_MODE_VAR,
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  ACCESS_SECRET_VAR,
  "NEXT_PUBLIC_IMAGING_ACCESS_SECRET",
  "NEXT_PUBLIC_DEV_AUTH",
  "NEXT_PUBLIC_LOCAL_MODE",
  RATE_CAPACITY_VAR,
  RATE_WINDOW_SEC_VAR,
]);

/* ── A test signing key, and a JWKS stub serving its public half ─────────── */

let signer: CryptoKey;
let otherSigner: CryptoKey;
let publicJwk: JsonWebKey;

const RSA = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };

test.beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(RSA, true, ["sign", "verify"])) as CryptoKeyPair;
  signer = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  otherSigner = ((await crypto.subtle.generateKey(RSA, true, ["sign", "verify"])) as CryptoKeyPair).privateKey;
});

const b64u = (v: string | Uint8Array) => Buffer.from(v).toString("base64url");
const nowS = () => Math.floor(Date.now() / 1000);

function claims(over: Record<string, unknown> = {}, at = nowS()): Record<string, unknown> {
  return {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: "uid-alice",
    user_id: "uid-alice",
    iat: at - 60,
    exp: at + 3600,
    auth_time: at - 120,
    ...over,
  };
}

async function mint(
  body: Record<string, unknown>,
  opts: { alg?: string; kid?: string | null; key?: CryptoKey } = {},
): Promise<string> {
  const header: Record<string, unknown> = { alg: opts.alg ?? "RS256", typ: "JWT" };
  if (opts.kid !== null) header.kid = opts.kid ?? KID;
  const h = b64u(JSON.stringify(header));
  const p = b64u(JSON.stringify(body));
  if (opts.alg === "none") return `${h}.${p}.`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", opts.key ?? signer, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(new Uint8Array(sig))}`;
}

let jwksCalls: string[] = [];
let jwksDown = false;
function jwksStub(maxAge = 3600) {
  return async (url: string): Promise<Response> => {
    jwksCalls.push(url);
    if (jwksDown) throw new TypeError("fetch failed (probe: JWKS outage)");
    return new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: KID, alg: "RS256", use: "sig" }] }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": `public, max-age=${maxAge}, must-revalidate, no-transform` },
    });
  };
}

const realFetch = globalThis.fetch;

test.beforeEach(() => {
  __resetRateLimit();
  __resetJwksCache();
  __resetSessionToken();
  jwksCalls = [];
  jwksDown = false;
  __setJwksFetch(jwksStub());
  globalThis.fetch = (async () => {
    throw new Error("principal.probe: real network reached - the JWKS fetcher injection was bypassed");
  }) as typeof fetch;
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT;
  process.env[ACCESS_SECRET_VAR] = SECRET;
  delete process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET;
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  delete process.env.NEXT_PUBLIC_LOCAL_MODE;
  delete process.env[PRINCIPAL_MODE_VAR];
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
  __setJwksFetch(null);
  __resetJwksCache();
  __resetSessionToken();
});

function req(headers: Record<string, string>, ip = "198.51.100.1"): Request {
  return new Request("http://localhost/api/imaging/generate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, ...headers },
    body: "{}",
  });
}
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

/* ── Acceptance 1: a token signed by the served JWK is a firebase principal ── */

test("A1: a token signed by the served JWK resolves to {kind:'firebase', uid: sub}", async () => {
  process.env[PRINCIPAL_MODE_VAR] = "verified";
  const token = await mint(claims());

  const viaBearer = await resolvePrincipal(req(bearer(token)));
  expect(viaBearer).toMatchObject({ kind: "firebase", uid: "uid-alice" });

  // The client's own header carries it too (a legacy bundle keeps Authorization
  // for the shared secret and sends the token beside it).
  const viaHeader = await resolvePrincipal(req({ ...bearer(SECRET), [ID_TOKEN_HEADER]: token }));
  expect(viaHeader).toMatchObject({ kind: "firebase", uid: "uid-alice" });

  expect(await guardRequest(req(bearer(token), "198.51.100.2"))).toBeNull();
  expect(await guardAccessOnly(req(bearer(token), "198.51.100.3"))).toBeNull();

  // The key set came from Google's securetoken JWKS, through the injected
  // fetcher, once - the second and third verifications read the cache.
  expect(jwksCalls).toEqual([SECURETOKEN_JWKS_URL]);
});

/* ── Acceptance 2: every mismatch is a typed refusal, never a fallthrough ── */

test("A2: wrong aud / wrong iss / expired / alg:none and every other mismatch is a typed refusal", async () => {
  process.env[PRINCIPAL_MODE_VAR] = "verified";
  const t = nowS();
  const cases: [string, () => Promise<string>, string][] = [
    ["wrong aud", () => mint(claims({ aud: "someone-elses-project" })), "wrong-aud"],
    ["wrong iss", () => mint(claims({ iss: "https://securetoken.google.com/someone-elses-project" })), "wrong-iss"],
    ["expired", () => mint(claims({ exp: t - 1 })), "expired"],
    ["alg none", () => mint(claims(), { alg: "none" }), "bad-alg"],
    ["alg HS256", () => mint(claims(), { alg: "HS256" }), "bad-alg"],
    ["signed by another key", () => mint(claims(), { key: otherSigner }), "bad-signature"],
    ["unknown kid", () => mint(claims(), { kid: "not-a-google-key" }), "unknown-key"],
    ["no kid", () => mint(claims(), { kid: null }), "malformed"],
    ["issued in the future", () => mint(claims({ iat: t + 3600, exp: t + 7200 })), "iat-future"],
    ["no auth_time", () => mint(claims({ auth_time: undefined })), "bad-auth-time"],
    ["auth_time in the future", () => mint(claims({ auth_time: t + 3600 })), "bad-auth-time"],
    ["empty sub", () => mint(claims({ sub: "" })), "no-sub"],
    ["payload not JSON", async () => (await mint(claims())).replace(/\.[^.]+\./, `.${b64u("not json")}.`), "malformed"],
  ];
  for (const [what, make, code] of cases) {
    const token = await make();
    // The CORRECT shared secret rides along on every one of these. A verifier
    // that fell through to the legacy gate on a bad token would admit them all.
    const r = req({ ...bearer(token), "x-imaging-access-secret": SECRET });
    const who = await resolvePrincipal(r);
    expect(who, `${what}: should be refused`).toMatchObject({ kind: "refused", code });

    const res = await guardRequest(req({ ...bearer(token), "x-imaging-access-secret": SECRET }, `203.0.113.${cases.findIndex((c) => c[0] === what) + 1}`));
    expect(res, `${what}: guardRequest admitted it`).not.toBeNull();
    expect(res!.status, `${what}: status`).toBe(401);
    const body = (await res!.json()) as { code: string; refusal: string };
    expect(body.refusal, `${what}: the refusal names its reason`).toBe(code);
    console.log(`[principal] ${what} -> ${res!.status} ${body.refusal}`);
  }

  // Not JWT-shaped at all: in the token header it is a malformed token; as a
  // Bearer value it is read as a shared secret, and that door is closed.
  const twoSegments = (await mint(claims())).split(".").slice(0, 2).join(".");
  expect(await resolvePrincipal(req({ [ID_TOKEN_HEADER]: twoSegments }))).toMatchObject({ kind: "refused", code: "malformed" });
  expect(await resolvePrincipal(req(bearer(twoSegments)))).toMatchObject({ kind: "refused", code: "shared-secret-closed" });
});

/* ── Acceptance 3: verified mode closes the shared-secret door ──────────── */

test("A3: PRINCIPAL_MODE=verified with the legacy bundle secret presented -> 401", async () => {
  // Control first: the same request is admitted under the default (legacy) mode.
  expect(await guardRequest(req(bearer(SECRET), "192.0.2.1"))).toBeNull();

  process.env[PRINCIPAL_MODE_VAR] = "verified";
  for (const [shape, headers] of [
    ["Authorization: Bearer <secret>", bearer(SECRET)],
    ["x-imaging-access-secret", { "x-imaging-access-secret": SECRET }],
  ] as const) {
    const money = await guardRequest(req(headers, "192.0.2.2"));
    expect(money?.status, `${shape}: money route`).toBe(401);
    expect(((await money!.json()) as { refusal: string }).refusal).toBe("shared-secret-closed");
    const read = await guardAccessOnly(req(headers, "192.0.2.3"));
    expect(read?.status, `${shape}: read route`).toBe(401);
  }
  // And the secret never resolved a principal: no JWKS fetch was needed to say no.
  expect(jwksCalls).toEqual([]);
});

/* ── Acceptance 4: one principal, one bucket, whatever the forwarded IP ──── */

test("A4: two requests with the same uid and different x-forwarded-for share one rate bucket", async () => {
  process.env[RATE_CAPACITY_VAR] = "1";
  process.env[RATE_WINDOW_SEC_VAR] = "3600";

  // Control: under legacy the bucket is still today's key, the forwarded IP.
  expect(await guardRequest(req(bearer(SECRET), "10.9.0.1"))).toBeNull();
  expect(await guardRequest(req(bearer(SECRET), "10.9.0.2"))).toBeNull();

  __resetRateLimit();
  process.env[PRINCIPAL_MODE_VAR] = "verified";
  const alice = await mint(claims());
  const bob = await mint(claims({ sub: "uid-bob", user_id: "uid-bob" }));

  expect(await guardRequest(req(bearer(alice), "10.9.1.1"))).toBeNull();
  const second = await guardRequest(req(bearer(alice), "10.9.1.2"));
  expect(second?.status, "alice from a second IP should hit alice's drained bucket").toBe(429);
  // A different principal is a different bucket, even from alice's first IP.
  expect(await guardRequest(req(bearer(bob), "10.9.1.1"))).toBeNull();
});

/* ── Legacy is the default, and it answers byte for byte as before ──────── */

test("legacy (the default): the shared-secret gate's responses are unchanged", async () => {
  expect(process.env[PRINCIPAL_MODE_VAR]).toBeUndefined();
  const shapes: [string, () => void, Record<string, string>, { detail: string; code: string } | null][] = [
    ["ok", () => {}, bearer(SECRET), null],
    [
      "missing",
      () => {},
      {},
      { detail: "This route requires access credentials. Send `Authorization: Bearer <secret>`.", code: "unauthorized" },
    ],
    ["wrong", () => {}, bearer("nope"), { detail: "The access credentials were not accepted.", code: "unauthorized" }],
    [
      "no-config",
      () => delete process.env[ACCESS_SECRET_VAR],
      bearer(SECRET),
      {
        detail:
          `This route is access-gated and no ${ACCESS_SECRET_VAR} is configured, so it is closed. ` +
          "Set it on the server and present it as `Authorization: Bearer <secret>`.",
        code: "unauthorized",
      },
    ],
  ];
  let ip = 1;
  for (const [what, arrange, headers, want] of shapes) {
    arrange();
    for (const guard of [guardRequest, guardAccessOnly]) {
      const res = await guard(req(headers, `100.64.0.${ip++}`));
      if (want === null) {
        expect(res, `${what}: admitted`).toBeNull();
        continue;
      }
      expect(res!.status, `${what}: status`).toBe(401);
      expect(await res!.json(), `${what}: body`).toEqual(want);
      expect(res!.headers.get("retry-after"), `${what}: no retry-after`).toBeNull();
    }
    process.env[ACCESS_SECRET_VAR] = SECRET;
  }
  // A token beside the secret changes nothing in legacy: it is not even verified.
  const token = await mint(claims({ aud: "wrong" }));
  expect(await guardRequest(req({ ...bearer(SECRET), [ID_TOKEN_HEADER]: token }, "100.64.1.1"))).toBeNull();
  expect(jwksCalls, "legacy mode must never reach the JWKS").toEqual([]);
});

test("an unrecognised PRINCIPAL_MODE fails closed (verified), not open (legacy)", async () => {
  process.env[PRINCIPAL_MODE_VAR] = "verifed";
  expect((await guardRequest(req(bearer(SECRET))))?.status).toBe(401);
});

/* ── JWKS outage: closed for money, reads keep the last good keys ───────── */

test("JWKS outage: money routes fail closed, reads verify against the last good key set", async () => {
  process.env[PRINCIPAL_MODE_VAR] = "verified";
  const t0 = Date.now();
  // Warm the cache (max-age 3600 from the stub).
  const warm = await mint(claims({}, Math.floor(t0 / 1000)));
  expect(await resolvePrincipal(req(bearer(warm)), { use: "money", now: t0 })).toMatchObject({ kind: "firebase" });

  // Two hours later the cached set is past its Cache-Control lifetime and Google
  // cannot be reached.
  jwksDown = true;
  const later = t0 + 2 * 3600_000;
  const token = await mint(claims({}, Math.floor(later / 1000)));
  const money = await resolvePrincipal(req(bearer(token)), { use: "money", now: later });
  expect(money).toMatchObject({ kind: "refused", code: "jwks-unavailable", status: 503 });
  const read = await resolvePrincipal(req(bearer(token)), { use: "read", now: later });
  expect(read).toMatchObject({ kind: "firebase", uid: "uid-alice" });

  // A stale key set is not a forever pass: a read past the stale ceiling is refused too.
  const muchLater = t0 + 3 * 86_400_000;
  const old = await mint(claims({}, Math.floor(muchLater / 1000)));
  expect(await resolvePrincipal(req(bearer(old)), { use: "read", now: muchLater })).toMatchObject({
    kind: "refused",
    code: "jwks-unavailable",
  });
});

test("JWKS outage on a cold process: 503 for both doors, never the shared secret", async () => {
  process.env[PRINCIPAL_MODE_VAR] = "verified";
  jwksDown = true;
  const token = await mint(claims());
  const money = await guardRequest(req({ ...bearer(token), "x-imaging-access-secret": SECRET }, "100.65.0.1"));
  expect(money?.status).toBe(503);
  expect(((await money!.json()) as { refusal: string }).refusal).toBe("jwks-unavailable");
  const read = await guardAccessOnly(req(bearer(token), "100.65.0.2"));
  expect(read?.status).toBe(503);
});

test("verified mode with no Firebase project id configured is closed", async () => {
  process.env[PRINCIPAL_MODE_VAR] = "verified";
  const token = await mint(claims());
  delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const res = await guardRequest(req(bearer(token)));
  expect(res?.status).toBe(401);
  expect(((await res!.json()) as { refusal: string }).refusal).toBe("verifier-no-config");
});

test("verifyIdToken is pure over its token and clock (the money/read split lives in `use`)", async () => {
  process.env[PRINCIPAL_MODE_VAR] = "verified";
  const token = await mint(claims());
  expect(await verifyIdToken(token, { use: "read" })).toMatchObject({ kind: "firebase", uid: "uid-alice" });
});

/* ── The fixture and local identities are named kinds, never inferred ──── */

test("the dev fixture and the local owner resolve to their own named kinds", async () => {
  process.env.NEXT_PUBLIC_DEV_AUTH = "1";
  for (const mode of ["legacy", "verified"]) {
    process.env[PRINCIPAL_MODE_VAR] = mode;
    expect(await resolvePrincipal(req({}))).toEqual({ kind: "dev-fixture", uid: DEV_UID });
  }
  delete process.env.NEXT_PUBLIC_DEV_AUTH;

  process.env.NEXT_PUBLIC_LOCAL_MODE = "1";
  process.env[PRINCIPAL_MODE_VAR] = "legacy";
  expect(await resolvePrincipal(req(bearer(SECRET)))).toEqual({ kind: "local-owner", uid: LOCAL_UID });
  // Local mode does not open the money gate in legacy either (lib/localMode.ts).
  expect(await resolvePrincipal(req({}))).toMatchObject({ kind: "refused", code: "missing" });

  // A local owner has no token to present, and verified mode will not take the
  // secret instead - refused BY NAME, so the operator sees the contradiction.
  process.env[PRINCIPAL_MODE_VAR] = "verified";
  expect(await resolvePrincipal(req(bearer(SECRET)))).toMatchObject({ kind: "refused", code: "local-owner-unverifiable" });

  delete process.env.NEXT_PUBLIC_LOCAL_MODE;
  process.env[PRINCIPAL_MODE_VAR] = "legacy";
  expect(await resolvePrincipal(req(bearer(SECRET)))).toEqual({ kind: "shared-secret", legacy: true });
});

/* ── The client half: what a deployed browser sends, in each bundle ─────── */

test("client: a legacy bundle keeps the secret in Authorization and sends the token beside it", async () => {
  const token = await mint(claims());
  process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET = SECRET;
  expect(accessHeader(), "signed out: byte-identical to the pre-principal header").toEqual(bearer(SECRET));

  await cacheSessionToken({ uid: "uid-alice", getIdToken: async () => token });
  expect(currentIdToken()).toBe(token);
  const h = accessHeader();
  expect(h).toEqual({ ...bearer(SECRET), [ID_TOKEN_HEADER]: token });

  // The SAME headers satisfy both servers: the legacy gate reads the secret,
  // the verified gate reads the token.
  expect(await guardRequest(req(h, "100.66.0.1"))).toBeNull();
  process.env[PRINCIPAL_MODE_VAR] = "verified";
  expect(await guardRequest(req(h, "100.66.0.2"))).toBeNull();
});

test("client: a verified bundle (no public secret) sends Bearer <idToken>", async () => {
  const token = await mint(claims());
  expect(accessHeader()).toEqual({});
  await cacheSessionToken({ uid: "uid-alice", getIdToken: async () => token });
  expect(accessHeader()).toEqual(bearer(token));
  process.env[PRINCIPAL_MODE_VAR] = "verified";
  expect(await guardRequest(req(accessHeader(), "100.66.1.1"))).toBeNull();

  // Sign-out clears the cached token (the listener reports null) - and that is
  // ALL it does; the identity eviction is not this module's to run.
  await cacheSessionToken(null);
  expect(accessHeader()).toEqual({});
});

test("client: the fixture and local users are never asked for a token (they throw)", async () => {
  for (const u of [DEV_USER, LOCAL_USER]) {
    await expect(u.getIdToken()).rejects.toThrow();
    await cacheSessionToken(u);
    expect(currentIdToken(), `${u.uid}: no token`).toBeUndefined();
  }
});

test("client: an expired cached token is not presented", async () => {
  const token = await mint(claims({ iat: nowS() - 7200, exp: nowS() - 10, auth_time: nowS() - 7200 }));
  await cacheSessionToken({ uid: "uid-alice", getIdToken: async () => token });
  expect(currentIdToken()).toBeUndefined();
});

/* ── Source contracts ───────────────────────────────────────────────────── */

const ROOT = process.cwd();
const src = (rel: string) => stripComments(readFileSync(join(ROOT, rel), "utf8"));

test("the token listener only caches: it never evicts (lib/identityEviction.ts trigger rule)", () => {
  const session = src("lib/sessionToken.ts");
  expect(session, "lib/sessionToken.ts reaches the eviction owner").not.toMatch(/identityEviction|evictIdentity|transitionFor/);

  const at = session.indexOf("onIdTokenChanged(");
  expect(at, "lib/sessionToken.ts no longer subscribes onIdTokenChanged - the token cache is fed by nothing").toBeGreaterThan(-1);
  let depth = 0;
  let end = at + "onIdTokenChanged".length;
  do {
    if (session[end] === "(") depth++;
    else if (session[end] === ")") depth--;
    end++;
  } while (depth > 0 && end < session.length);
  expect(session.slice(at, end), "the token listener does something other than cache").toMatch(
    /^onIdTokenChanged\(auth,\s*\(u\)\s*=>\s*\{\s*void cacheSessionToken\(u\);\s*\}\)$/,
  );

  // The identity layer wires the cache and keeps eviction on auth STATE
  // (identity-and-writes.probe pins that it never calls onIdTokenChanged itself).
  const auth = src("lib/useAuth.tsx");
  expect(auth).toMatch(/subscribeSessionToken\(auth\)/);
  expect(auth).toMatch(/onAuthStateChanged\(auth,/);
});

test("the client and the server spell the token header the same way", () => {
  expect(ID_TOKEN_HEADER).toBe(SERVER_ID_TOKEN_HEADER);
});

test("every route awaits its guard (a bare call returns a Promise, which is truthy)", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) files.push(relative(ROOT, full).split("\\").join("/"));
    }
  };
  walk(join(ROOT, "app"));
  walk(join(ROOT, "lib"));
  let calls = 0;
  const bare: string[] = [];
  for (const f of files) {
    if (f === "lib/apiAuth.ts") continue;
    const code = src(f);
    for (const m of code.matchAll(/\b(guardRequest|guardAccessOnly)\s*\(/g)) {
      calls++;
      const before = code.slice(Math.max(0, m.index! - 12), m.index!);
      if (!/\bawait\s+$/.test(before)) bare.push(`${f}:${code.slice(0, m.index).split("\n").length}`);
    }
  }
  console.log(`[principal] ${files.length} files walked, ${calls} guard calls, ${bare.length} not awaited`);
  expect(calls, "the walk found no guard call - it is reading the wrong tree").toBeGreaterThan(40);
  expect(bare, "guard calls that are not awaited: an admitted request would return null from the handler").toEqual([]);
});

/** Runtime imports of one file, resolved like the bundler (`@/`, relative). */
function runtimeImports(rel: string): string[] {
  const code = src(rel);
  const out: string[] = [];
  for (const m of code.matchAll(/^import\s+(?!type\b)[\s\S]*?from\s+["']([^"']+)["']/gm)) {
    const spec = m[1];
    if (spec.startsWith("node:")) {
      out.push(spec);
      continue;
    }
    let base: string;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith(".")) base = join(dirname(rel), spec).split("\\").join("/");
    else continue;
    const hit = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((c) => {
      const full = join(ROOT, c);
      return existsSync(full) && statSync(full).isFile();
    });
    expect(hit, `${rel} imports "${spec}", which resolves to no file`).toBeTruthy();
    out.push(hit!);
  }
  return out;
}

test("the client modules reach nothing server-only (no lib/principal, lib/apiAuth, node:, server env names)", () => {
  for (const entry of ["lib/imagingClient.ts", "lib/sessionToken.ts"]) {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length) {
      const f = queue.pop()!;
      if (seen.has(f) || f.startsWith("node:")) {
        seen.add(f);
        continue;
      }
      seen.add(f);
      queue.push(...runtimeImports(f));
    }
    const reach = [...seen];
    console.log(`[principal] ${entry} reaches ${reach.join(", ")}`);
    expect(reach.filter((f) => f.startsWith("node:") || f === "lib/principal.ts" || f === "lib/apiAuth.ts")).toEqual([]);
    for (const f of reach) {
      expect(src(f), `${f} names a server-only variable`).not.toMatch(/PRINCIPAL_MODE|(?<!NEXT_PUBLIC_)IMAGING_ACCESS_SECRET/);
    }
  }
});
