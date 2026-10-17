// LANE — /api/foundry/file, called as a function (dynamic).
//
// Route handlers here are plain `(Request) => Response` functions over the
// platform globals, so the probe invokes them directly. Nothing here starts a
// server or reaches a vendor; a refused request never touches the disk.
//
// Phase 6 wave C (L70): the file route is on route()'s `access` guard and no
// longer reads `?k=`; its refusals are route()'s envelope `{ error, code,
// detail }`. RETIRED with their routes: the extract POST's declared-size 413
// (app/api/foundry/extract/route.ts MAX_BODY_BYTES) - an extract run is launched
// by the Floor's server action and the CLI now, which read their images from
// disk, so no request body carries 60 images any more.

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";
import { GET as fileGET } from "@/app/api/foundry/file/route";

import { keepEnv } from "./_helpers";

const ENV_KEYS = [ACCESS_SECRET_VAR, "NEXT_PUBLIC_DEV_AUTH"] as const;
// The lane's contract (env-isolation.probe.spec.ts): a probe that writes
// process.env registers the snapshot/restore at file scope.
keepEnv(ENV_KEYS);

async function withEnv<T>(patch: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => Promise<T>): Promise<T> {
  __resetRateLimit();
  for (const k of ENV_KEYS) {
    if (patch[k] === undefined) delete process.env[k];
    else process.env[k] = patch[k];
  }
  return fn();
}

const fileReq = (bearer?: string, query = "") =>
  new Request(`http://studio.local/api/foundry/file?run=r&path=x.png${query}`, bearer ? { headers: { authorization: `Bearer ${bearer}` } } : {});

type Envelope = { error: string; code: string; detail?: string };

test("file route: with NO secret configured the 401 says so — not a bare 'Access denied'", async () => {
  await withEnv({}, async () => {
    const res = await fileGET(fileReq("anything"));
    const body = (await res.json()) as Envelope;
    console.log(`[foundry] file/no-config -> ${res.status} ${body.error.slice(0, 80)}`);
    expect(res.status).toBe(401);
    // The sentence names the variable the operator has to set.
    expect(body.error).toContain(ACCESS_SECRET_VAR);
    expect(body.code).toBe("unauthenticated");
  });
});

test("file route: a WRONG secret is told it was not accepted; a missing one is told what to send", async () => {
  await withEnv({ [ACCESS_SECRET_VAR]: "right-secret" }, async () => {
    const wrong = await fileGET(fileReq("wrong-secret"));
    expect(wrong.status).toBe(401);
    expect(((await wrong.json()) as Envelope).error).toMatch(/not accepted/);

    const missing = await fileGET(fileReq());
    expect(missing.status).toBe(401);
    expect(((await missing.json()) as Envelope).error).toMatch(/requires access credentials/);
  });
});

test("file route: the secret in the URL is no credential - the right `k` alone is refused", async () => {
  await withEnv({ [ACCESS_SECRET_VAR]: "right-secret" }, async () => {
    const res = await fileGET(fileReq(undefined, "&k=right-secret"));
    expect(res.status).toBe(401);
  });
});

test("file route: the right header passes the gate and reaches the disk layer, whose 404 keeps its status", async () => {
  await withEnv({ [ACCESS_SECRET_VAR]: "right-secret" }, async () => {
    const res = await fileGET(fileReq("right-secret"));
    // Past the gate: the run id `r` resolves to nothing, which is the disk
    // layer's 404 — proof the request got through the door.
    expect(res.status).toBe(404);
    expect(((await res.json()) as Envelope).code).toBe("not-found");
  });
});
