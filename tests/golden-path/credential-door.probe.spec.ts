// LANE — ONE CREDENTIAL DOOR (dynamic + source-coupled). Follow-up to card
// AUP-A stage 1.
//
// <img>, <video>, <audio>, <iframe> and a plain <a download> cannot send a
// header, so the media/file routes take the access credential as a `?k=` query.
// Stage 1 taught `accessHeader()` (lib/imagingClient.ts) to send a Firebase ID
// token when the bundle carries no public secret - but the media URLs were
// built beside it, each reading NEXT_PUBLIC_IMAGING_ACCESS_SECRET itself. In
// PRINCIPAL_MODE=verified that variable is empty by design, so every one of
// those players and tiles sent no credential at all and drew a 401.
//
// The door is `withAccess(url)` beside `accessHeader()`, and this lane pins:
//   · what it appends for each bundle shape (legacy secret · verified token ·
//     fixture / local / signed out: nothing);
//   · the server half: a verified READ door admits a valid `?k=` token and
//     refuses an expired one; the MONEY door never reads a query credential;
//     legacy `?k=<secret>` answers exactly as before, on exactly the routes that
//     read `k` today;
//   · the source: nothing but the door reads the bundle secret, and nothing
//     but the door builds a `k=` credential query.
//
// NEVER REAL NETWORK. The JWKS fetcher is injected (a test RSA key minted
// here) and `globalThis.fetch` throws for every case.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { test, expect } from "@playwright/test";

import { keepEnv, stripComments } from "./_helpers";
import { ACCESS_SECRET_VAR, guardAccessOnly, guardRequest, __resetRateLimit } from "@/lib/apiAuth";
import { PRINCIPAL_MODE_VAR, __resetJwksCache, __setJwksFetch } from "@/lib/principal";
import { cacheSessionToken, __resetSessionToken } from "@/lib/sessionToken";
import { ACCESS_QUERY_PARAM, accessHeader, accessQuery, withAccess } from "@/lib/imagingClient";
import { DEV_USER } from "@/lib/devAuth";
import { LOCAL_USER } from "@/lib/localMode";
import { GET as foundryFileGET } from "@/app/api/foundry/file/route";
import { GET as clipFileGET } from "@/app/api/video/clips/[id]/file/route";
import { POST as generatePOST } from "@/app/api/imaging/generate/route";

const PROJECT = "gravitone-probe";
const SECRET = "probe-shared-secret";
const KID = "probe-door-key";

keepEnv([
  PRINCIPAL_MODE_VAR,
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  ACCESS_SECRET_VAR,
  "NEXT_PUBLIC_IMAGING_ACCESS_SECRET",
  "NEXT_PUBLIC_DEV_AUTH",
  "NEXT_PUBLIC_LOCAL_MODE",
]);

/* ── A test signing key and a JWKS stub (same shape as principal.probe) ──── */

let signer: CryptoKey;
let publicJwk: JsonWebKey;

test.beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  signer = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
});

const b64u = (v: string | Uint8Array) => Buffer.from(v).toString("base64url");
const nowS = () => Math.floor(Date.now() / 1000);

