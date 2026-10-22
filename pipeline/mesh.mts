// MESH - a game asset made on this box (spark game-3d-assets WP2; docs/mesh.md).
//
//   npx tsx pipeline/mesh.mts new <assetId> --class character|weapon|prop --subject "..." --concept <png>
//                                 [--techniques T1,T2] [--rig] [--live] [--detach] [--json]
//   npx tsx pipeline/mesh.mts status [<assetId>] [--json]
//   npx tsx pipeline/mesh.mts finish <assetId> [--variant <v>] [--live] [--detach] [--json]
//   npx tsx pipeline/mesh.mts keep|reject <assetId> <variantId> [--json]
//
// `new` grades the concept (single subject, plain background, whole in frame) and refuses before
// anything is written when it fails; otherwise it writes the asset, queues the mesh job (TRELLIS.2
// through ComfyUI, gpu.local) and drives it, then the finish job its settle queues (Blender,
// box.blender). --detach queues the mesh job and leaves both stages to the worker. `finish` retries
// the finish of failed variants that have a raw mesh. `keep`/`reject` record the operator's verdict
// (the stand-in for /scout's morning packet).
//
// DRY BY DEFAULT: stand-in glbs, no ComfyUI, no Blender. --live arms the engines (refused under
// GRAVITONE_DRY_ONLY=1). Nothing here POSTs ComfyUI's /free or restarts it.
//
// THE STORES: GRAVITONE_STORE_PATH (the kernel), MESH_STORE_DIR (the assets, default
// foundry-out/mesh). --json: one JSON document on stdout. EXIT 0 done · 1 failed or refused · 2 usage.

import { parseArgs } from "node:util";
import { errorMessage } from "@gt/domain/errors";

const USAGE = [
  "usage: npx tsx pipeline/mesh.mts <command>",
  "  new <assetId> --class character|weapon|prop --subject \"...\" --concept <png> [--techniques T1,T2] [--rig] [--live] [--detach] [--json]",
  "  status [<assetId>] [--json]",
  "  finish <assetId> [--variant <v>] [--live] [--detach] [--json]",
  "  keep <assetId> <variantId> [--json]",
  "  reject <assetId> <variantId> [--json]",
].join("\n");

let parsed;
try {
  parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      class: { type: "string" },
      subject: { type: "string" },
      concept: { type: "string" },
      techniques: { type: "string" },
      variant: { type: "string" },
      rig: { type: "boolean" },
      live: { type: "boolean" },
      dry: { type: "boolean" },
      detach: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: true,
  });
} catch (e) {
  console.error(`mesh: ${errorMessage(e)}\n${USAGE}`);
  process.exit(2);
}
const { values: v, positionals } = parsed;
const [verb, id, variant, ...extra] = positionals;
const json = v.json === true;
const out = (human: string, doc: unknown): void => console.log(json ? JSON.stringify(doc, null, 2) : human);
const usage = (why?: string): number => {
  console.error(`${why === undefined ? "" : `mesh: ${why}\n`}${USAGE}`);
  return 2;
};

