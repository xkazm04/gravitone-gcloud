// THE SHELF'S IMPORT (spark studio-to-release WP3) - app/(studio)/audio/_release/importActs.ts over a temp sound store: a
// WAV sent in pieces under the action cap is assembled, measured by ffprobe and filed KEPT (kind music, origin import,
// titled from its name); the same bytes again find their take; a file past the 60 MB cap and a file that is not audio
// are refused on the first piece in the door's own words; a piece that never arrives files nothing.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-release-import-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "sound-ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
});

vi.mock("../../app/_server/principal.ts", () => ({ principal: async () => ({ kind: "firebase", uid: "u-7", authTime: 0, exp: 0 }) }));

import { importPieceAct } from "../../app/(studio)/audio/_release/importActs.ts";
import { silentWav } from "../../lib/producers/voice.ts";
import { listTakes } from "../../lib/sound/takes.ts";

const PIECE = 300 * 1024;

async function send(name: string, bytes: Uint8Array, o: { readonly size?: number; readonly skip?: number } = {}) {
  const upload = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  const count = Math.max(1, Math.ceil(bytes.byteLength / PIECE));
  let last: Awaited<ReturnType<typeof importPieceAct>> | undefined;
  for (let index = 0; index < count; index++) {
    if (index === o.skip) continue;
    const f = new FormData();
    f.set("upload", upload);
    f.set("index", String(index));
    f.set("count", String(count));
    f.set("size", String(o.size ?? bytes.byteLength));
    f.set("name", name);
    f.set("bytes", new Blob([bytes.slice(index * PIECE, (index + 1) * PIECE)]));
    last = await importPieceAct(f);
    if (!last.ok) return last;
  }
  return last;
}

describe("the shelf's import", () => {
  it("files a WAV sent in pieces as a kept music take, and finds it again", async () => {
    const wav = silentWav(40);
    expect(wav.byteLength).toBeGreaterThan(PIECE);
    const r = await send("03 - Harbour Lights (main).wav", wav);
    if (r === undefined || !r.ok) throw new Error(JSON.stringify(r));
    if (r.value.kind !== "filed") throw new Error(r.value.kind);
    expect(r.value).toMatchObject({ title: "Harbour Lights", created: true });
    expect(r.value.durationS).toBeCloseTo(40, 1);
    const kept = await listTakes({ verdict: "kept" });
    const t = kept.find((x) => x.id === (r.value.kind === "filed" ? r.value.takeId : ""));
    expect(t).toMatchObject({ kind: "music", origin: "import", verdict: "kept", fileName: "03 - Harbour Lights (main).wav" });
    const again = await send("Harbour Lights copy.wav", wav);
    expect(again?.ok && again.value.kind === "filed" && again.value.created).toBe(false);
  });

  it("refuses a file past the cap and a file that is not audio on the first piece, in the door's words", async () => {
    const big = await send("long.wav", new Uint8Array(10), { size: 61 * 1024 * 1024 });
    expect(big?.ok).toBe(false);
    if (big !== undefined && !big.ok) expect(big.error.error).toBe("the file is 61 MB; takes are capped at 60 MB");
    const notes = await send("notes.txt", new TextEncoder().encode("not audio"));
    expect(notes?.ok).toBe(false);
    if (notes !== undefined && !notes.ok) expect(notes.error.error).toContain("notes.txt is not audio");
  });

  it("files nothing when a piece never arrived", async () => {
    const before = (await listTakes({ verdict: "kept" })).length;
    const r = await send("gap.wav", silentWav(40), { skip: 0 });
    expect(r?.ok).toBe(false);
    expect((await listTakes({ verdict: "kept" })).length).toBe(before);
  });
});
