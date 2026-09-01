// EXTRACT STYLES FROM A FOLDER — the local driver over lib/foundry/extract.
//
//   npx tsx pipeline/foundry/extract.mts "C:/path/to/gallery" --slug my-gallery
//   npx tsx pipeline/foundry/extract.mts "C:/path/to/gallery" --slug my-gallery --dry
//   npx tsx pipeline/foundry/extract.mts --resume <run-id> [--force]
//   npx tsx pipeline/foundry/extract.mts --status <run-id>
//   npx tsx pipeline/foundry/extract.mts --commit <run-id> --keep a,b [--reject c]
//
// Options on a new run: --rounds 2 --replicas 2 --transfers 1 --target 0.85
// --max 40 (cap on the number of images taken from the folder, in name order).
//
// This is the SAME engine the /foundry Extract tab drives from the browser:
// the same store, the same units, the same files under foundry-out/extract/.
// The only difference is who calls step() — here a loop in this process,
// there a fetch loop in a page. A run started here shows up in the app to be
// culled, and a run started in the app can be resumed here.
//
// WHAT IT SPENDS. Every source costs one recognition; every style costs up
// to replicas × rounds + transfers generations, each read back once. The
// imaging budget window (IMAGING_BUDGET_USD_PER_WINDOW, default $5/hour)
// applies exactly as it does in the app — an over-budget refusal stops the
// loop with the sentence the router wrote, and --resume continues once the
// window has moved.
//
// NOT A TEST and not in `npm run verify` — it talks to live vendors.

import fs from "node:fs";
import path from "node:path";

/** Load .env then .env.local, without clobbering anything already exported.
 *  Next does this for the app; a bare tsx process gets nothing. */
