import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { ok } = await import("@gt/domain/errors");
const { openKernel } = await import("@gt/kernel/kernel");
const { thisDevice } = await import("../../lib/knowhow/device.ts");
const { exportAll } = await import("../../lib/knowhow/export.ts");
const { localFileOf, mediaRef } = await import("../../lib/knowhow/media.ts");
const { sectionsOf } = await import("../../lib/knowhow/lanes.ts");
const { importRows } = await import("../../lib/library/characters.ts");
const { setVerdict } = await import("../../lib/production/ops.ts");
const { readState } = await import("../../lib/production/state.ts");

// THE KNOW-HOW EXPORT (spark device-metadata-sync, KS1): the projection is idempotent (a second export writes nothing),
// never carries a machine path or a user name, keeps a record's owner, never rewrites a lane file, and is written on every
// change through the afterWrite hook. Every root is a temp dir; the operator's store is never opened.

const ENV = ["PRODUCTION_FIXTURE_DIR", "GRAVITONE_DEVICE_FILE", "KNOWHOW_ROOT", "GRAVITONE_STORE_PATH"] as const;
const LEAK = /[A-Za-z]:\\|\/Users\/|kazda/;
let dir = "";
let saved: Record<string, string | undefined> = {};
let kernel: { readonly store: import("@gt/kernel/store").Store; close(): void } | null = null;

const put = (rel: string, body = "x"): void => {
  const f = path.join(dir, "fixture", rel);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, body);
};

const know = (): string => path.join(dir, "knowhow");
const skills = (): string => path.join(dir, "skills");

function files(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(root);
  return out.sort();
}

const json = (rel: string): Record<string, unknown> => JSON.parse(readFileSync(path.join(know(), rel), "utf8")) as Record<string, unknown>;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "knowhow-export-"));
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  process.env["PRODUCTION_FIXTURE_DIR"] = path.join(dir, "fixture");
  process.env["GRAVITONE_DEVICE_FILE"] = path.join(dir, "device.json");
  process.env["KNOWHOW_ROOT"] = know();
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store", "gravitone.sqlite");
  put("cores/sofia/portrait.jpg", "sofia-portrait");
  put("cores/sofia/sheet.jpg", "sofia-sheet");
  put("cores/unlatched-lead/portrait.jpg", "lead");
  put("unlatched/plates/P-K00.jpg", "plate");
  put("experiment/FINDINGS.md", "# WP4 (2026-11-20)\n\n## What held\n- **Wardrobe held.** 18 of 18.\n  - nested detail\n- Chaining held identity.\n\n## Files\n- `sheet.jpg`: the contact sheet.\n");
  put("experiment/director/bible.md", "## Room\nOne bedroom.\n");
  mkdirSync(path.join(skills(), "scout"), { recursive: true });
  const lessons = ["# scout", "", "## 1.0.0 - 2026-10-23 - night", "- A dated lesson.", "", "## undated", "- not exported", "- 2026-10-26 (S6): a bullet with its own date,", "  continued.", "- 2026-10-27 a lesson naming C:/Users/<someone>/x is refused", ""];
  writeFileSync(path.join(skills(), "scout", "LESSONS.md"), lessons.join("\n"));
  mkdirSync(path.dirname(process.env["GRAVITONE_STORE_PATH"]), { recursive: true });
  const k = openKernel(process.env["GRAVITONE_STORE_PATH"]);
  if (!k.ok) throw k.error;
  kernel = k.value;
});

afterEach(() => {
  kernel?.close();
  kernel = null;
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
});

async function seedKernelCharacter(): Promise<string> {
  const store = kernel?.store;
  if (store === undefined) throw new Error("no kernel");
  const img = path.join(dir, "fixture", "cores", "sofia", "portrait.jpg");
  const row = { pool: "muse-army" as const, sourceKey: "muse-army:r/a-1", card: { name: "Bora", look: "glossy black hair, a slim build", personality: "An archer.", age: 32 }, files: [{ role: "portrait", abs: img }] };
  const blob = { sha256: "a".repeat(64), bytes: 4, mime: "image/png" };
  const done = await importRows(store, [row], async () => ok([{ role: "portrait", blob }]));
  if (!done.ok) throw done.error;
  return done.value.outcomes[0]?.id ?? "";
}

