// SUNO API SIGN-IN - OAuth 2.1 authorization code + PKCE (S256) against Suno's own authorization server,
// with dynamic client registration and rotating refresh tokens.
//
// DISCOVERED, NOT HARD-CODED. The resource (SUNO_API_BASE, default https://api.suno.com) names its
// authorization server in /.well-known/oauth-protected-resource (RFC 9728); that server's metadata
// (RFC 8414) names the authorize, token, revocation and registration endpoints. Probed 2026-11-10:
// the metadata answers at `<issuer>/.well-known/oauth-authorization-server` (path appended), the
// RFC 8414 form (well-known inserted before the path) is tried second. A success is cached for the
// life of the process; a failure is not.
//
// ONE SIGN-IN, TWO PROCESSES. The tokens are tokens.ts's file; every write here runs under its
// lock, and `refresh` re-reads the file after taking it, so a CLI and the server never both spend one
// rotating refresh token. Every network call made under the lock times out (20 s) before the lock
// goes stale (30 s).
//
// ERRORS ARE THE VENDOR'S. A token-endpoint refusal is `error_description` verbatim (else `error`),
// never a paraphrase. `fetch` is injectable everywhere (the lib/publish/youtube.ts pattern).
//
// No `server-only` and no Next import: pipeline CLIs load this through tsx.

import { createHash, randomBytes } from "node:crypto";

import type { z } from "zod";

import { err, errorMessage, ok, type AppErrorCode, type Result } from "@gt/domain/errors";

import { addPending, hasPending, readAuth, takePending, withAuthLock, writeAuth, type AuthFile, type StoredClient, type StoredTokens } from "./tokens.ts";
import { AuthServer, OAuthErrorBody, parseVendor, ProtectedResource, QUOTE_CHARS, Registration, TokenResponse } from "./wire.ts";

export const DEFAULT_API_BASE = "https://api.suno.com";
export const SCOPES = ["api:v0", "credits:spend", "library:read", "library:search", "profile:read", "offline_access"] as const;
export const CLIENT_NAME = "Gravitone Studio";
/** Every OAuth call is made under auth.lock, which goes stale at 30 s. */
const OAUTH_TIMEOUT_MS = 20_000;
/** A token this close to expiry is refreshed before use. */
export const REFRESH_MARGIN_MS = 60_000;

export interface OAuthDeps {
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  /** The REST base; defaults to SUNO_API_BASE, else https://api.suno.com. */
  readonly base?: string;
}

export function apiBase(deps: OAuthDeps = {}): string {
  return (deps.base ?? (process.env.SUNO_API_BASE?.trim() || DEFAULT_API_BASE)).replace(/\/+$/, "");
}

const nowOf = (deps: OAuthDeps) => (deps.now ?? Date.now)();

export interface Raw {
  readonly status: number;
  readonly ok: boolean;
  readonly text: string;
}

/** One vendor call with a deadline; a network failure or a timeout is `unavailable` with its own sentence. */
export async function vendorCall(deps: OAuthDeps, url: string, init: RequestInit, timeoutMs: number): Promise<Result<Raw>> {
  try {
    const res = await (deps.fetch ?? globalThis.fetch)(url, { ...init, signal: AbortSignal.timeout(timeoutMs), redirect: init.redirect ?? "follow" });
    return ok({ status: res.status, ok: res.ok, text: await res.text() });
  } catch (e) {
    return err("unavailable", `${new URL(url).host}: ${errorMessage(e)}`, { detail: "suno-unreachable", cause: e });
  }
}

function codeOfStatus(status: number, oauthError?: string): AppErrorCode {
  if (oauthError === "invalid_grant" || oauthError === "invalid_client" || oauthError === "unauthorized_client" || status === 401) return "unauthenticated";
  if (oauthError === "access_denied" || status === 403) return "refused";
  if (status === 429 || status >= 500) return "unavailable";
  return "invalid";
}

/** An OAuth server's refusal, in its own words (RFC 6749 §5.2). */
export function oauthRefusal<T = never>(door: string, raw: Raw): Result<T> {
  const body = parseVendor(door, OAuthErrorBody, raw.text);
  if (body.ok) return err(codeOfStatus(raw.status, body.value.error), body.value.error_description ?? body.value.error, { detail: body.value.error });
  return err(codeOfStatus(raw.status), `${door}: ${raw.status}: ${raw.text.slice(0, QUOTE_CHARS)}`, { detail: `http-${raw.status}` });
}

async function getJson<S extends z.ZodType>(deps: OAuthDeps, door: string, url: string, schema: S): Promise<Result<z.output<S>>> {
  const raw = await vendorCall(deps, url, { method: "GET", headers: { accept: "application/json" } }, OAUTH_TIMEOUT_MS);
  if (!raw.ok) return raw;
  if (!raw.value.ok) return oauthRefusal(door, raw.value);
  return parseVendor(door, schema, raw.value.text);
}

export interface Discovery {
  readonly resource: string;
  readonly issuer: string;
  readonly server: AuthServer;
}

