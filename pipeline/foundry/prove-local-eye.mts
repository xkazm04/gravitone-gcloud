// One recognition through the chokepoint, proving the local eye leads.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").concat(fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")))
  if (line.includes("=") && !line.trim().startsWith("#")) {
    const [k, ...v] = line.split("=");
    process.env[k.trim()] ??= v.join("=").trim();
  }
const { recognize } = await import("../../lib/imaging/router");
const img = fs.readFileSync(path.join(ROOT, "pipeline/vlm-probe/frames/spiderverse-atsv-0031.jpg"));
const out = await recognize({
  image: { base64: img.toString("base64"), mime: "image/jpeg" },
  instruction: "Read this frame for a style library.",
  schema: { type: "object", properties: { palette_strategy: { type: "string" }, look: { type: "string" } }, required: ["palette_strategy", "look"] },
});
console.log("provider:", out.provenance.provider, "| model:", out.provenance.model,
  "| costUsd:", out.provenance.costUsd, "| basis:", out.provenance.costBasis,
  "| ms:", out.provenance.durationMs);
console.log("json:", JSON.stringify(out.json).slice(0, 200));