describe("the know-how export", () => {
  it("writes every stream once, then nothing; no byte carries a machine path or a user name", async () => {
    expect(readState("unlatched").ok).toBe(true);
    const chr = await seedKernelCharacter();
    const first = exportAll({ store: kernel!.store, skills: skills() });
    expect(first.written.some((w) => w === "knowhow/productions/unlatched.json")).toBe(true);
    expect(first.written.some((w) => w === "knowhow/characters/sofia.json")).toBe(true);
    expect(first.written.some((w) => w.startsWith("knowhow/lanes/music-clip/"))).toBe(true);
    expect(first.filled).toContain("characters (kernel)");

    const again = exportAll({ store: kernel!.store, skills: skills() });
    expect(again.written).toEqual([]);
    expect(again.unchanged).toBeGreaterThan(0);

    for (const f of files(know())) expect(readFileSync(f, "utf8")).not.toMatch(LEAK);

    const self = thisDevice();
    const sofia = json("characters/sofia.json");
    expect(sofia["owner"]).toBe(self.id);
    expect(sofia["identity"]).toMatch(/^Sofia|aged/);
    const mine = (sofia["visuals"] as Record<string, { kind: string; media: { at: string } }[]>)[self.id] ?? [];
    expect(mine.map((v) => v.media.at)).toContain("production-fixture/cores/sofia/portrait.jpg");

    const k = json(`characters/${chr.replace(/^chr:/, "")}.json`);
    expect(k["sourceKey"]).toBe("muse-army:r/a-1");
    expect((k["visuals"] as Record<string, { media: { at: string } }[]>)[self.id]?.[0]?.media.at).toBe(`blobs/aa/${"a".repeat(62)}`);

    const prod = json("productions/unlatched.json");
    expect(prod).not.toHaveProperty("failed");
    expect(prod["ownerName"]).toBe(self.name);
    const plate = (prod["nodes"] as { id: string; media?: { at: string; hash: string } }[]).find((n) => n.id === "plate:P-K00");
    expect(plate?.media?.at).toBe("production-fixture/unlatched/plates/P-K00.jpg");
    expect(localFileOf(plate!.media!)).toBe(path.join(dir, "fixture", "unlatched", "plates", "P-K00.jpg"));
  });

  it("keeps an existing owner and other devices' pictures on re-export", () => {
    exportAll({ skills: skills() });
    const file = path.join(know(), "characters", "sofia.json");
    const held = json("characters/sofia.json");
    const other = "dev:00000000-0000-0000-0000-000000000000";
    const visuals = { ...(held["visuals"] as object), [other]: [{ kind: "portrait", media: { kind: "image", hash: "b".repeat(64), at: "production-fixture/cores/sofia/portrait.jpg" } }] };
    writeFileSync(file, `${JSON.stringify({ ...held, owner: other, at: "2026-01-01T00:00:00.000Z", card: { name: "Sofia", look: "as the owner wrote it" }, visuals }, null, 1)}\n`);
    exportAll({ skills: skills() });
    const now = json("characters/sofia.json");
    expect(now["owner"]).toBe(other);
    expect(now["at"]).toBe("2026-01-01T00:00:00.000Z");
    expect(now["card"]).toEqual({ name: "Sofia", look: "as the owner wrote it" });
    expect(Object.keys(now["visuals"] as object).sort()).toEqual([other, thisDevice().id].sort());
  });

  it("never rewrites a lane file, and refuses another device's production", () => {
    expect(readState("unlatched").ok).toBe(true);
    exportAll({ skills: skills() });
    const lanes = files(path.join(know(), "lanes"));
    expect(lanes.length).toBe(5);
    expect(lanes.filter((f) => f.includes(`${path.sep}scout${path.sep}`)).length).toBe(2);
    const one = lanes[0] as string;
    writeFileSync(one, '{"edited": true}\n');
    const mtime = statSync(one).mtimeMs;
    const prodFile = path.join(know(), "productions", "unlatched.json");
    const p = json("productions/unlatched.json");
    writeFileSync(prodFile, `${JSON.stringify({ ...p, owner: "dev:11111111-1111-1111-1111-111111111111" })}\n`);
    const again = exportAll({ skills: skills() });
    expect(readFileSync(one, "utf8")).toBe('{"edited": true}\n');
    expect(statSync(one).mtimeMs).toBe(mtime);
    expect(again.refused.map((r) => r.id)).toContain("unlatched");
  });

  it("exports a production on write, through the hook", () => {
    expect(readState("unlatched").ok).toBe(true);
    const done = setVerdict({ production: "unlatched", node: "kf:K00", verdict: "keep", reasons: ["identity holds"] });
    expect(done.ok).toBe(true);
    const node = (json("productions/unlatched.json")["nodes"] as { id: string; verdict?: { verdict: string } }[]).find((n) => n.id === "kf:K00");
    expect(node?.verdict?.verdict).toBe("keep");
  });

  it("refuses a file outside every known root, and one whose bytes moved", () => {
    const stray = path.join(dir, "elsewhere.png");
    writeFileSync(stray, "x");
    expect(mediaRef(stray, "image")).toBeNull();
    const ref = mediaRef(path.join(dir, "fixture", "cores", "sofia", "sheet.jpg"), "image");
    expect(ref?.at).toBe("production-fixture/cores/sofia/sheet.jpg");
    expect(localFileOf({ ...ref!, hash: "0".repeat(64) })).toBeNull();
  });

  it("cuts a findings file into top-level bullets with their nested lines", () => {
    const s = sectionsOf("## A\n- one\n  - nested\n- two\n\npara\n## B\n- three\n");
    expect(s.map((x) => x.bullets)).toEqual([["one\n- nested", "two"], ["three"]]);
  });
});
