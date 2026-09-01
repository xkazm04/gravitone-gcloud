// DOJO PAIR RUNNER, GOOGLE STACK — A/B duos through the imaging router.
//
//   npx tsx pipeline/foundry/dojo-pairs-nb.mts foundry-out/training/<cycle-id>
//
// One of the two PURE STACKS (operator, 2026-09-01): a cycle runs entirely
// local (Flux/Wan/H3 pixels, ollama eyes, $0) or entirely Google (Nano
// Banana pixels, Gemini eyes, billed) — never mixed, so a verdict is about
// the stack it names. This is the Google half: generation AND readback
// through the router with an explicit `prefer: "google"` steer, so the local
// eye never touches a Google-stack cycle and every call keeps the app's
// budget metering, provenance and reroute trail.
//
// NO SEED-MATCHING, BY MEASURED NECESSITY: Google's interactions API rejects
// `seed` outright (providers/google.ts, measured 2026-08-27). The control is
// REPEATS instead — `repeats` candidates per arm in one call, judged as
// distributions, never as one roll against another. gen-spec.json:
//   {"aspect": "16:9", "repeats": 3,
//    "pairs": [{"id": "...", "baseline": {"prompt": "..."}, "challenger": {"prompt": "..."}}]}
//
// Resumable per arm: an arm with all its PNGs on disk is not re-billed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
for (const f of [".env.local", ".env"])
  for (const line of fs.readFileSync(path.join(ROOT, f), "utf8").split("\n"))
    if (line.includes("=") && !line.trim().startsWith("#")) {
      const [k, ...v] = line.split("=");
      process.env[k.trim()] ??= v.join("=").trim();
    }

const { generate, recognize } = await import("../../lib/imaging/router");
const { READBACK_SCHEMA } = await import("../../lib/foundry/extract/vocabulary");
const { readbackInstruction } = await import("../../lib/foundry/extract/prompts");

const cdir = path.resolve(ROOT, process.argv[2]);
const spec = JSON.parse(fs.readFileSync(path.join(cdir, "gen-spec.json"), "utf8"));
const pairsDir = path.join(cdir, "pairs");
fs.mkdirSync(pairsDir, { recursive: true });
const rbPath = path.join(cdir, "readbacks.json");
const readbacks: Record<string, unknown> = fs.existsSync(rbPath)
  ? JSON.parse(fs.readFileSync(rbPath, "utf8"))
  : {};

const repeats: number = spec.repeats ?? 3;
const arms = ["baseline", "challenger"] as const;
console.log(`dojo-pairs-nb: ${spec.pairs.length} duo(s) x ${repeats} repeat(s) x 2 arms via the imaging router`);

for (const p of spec.pairs) {
  for (const arm of arms) {
    const have = Array.from({ length: repeats }, (_, i) => path.join(pairsDir, `${p.id}--${arm}--r${i + 1}.png`));
    if (!have.every((f) => fs.existsSync(f))) {
      const out = await generate({
        prompt: p[arm].prompt,
        aspect: (spec.aspect ?? "16:9") as "16:9",
        count: repeats,
        prefer: "google",
      });
      out.images.forEach((img, i) => fs.writeFileSync(have[i], Buffer.from(img.base64, "base64")));
      console.log(`  ${p.id}--${arm}: ${out.images.length} image(s) via ${out.provenance.provider}/${out.provenance.model}` +
        (out.provenance.costUsd !== undefined ? ` $${out.provenance.costUsd.toFixed(4)}` : ""));
    }
    for (let i = 1; i <= repeats; i++) {
      const key = `${p.id}--${arm}--r${i}`;
      if (readbacks[key]) continue;
      const png = fs.readFileSync(path.join(pairsDir, `${p.id}--${arm}--r${i}.png`));
      const r = await recognize({
        image: { base64: png.toString("base64"), mime: "image/png" },
        instruction: readbackInstruction(),
        schema: READBACK_SCHEMA as Record<string, unknown>,
        prefer: "google",
      });
      readbacks[key] = { style: { readback: r.json }, eye: `${r.provenance.provider}/${r.provenance.model}` };
      fs.writeFileSync(rbPath, JSON.stringify(readbacks, null, 1));
      console.log(`  readback ${key} via ${r.provenance.provider} ($${(r.provenance.costUsd ?? 0).toFixed(4)})`);
    }
  }
}
console.log(`dojo-pairs-nb: done — ${Object.keys(readbacks).length} readback(s)`);
