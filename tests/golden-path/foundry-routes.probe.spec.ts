// LANE — THE /api/foundry/* HANDLERS, called as functions (dynamic).
//
// Route handlers here are plain `(Request) => Response` functions over the
// platform globals, so the probe invokes them directly — the same shape
// imaging-auth.probe.spec.ts uses for the imaging routes. Nothing here starts
// a server or reaches a vendor; the file route is refused before it touches
// the disk, and the extract POST is refused before it parses a body.

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";
import { MAX_BODY_BYTES, POST as extractPOST } from "@/app/api/foundry/extract/route";
import { GET as fileGET } from "@/app/api/foundry/file/route";

import { keepEnv } from "./_helpers";

const ENV_KEYS = [ACCESS_SECRET_VAR, "NEXT_PUBLIC_DEV_AUTH"] as const;
// The lane's contract (env-isolation.probe.spec.ts): a probe that writes
// process.env registers the snapshot/restore at file scope.
keepEnv(ENV_KEYS);

async function withEnv<T>(patch: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => Promise<T>): Promise<T> {
  for (const k of ENV_KEYS) {
    if (patch[k] === undefined) delete process.env[k];
    else process.env[k] = patch[k];
  }
  return fn();
}

const fileReq = (k?: string) =>
  new Request(`http://studio.local/api/foundry/file?run=r&path=x.png${k ? `&k=${k}` : ""}`);

test("file route: with NO secret configured the 401 says so — not a bare 'Access denied'", async () => {
  await withEnv({}, async () => {
    const res = await fileGET(fileReq("anything"));
    const body = (await res.json()) as { detail: string; code?: string };
    console.log(`[foundry] file/no-config -> ${res.status} ${body.detail.slice(0, 80)}`);
    expect(res.status).toBe(401);
    // The sentence names the variable the operator has to set, exactly as
    // every other gated route does through guardAccessOnly.
    expect(body.detail).toContain(ACCESS_SECRET_VAR);
    expect(body.code).toBe("unauthorized");
  });
});

test("file route: a WRONG `k` is told it was not accepted; a missing one is told what to send", async () => {
  await withEnv({ [ACCESS_SECRET_VAR]: "right-secret" }, async () => {
    const wrong = await fileGET(fileReq("wrong-secret"));
    const wrongBody = (await wrong.json()) as { detail: string };
    expect(wrong.status).toBe(401);
    expect(wrongBody.detail).toMatch(/not accepted/);

    const missing = await fileGET(fileReq());
    const missingBody = (await missing.json()) as { detail: string };
    expect(missing.status).toBe(401);
    expect(missingBody.detail).toMatch(/requires access credentials/);
  });
});

/* ── The extract POST refuses by declared size before it reads a byte ────── */

const extractReq = (contentLength: string | null, body = "{}") =>
  new Request("http://studio.local/api/foundry/extract", {
    method: "POST",
    headers: {
      authorization: "Bearer right-secret",
      "content-type": "application/json",
      "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      ...(contentLength ? { "content-length": contentLength } : {}),
    },
    body,
  });

test("extract POST: a body declared over the cap is refused with 413 before it is parsed", async () => {
  await withEnv({ [ACCESS_SECRET_VAR]: "right-secret" }, async () => {
    __resetRateLimit();
    // Before: nothing bounded the parse — 60 × 12 MB × 4/3 of base64 would
    // have been materialised before the first image was refused.
    const res = await extractPOST(extractReq(String(MAX_BODY_BYTES + 1)));
    const body = (await res.json()) as { detail: string; code: string };
    console.log(`[foundry] extract/oversize -> ${res.status} ${body.code}: ${body.detail.slice(0, 70)}`);
    expect(res.status).toBe(413);
    expect(body.code).toBe("too-large");
    expect(body.detail).toContain(`${MAX_BODY_BYTES / 1024 / 1024} MB`);
  });
});

test("extract POST: at or under the cap the body is parsed as before — a non-object is still a 400", async () => {
  await withEnv({ [ACCESS_SECRET_VAR]: "right-secret" }, async () => {
    __resetRateLimit();
    const exact = await extractPOST(extractReq(String(MAX_BODY_BYTES), "[]"));
    expect(exact.status).toBe(400);
    const undeclared = await extractPOST(extractReq(null, "[]"));
    expect(undeclared.status).toBe(400);
  });
});

test("file route: the right `k` passes the gate and reaches the disk layer", async () => {
  await withEnv({ [ACCESS_SECRET_VAR]: "right-secret" }, async () => {
    const res = await fileGET(fileReq("right-secret"));
    // Past the gate: the run id `r` resolves to nothing, which is the disk
    // layer's 404 — proof the request got through the door.
    expect(res.status).toBe(404);
  });
});
