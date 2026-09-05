// LANE — THE /api/foundry/* HANDLERS, called as functions (dynamic).
//
// Route handlers here are plain `(Request) => Response` functions over the
// platform globals, so the probe invokes them directly — the same shape
// imaging-auth.probe.spec.ts uses for the imaging routes. Nothing here starts
// a server or reaches a vendor; the file route is refused before it touches
// the disk, and the extract POST is refused before it parses a body.

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR } from "@/lib/apiAuth";
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

test("file route: the right `k` passes the gate and reaches the disk layer", async () => {
  await withEnv({ [ACCESS_SECRET_VAR]: "right-secret" }, async () => {
    const res = await fileGET(fileReq("right-secret"));
    // Past the gate: the run id `r` resolves to nothing, which is the disk
    // layer's 404 — proof the request got through the door.
    expect(res.status).toBe(404);
  });
});
