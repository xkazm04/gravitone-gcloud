// THE HUNT RETURN'S DOOR (app/(studio)/audio/hunt-return/route.ts) at the route, over the real
// sound store in a temp dir and a temp kernel: the door fails closed, a missing file is refused
// with nothing filed - and a body that declares no length is read only up to the cap.
//
// That last case is why this file exists, and it is the same defect /audio/return had
// (tests/next-server/audio-return.test.ts): route()'s `bodyCap` binds its JSON reader, this door
// declares no `input`, so the only bound was the DECLARED content-length, and a chunked body
// declares none. Measured before the fix: the 128 MiB chunked body below was pulled whole
// (134217728 bytes) by `req.formData()` before anything refused it.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-audio-hunt-return-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { POST } from "../../app/(studio)/audio/hunt-return/route.ts";
import { ACCESS_SECRET_VAR, __resetRateLimit } from "../../lib/apiAuth.ts";
import { closeKernel } from "../../lib/kernelStore.ts";
import { MAX_UPLOAD_BYTES } from "../../lib/sound/takes.ts";

const SOUND = path.join(ROOT, "sound");
const ENV = [ACCESS_SECRET_VAR, "PRINCIPAL_MODE", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_DEV_AUTH", "NEXT_PUBLIC_LOCAL_MODE"];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

beforeAll(() => {
  for (const k of ENV) delete process.env[k];
  process.env[ACCESS_SECRET_VAR] = "hunt-return-secret";
});
afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
  for (const k of ENV) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function seed(): void {
  rmSync(SOUND, { recursive: true, force: true });
  mkdirSync(SOUND, { recursive: true });
  writeFileSync(path.join(SOUND, "takes.json"), JSON.stringify({ version: 1, takes: [] }));
}
const onDisk = (): readonly unknown[] => (JSON.parse(readFileSync(path.join(SOUND, "takes.json"), "utf8")) as { takes: unknown[] }).takes;

const URL_ = "http://127.0.0.1:3255/audio/hunt-return";
const AUTH = { authorization: "Bearer hunt-return-secret" };

function form(file: boolean): FormData {
  const f = new FormData();
  f.set("hunt", "hn-1");
  f.set("node", "s");
  f.set("op", "opret0001");
  if (file) f.set("file", new File([new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])], "return.wav", { type: "audio/wav" }));
  return f;
}
const post = (body: FormData, headers: Record<string, string> = AUTH): Promise<Response> => {
  __resetRateLimit();
  return POST(new Request(URL_, { method: "POST", body, headers }));
};

describe("POST /audio/hunt-return", () => {
  it("fails closed: nothing presented is 401 and nothing is filed", async () => {
    seed();
    const r = await post(form(true), {});
    expect(r.status).toBe(401);
    expect(onDisk()).toHaveLength(0);
  });

  it("refuses a return with no file, filing nothing", async () => {
    seed();
    const r = await post(form(false));
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain("audio file");
    expect(onDisk()).toHaveLength(0);
  });

  it("reads a body that declares no length only up to the cap, then refuses it", async () => {
    seed();
    const chunk = new Uint8Array(1 << 20);
    const chunks = 128;
    let pulled = 0;
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent === chunks) return c.close();
        sent++;
        pulled += chunk.byteLength;
        c.enqueue(chunk);
      },
    });
    __resetRateLimit();
    const req = new Request(URL_, { method: "POST", body, headers: { ...AUTH, "content-type": "multipart/form-data; boundary=x" }, duplex: "half" } as RequestInit);
    expect(req.headers.get("content-length")).toBeNull();
    const r = await POST(req);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain(`over ${MAX_UPLOAD_BYTES / 1048576} MB`);
    // The cap, the chunk that crossed it and the stream's one chunk of read-ahead; the rest of
    // the 128 MiB is never pulled.
    expect(pulled).toBeLessThanOrEqual(MAX_UPLOAD_BYTES + 1_000_000 + 2 * chunk.byteLength);
    expect(onDisk()).toHaveLength(0);
  });
});