async function mint(over: Record<string, unknown> = {}): Promise<string> {
  const t = nowS();
  const body = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: "uid-alice",
    iat: t - 60,
    exp: t + 3600,
    auth_time: t - 120,
    ...over,
  };
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT", kid: KID }));
  const p = b64u(JSON.stringify(body));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signer, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(new Uint8Array(sig))}`;
}

const realFetch = globalThis.fetch;

test.beforeEach(() => {
  __resetRateLimit();
  __resetJwksCache();
  __resetSessionToken();
  __setJwksFetch(async () =>
    new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: KID, alg: "RS256", use: "sig" }] }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
    }),
  );
  globalThis.fetch = (async () => {
    throw new Error("credential-door.probe: real network reached - the JWKS fetcher injection was bypassed");
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

const signIn = (token: string) => cacheSessionToken({ uid: "uid-alice", getIdToken: async () => token });

/* ── The helper, per bundle shape ────────────────────────────────────────── */

test("door: a legacy bundle puts its secret in k= exactly as the hand-built URLs did", async () => {
  process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET = ` ${SECRET} `;
  expect(ACCESS_QUERY_PARAM).toBe("k");
  expect(accessQuery()).toBe(SECRET);
  expect(withAccess("/api/video/clips/c1/file")).toBe(`/api/video/clips/c1/file?k=${SECRET}`);
  expect(withAccess("/api/music-video/export/file?id=abc")).toBe(`/api/music-video/export/file?id=abc&k=${SECRET}`);
  // A value with characters a query must escape is escaped, once.
  process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET = "s e&c=r?t";
  expect(withAccess("/x")).toBe(`/x?k=${encodeURIComponent("s e&c=r?t")}`);
  expect(new URL(withAccess("/x?a=1"), "http://h").searchParams.get("k")).toBe("s e&c=r?t");

  // Signed in on a legacy bundle the query still carries the SECRET: a legacy
  // server compares k to its secret, and a URL has room for one credential.
  process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET = SECRET;
  await signIn(await mint());
  expect(accessQuery()).toBe(SECRET);
  expect(withAccess("/x")).toBe(`/x?k=${SECRET}`);
});

test("door: a verified bundle (no public secret) puts the cached ID token in k=", async () => {
  const token = await mint();
  expect(withAccess("/x"), "signed out: no credential, URL untouched").toBe("/x");
  await signIn(token);
  expect(accessQuery()).toBe(token);
  expect(withAccess("/x?id=1")).toBe(`/x?id=1&k=${token}`);
  // One door: the query credential is the header's Bearer value.
  expect(accessHeader()).toEqual({ authorization: `Bearer ${token}` });

  await cacheSessionToken(null);
  expect(accessQuery()).toBeUndefined();
  expect(withAccess("/x")).toBe("/x");
});

test("door: the dev fixture and the local owner add nothing (they have no token to give)", async () => {
  for (const u of [DEV_USER, LOCAL_USER]) {
    await cacheSessionToken(u);
    expect(accessQuery(), u.uid).toBeUndefined();
    expect(withAccess("/api/foundry/file?run=r&path=a.png"), u.uid).toBe("/api/foundry/file?run=r&path=a.png");
  }
});

test("door: a fragment stays last", async () => {
  process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET = SECRET;
  expect(withAccess("/api/articles/r1/file/post/index.html#src-1")).toBe(`/api/articles/r1/file/post/index.html?k=${SECRET}#src-1`);
});

/* ── The server: verified read door, money door, legacy unchanged ─────────── */

const fileReq = (k?: string) => new Request(`http://studio.local/api/foundry/file?run=r&path=x.png${k ? `&k=${encodeURIComponent(k)}` : ""}`);
const clipReq = (k?: string) => new Request(`http://studio.local/api/video/clips/not-a-clip/file${k ? `?k=${encodeURIComponent(k)}` : ""}`);
const clipCtx = { params: Promise.resolve({ id: "not-a-clip" }) };

test("verified READ door: a valid ?k= token is admitted, an expired one is refused by name", async () => {
  process.env[PRINCIPAL_MODE_VAR] = "verified";
  const good = await mint();
  const expired = await mint({ iat: nowS() - 7200, exp: nowS() - 10, auth_time: nowS() - 7200 });

  for (const [route, call] of [
    ["foundry file", (k?: string) => foundryFileGET(fileReq(k))],
    ["video clip file", (k?: string) => clipFileGET(clipReq(k), clipCtx)],
  ] as const) {
    const ok = await call(good);
    console.log(`[door] verified ${route} ?k=<token> -> ${ok.status}`);
    expect(ok.status, `${route}: a valid token in k= is past the gate (the route's own 4xx, not 401)`).not.toBe(401);

    const old = await call(expired);
    expect(old.status, `${route}: expired`).toBe(401);
    expect(((await old.json()) as { refusal: string }).refusal).toBe("expired");

    // The legacy secret in k= is not a token, and the verified door is shut to it.
    const secret = await call(SECRET);
    expect(secret.status, `${route}: secret in k=`).toBe(401);
    expect(((await secret.json()) as { refusal: string }).refusal).toBe("shared-secret-closed");
  }
});

