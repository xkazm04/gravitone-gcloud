// FAKE ENGINES FOR THE MESH TESTS (spark game-3d-assets WP2): a "Blender" that is a node script and a
// "ComfyUI" that is a node:http server. Neither the box's Blender nor its ComfyUI on :8188 is touched.
//
// The fake Blender reads `-P <script> -- <args>` as Blender would be handed them and writes the
// files and the JSON result each ported script (pipeline/mesh/blender/) writes. Its control file
// makes one script print a traceback and exit non-zero (`fail`), or exit 0 having written nothing
// (`silent`); every call is appended to calls.log.

import { writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { standInGlb } from "../../lib/foundry/mesh/standin.ts";

export type FakeBlender = { readonly command: readonly string[]; readonly control: (c: { fail?: string; code?: number; silent?: string }) => void; readonly log: string };

export function fakeBlender(root: string): FakeBlender {
  const fake = path.join(root, "fake-blender.mjs");
  const control = path.join(root, "control.json");
  const rigged = path.join(root, "rigged-standin.glb");
  const log = path.join(root, "calls.log");
  writeFileSync(rigged, standInGlb("character", { rig: true }));
  writeFileSync(control, "{}");
  writeFileSync(
    fake,
    `import fs from "node:fs"; import path from "node:path";
const argv = process.argv.slice(2);
const script = path.basename(argv[argv.indexOf("-P") + 1]);
const a = argv.slice(argv.indexOf("--") + 1);
const c = JSON.parse(fs.readFileSync(${JSON.stringify(control)}, "utf8"));
fs.appendFileSync(${JSON.stringify(log)}, script + " " + argv.slice(0, argv.indexOf("-P")).join(" ") + "\\n");
if (c.fail === script) { process.stderr.write("Traceback (most recent call last):\\n  File \\"" + script + "\\", line 12\\nRuntimeError: Error: Cannot open file for writing\\n"); process.exit(c.code ?? 1); }
if (c.silent === script) process.exit(0);
const w = (f, d) => fs.writeFileSync(f, typeof d === "string" || d instanceof Uint8Array ? d : JSON.stringify(d));
switch (script) {
  case "finish.py": { const [raw, out, name] = a; fs.copyFileSync(raw, path.join(out, name + "_static.glb")); w(path.join(out, name + "_finish.blend"), "BLENDER"); w(path.join(out, name + "_finish.json"), { tris_final: 432 }); break; }
  case "touchup.py": { const [src, , outbase] = a; fs.copyFileSync(src, outbase + ".glb"); w(outbase + ".touchup.json", { fixed: ["removed 3 floater/stray shells (40 faces)"], not_fixed: ["second blade is deleted, not replaced: the back of the head is a flat cut stub (no back spike or poll is modelled)"] }); break; }
  case "rig.py": { const [, out, name] = a; fs.copyFileSync(${JSON.stringify(rigged)}, path.join(out, name + "_rigged.glb")); w(path.join(out, name + "_rigged.blend"), "BLENDER"); w(path.join(out, name + "_rig.json"), { weights: "proxy heat (ARMATURE_AUTO on watertight voxel proxy) transferred by nearest proxy vertex; then vertex_group_smooth x4, limit 4, normalize", nearest_bone_fallback_verts: 12 }); break; }
  case "metrics.py": { const [, out] = a; w(out, { verts: 218, faces: 432, watertight: false, windingConsistent: true, components: 1, euler: 2, bbox: [0.6, 1.8, 0.35], volume: null, area: 3.84, degenerateFaces: 0, componentFaces: [432], componentFacesOmitted: 0 }); break; }
  case "render.py": { const [, out, name] = a; w(path.join(out, name + "_hero.png"), "PNG"); w(path.join(out, name + "_gameplay.png"), "PNG"); w(path.join(out, name + "_render.json"), { mode: "stills", files: [] }); break; }
  case "views4.py": { const [, prefix] = a; for (let i = 0; i < 4; i++) w(prefix + "_" + i + ".png", "PNG"); w(prefix + "_views.json", { files: [] }); break; }
  case "echo.py": { w(a[0], { args: a }); break; }
  default: process.stderr.write("unknown script " + script); process.exit(9);
}
`,
  );
  return { command: [process.execPath, fake], control: (c) => writeFileSync(control, JSON.stringify(c)), log };
}

export type FakeComfy = { readonly base: string; readonly seen: string[]; close(): Promise<void> };

/** A ComfyUI that takes any prompt and finishes it on the second poll with a stand-in glb. */
export async function fakeComfy(): Promise<FakeComfy> {
  const seen: string[] = [];
  const glb = standInGlb("character");
  let polls = 0;
  let next = 0;
  const server: Server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      seen.push(`${req.method ?? ""} ${url.pathname}`);
      const json = (doc: unknown): void => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(doc));
      };
      if (url.pathname === "/system_stats") return json({});
      if (url.pathname === "/upload/image") return json({ name: "concept.png", subfolder: "", type: "input" });
      if (url.pathname === "/prompt") return json({ prompt_id: `p-${++next}` });
      if (url.pathname.startsWith("/history/")) {
        const id = decodeURIComponent(url.pathname.slice("/history/".length));
        if (++polls % 2 === 1) return json({});
        return json({ [id]: { outputs: { "322": { "3d": [{ filename: `${id}.glb`, subfolder: "gravitone", type: "output" }] } }, status: { status_str: "success", completed: true } } });
      }
      if (url.pathname === "/view") {
        res.writeHead(200);
        return res.end(Buffer.from(glb));
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, close: () => new Promise<void>((r) => server.close(() => r())) };
}
