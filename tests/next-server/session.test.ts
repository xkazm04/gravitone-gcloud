import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { ok } from "@gt/domain/errors";

import { runAction } from "../../app/_server/actionCore.ts";
import { clearedCookie, cookieValue, isLoopbackHost, resolveSession, SESSION_COOKIE, sessionCookie, verifySession } from "../../app/_server/session.ts";
import { localEntryAvailable, localEntryCookie, localEntryGranted } from "../../lib/localEntry.ts";
import { LOCAL_ENTRY_COOKIE, localEntryChosen } from "../../lib/localMode.ts";
import { refuse, type Resolution } from "../../lib/principal.ts";
import { installSigner, nowS, PROJECT, uninstallSigner, type Signer } from "./tokens.ts";

// The session bridge and the Server Action core. DEV_AUTH and LOCAL_MODE are
// module constants read at import (lib/devAuth.ts, lib/localMode.ts), and this
// file runs with both off: the fixture paths are v1's and are pinned by
// tests/golden-path/principal.probe.spec.ts.

let signer: Signer;
beforeAll(async () => {
  signer = await installSigner();
});
afterAll(() => uninstallSigner());

const kindOf = (r: Resolution): string => (r.kind === "refused" ? `refused:${r.code}` : r.kind);

describe("the session cookie", () => {
  it("lives exactly as long as its token, httpOnly, Lax, and Secure off loopback only", () => {
    const now = 1_000_000_000_000;
    const c = sessionCookie("a.b.c", now / 1000 + 1800, now, true);
    expect(c).toBe(`${SESSION_COOKIE}=a.b.c; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800; Secure`);
    expect(sessionCookie("a.b.c", now / 1000 + 10, now, false)).not.toContain("Secure");
    expect(sessionCookie("a.b.c", now / 1000 - 10, now, false)).toContain("Max-Age=0");
    expect(clearedCookie(true)).toBe(`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`);
  });

  it("knows loopback when it sees it, and nothing else", () => {
    for (const h of ["localhost", "127.0.0.1", "127.4.5.6", "[::1]", "app.localhost"]) expect(isLoopbackHost(h)).toBe(true);
    for (const h of ["studio.example", "10.0.0.1", "localhost.evil.example", "128.0.0.1"]) expect(isLoopbackHost(h)).toBe(false);
  });

  it("reads one cookie out of a header", () => {
    expect(cookieValue(`x=1; ${SESSION_COOKIE}=t.o.k; y=2`, SESSION_COOKIE)).toBe("t.o.k");
    expect(cookieValue(`${SESSION_COOKIE}=`, SESSION_COOKIE)).toBeUndefined();
    expect(cookieValue(`${SESSION_COOKIE}x=1`, SESSION_COOKIE)).toBeUndefined();
    expect(cookieValue(null, SESSION_COOKIE)).toBeUndefined();
  });
});

describe("resolveSession", () => {
  it("a valid token is the firebase principal it names", async () => {
    const who = await resolveSession(await signer.sign({ sub: "uid-bob" }), "read");
    expect(who).toMatchObject({ kind: "firebase", uid: "uid-bob" });
  });

  it("refuses expired, foreign-project and oversized tokens, each for its own reason", async () => {
    expect(kindOf(await resolveSession(await signer.sign({ exp: nowS() - 1 }), "read"))).toBe("refused:expired");
    expect(kindOf(await resolveSession(await signer.sign({ aud: `${PROJECT}-other` }), "read"))).toBe("refused:wrong-aud");
    expect(kindOf(await verifySession("x".repeat(5000), "read"))).toBe("refused:malformed");
  });

  it("no cookie and no posture is missing-token, never a guess", async () => {
    expect(kindOf(await resolveSession(undefined, "read"))).toBe("refused:missing-token");
  });

  it("a granted local entry is the local owner, a presented token still speaks for itself, and verified mode refuses it", async () => {
    expect(kindOf(await resolveSession(undefined, "read", undefined, true))).toBe("local-owner");
    expect(kindOf(await resolveSession(await signer.sign({ exp: nowS() - 1 }), "read", undefined, true))).toBe("refused:expired");
    process.env["PRINCIPAL_MODE"] = "verified";
    try {
      expect(kindOf(await resolveSession(undefined, "read", undefined, true))).toBe("refused:local-owner-unverifiable");
    } finally {
      delete process.env["PRINCIPAL_MODE"];
    }
  });
});