test("verified MONEY door: a ?k= token with no header is refused - the query is never read", async () => {
  process.env[PRINCIPAL_MODE_VAR] = "verified";
  const token = await mint();
  const url = `http://studio.local/api/imaging/generate?k=${token}`;
  const post = () => new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

  const direct = await guardRequest(post());
  expect(direct?.status).toBe(401);
  expect(((await direct!.json()) as { refusal: string }).refusal).toBe("missing-token");

  const route = await generatePOST(post());
  expect(route.status, "the generate route spent on a query credential").toBe(401);

  // Control: the same token in the header passes the same door.
  expect(await guardRequest(new Request(url, { method: "POST", headers: { authorization: `Bearer ${token}` } }))).toBeNull();
  // And guardAccessOnly does not read the query either: the k= is a route's
  // explicit choice, made on the media routes only (pinned below).
  expect((await guardAccessOnly(post()))?.status).toBe(401);
});

test("legacy: ?k=<secret> answers exactly as before on the media routes", async () => {
  expect(process.env[PRINCIPAL_MODE_VAR]).toBeUndefined();
  for (const [route, call] of [
    ["foundry file", (k?: string) => foundryFileGET(fileReq(k))],
    ["video clip file", (k?: string) => clipFileGET(clipReq(k), clipCtx)],
  ] as const) {
    expect((await call(SECRET)).status, `${route}: right secret`).not.toBe(401);
    const wrong = await call("nope");
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ detail: "The access credentials were not accepted.", code: "unauthorized" });
    const missing = await call();
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({
      detail: "This route requires access credentials. Send `Authorization: Bearer <secret>`.",
      code: "unauthorized",
    });
  }
});

/* ── Source contracts ───────────────────────────────────────────────────── */

const ROOT = process.cwd();
const DOOR = "lib/imagingClient.ts";

function walk(): string[] {
  const out: string[] = [];
  const go = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) go(full);
      else if (/\.(ts|tsx|mts)$/.test(e.name)) out.push(relative(ROOT, full).split("\\").join("/"));
    }
  };
  for (const d of ["app", "components", "lib"]) go(join(ROOT, d));
  return out;
}
const code = (rel: string) => stripComments(readFileSync(join(ROOT, rel), "utf8"));

/** Sites that still hand-build a credential query because their files belong to
 *  a parallel builder this wave (posture coherence: the cut/music-video/ads
 *  export buttons). Each must STILL be a violation - when one is migrated to
 *  `withAccess`, delete its line here. The list may only shrink. */
// Emptied 2026-10-06: both export download links go through withAccess now.
const PENDING = new Set<string>([]);

