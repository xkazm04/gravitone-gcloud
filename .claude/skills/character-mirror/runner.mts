// Draws queue.jsonl items on local Flux 2 (ComfyUI) one at a time until the deadline, appending done.jsonl. Items may carry
// refs (file paths, at most 3) and late (0..1, where the references join the denoise).
// usage: npx tsx .claude/skills/character-mirror/runner.mts <outDir> <deadline ISO>
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { drawFlux } from "../../../lib/imaging/local/flux2.ts";

const [out, deadlineIso] = process.argv.slice(2);
const deadline = Date.parse(deadlineIso);
mkdirSync(join(out, "img"), { recursive: true });
const q = join(out, "queue.jsonl"), done = join(out, "done.jsonl");
const lines = (f: string) => (existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
// Per-item guidance/steps: patch the graph on its way to /prompt (drawFlux fixes guidance 4, steps 20).
const tuned = (g?: number, steps?: number) => async (url: string, init?: RequestInit) => {
  if ((g !== undefined || steps !== undefined) && url.endsWith("/prompt") && typeof init?.body === "string") {
    const body = JSON.parse(init.body);
    for (const n of Object.values(body.prompt) as { class_type: string; inputs: Record<string, unknown> }[]) {
      if (n.class_type === "FluxGuidance" && g !== undefined) n.inputs.guidance = g;
      if (n.class_type === "Flux2Scheduler" && steps !== undefined) n.inputs.steps = steps;
    }
    init = { ...init, body: JSON.stringify(body) };
  }
  return fetch(url, init);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

while (Date.now() < deadline) {
  const finished = new Set(lines(done).map((d) => d.id));
  const next = lines(q).find((i) => !finished.has(i.id));
  if (next === undefined) { await sleep(15_000); continue; }
  const t = Date.now();
  try {
    const refs = (next.refs ?? []).map((p: string) => new Uint8Array(readFileSync(p)));
    const s = await drawFlux({ prompt: next.prompt, aspect: next.aspect ?? "9:16", ...(next.seed === undefined ? {} : { seed: next.seed }), ...(refs.length ? { refs, late: next.late ?? 0 } : {}) }, { fetch: tuned(next.guidance, next.steps) });
    const file = `img/${next.id}.png`;
    writeFileSync(join(out, file), s.png);
    appendFileSync(done, JSON.stringify({ ...next, seed: s.seed, file, wallMs: s.wallMs, at: new Date().toISOString() }) + "\n");
    console.log(`${new Date().toISOString()} ${next.id} ${Math.round((Date.now() - t) / 1000)}s`);
  } catch (e) {
    appendFileSync(done, JSON.stringify({ ...next, error: e instanceof Error ? e.message : String(e), at: new Date().toISOString() }) + "\n");
    console.log(`${new Date().toISOString()} ${next.id} FAILED ${e instanceof Error ? e.message : e}`);
    await sleep(20_000);
  }
}
console.log("deadline reached");