function loadEnv(root: string) {
  for (const f of [".env", ".env.local"]) {
    const at = path.join(root, f);
    if (!fs.existsSync(at)) continue;
    for (const line of fs.readFileSync(at, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (v && process.env[k] === undefined) process.env[k] = v;
    }
  }
}

const ROOT = path.resolve(import.meta.dirname, "..", "..");
loadEnv(ROOT);
// The store resolves everything from process.cwd(); make that the repo root
// wherever the command was typed.
process.chdir(ROOT);

const { createRun, getExtractRun, liveIO, commitExtractRun, MAX_SOURCE_BYTES, MAX_SOURCES } = await import("../../lib/foundry/extract/store");
const { runToEnd, totalUnits, foreignLease, pruneFailures, hasFailures } = await import("../../lib/foundry/extract/engine");
const { TRANSFER_SCENES } = await import("../../lib/foundry/extract/prompts");
type ExtractManifest = import("../../lib/foundry/extract/types").ExtractManifest;
type ExtractUpload = import("../../lib/foundry/extract/types").ExtractUpload;

/* ── args ─────────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => argv.includes(`--${name}`);
const num = (name: string, d: number) => {
  const v = flag(name);
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
};
const positional = argv.filter((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1].startsWith("--") || ["dry", "help"].includes(argv[i - 1].slice(2))));

const usage = () => {
  console.log(
    [
      "usage:",
      '  npx tsx pipeline/foundry/extract.mts "<folder>" --slug <slug> [--rounds 2] [--replicas 2] [--transfers 1] [--target 0.85] [--max 40] [--singletons] [--dry]',
      "      --singletons: no grouping — every image is its own style, its recipe written by the eye with the image in view",
      "  npx tsx pipeline/foundry/extract.mts --resume <run-id>       # continue; a failed run is pruned and retried",
      "  npx tsx pipeline/foundry/extract.mts --retry <run-id>        # a done run with failed units: take them again",
      "  npx tsx pipeline/foundry/extract.mts --status <run-id>",
      "  npx tsx pipeline/foundry/extract.mts --commit <run-id> --keep a,b [--reject c]",
    ].join("\n"),
  );
};

/* ── the folder → uploads ─────────────────────────────────────────────────── */

const MIME: Record<string, ExtractUpload["mime"]> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

function readFolder(folder: string, max: number): { uploads: ExtractUpload[]; skipped: string[] } {
  const abs = path.resolve(folder);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error(`Not a folder: ${abs}`);
  const names = fs
    .readdirSync(abs)
    .filter((n) => MIME[path.extname(n).toLowerCase()])
    .sort((a, b) => a.localeCompare(b));
  const uploads: ExtractUpload[] = [];
  const skipped: string[] = [];
  for (const n of names) {
    if (uploads.length >= Math.min(max, MAX_SOURCES)) {
      skipped.push(`${n} (over --max ${max})`);
      continue;
    }
    const bytes = fs.readFileSync(path.join(abs, n));
    if (bytes.length > MAX_SOURCE_BYTES) {
      skipped.push(`${n} (${(bytes.length / 1024 / 1024).toFixed(1)} MB, over the ${MAX_SOURCE_BYTES / 1024 / 1024} MB cap)`);
      continue;
    }
    uploads.push({ name: n, mime: MIME[path.extname(n).toLowerCase()], base64: bytes.toString("base64") });
  }
  return { uploads, skipped };
}

/* ── reporting ────────────────────────────────────────────────────────────── */

const pct = (x: number | null | undefined) => (typeof x === "number" ? `${Math.round(100 * x)}%`.padStart(4) : "   —");

function summary(m: ExtractManifest): string {
  const rows: string[] = [];
  rows.push(`run ${m.id} · ${m.status} · ${m.sources.length} source(s), ${m.styles.length} style(s)`);
  const failed = m.sources.filter((s) => s.error);
  if (failed.length) rows.push(`  unread sources: ${failed.map((s) => `${s.id} (${s.error})`).join("; ")}`);
  if (m.engines.vision || m.engines.generator || m.engines.reasoner)
    rows.push(`  engines: eyes ${m.engines.vision ?? "—"} · pixels ${m.engines.generator ?? "—"} · words ${m.engines.reasoner ?? "—"}`);
  rows.push("");
  rows.push("  style                          n  by         replica  transfer  text  recipe tries");
  for (const st of m.styles) {
    let best: number | null = null;
    let text = false;
    for (const r of st.replicas)
      for (const x of r.rounds) {
        if (typeof x.score === "number" && (best === null || x.score > best)) best = x.score;
        if (x.critique?.has_text) text = true;
      }
    const tr = st.transfers.map((t) => t.score).filter((x): x is number => typeof x === "number");
    const trm = tr.length ? tr.reduce((a, b) => a + b, 0) / tr.length : null;
    if (st.transfers.some((t) => t.readback?.has_text)) text = true;
    rows.push(
      `  ${st.id.padEnd(30)} ${String(st.members.length).padStart(2)}  ${st.grouped_by.padEnd(10)} ${pct(best)}     ${pct(trm)}     ${text ? "TEXT" : "    "}  ${st.recipe_history.length}`,
    );
  }
  rows.push("");
  rows.push(`  files: foundry-out/extract/${m.id}/`);
  if (m.status === "failed") rows.push(`  failed: ${m.error ?? ""}\n  retry with: npx tsx pipeline/foundry/extract.mts --resume ${m.id}`);
  if (m.status === "done") rows.push(`  cull: open /foundry → Extract → ${m.id}, or --commit ${m.id} --keep <ids>`);
  return rows.join("\n");
}

/* ── the modes ────────────────────────────────────────────────────────────── */

async function drive(id: string, retry = false) {
  const { run } = await getExtractRun(id);
  // A failed run is retried by --resume without further ceremony: the breaker
  // stopped it so the cause could be fixed, and resuming IS the claim that it
  // was. A done run with failures needs --retry, because "done" was a verdict.
  if (run.status === "failed" || (retry && run.status === "done")) {
    if (!hasFailures(run) && run.status !== "failed") {
      console.log(summary(run));
      return;
    }
    const n = pruneFailures(run);
    await liveIO(id, "cli").save(run);
    console.log(`pruned ${n} failed unit(s); ${run.status}`);
  }
  if (run.status === "done" || run.status === "committed" || run.status === "failed") {
    console.log(summary(run));
    if (run.status === "done" && hasFailures(run)) console.log("  (this run has failed units; --retry <run-id> takes them again)");
    return;
  }
  const other = foreignLease(run, "cli", Date.now());
  if (other && !has("force")) {
    console.error(`${id} is being driven by the ${other.owner} (stamped ${other.at}). Wait, or pass --force to take it over.`);
    process.exitCode = 1;
    return;
  }
  const io = liveIO(id, "cli");
  const t0 = Date.now();
  console.log(`driving ${id}: ${run.progress.done}/${totalUnits(run)} units done`);
  try {
    await runToEnd(run, io, (r) => {
      const el = Math.round((Date.now() - t0) / 1000);
      console.log(`  [${String(r.progress.done).padStart(3)}/${r.progress.total}] ${el}s  ${r.unit}`);
    });
  } catch (e) {
    console.error(`\nstopped: ${e instanceof Error ? e.message : String(e)}`);
    console.error(`resume with: npx tsx pipeline/foundry/extract.mts --resume ${id}`);
    process.exitCode = 1;
  }
  const after = await getExtractRun(id);
  console.log("\n" + summary(after.run));
}

async function main() {
  if (has("help") || (!argv.length)) return usage();

  if (has("status")) {
    const { run } = await getExtractRun(flag("status")!);
    console.log(summary(run));
    return;
  }
  if (has("resume")) return drive(flag("resume")!);
  if (has("retry")) return drive(flag("retry")!, true);

  if (has("commit")) {
    const id = flag("commit")!;
    const keep = (flag("keep") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const reject = (flag("reject") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!keep.length) throw new Error("--commit needs --keep <style-id,...>");
    const at = new Date().toISOString();
    const verdicts = Object.fromEntries([...keep.map((k) => [k, { verdict: "keep" as const, at }]), ...reject.map((k) => [k, { verdict: "reject" as const, at }])]);
    const r = await commitExtractRun(id, verdicts);
    console.log(`committed ${id}: written ${r.written.join(", ")}; rejected ${r.rejected.join(", ") || "none"} → pipeline/foundry/styles.json`);
    return;
  }

  const folder = positional[0];
  const slug = flag("slug");
  if (!folder || !slug) {
    usage();
    throw new Error("a folder and --slug are required");
  }
  const options = {
    rounds: num("rounds", 2),
    replicas: num("replicas", 2),
    transfers: num("transfers", 1),
    target: num("target", 0.85),
    ...(has("singletons") ? { grouping: "none" as const } : {}),
  };
  const { uploads, skipped } = readFolder(folder, num("max", 40));
  if (!uploads.length) throw new Error("no PNG/JPEG/WebP files in that folder");
  console.log(`${uploads.length} image(s) from ${path.resolve(folder)}${skipped.length ? `; skipped ${skipped.length}: ${skipped.join(", ")}` : ""}`);

  if (has("dry")) {
    // The unit count at the WORST case: every source its own style.
    const worstStyles = uploads.length;
    const perStyle = options.replicas * options.rounds + Math.min(options.transfers, TRANSFER_SCENES.length);
    const gens = worstStyles * perStyle;
    console.log(
      [
        `dry run — nothing is created.`,
        `  reads: ${uploads.length} recognitions`,
        `  per style: up to ${options.replicas}×${options.rounds} replica rounds + ${options.transfers} transfer(s) = ${perStyle} generations, each read back once`,
        `  worst case (${worstStyles} styles): ${gens} generations ≈ $${(gens * 0.045).toFixed(2)} at the measured 1K Nano Banana rate; a gallery that groups into ~6 styles is ≈ $${(6 * perStyle * 0.045).toFixed(2)}`,
        `  the imaging budget window is ${process.env.IMAGING_BUDGET_USD_PER_WINDOW || "5"} USD per ${process.env.IMAGING_BUDGET_WINDOW_MS ? `${Number(process.env.IMAGING_BUDGET_WINDOW_MS) / 60000} min` : "hour"}`,
        `  keys: GOOGLE_AI_API_KEY ${process.env.GOOGLE_AI_API_KEY ? "set" : "MISSING (pixels + hosted eyes)"} · QWEN_API_KEY ${process.env.QWEN_API_KEY ? "set (dev eyes)" : "unset"}`,
      ].join("\n"),
    );
    return;
  }

  const run = await createRun(slug, uploads, options);
  console.log(`created ${run.id}`);
  await drive(run.id);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
