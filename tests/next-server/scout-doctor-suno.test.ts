import { ROOT, disposeRoot, resolve, stubTools } from "./scout-cli-harness.ts";

import { afterAll, describe, expect, it } from "vitest";
import { blocking, doctor } from "../../lib/foundry/scout/doctor.ts";
import { runCli } from "../../pipeline/scout.mts";

afterAll(() => disposeRoot());

// Suno is paused by the operator: a doctor that names no --tracks attaches to no browser (no probe port exists on
// the CLI, so a probe here would reach for the real one), and one that does name a cap still blocks on it.
describe("doctor and the paused Suno browser", () => {
  it("a live doctor with no --tracks lists suno as a note", async () => {
    const out: string[] = [];
    const env = { ...process.env, GRAVITONE_DRY_ONLY: undefined };
    await runCli(["doctor", "--json"], { env, out: (s) => out.push(s), err: () => {}, ports: { resolve, ingest: stubTools().deps, spawn: stubTools().spawn } });
    const checks = (JSON.parse(out.join("\n")) as { checks: { name: string; needed: boolean; found: string }[] }).checks;
    const suno = checks.find((c) => c.name === "suno");
    expect(suno?.needed).toBe(false);
    expect(suno?.found).toMatch(/no track cap named/);
  });

  it("doctor() with tracks > 0 and a dead browser blocks on suno; with none it does not", async () => {
    const suno = async () => ({ ok: false as const, reason: "no browser on the port" });
    const base = { env: { ...process.env }, storePath: ROOT + "/none.sqlite", scoutRoot: ROOT + "/scout", dry: false, spawn: stubTools().spawn, suno };
    expect(blocking(await doctor({ ...base, tracks: 2 })).map((c) => c.name)).toContain("suno");
    expect(blocking(await doctor(base)).map((c) => c.name)).not.toContain("suno");
  });

  it("on the API driver a dead browser is a `suno bytes` note, never a blocker; the API's own failure blocks", async () => {
    const base = { env: { ...process.env }, storePath: ROOT + "/none.sqlite", scoutRoot: ROOT + "/scout", dry: false, spawn: stubTools().spawn, tracks: 2, sunoKind: async () => "api" as const };
    const dead = async () => ({ ok: false as const, reason: "suno browser not running" });
    const up = await doctor({ ...base, suno: async () => ({ ok: true as const }), sunoBrowser: dead });
    const bytes = up.find((c) => c.name === "suno bytes");
    expect([bytes?.ok, bytes?.needed, bytes?.found]).toEqual([false, false, "suno browser not running: the songs land with no audio bytes"]);
    expect(blocking(up).map((c) => c.name)).not.toContain("suno");
    const down = await doctor({ ...base, suno: async () => ({ ok: false as const, reason: "not connected to suno" }), sunoBrowser: async () => ({ ok: true as const }) });
    expect(blocking(down).map((c) => c.name)).toContain("suno");
    expect(down.find((c) => c.name === "suno bytes")?.ok).toBe(true);
  });
});