const discovered = new Map<string, Discovery>();

/** The resource's authorization server and its endpoints. Cached per base on success. */
export async function discover(deps: OAuthDeps = {}): Promise<Result<Discovery>> {
  const base = apiBase(deps);
  const hit = discovered.get(base);
  if (hit) return ok(hit);
  const pr = await getJson(deps, "suno protected-resource metadata", `${base}/.well-known/oauth-protected-resource`, ProtectedResource);
  if (!pr.ok) return pr;
  const issuer = pr.value.authorization_servers[0]!.replace(/\/+$/, "");
  const u = new URL(issuer);
  const candidates = [`${issuer}/.well-known/oauth-authorization-server`, `${u.origin}/.well-known/oauth-authorization-server${u.pathname === "/" ? "" : u.pathname}`];
  let last: Result<AuthServer> = err("unavailable", `no authorization-server metadata at ${candidates.join(" or ")}`);
  for (const url of candidates) {
    last = await getJson(deps, "suno authorization-server metadata", url, AuthServer);
    if (last.ok) break;
  }
  if (!last.ok) return last;
  const methods = last.value.code_challenge_methods_supported;
  if (methods && !methods.includes("S256")) return err("unavailable", `suno's authorization server offers PKCE ${methods.join(", ")}, not S256`);
  const d: Discovery = { resource: pr.value.resource, issuer, server: last.value };
  discovered.set(base, d);
  return ok(d);
}

/** Forget the cached discovery (tests). */
export function __resetDiscovery(): void {
  discovered.clear();
}

const b64url = (b: Buffer) => b.toString("base64url");

/** RFC 7636: the challenge is base64url(sha256(verifier)), no padding. */
export function pkceChallenge(verifier: string): string {
  return b64url(createHash("sha256").update(verifier, "ascii").digest());
}

export function newVerifier(): string {
  return b64url(randomBytes(32));
}

async function postForm(deps: OAuthDeps, url: string, form: Record<string, string>): Promise<Result<Raw>> {
  return vendorCall(
    deps,
    url,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams(form).toString() },
    OAUTH_TIMEOUT_MS,
  );
}

/** Inside the lock: the stored client when it was registered for `redirectUri`, else a new registration. */
async function ensureClientLocked(d: Discovery, redirectUri: string, deps: OAuthDeps): Promise<Result<StoredClient>> {
  const auth = await readAuth();
  if (auth.client && auth.client.redirectUri === redirectUri) return ok(auth.client);
  const endpoint = d.server.registration_endpoint;
  if (!endpoint) return err("unavailable", "suno's authorization server publishes no registration endpoint");
  const body = {
    client_name: CLIENT_NAME,
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: SCOPES.join(" "),
  };
  const raw = await vendorCall(
    deps,
    endpoint,
    { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) },
    OAUTH_TIMEOUT_MS,
  );
  if (!raw.ok) return raw;
  if (!raw.value.ok) return oauthRefusal("suno client registration", raw.value);
  const reg = parseVendor("suno client registration", Registration, raw.value.text);
  if (!reg.ok) return reg;
  const client: StoredClient = { clientId: reg.value.client_id, redirectUri, registeredAt: new Date(nowOf(deps)).toISOString() };
  await writeAuth({ ...(await readAuth()), client });
  return ok(client);
}

/** The registered client for `redirectUri`, registering (or re-registering) when needed. */
export async function ensureClient(redirectUri: string, deps: OAuthDeps = {}): Promise<Result<StoredClient>> {
  const d = await discover(deps);
  if (!d.ok) return d;
  return withAuthLock(() => ensureClientLocked(d.value, redirectUri, deps));
}

export interface Authorization {
  readonly url: string;
  readonly state: string;
}

/** The authorize URL to send the browser to; the verifier waits in pending.json under `state`. */
export async function beginAuthorization(redirectUri: string, deps: OAuthDeps = {}): Promise<Result<Authorization>> {
  const d = await discover(deps);
  if (!d.ok) return d;
  return withAuthLock(async () => {
    const client = await ensureClientLocked(d.value, redirectUri, deps);
    if (!client.ok) return client;
    const verifier = newVerifier();
    const state = b64url(randomBytes(16));
    await addPending(state, { verifier, redirectUri, clientId: client.value.clientId, createdAt: nowOf(deps) }, nowOf(deps));
    const url = new URL(d.value.server.authorization_endpoint);
    const q = {
      response_type: "code",
      client_id: client.value.clientId,
      redirect_uri: redirectUri,
      scope: SCOPES.join(" "),
      state,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: "S256",
      resource: d.value.resource,
    };
    for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
    return ok({ url: url.href, state });
  });
}

function tokensOf(t: TokenResponse, now: number, previous: StoredTokens | undefined): StoredTokens {
  const refreshToken = t.refresh_token ?? previous?.refreshToken;
  return {
    accessToken: t.access_token,
    ...(refreshToken !== undefined ? { refreshToken } : {}),
    expiresAt: now + (t.expires_in ?? 3600) * 1000,
    scope: t.scope ?? previous?.scope ?? SCOPES.join(" "),
  };
}

