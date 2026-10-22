// A glb's own counts, read in pure TS (spark game-3d-assets WP3): the facts a model item's detail
// shows, over a GLB built in code (no binary checked in), and the parser's own sentence when the
// bytes are not a GLB it can read.
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";

import { meshFactsOf } from "../src/media-facts/core.ts";
import { readGlb } from "../src/media-facts/glb.ts";
import { buildGlb, dataUrl, figure } from "../src/media-facts/glbSample.ts";

const SHA = "a".repeat(64);
const AT = "2026-10-22T09:00:00.000Z";
const box = { at: [0, 0.5, 0] as const, size: [1, 1, 1] as const };

const facts = (bytes: Uint8Array) => {
  const r = readGlb(bytes);
  if (!r.ok) throw new Error(r.error);
  return r.facts;
};

/** The JSON chunk of a built GLB, edited, re-packed (the BIN chunk dropped: the counts never read it). */
function withJson(bytes: Uint8Array, edit: (j: Record<string, unknown>) => void): Uint8Array {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read = parseJsonAt("test glb", z.record(z.string(), z.unknown()), new TextDecoder().decode(bytes.subarray(20, 20 + v.getUint32(12, true))));
  if (!read.ok) throw read.error;
  const json: Record<string, unknown> = { ...read.value };
  edit(json);
  const text = new TextEncoder().encode(JSON.stringify(json));
  const len = (text.byteLength + 3) & ~3;
  const out = new Uint8Array(20 + len).fill(0x20);
  const o = new DataView(out.buffer);
  o.setUint32(0, 0x46546c67, true);
  o.setUint32(4, 2, true);
  o.setUint32(8, out.byteLength, true);
  o.setUint32(12, len, true);
  o.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  return out;
}

describe("readGlb", () => {
  it("counts a static box: 12 triangles, 36 flat vertices, no bones, clips or images, a 1 m cube", () => {
    expect(facts(buildGlb({ meshes: [{ boxes: [box], color: [1, 0, 0] }] }))).toEqual({ tris: 12, verts: 36, bones: 0, clips: 0, images: 0, bboxM: [1, 1, 1] });
  });

  it("counts a rigged figure's joints, clips and embedded images", () => {
    const f = facts(buildGlb({ meshes: [{ boxes: figure(), color: [0.4, 0.5, 0.6] }], bones: 5, clips: 2, images: [new Uint8Array([137, 80, 78, 71])] }));
    expect(f).toMatchObject({ tris: figure().length * 12, verts: figure().length * 36, bones: 5, clips: 2, images: 1 });
    expect(f.bboxM?.[1]).toBeCloseTo(1.8, 2);
  });

  it("counts by primitive mode: indexed triangles, a strip, a fan, and lines as none", () => {
    const g = withJson(buildGlb({ meshes: [{ boxes: [box], color: [1, 1, 1] }] }), (j) => {
      const acc = j["accessors"] as Record<string, unknown>[];
      acc.push({ componentType: 5123, count: 30, type: "SCALAR" });
      const ix = acc.length - 1;
      j["meshes"] = [
        {
          primitives: [
            { attributes: { POSITION: 0 }, indices: ix },
            { attributes: { POSITION: 0 }, mode: 5 },
            { attributes: { POSITION: 0 }, mode: 6 },
            { attributes: { POSITION: 0 }, mode: 1 },
          ],
        },
      ];
    });
    expect(facts(g)).toMatchObject({ tris: 10 + 34 + 34 + 0, verts: 36 * 4 });
  });

  it("counts a mesh once per node that draws it, through the node's transform", () => {
    const g = withJson(buildGlb({ meshes: [{ boxes: [box], color: [1, 1, 1] }] }), (j) => {
      j["nodes"] = [{ mesh: 0 }, { mesh: 0, translation: [3, 0, 0], scale: [2, 2, 2] }];
    });
    const f = facts(g);
    expect(f.tris).toBe(24);
    expect(f.bboxM).toEqual([4.5, 2, 2]);
  });

  it("leaves the extent out when a POSITION omits its bounds, never guessing one", () => {
    const g = withJson(buildGlb({ meshes: [{ boxes: [box], color: [1, 1, 1] }] }), (j) => {
      const acc = j["accessors"] as Record<string, unknown>[];
      delete acc[0]?.["min"];
    });
    expect(facts(g)).not.toHaveProperty("bboxM");
  });

  it("refuses what is not a GLB it can read, in a sentence that names the fault", () => {
    const good = buildGlb({ meshes: [{ boxes: [box], color: [1, 1, 1] }] });
    const said = (b: Uint8Array) => {
      const r = readGlb(b);
      return r.ok ? "read" : r.error;
    };
    expect(said(new TextEncoder().encode("ftypisom-not-a-glb-at-all"))).toMatch(/^glb: the magic is 0x[0-9a-f]{8}, not glTF$/);
    expect(said(good.subarray(0, 10))).toBe("glb: 10 bytes is shorter than a header and one chunk");
    expect(said(good.subarray(0, 40))).toBe(`glb: the header declares ${good.byteLength} bytes, the file holds 40`);
    const broken = withJson(good, (j) => {
      j["meshes"] = [{ primitives: [{ attributes: { POSITION: 9 } }] }];
    });
    expect(said(broken)).toBe("glb: primitive 0 of mesh 0 POSITION names accessor 9, which does not exist");
    const garbled = good.slice();
    garbled[20] = 0x7d;
    expect(said(garbled)).toMatch(/^glb: .*JSON/);
  });
});

describe("meshFactsOf", () => {
  it("writes a decodable glb with its counts and no pixels", () => {
    const f = meshFactsOf({ sha: SHA, mime: "model/gltf-binary", read: readGlb(buildGlb({ meshes: [{ boxes: [box], color: [1, 1, 1] }] })), at: AT });
    expect(f).toMatchObject({ decodable: true, w: null, h: null, durationS: null, posterSha: null, error: null, mesh: { tris: 12 } });
  });
  it("writes a damaged one undecodable with the parser's sentence verbatim", () => {
    const f = meshFactsOf({ sha: SHA, mime: "model/gltf-binary", read: readGlb(new Uint8Array(8)), at: AT });
    expect(f).toMatchObject({ decodable: false, error: "glb: 8 bytes is shorter than a header and one chunk" });
    expect(f).not.toHaveProperty("mesh");
  });
});

describe("dataUrl", () => {
  it("is base64 of the bytes, padded", () => {
    expect(dataUrl(new TextEncoder().encode("glTF!"), "model/gltf-binary")).toBe("data:model/gltf-binary;base64,Z2xURiE=");
    expect(dataUrl(new TextEncoder().encode("ab"), "x/y")).toBe("data:x/y;base64,YWI=");
  });
});
