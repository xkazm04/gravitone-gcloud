import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";

// THE CLI CONTRACT (plan §5.1) of `pipeline/publish.mts`, run as an agent runs it: the same verbs,
// one JSON document on stdout under `--json`, exit 0 ok / 1 the operation failed / 2 usage - and
// v1's keys on that document (`slot.status`, `publishAt`, `channelId`, `exportId`, `error`,
// `outcomes[].planFile`). The process gets a fetch that refuses and reports, a scratch store, and
// GRAVITONE_DRY_ONLY=1; nothing here can reach a platform or the operator's store.

const ROOT = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), "gt-publish-cli-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const EXPORT = "0b1c2d3e-4f50-4617-8a9b-cafe0000aaaa";
mkdirSync(path.join(dir, "exports"));
writeFileSync(path.join(dir, "exports", `${EXPORT}.mp4`), Buffer.alloc(300_000, 7));
const STUB = path.join(dir, "no-network.mjs");
writeFileSync(STUB, 'globalThis.fetch = async (u) => { process.stderr.write(`FETCH ${u}\\n`); throw new Error("network refused"); };\n');

const env = {
  ...process.env,
  GRAVITONE_STORE_PATH: path.join(dir, "store.sqlite"),
  PUBLISH_STORE_DIR: path.join(dir, "publish"),
  PUBLISH_EXPORTS_DIR: path.join(dir, "exports"),
  AD_EXPORT_DIR: "",
  GRAVITONE_DRY_ONLY: "1",
  PUBLISH_MODE: "dry",
  NODE_OPTIONS: `--import=${pathToFileURL(STUB).href}`,
};

function cli(...args: string[]): { code: number | null; out: string; err: string } {
  const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", path.join(ROOT, "pipeline", "publish.mts"), ...args], { cwd: ROOT, env, encoding: "utf8", timeout: 120_000 });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}
function doc<S extends z.ZodType>(schema: S, out: string) {
  const p = parseJsonAt("publish.mts --json", schema, out.trim());
  if (!p.ok) throw new Error(`${p.error.message}\n${out}`);
  return p.value;
}

const wireSlot = z.object({ id: z.string(), exportId: z.string().nullable(), channelId: z.string(), publishAt: z.string(), status: z.string(), error: z.string().nullable(), missedAt: z.string().nullable(), publicationId: z.string().nullable() });

describe("pipeline/publish.mts", () => {
  it("schedule -> list -> tick -> publish again: v1's verbs, keys and exit codes, over the kernel store, with no network", () => {
    const at = new Date(Date.now() - 60_000).toISOString();
    const s = cli("schedule", "--export", EXPORT, "--channel", "youtube", "--at", at, "--title", "A cut", "--tags", "a,b", "--project", "proj-1", "--json");
    expect(s.code, s.err).toBe(0);
    const slot = doc(z.object({ slot: wireSlot }), s.out).slot;
    expect(slot).toMatchObject({ exportId: EXPORT, channelId: "youtube", status: "scheduled", publishAt: at, error: null, publicationId: null });

    const l = cli("list", "--json");
    expect(l.code, l.err).toBe(0);
    expect(doc(z.object({ slots: z.array(wireSlot), now: z.string() }), l.out).slots.map((x) => [x.id, x.status])).toEqual([[slot.id, "scheduled"]]);

    const t = cli("tick", "--json");
    expect(t.code, t.err).toBe(0);
    const tick = doc(
      z.object({ missed: z.array(z.string()), interrupted: z.array(z.string()), drifted: z.array(z.string()), outcomes: z.array(z.object({ slot: wireSlot, publication: z.object({ id: z.string(), dry: z.boolean(), platformVideoId: z.null(), channelId: z.string() }).nullable(), planFile: z.string().nullable() })) }),
      t.out,
    );
    expect(tick.outcomes.map((o) => [o.slot.id, o.slot.status, o.publication?.dry, typeof o.planFile])).toEqual([[slot.id, "published", true, "string"]]);

    // A second publish of a published slot is a refusal of the operation: exit 1, `{ error }`.
    const again = cli("publish", slot.id, "--json");
    expect(again.code).toBe(1);
    expect(doc(z.object({ error: z.string() }), again.out).error).toMatch(/published slot cannot be published/);
    expect(`${s.err}${l.err}${t.err}${again.err}`).not.toContain("FETCH ");
  }, 180_000);

  it("refuses bad input as usage (exit 2) and a refused schedule as a failed operation (exit 1)", () => {
    const at = new Date(Date.now() + 3_600_000).toISOString();
    expect(cli("schedule", "--export", EXPORT, "--channel", "myspace", "--at", at, "--title", "x", "--json").code).toBe(2);
    expect(cli("schedule", "--export", EXPORT, "--channel", "youtube", "--at", "tomorrow-ish", "--title", "x", "--json").code).toBe(2);
    expect(cli("schedule", "--export", EXPORT, "--channel", "youtube", "--at", at, "--title", "<b>", "--json").code).toBe(2);
    const unwired = cli("schedule", "--export", EXPORT, "--channel", "tiktok", "--at", at, "--title", "x", "--json");
    expect(unwired.code).toBe(1);
    expect(doc(z.object({ error: z.string() }), unwired.out).error).toBe("tiktok is not wired");
    expect(cli("frobnicate").code).toBe(2);
  }, 180_000);
});