/** The redirect's `state` and `code` -> tokens saved. An unknown or expired state is refused. */
const UNKNOWN_STATE = "the authorization state is unknown or older than ten minutes; connect again";

export async function completeAuthorization(state: string, code: string, deps: OAuthDeps = {}): Promise<Result<StoredTokens>> {
  // An unknown state costs no network: it is refused before discovery.
  if (!(await hasPending(state, nowOf(deps)))) return err("refused", UNKNOWN_STATE, { detail: "state-mismatch" });
  const d = await discover(deps);
  if (!d.ok) return d;
  return withAuthLock(async () => {
    const pending = await takePending(state, nowOf(deps));
    if (!pending) return err("refused", UNKNOWN_STATE, { detail: "state-mismatch" });
    const raw = await postForm(deps, d.value.server.token_endpoint, {
      grant_type: "authorization_code",
      code,
      redirect_uri: pending.redirectUri,
      client_id: pending.clientId,
      code_verifier: pending.verifier,
      resource: d.value.resource,
    });
    if (!raw.ok) return raw;
    if (!raw.value.ok) return oauthRefusal("suno token exchange", raw.value);
    const t = parseVendor("suno token exchange", TokenResponse, raw.value.text);
    if (!t.ok) return t;
    const auth = await readAuth();
    const now = nowOf(deps);
    const tokens = tokensOf(t.value, now, undefined);
    await writeAuth({ ...auth, tokens, connectedAt: new Date(now).toISOString() });
    return ok(tokens);
  });
}

const withoutTokens = (a: AuthFile): AuthFile => (a.client ? { v: 1, client: a.client } : { v: 1 });

export interface RefreshOptions {
  /** The access token a call just saw refused (401): refresh unless the file already holds another. */
  readonly stale?: string;
}

/**
 * Fresh tokens. Under the lock the file is read again: when another process already replaced the
 * token (or, without `stale`, the token is not near expiry) that one is returned and nothing is
 * spent. A response without a refresh token keeps the old one; `invalid_grant` drops the tokens,
 * since that grant can never be spent again.
 */
export async function refresh(deps: OAuthDeps = {}, opts: RefreshOptions = {}): Promise<Result<StoredTokens>> {
  // Outside the lock, a cheap look: nothing held, or nothing to do, costs no network.
  const peek = (await readAuth()).tokens;
  if (!peek) return err("unauthenticated", "not connected to suno", { detail: "suno-not-connected" });
  if (opts.stale === undefined && peek.expiresAt - nowOf(deps) > REFRESH_MARGIN_MS) return ok(peek);
  const d = await discover(deps);
  if (!d.ok) return d;
  return withAuthLock(async () => {
    const auth = await readAuth();
    const tokens = auth.tokens;
    if (!tokens) return err("unauthenticated", "not connected to suno", { detail: "suno-not-connected" });
    const now = nowOf(deps);
    if (opts.stale !== undefined ? tokens.accessToken !== opts.stale : tokens.expiresAt - now > REFRESH_MARGIN_MS) return ok(tokens);
    if (!tokens.refreshToken || !auth.client) return err("unauthenticated", "the suno grant holds no refresh token; connect again", { detail: "suno-no-refresh" });
    const raw = await postForm(deps, d.value.server.token_endpoint, {
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: auth.client.clientId,
      resource: d.value.resource,
    });
    if (!raw.ok) return raw;
    if (!raw.value.ok) {
      const refused = oauthRefusal<StoredTokens>("suno token refresh", raw.value);
      if (!refused.ok && refused.error.detail === "invalid_grant") {
        await writeAuth(withoutTokens(auth));
      }
      return refused;
    }
    const t = parseVendor("suno token refresh", TokenResponse, raw.value.text);
    if (!t.ok) return t;
    const next = tokensOf(t.value, nowOf(deps), tokens);
    await writeAuth({ ...auth, tokens: next });
    return ok(next);
  });
}

/** Revoke the refresh token when the server allows it, then forget the tokens; the client stays. */
export async function disconnect(deps: OAuthDeps = {}): Promise<Result<{ revoked: boolean }>> {
  const held = (await readAuth()).tokens;
  // Nothing held: no network at all.
  const d = held ? await discover(deps) : null;
  return withAuthLock(async () => {
    const auth = await readAuth();
    let revoked = false;
    const endpoint = d?.ok ? d.value.server.revocation_endpoint : undefined;
    if (auth.tokens && endpoint && auth.client) {
      const token = auth.tokens.refreshToken ?? auth.tokens.accessToken;
      const hint = auth.tokens.refreshToken ? "refresh_token" : "access_token";
      const raw = await postForm(deps, endpoint, { token, token_type_hint: hint, client_id: auth.client.clientId });
      revoked = raw.ok && raw.value.ok;
    }
    await writeAuth(withoutTokens(auth));
    return ok({ revoked });
  });
}
