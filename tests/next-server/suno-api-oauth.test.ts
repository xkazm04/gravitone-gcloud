// SUNO API SIGN-IN (lib/suno/api/oauth.ts + tokens.ts) over a fake Suno (./_sunoApiFake.ts) and a temp
// sound store: PKCE is S256 of the stored verifier, an unknown state is refused before any network, the
// exchange saves the tokens and spends the state once, the vendor's sentence arrives verbatim, a rotated
// refresh token is kept and a missing one keeps the old, two processes refreshing at once spend the
// refresh token once (the lock re-read), and disconnect revokes and keeps the client.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BASE, fakeSuno, type FakeSuno } from "./_sunoApiFake.ts";

import * as oauth from "../../lib/suno/api/oauth.ts";
import { authFile, pendingFile, readAuth, writeAuth, withAuthLock } from "../../lib/suno/api/tokens.ts";

const REDIRECT = "http://localhost:3000/api/suno/callback";
let dir = "";
let suno: FakeSuno;
const saved = { sound: process.env["SOUND_STORE_DIR"], store: process.env["GRAVITONE_STORE_PATH"] };

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-suno-api-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  oauth.__resetDiscovery();
  suno = fakeSuno();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const [k, v] of [["SOUND_STORE_DIR", saved.sound], ["GRAVITONE_STORE_PATH", saved.store]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const deps = () => ({ fetch: suno.fetch, base: BASE });

async function connect(): Promise<void> {
  const a = await oauth.beginAuthorization(REDIRECT, deps());
  if (!a.ok) throw a.error;
  const c = await oauth.completeAuthorization(a.value.state, "good-code", deps());
  if (!c.ok) throw c.error;
}

describe("beginAuthorization", () => {
  it("registers a public client and sends S256 of the stored verifier, with the scopes and the resource", async () => {
    const r = await oauth.beginAuthorization(REDIRECT, deps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const u = new URL(r.value.url);
    expect(u.origin + u.pathname).toBe("https://as.suno.test/api/v2/external/oauth/authorize/");
    const q = u.searchParams;
    expect(q.get("response_type")).toBe("code");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("redirect_uri")).toBe(REDIRECT);
    expect(q.get("resource")).toBe(BASE);
    expect(q.get("scope")).toBe("api:v0 credits:spend library:read library:search profile:read offline_access");
    expect(q.get("state")).toBe(r.value.state);
    const pending = JSON.parse(readFileSync(pendingFile(), "utf8"))[r.value.state];
    expect(pending.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.get("code_challenge")).toBe(createHash("sha256").update(pending.verifier).digest("base64url"));
    const reg = suno.calls.find((c) => c.url.endsWith("/register/"))!;
    expect(JSON.parse(reg.body)).toMatchObject({
      client_name: "Gravitone Studio",
      redirect_uris: [REDIRECT],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    expect(q.get("client_id")).toBe((await readAuth()).client?.clientId);
  });

  it("reuses the client for the same redirect URI and re-registers for another", async () => {
    await oauth.beginAuthorization(REDIRECT, deps());
    await oauth.beginAuthorization(REDIRECT, deps());
    expect(suno.calls.filter((c) => c.url.endsWith("/register/"))).toHaveLength(1);
    await oauth.beginAuthorization("http://127.0.0.1:3007/api/suno/callback", deps());
    expect(suno.calls.filter((c) => c.url.endsWith("/register/"))).toHaveLength(2);
    expect((await readAuth()).client?.redirectUri).toBe("http://127.0.0.1:3007/api/suno/callback");
  });

  it("discovers once per process", async () => {
    await oauth.beginAuthorization(REDIRECT, deps());
    await oauth.beginAuthorization(REDIRECT, deps());
    expect(suno.calls.filter((c) => c.url.includes("/.well-known/"))).toHaveLength(2);
  });
});

describe("completeAuthorization", () => {
  it("refuses an unknown state before any network call", async () => {
    const r = await oauth.completeAuthorization("no-such-state", "good-code", deps());
    expect(r.ok).toBe(false);
    if (!r.ok) expect([r.error.code, r.error.detail]).toEqual(["refused", "state-mismatch"]);
    expect(suno.calls).toHaveLength(0);
  });

  it("exchanges the code with the verifier, saves the tokens, and spends the state once", async () => {
    const a = await oauth.beginAuthorization(REDIRECT, deps());
    if (!a.ok) throw a.error;
    const verifier = JSON.parse(readFileSync(pendingFile(), "utf8"))[a.value.state].verifier;
    const c = await oauth.completeAuthorization(a.value.state, "good-code", deps());
    expect(c.ok).toBe(true);
    const [grant] = suno.grants("authorization_code");
    expect(grant!.get("code_verifier")).toBe(verifier);
    expect(grant!.get("redirect_uri")).toBe(REDIRECT);
    expect(grant!.get("resource")).toBe(BASE);
    const auth = JSON.parse(readFileSync(authFile(), "utf8"));
    expect(auth.tokens).toMatchObject({ accessToken: "at-1", refreshToken: "rt-1", scope: "api:v0 offline_access" });
    expect(auth.tokens.expiresAt).toBeGreaterThan(Date.now() + 3_500_000);
    expect(auth.connectedAt).toBeTypeOf("string");
    const again = await oauth.completeAuthorization(a.value.state, "good-code", deps());
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.detail).toBe("state-mismatch");
  });

  it("carries the vendor's error_description verbatim", async () => {
    const a = await oauth.beginAuthorization(REDIRECT, deps());
    if (!a.ok) throw a.error;
    const c = await oauth.completeAuthorization(a.value.state, "bad-code", deps());
    expect(c.ok).toBe(false);
    if (!c.ok) expect([c.error.code, c.error.message]).toEqual(["unauthenticated", "Invalid authorization code."]);
    expect((await readAuth()).tokens).toBeUndefined();
  });

  it("drops a pending entry older than ten minutes", async () => {
    const a = await oauth.beginAuthorization(REDIRECT, { ...deps(), now: () => Date.now() - 11 * 60_000 });
    if (!a.ok) throw a.error;
    const c = await oauth.completeAuthorization(a.value.state, "good-code", deps());
    expect(c.ok).toBe(false);
  });
});

describe("refresh", () => {
  it("persists a rotated refresh token, and keeps the old one when the response carries none", async () => {
    await connect();
    const r1 = await oauth.refresh(deps(), { stale: "at-1" });
    expect(r1.ok && r1.value).toMatchObject({ accessToken: "at-2", refreshToken: "rt-2" });
    expect((await readAuth()).tokens?.refreshToken).toBe("rt-2");
    suno.live.rotate = false;
    const r2 = await oauth.refresh(deps(), { stale: "at-2" });
    expect(r2.ok && r2.value).toMatchObject({ accessToken: "at-3", refreshToken: "rt-2" });
    expect((await readAuth()).tokens?.refreshToken).toBe("rt-2");
  });

  it("spends nothing when the token is not near expiry", async () => {
    await connect();
    const r = await oauth.refresh(deps());
    expect(r.ok && r.value.accessToken).toBe("at-1");
    expect(suno.grants("refresh_token")).toHaveLength(0);
  });

  it("two processes refreshing one stale token spend the refresh token once", async () => {
    await connect();
    suno.live.delayMs = 80;
    // A second copy of the modules is a second process's view: its own in-process queue, the same
    // lock file. Only the file lock and the re-read under it can stop the double spend.
    vi.resetModules();
    const other = (await import("../../lib/suno/api/oauth.ts")) as typeof oauth;
    other.__resetDiscovery();
    const [a, b] = await Promise.all([oauth.refresh(deps(), { stale: "at-1" }), other.refresh(deps(), { stale: "at-1" })]);
    expect(a.ok && b.ok).toBe(true);
    expect(suno.grants("refresh_token")).toHaveLength(1);
    expect(a.ok && b.ok && a.value.accessToken === b.value.accessToken).toBe(true);
    expect((await readAuth()).tokens?.refreshToken).toBe(suno.live.refresh);
  });

  it("an invalid_grant drops the tokens, in the vendor's words", async () => {
    await connect();
    suno.live.refresh = "rt-elsewhere";
    const r = await oauth.refresh(deps(), { stale: "at-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe("Refresh token has been used.");
    const auth = await readAuth();
    expect(auth.tokens).toBeUndefined();
    expect(auth.client).toBeDefined();
  });

  it("without tokens answers not connected and calls nothing", async () => {
    const r = await oauth.refresh(deps());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe("not connected to suno");
    expect(suno.calls).toHaveLength(0);
  });
});

describe("disconnect", () => {
  it("revokes the refresh token, clears the tokens and keeps the client", async () => {
    await connect();
    const r = await oauth.disconnect(deps());
    expect(r.ok && r.value.revoked).toBe(true);
    const revoke = suno.calls.find((c) => c.url.endsWith("/revoke_token/"))!;
    expect(new URLSearchParams(revoke.body).get("token")).toBe("rt-1");
    const auth = await readAuth();
    expect(auth.tokens).toBeUndefined();
    expect(auth.connectedAt).toBeUndefined();
    expect(auth.client?.redirectUri).toBe(REDIRECT);
  });

  it("with nothing held makes no call", async () => {
    await withAuthLock(() => writeAuth({ v: 1 }));
    const r = await oauth.disconnect(deps());
    expect(r.ok).toBe(true);
    expect(suno.calls).toHaveLength(0);
  });
});
