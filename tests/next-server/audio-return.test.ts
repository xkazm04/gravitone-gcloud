// THE SUNO RETURN'S DOOR (app/(studio)/audio/return/route.ts) at the route, over the real sound
// store in a temp dir and a temp kernel: the door fails closed, a return becomes the card's next
// version and a retried op finds the take it filed, a field outside the door and a missing file
// are refused with nothing filed - and a body that declares no length is read only up to the cap.
//
// That last case is why this file exists. route()'s `bodyCap` is enforced by its JSON reader
// (app/_server/http.ts readJson), and this route declares no `input`, so the cap it passes was
// never applied: the only bound was the DECLARED content-length, and a chunked body declares none.
// Measured before the fix: a 64 MiB chunked body was pulled whole (67108864 bytes) and buffered by
// `req.formData()` before anything refused it; after, 65011712 of a 128 MiB body.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-audio-return-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { POST } from "../../app/(studio)/audio/return/route.ts";
import { ACCESS_SECRET_VAR, __resetRateLimit } from "../../lib/apiAuth.ts";
import { closeKernel } from "../../lib/kernelStore.ts";
import { MAX_UPLOAD_BYTES } from "../../lib/sound/takes.ts";

const SOUND = path.join(ROOT, "sound");
const ENV = [ACCESS_SECRET_VAR, "PRINCIPAL_MODE", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_DEV_AUTH", "NEXT_PUBLIC_LOCAL_MODE"];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

beforeAll(() => {
  for (const k of ENV) delete process.env[k];
  process.env[ACCESS_SECRET_VAR] = "return-secret";
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

const head = {
  id: "a",
  kind: "music",
  title: "Take a",
  provider: "suno",
  op: "manual",
  origin: "lab",
  technique: [],
  prompt: "prompt a",
  negative: null,
  terms: { genre: ["ambient"], mood: ["calm"], instrument: ["piano"], sfxCategory: null },
  tempoBpm: null,
  key: null,
  durationS: 30,
  loop: null,
  file: null,
  peaks: null,
  measured: null,
  ratings: {},
  verdict: "kept",
  reasons: [],
  note: null,
  stage: "remaster",
  group: "drone",
  label: null,
  parentId: null,
  createdAt: "2026-10-10T00:00:00.000Z",
  judgedAt: "2026-10-10T00:00:00.000Z",
  finalizedAt: null,
};

function seed(): void {
  rmSync(SOUND, { recursive: true, force: true });
  mkdirSync(SOUND, { recursive: true });
  writeFileSync(path.join(SOUND, "takes.json"), JSON.stringify({ version: 1, takes: [head] }));
  writeFileSync(path.join(SOUND, "groups.json"), JSON.stringify({ version: 1, groups: { music: ["drone"], sfx: [] } }));
}
const onDisk = (): readonly { id: string }[] => (JSON.parse(readFileSync(path.join(SOUND, "takes.json"), "utf8")) as { takes: { id: string }[] }).takes;

const URL_ = "http://127.0.0.1:3255/audio/return";
const AUTH = { authorization: "Bearer return-secret" };

function form(fields: Record<string, string>, file: boolean): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  if (file) f.set("file", new File([new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])], "return.wav", { type: "audio/wav" }));
  return f;
}
const post = (body: FormData, headers: Record<string, string> = AUTH): Promise<Response> => {
  __resetRateLimit();
  return POST(new Request(URL_, { method: "POST", body, headers }));
};

describe("POST /audio/return", () => {
  it("fails closed: nothing presented is 401 and nothing is filed", async () => {
    seed();
    const r = await post(form({ head: "a", stage: "edit", op: "op0001" }, true), {});
    expect(r.status).toBe(401);
    expect(onDisk()).toHaveLength(1);
  });

  it("files the return as the card's next version; the same op again finds the take it filed", async () => {
    seed();
    const r = await post(form({ head: "a", stage: "edit", op: "op0002" }, true));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ version: 2, created: true });
    const again = await post(form({ head: "a", stage: "edit", op: "op0002" }, true));
    expect(await again.json()).toMatchObject({ version: 2, created: false });
    expect(onDisk()).toHaveLength(2);
  });

  it("refuses a stage outside the door and a return with no file, filing nothing", async () => {
    seed();
    const stage = await post(form({ head: "a", stage: "nowhere", op: "op0003" }, true));
    expect(stage.status).toBe(400);
    const nofile = await post(form({ head: "a", stage: "edit", op: "op0004" }, false));
    expect(nofile.status).toBe(400);
    expect(((await nofile.json()) as { error: string }).error).toContain("audio file");
    expect(onDisk()).toHaveLength(1);
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
    // The cap, the chunk that crossed it and the stream's one chunk of read-ahead; the other
    // ~66 MiB are never pulled.
    expect(pulled).toBeLessThanOrEqual(MAX_UPLOAD_BYTES + 1_000_000 + 2 * chunk.byteLength);
    expect(onDisk()).toHaveLength(1);
  });
});
