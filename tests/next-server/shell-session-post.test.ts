// THE CLIENT HALF OF THE SESSION BRIDGE (app/(studio)/_shell/session.ts postSession) against the
// answers app/api/session/route.ts actually gives: a refusal is an ErrorEnvelope
// (`{error, code, detail}`), and the words the shell shows (the handoff's ErrorLine, the renewal
// toast) are the envelope's `error`, never the JSON around it.
import { afterEach, describe, expect, it, vi } from "vitest";

import { postSession } from "../../app/(studio)/_shell/session.ts";

const answer = (status: number, body: string, type = "application/json") => vi.fn(async () => new Response(body, { status, headers: { "content-type": type } }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postSession", () => {
  it("posts the token and answers ok on 200", async () => {
    const fetch = answer(200, JSON.stringify({ uid: "u1", exp: 1 }));
    vi.stubGlobal("fetch", fetch);
    expect((await postSession("tok")).ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/session", expect.objectContaining({ method: "POST", body: JSON.stringify({ idToken: "tok" }) }));
  });

  it("a refusal carries the server's own sentence, not its envelope", async () => {
    vi.stubGlobal("fetch", answer(401, JSON.stringify({ error: "Firebase ID token has expired.", code: "unauthenticated", detail: "expired" })));
    const r = await postSession("tok");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("unauthenticated");
    expect(r.error.message).toBe("session answered 401: Firebase ID token has expired.");
  });

  it("a body that is not an envelope is still shown, verbatim", async () => {
    vi.stubGlobal("fetch", answer(502, "Bad Gateway", "text/plain"));
    const r = await postSession("tok");
    expect(r.ok ? null : r.error.message).toBe("session answered 502: Bad Gateway");
    expect(r.ok ? null : r.error.code).toBe("unavailable");
  });

  it("a network failure is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const r = await postSession("tok");
    expect(r.ok ? null : r.error.message).toBe("session unreachable");
  });
});
