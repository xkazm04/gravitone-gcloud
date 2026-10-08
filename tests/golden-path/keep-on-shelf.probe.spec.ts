// LANE — KEEP-ON-SHELF: a plate kept on the Library shelf is a COPY of its
// bytes in a lib/assets upload row, never a pointer (card WORKSPACE-B stage 2).
// fake-indexeddb, no component mounted.
//
//   1  one keep -> one asset row, one upload row, the decoded bytes
//   2  the same bytes kept twice (or from two projects) -> still one of each
//   3  a copy, not a pointer: regenerate + deleteProject, the bytes remain
//   4  only plates: missing, audio and src-less outputs are not keepable;
//      the control is rendered behind `keepable` only
//   5  a public-path plate is fetched once; a 404 writes nothing, says why
//   6  a refused transaction writes nothing; the store's message comes back whole
//   7  the kept mark follows the bytes: a regenerate drops it, a re-keep adds a row
//   8  no new prose: three hand-wired TALLY_TONE sites stay three; the name is a verb
import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { saveStep } from "@/app/_phases/_shared/stepStore";
import type { Frame } from "@/app/_phases/frames/frames";
import { unitsFromFrames } from "@/app/_phases/frames/picture/unit";
import { keepPlate, keepable, keptIndex, plateBlob, plateDigest } from "@/app/_library/keepPlate";
import { readOutputs, type Output } from "@/app/_library/projectOutputs";
import { getUploadBlobs, listAssets, assetFromKeptPlate, type UploadRecord } from "@/lib/assets";
import { deleteProject, newProject, putProject } from "@/lib/projects";

import { stripComments } from "./_helpers";

const UID = "uid-keep";
const b64 = (s: string) => Buffer.from(s, "binary").toString("base64");
const dataUrl = (s: string) => `data:image/png;base64,${b64(s)}`;
const BYTES_A = "\x89PNG\r\n\x1a\nplate-a";
const BYTES_B = "\x89PNG\r\n\x1a\nplate-b-regenerated";

function frame(id: string, src: string): Frame {
  return {
    id,
    at: "0:00",
    atS: 0,
    kind: "hook",
    title: `title ${id}`,
    line: `line ${id}`,
    plate: { state: "ready", src, model: "gemini-x", costUsd: 0.04 },
    clip: { status: "not-started", motion: "" },
    elements: [],
    texts: [],
  };
}

async function putFrames(projectId: string, src: string) {
  const frames = [frame("a", src)];
  const units = unitsFromFrames(frames, { sourceId: "r-1", totalS: null });
  const out = await saveStep(projectId, "frames", { units, frames, renderId: "r-1" }, { v: 2 });
  expect(out.ok).toBe(true);
}

