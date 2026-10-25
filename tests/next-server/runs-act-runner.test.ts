// RUNS' ACT RUNNER (app/(studio)/projects/runs/_runs/actRunner.ts): a Server Action that REJECTS
// (the network gone, the server down before it answered) reaches the operator as a toast and still
// clears what the press armed; an answer, ok or not, reaches the answer handler untouched.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { settled } from "../../app/(studio)/projects/runs/_runs/actRunner.ts";

describe("settled", () => {
  it("hands a rejection's message to the reject handler, never the answer handler, and still ends", async () => {
    const seen: string[] = [];
    await settled(
      () => Promise.reject(new Error("fetch failed")),
      () => seen.push("answer"),
      (message) => seen.push(`reject:${message}`),
      () => seen.push("end"),
    );
    expect(seen).toEqual(["reject:fetch failed", "end"]);
  });

  it("hands an answer to the answer handler, then ends; a refusal in the envelope is an answer, not a rejection", async () => {
    const seen: string[] = [];
    await settled(
      () => Promise.resolve({ ok: false as const, error: { error: "paused already" } }),
      (r) => seen.push(r.ok ? "ok" : `answer:${r.error.error}`),
      (message) => seen.push(`reject:${message}`),
      () => seen.push("end"),
    );
    expect(seen).toEqual(["answer:paused already", "end"]);
  });

  it("a call that throws before it returns a promise is a rejection too", async () => {
    const seen: string[] = [];
    await settled(
      () => {
        throw new Error("no port");
      },
      () => seen.push("answer"),
      (message) => seen.push(`reject:${message}`),
    );
    expect(seen).toEqual(["reject:no port"]);
  });
});

describe("Runs.tsx", () => {
  it("reaches the transport through settled at every site: no bare .then chain is left on a Server Action", () => {
    const src = readFileSync(new URL("../../app/(studio)/projects/runs/_runs/Runs.tsx", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src.match(/\.then\(/g) ?? []).toEqual([]);
    expect((src.match(/settled\(/g) ?? []).length).toBe(3);
  });
});
