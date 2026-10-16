import { gzipSync } from "node:zlib";

import { beforeEach, describe, expect, it } from "vitest";

import { ArchiveRefused, exportAccount, inspectArchive } from "../../lib/studioArchive.ts";
import { openDb } from "../../lib/studioDb.ts";
import { readArchive, refusalOf, V1_DB_VERSION } from "../../lib/import/archive.ts";
import { markOriginal, refsInRecord, restoreOriginal, type Sink } from "../../lib/import/bytes.ts";
import { bytesOf, clearV1, dataUrl, seedV1 } from "./import-harness.ts";

// THE SERVER'S ARCHIVE READER AGAINST v1's (L42): the same bytes refused for the same reason
// by both - the page verifies with v1's `inspectArchive` before it uploads, the route verifies
// again here, and the two must never disagree about a file.

beforeEach(async () => {
  await clearV1();
});

const text = (b: Uint8Array) => new TextDecoder().decode(b);
const enc = (s: string) => new TextEncoder().encode(s);

async function v1Code(bytes: Uint8Array): Promise<string> {
  try {
    await inspectArchive(new Blob([Buffer.from(bytes)]));
    return "accepted";
  } catch (e) {
    return e instanceof ArchiveRefused ? e.code : `threw ${String(e)}`;
  }
}

function serverCode(bytes: Uint8Array, caps?: Parameters<typeof readArchive>[1]): string {
  const r = readArchive(bytes, caps);
  return r.ok ? "accepted" : (refusalOf(r.error) ?? r.error.message);
}

describe("the v1 database version", () => {
  it("is the one the server reader pins", async () => {
    const db = await openDb();
    try {
      expect(db.version).toBe(V1_DB_VERSION);
    } finally {
      db.close();
    }
  });
});

describe("refusals, named as v1 names them", () => {
  it("agrees with v1 on a whole archive and on every damaged one", async () => {
    await seedV1("uid-a");
    const plain = text(await bytesOf(exportAccount("uid-a", { gzip: false })));
    const lines = plain.trimEnd().split("\n");
    const cases: Record<string, Uint8Array> = {
      accepted: enc(plain),
      gzipped: new Uint8Array(gzipSync(enc(plain))),
      truncated: enc(`${lines.slice(0, -1).join("\n")}\n`),
      "corrupt-section": enc(plain.replace("Glass harbor", "Glass harbou")),
      "newer-db-version": enc(plain.replace(`"dbVersion":${V1_DB_VERSION}`, `"dbVersion":${V1_DB_VERSION + 1}`)),
      "newer-format": enc(plain.replace(`"format":1`, `"format":2`)),
      "not-an-archive": enc('{"kind":"something-else"}\n'),
      malformed: enc(`${lines[0]}\nnot json\n`),
    };
    for (const [want, bytes] of Object.entries(cases)) {
      const expected = want === "gzipped" ? "accepted" : want;
      expect(serverCode(bytes), want).toBe(expected);
      expect(await v1Code(bytes), `v1 on ${want}`).toBe(expected);
    }
  });

  it("caps an untrusted parse before it runs: the body, the inflated text, the line count", async () => {
    await seedV1("uid-a");
    const gz = await bytesOf(exportAccount("uid-a"));
    expect(serverCode(gz, { bodyBytes: gz.byteLength - 1, plainBytes: 2 ** 30, lines: 10_000 })).toBe("too-large");
    expect(serverCode(gz, { bodyBytes: 2 ** 30, plainBytes: 1024, lines: 10_000 })).toBe("too-large");
    expect(serverCode(gz, { bodyBytes: 2 ** 30, plainBytes: 2 ** 30, lines: 3 })).toBe("too-large");
  });
});

describe("bytes out of the rows and back", () => {
  it("restores a marked row to v1's exact text, and leaves a non-canonical base64 inline", async () => {
    const sink: Sink = new Map();
    const row = { id: "p:frames", phase: "frames", data: { units: [{ plate: { src: dataUrl(3), state: "ready" } }], odd: "data:image/png;base64,iVBORw0KGgo", proofs: [{ base64: Buffer.from("hi").toString("base64"), mime: "image/png" }] } };
    const marked = markOriginal(row, sink);
    expect(JSON.stringify(marked)).not.toContain(dataUrl(3));
    expect(JSON.stringify(marked)).toContain("iVBORw0KGgo"); // not canonical (no padding): kept inline
    expect(sink.size).toBe(2);
    const back = await restoreOriginal(marked, async (ref) => sink.get(ref.sha256)?.bytes ?? null);
    expect(JSON.stringify(back)).toBe(JSON.stringify(row));
  });

  it("turns a src data: URL into the kernel's blob ref in the record", () => {
    const sink: Sink = new Map();
    const rec = refsInRecord({ plate: { state: "ready", src: dataUrl(5), model: "m" } }, sink) as { plate: Record<string, unknown> };
    expect(rec.plate["src"]).toBeUndefined();
    expect(rec.plate["blob"]).toMatchObject({ bytes: 11, mime: "image/png" });
    expect(rec.plate["model"]).toBe("m");
  });
});