const realFetch = globalThis.fetch;
test.beforeEach(() => {
  // The sound store is not under test: answer its list call with no takes.
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ takes: [] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

async function project(title: string) {
  return putProject(newProject(UID, { title, logline: "", template: "explainer" } as never));
}

async function plateOf(projectId: string): Promise<Output> {
  const r = await readOutputs(projectId);
  const o = r.outputs.find((x) => x.kind === "image" && x.state !== "missing");
  expect(o).toBeTruthy();
  return o as Output;
}

const bytesOf = async (b: Blob) => Buffer.from(await b.arrayBuffer()).toString("binary");
const keptRows = async () => (await listAssets(UID)).filter((a) => a.meta?.kept === "plate");

test("case 1: one keep writes one asset row, one upload row, the decoded bytes", async () => {
  const p = await project("Glass Harbor");
  await putFrames(p.id, dataUrl(BYTES_A));
  const o = await plateOf(p.id);
  await keepPlate(UID, p.id, o);

  const rows = await keptRows();
  expect(rows).toHaveLength(1);
  const a = rows[0];
  expect(a.id).toMatch(/^as-kept-[0-9a-f]{16}$/);
  const d16 = a.id.slice("as-kept-".length);
  expect(a.src).toBe(`upload:up-kept-${d16}`);
  expect(a.path).toEqual(["kept", "glass-harbor"]);
  expect(a.meta).toMatchObject({
    upload: true,
    uploadId: `up-kept-${d16}`,
    kept: "plate",
    projectId: p.id,
    outputId: o.id,
    renderId: o.provenance.run,
    model: "gemini-x",
    costUsd: 0.04,
  });
  expect(String(a.meta?.digest).startsWith(d16)).toBe(true);
  const blobs = await getUploadBlobs([`up-kept-${d16}`]);
  expect(await bytesOf(blobs.get(`up-kept-${d16}`)!)).toBe(BYTES_A);
});

test("case 2: the same bytes kept twice, or from two projects, leave one row and one blob", async () => {
  const p1 = await project("One");
  const p2 = await project("Two");
  await putFrames(p1.id, dataUrl(BYTES_A));
  await putFrames(p2.id, dataUrl(BYTES_A));
  const o1 = await plateOf(p1.id);
  const o2 = await plateOf(p2.id);
  await Promise.all([keepPlate(UID, p1.id, o1), keepPlate(UID, p1.id, o1)]);
  await keepPlate(UID, p2.id, o2);
  const digest = await plateDigest(o1.src!);
  const rows = (await keptRows()).filter((r) => r.meta?.digest === digest);
  expect(rows).toHaveLength(1);
  const id = String(rows[0].meta?.uploadId);
  expect((await getUploadBlobs([id])).size).toBe(1);
});

test("case 3: a regenerate and a deleted project leave the kept bytes and the row", async () => {
  const p = await project("Doomed");
  await putFrames(p.id, dataUrl(BYTES_A));
  await keepPlate(UID, p.id, await plateOf(p.id));
  const row = (await keptRows()).find((r) => r.meta?.projectId === p.id)!;
  await putFrames(p.id, dataUrl(BYTES_B));
  await deleteProject(p.id);
  const blobs = await getUploadBlobs([String(row.meta?.uploadId)]);
  expect(await bytesOf(blobs.get(String(row.meta?.uploadId))!)).toBe(BYTES_A);
  expect((await listAssets(UID)).some((a) => a.id === row.id)).toBe(true);
});

test("case 4: only plates are keepable, and the control is rendered behind keepable", () => {
  const base = { id: "x", title: "t", provenance: { step: "frames" as const } };
  expect(keepable({ ...base, kind: "image", state: "in-cut", src: "/p/a.png" })).toBe(true);
  expect(keepable({ ...base, kind: "image", state: "missing", code: "plate-refused" })).toBe(false);
  expect(keepable({ ...base, kind: "image", state: "in-cut" })).toBe(false);
  expect(keepable({ ...base, kind: "audio", state: "in-cut", src: "/t.mp3" })).toBe(false);
  expect(keepable({ ...base, kind: "image", state: "missing", src: "/p/a.png" })).toBe(false);

  const src = stripComments(readFileSync(path.join(process.cwd(), "app/_library/LibraryShelves.tsx"), "utf8"));
  expect(src).toMatch(/keepable\(o\)\s*&&[^<]*<KeepControl/);
  expect(src.match(/<KeepControl/g)).toHaveLength(1);
});

test("case 5: a public-path plate is fetched once; a 404 writes nothing and names its status", async () => {
  let calls = 0;
  const ok = (async () => {
    calls++;
    return new Response(Buffer.from(BYTES_A, "binary"), { status: 200, headers: { "content-type": "image/png" } });
  }) as typeof fetch;
  const blob = await plateBlob("/p/a.png", ok);
  expect(calls).toBe(1);
  expect(await bytesOf(blob)).toBe(BYTES_A);

  const p = await project("Public");
  await putFrames(p.id, "/p/missing.png");
  const o = await plateOf(p.id);
  const before = (await keptRows()).length;
  globalThis.fetch = (async (url: unknown) =>
    String(url).includes("/api/")
      ? new Response(JSON.stringify({ takes: [] }), { status: 200 })
      : new Response("nope", { status: 404, statusText: "Not Found" })) as typeof fetch;
  await expect(keepPlate(UID, p.id, o)).rejects.toThrow(/404/);
  expect((await keptRows()).length).toBe(before);
});

test("case 6: a refused transaction writes nothing and its message comes back whole", async () => {
  const p = await project("Quota");
  await putFrames(p.id, dataUrl("quota-bytes"));
  const o = await plateOf(p.id);
  const before = (await keptRows()).length;
  const refuse = async (_pairs: { upload: UploadRecord }[]) => {
    throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
  };
  await expect(keepPlate(UID, p.id, o, refuse as never)).rejects.toThrow("The quota has been exceeded.");
  expect((await keptRows()).length).toBe(before);
});

test("case 7: the kept mark follows the bytes", async () => {
  const p = await project("Follow");
  await putFrames(p.id, dataUrl(BYTES_A));
  const o = await plateOf(p.id);
  await keepPlate(UID, p.id, o);
  const marked = async (out: Output) => keptIndex(await listAssets(UID)).get(out.id) === (await plateDigest(out.src!));
  expect(await marked(o)).toBe(true);

  await putFrames(p.id, dataUrl(BYTES_B));
  const regenerated = await plateOf(p.id);
  expect(regenerated.id).toBe(o.id);
  expect(await marked(regenerated)).toBe(false);

  const before = (await keptRows()).filter((r) => r.meta?.projectId === p.id).length;
  await keepPlate(UID, p.id, regenerated);
  expect((await keptRows()).filter((r) => r.meta?.projectId === p.id).length).toBe(before + 1);
  expect(await marked(regenerated)).toBe(true);
});

test("case 8: no new prose; the control's name is a verb; assetFromKeptPlate is pure", () => {
  const src = stripComments(readFileSync(path.join(process.cwd(), "app/_library/LibraryShelves.tsx"), "utf8"));
  // Three hand-wired sites (a ternary line counts once): the kept mark is <Tally>.
  expect(src.split(/\r?\n/).filter((l) => /TALLY_TONE\./.test(l))).toHaveLength(3);
  expect(src).toMatch(/aria-label=\{?[`"']Keep\b/);
  const pair = assetFromKeptPlate("u", {
    blob: new Blob(["x"]),
    mime: "image/png",
    digest: "ab".repeat(32),
    projectTitle: "T",
    projectId: "p",
    outputId: "frames:a",
    name: "n",
  });
  expect(pair.asset.id).toBe("as-kept-abababababababab");
  expect(pair.upload.id).toBe("up-kept-abababababababab");
});