describe("local entry (lib/localEntry.ts)", () => {
  const env = (k: string, v: string | undefined, run: () => void): void => {
    const was = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
    try {
      run();
    } finally {
      if (was === undefined) delete process.env[k];
      else process.env[k] = was;
    }
  };

  it("is available on a loopback host only", () => {
    for (const h of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "localhost"]) expect(localEntryAvailable(h)).toBe(true);
    for (const h of ["192.168.1.20:3000", "studio.example", "localhost.evil.example:3000", "", null, undefined]) expect(localEntryAvailable(h)).toBe(false);
  });

  it("is withdrawn by LOCAL_ENTRY=off, a managed platform and verified mode", () => {
    env("LOCAL_ENTRY", "off", () => expect(localEntryAvailable("localhost:3000")).toBe(false));
    env("K_SERVICE", "gravitone", () => expect(localEntryAvailable("localhost:3000")).toBe(false));
    env("PRINCIPAL_MODE", "verified", () => expect(localEntryAvailable("localhost:3000")).toBe(false));
  });

  it("is granted only for the choice AND an available request; the cookie is a Strict choice with no secret", () => {
    expect(localEntryGranted("1", "localhost:3000")).toBe(true);
    expect(localEntryGranted(undefined, "localhost:3000")).toBe(false);
    expect(localEntryGranted("1", "10.0.0.5:3000")).toBe(false);
    expect(localEntryCookie(true)).toBe(`${LOCAL_ENTRY_COOKIE}=1; Path=/; SameSite=Strict; Max-Age=2592000`);
    expect(localEntryCookie(false)).toContain("Max-Age=0");
    expect(localEntryChosen(`a=1; ${LOCAL_ENTRY_COOKIE}=1`)).toBe(true);
    expect(localEntryChosen(`${LOCAL_ENTRY_COOKIE}=10`)).toBe(false);
  });
});

describe("runAction", () => {
  const admit = async (): Promise<Resolution> => ({ kind: "firebase", uid: "uid-a", authTime: 1, exp: 2 });
  const schema = z.object({ n: z.number() });

  it("resolves who before the input is read, and a refusal never reaches the body", async () => {
    let parsed = false;
    const spy = z.unknown().transform((v) => {
      parsed = true;
      return v;
    });
    const r = await runAction("t", async () => refuse("missing-token"), spy, () => ok(1), { n: 1 });
    expect(r).toEqual({ ok: false, error: { error: expect.any(String), code: "unauthenticated", detail: "missing-token" } });
    expect(parsed).toBe(false);
  });

  it("a JWKS outage is unavailable, not refused", async () => {
    const r = await runAction("t", async () => refuse("jwks-unavailable"), schema, () => ok(1), { n: 1 });
    expect(r.ok ? "" : r.error.code).toBe("unavailable");
  });

  it("parses through the door and hands the body the principal", async () => {
    const r = await runAction("t", admit, schema, (input, who) => ok(`${who.kind === "firebase" ? who.uid : "?"}:${input.n}`), { n: 4 });
    expect(r).toEqual({ ok: true, value: "uid-a:4" });
    const bad = await runAction("t", admit, schema, () => ok(1), { n: "4" });
    expect(bad.ok ? "" : bad.error.code).toBe("invalid");
  });

  it("never throws to the client: a throw is an opaque internal envelope, plain data", async () => {
    const quiet = console.error;
    console.error = () => undefined;
    try {
      const r = await runAction("t", admit, schema, () => {
        throw new Error("disk path C:/private");
      }, { n: 1 });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe("internal");
        expect(r.error.error).not.toContain("private");
        // Serialisable: a structured clone round-trips it unchanged.
        expect(structuredClone(r)).toEqual(r);
      }
    } finally {
      console.error = quiet;
    }
  });
});