/** A hand-built `k=` credential query, in any of the spellings the tree used. */
const K_QUERY: [string, RegExp][] = [
  ["?k= / &k= literal", /[?&]k=/],
  ["${sep}k= template", /\$\{[^}]*\}k=/],
  ["searchParams.set/append('k')", /\.(?:set|append)\(\s*["'`]k["'`]/],
  ["URLSearchParams({ ..., k })", /URLSearchParams\([^\n]*[{,]\s*k\s*[:,}]/],
  ["accessHeader().authorization laundered into a query", /accessHeader\(\)\s*\.\s*authorization/],
];

test("source: only the door reads NEXT_PUBLIC_IMAGING_ACCESS_SECRET", () => {
  const files = walk();
  const readers = files.filter((f) => /NEXT_PUBLIC_IMAGING_ACCESS_SECRET/.test(code(f)));
  console.log(`[door] ${files.length} files walked; secret readers: ${readers.join(", ")}`);
  expect(files.length, "the walk read almost nothing - wrong root").toBeGreaterThan(200);
  expect(readers, "the door itself no longer reads the bundle secret - the walk is not seeing it").toContain(DOOR);
  expect(readers.filter((f) => f !== DOOR && !PENDING.has(f)), "read the bundle secret outside lib/imagingClient.ts - use withAccess()/accessHeader()").toEqual([]);
});

test("source: nothing outside the door hand-builds a k= credential query", () => {
  const files = walk().filter((f) => !f.startsWith("app/api/") && f !== DOOR);
  const hits: string[] = [];
  for (const f of files) {
    const c = code(f);
    for (const [what, re] of K_QUERY) if (re.test(c)) hits.push(`${f} (${what})`);
  }
  console.log(`[door] ${files.length} client-side files walked; k= builders: ${hits.length}`);
  expect(files.length).toBeGreaterThan(200);
  const offending = hits.filter((h) => !PENDING.has(h.split(" (")[0]));
  expect(offending, "hand-built credential queries - route them through withAccess() in lib/imagingClient.ts").toEqual([]);
  for (const p of PENDING) {
    expect(hits.some((h) => h.startsWith(`${p} (`)), `${p} no longer hand-builds k= - remove it from PENDING`).toBe(true);
  }
  // Each pattern still catches the spelling it was written for - the lines the
  // tree held before the door landed, verbatim.
  const before = [
    "return k ? `${base}?k=${encodeURIComponent(k)}` : base;",
    "return `${runPath(id)}/file/${at}${k ? `?k=${encodeURIComponent(k)}` : \"\"}`;",
    "return `${url}${sep}k=${encodeURIComponent(k)}`;",
    "const q = new URLSearchParams({ run, path: rel, ...(kind ? { kind } : {}), ...(k ? { k } : {}) });",
    "const auth = accessHeader().authorization;",
    "u.searchParams.set(\"k\", secret);",
  ];
  for (const [what, re] of K_QUERY) expect(before.some((l) => re.test(l)), `pattern "${what}" catches none of the spellings it was written for`).toBe(true);
  for (const l of before) expect(K_QUERY.some(([, re]) => re.test(l)), `no pattern catches: ${l}`).toBe(true);
});

test("source: exactly the media routes read a query credential, and only through the read door", () => {
  const routes = walk().filter((f) => f.startsWith("app/api/") && /route\.tsx?$/.test(f));
  expect(routes.length).toBeGreaterThan(40);
  const readsK = routes.filter((f) => /searchParams\.get\(\s*["'`]k["'`]\s*\)/.test(code(f))).sort();
  // The set as it stood when the door landed (2026-10-06). Growing it is a
  // decision: a token in a URL reaches access logs, which is acceptable for a
  // short-lived token on a read-only byte serve and for nothing else.
  expect(readsK).toEqual(
    [
      "app/api/ads/render/[id]/file/route.ts",
      "app/api/articles/[runId]/file/[...path]/route.ts",
      "app/api/cut/export/file/route.ts",
      "app/api/foundry/file/route.ts",
      "app/api/music-video/export/file/route.ts",
      "app/api/sound/takes/[id]/file/route.ts",
      "app/api/video/clips/[id]/file/route.ts",
    ].sort(),
  );
  for (const f of readsK) {
    const c = code(f);
    expect(c, `${f} reads k= and calls the MONEY door`).not.toMatch(/\bguardRequest\s*\(/);
    expect(c, `${f} reads k= but never calls the read door`).toMatch(/\bguardAccessOnly\s*\(/);
    expect(c, `${f} serves something other than GET`).not.toMatch(/export\s+(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)\b/);
  }
});