async function main(): Promise<number> {
  if (v.help === true) {
    console.log(USAGE);
    return 0;
  }
  if (verb === undefined) return usage();
  if (v.live === true && v.dry === true) return usage("--live and --dry contradict each other");
  const { ASSET_CLASSES, TECHNIQUES } = await import("../lib/foundry/mesh/types.ts");
  const { describeAsset } = await import("../lib/foundry/mesh/describe.ts");

  if (verb === "status" && variant === undefined) {
    const { listAssets, readAsset } = await import("../lib/foundry/mesh/store.ts");
    const assets = id === undefined ? await listAssets() : [await readAsset(id)];
    out(assets.length === 0 ? "no assets yet" : assets.map(describeAsset).join("\n\n"), { assets });
    return 0;
  }
  if ((verb === "keep" || verb === "reject") && id !== undefined && variant !== undefined && extra.length === 0) {
    const { decide } = await import("../lib/foundry/mesh/cli-acts.ts");
    const r = await decide(id, variant, verb === "keep" ? "kept" : "rejected");
    if (!r.ok) {
      out(`mesh: ${r.error.message}`, { error: r.error.message });
      return 1;
    }
    out(`${id}/${variant} ${verb === "keep" ? "kept" : "rejected"}`, { asset: r.value });
    return 0;
  }

  const { openKernel } = await import("@gt/kernel/kernel");
  const { storeLocation } = await import("../lib/kernelProcess.ts");
  const { dryOnlyFrom } = await import("@gt/kernel/dryrun");
  const actor = { kind: "operator" as const, id: "mesh-cli" };
  const dryOnly = dryOnlyFrom(process.env);

  if (verb === "new" && id !== undefined && variant === undefined) {
    const cls = ASSET_CLASSES.find((c) => c === v.class);
    if (cls === undefined) return usage(`--class is one of ${ASSET_CLASSES.join(", ")}`);
    if (v.subject === undefined || v.concept === undefined) return usage("new needs --subject and --concept");
    const techniques = v.techniques?.split(",").map((t) => t.trim().toUpperCase());
    const unknown = techniques?.find((t) => !(TECHNIQUES as readonly string[]).includes(t));
    if (unknown !== undefined) return usage(`unknown technique ${unknown}; one of ${TECHNIQUES.join(", ")}`);
    const { newAsset } = await import("../lib/foundry/mesh/cli-acts.ts");
    const location = storeLocation();
    const k = openKernel(location);
    if (!k.ok) throw k.error;
    try {
      const r = await newAsset(k.value.store, location, {
        id,
        cls,
        subject: v.subject,
        concept: v.concept,
        ...(techniques === undefined ? {} : { techniques: techniques as (typeof TECHNIQUES)[number][] }),
        rig: v.rig === true,
        live: v.live === true,
        detach: v.detach === true,
        actor,
        dryOnly,
      });
      if (!r.ok) {
        out(`mesh: ${r.error.message}`, { error: r.error.message, code: r.error.code });
        return 1;
      }
      if (r.value.kind === "refused") {
        const g = r.value.gate;
        out(`mesh: the concept is refused (input gate ${g.verdict}); no asset was made and no job queued\n  ${[...g.fails, ...g.warns].join("\n  ")}`, { refused: true, gate: g });
        return 1;
      }
      const { asset, drove } = r.value;
      const lines = [describeAsset(asset), ...drove.map((d) => `${d.jobId}: ${d.outcome}${d.reason === undefined ? "" : ` - ${d.reason}`}`)];
      out(lines.join("\n"), { asset, drove, gate: r.value.gate });
      return asset.variants.some((x) => x.status === "failed") || drove.some((d) => d.outcome === "failed") ? 1 : 0;
    } finally {
      k.value.close();
    }
  }

  if (verb === "finish" && id !== undefined && variant === undefined) {
    const { retryFinish } = await import("../lib/foundry/mesh/cli-acts.ts");
    const location = storeLocation();
    const k = openKernel(location);
    if (!k.ok) throw k.error;
    try {
      const r = await retryFinish(k.value.store, location, { assetId: id, ...(v.variant === undefined ? {} : { variantId: v.variant }), live: v.live === true, detach: v.detach === true, actor, dryOnly });
      if (!r.ok) {
        out(`mesh: ${r.error.message}`, { error: r.error.message, code: r.error.code });
        return 1;
      }
      out([describeAsset(r.value.asset), ...r.value.drove.map((d) => `${d.jobId}: ${d.outcome}`)].join("\n"), r.value);
      return r.value.asset.variants.some((x) => x.status === "failed") ? 1 : 0;
    } finally {
      k.value.close();
    }
  }
  return usage();
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(`mesh: ${errorMessage(e)}`);
    process.exitCode = 1;
  },
);
