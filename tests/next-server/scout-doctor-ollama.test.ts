// THE NIGHT'S PREFLIGHT, ITS LOCAL MODEL LINE (lib/foundry/scout/doctorOllama.ts): the Ollama daemon at
// OLLAMA_HOST, answering or not, holding the text model or not - a note every way, never a block. The
// daemon is a fake fetch; with OLLAMA_HOST unset nothing is asked. Store and night paths are a temp dir.

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { blocking, doctor, doctorLine, type DoctorInput } from "../../lib/foundry/scout/doctor.ts";
import { ollamaCheck } from "../../lib/foundry/scout/doctorOllama.ts";
import type { SpawnResult } from "../../lib/foundry/scout/ingest.ts";
import type { OllamaFetch } from "../../lib/text/providers/ollama.ts";

const DIR = mkdtempSync(path.join(os.tmpdir(), "gt-scout-doctor-ollama-"));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

const HOST = "http://127.0.0.1:11434";
function daemon(o: { down?: boolean; models?: string[] } = {}): { f: OllamaFetch; asked: string[] } {
  const asked: string[] = [];
  const f: OllamaFetch = async (url) => {
    asked.push(url);
    if (o.down) throw new TypeError("fetch failed");
    return Response.json({ models: (o.models ?? ["qwen3.8:27b"]).map((name) => ({ name })) });
  };
  return { f, asked };
}
const line = async (env: Record<string, string>, f?: OllamaFetch) => doctorLine(await ollamaCheck(env, f));

describe("doctor, the local model", () => {
  it("names the host, the daemon up and the text model present", async () => {
    const d = daemon();
    expect(await line({ OLLAMA_HOST: HOST }, d.f)).toBe(`ok   ${"ollama".padEnd(19)} ${HOST} · daemon up · qwen3.8:27b present`);
    expect(d.asked).toEqual([`${HOST}/api/tags`]);
  });

  it("notes a daemon that does not answer, with the script that starts it", async () => {
    expect(await line({ OLLAMA_HOST: HOST }, daemon({ down: true }).f)).toBe(
      `note ${"ollama".padEnd(19)} ${HOST} · daemon did not answer /api/tags: fetch failed -> powershell -File pipeline/ollama-up.ps1 starts it; set OLLAMA_HOST=http://127.0.0.1:11434 (pipeline/scout-schedule.ps1 does both)`,
    );
  });

  it("notes a model the daemon does not hold, naming the ones it does and OLLAMA_TEXT_MODEL", async () => {
    expect(await line({ OLLAMA_HOST: HOST }, daemon({ models: ["llama4:latest"] }).f)).toBe(
      `note ${"ollama".padEnd(19)} ${HOST} · daemon up · qwen3.8:27b not pulled -> ollama pull qwen3.8:27b, or set OLLAMA_TEXT_MODEL to one of: llama4:latest`,
    );
    expect(await line({ OLLAMA_HOST: HOST, OLLAMA_TEXT_MODEL: "llama4" }, daemon({ models: ["llama4:latest"] }).f)).toMatch(/^ok +ollama +.* llama4 present$/);
  });

  it("asks nothing when OLLAMA_HOST is unset, and says where the drafts go instead", async () => {
    const d = daemon();
    expect(await line({}, d.f)).toMatch(/^note ollama +OLLAMA_HOST unset: drafts fall to the claude CLI, the eye to Gemini -> /);
    expect(d.asked).toEqual([]);
  });

  it("rides in the whole preflight as a note that never blocks a live night", async () => {
    const spawn = async (bin: string): Promise<SpawnResult> => ({ ok: true, stdout: Buffer.from(`${bin} version 9.9\n`), stderr: "" });
    const T = Date.parse("2026-10-26T22:00:00.000Z");
    const input: DoctorInput = {
      env: { GOOGLE_AI_API_KEY: "set", LEONARDO_API_KEY: "set", SCOUT_CLIP_ENGINE: "hailuo", OLLAMA_HOST: HOST },
      storePath: path.join(DIR, "kernel.sqlite"), scoutRoot: path.join(DIR, "scout"), dry: false, spawn,
      keyFetch: async () => ({ ok: true, status: 200, text: async () => "{}" }),
      worker: async () => T - 60_000, now: () => T,
      studio: async () => ({ ok: true }), chromium: async () => process.execPath,
      ollamaFetch: daemon({ down: true }).f,
    };
    const checks = await doctor(input);
    expect(checks.find((c) => c.name === "ollama")).toMatchObject({ ok: false, needed: false });
    expect(blocking(checks).map((c) => c.name)).not.toContain("ollama");
  });
});
