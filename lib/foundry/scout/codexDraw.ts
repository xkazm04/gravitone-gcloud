// A STORYBOARD PANEL DRAWN BY CODEX (idea loop, stage 3), on the operator's subscription.
//
// A panel succeeds only when a decodable, non-blank PNG exists for its own thread. Anything else throws, which the
// caller records as a failed panel: there is no second image path here and nothing retries.
//
// WHY NOT THROUGH THE STORYBOARD JOB. A kernel job is claimable: with the worker up, the job could be picked up and
// drawn by the worker's bound engine, which is Flux, and the job books FLUX_MODEL on every panel whatever drew it. A
// Codex storyboard is therefore drawn in this process with no job, which also means `--detach` is refused.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { StoryboardDraw } from "../../producers/scoutStoryboardActs.ts";
import { withPanel, panelFile } from "../../producers/scoutStoryboardActs.ts";
import type { ActContext } from "./acts";
import { settledCodexBoard } from "./codexOwner";
import { imagesOf, inspectPng, notAPicture, runCodex } from "./codexExec";
import { mutateNight, readNight, resolveInNight, withCandidate } from "./store";
import type { CandidateId, NightId, StoryboardCandidate } from "./types";

export function codexDrawPrompt(prompt: string, aspect: string): string {
  return [
    "Generate exactly one image with your built-in image generation tool (image_gen). Do not write code, do not run a shell command, and do not use any script or API.",
    `Aspect ratio ${aspect}. A rough storyboard frame: ${prompt}`,
    "When the tool has returned, reply with the single word DONE.",
  ].join("\n");
}

/** Codex has no seed to set or report, so every panel records 0. */
export const codexDraw = (o: { readonly base?: NodeJS.ProcessEnv; readonly timeoutS?: number } = {}): StoryboardDraw => async (prompt, ask) => {
  if ((ask.refs?.length ?? 0) > 0) throw new Error("codex draw takes no reference image");
  const run = await runCodex(codexDrawPrompt(prompt, ask.aspect), { ...(o.base === undefined ? {} : { base: o.base }), ...(o.timeoutS === undefined ? {} : { timeoutS: o.timeoutS }) });
  if (run.exit !== 0) throw new Error(`codex exited ${String(run.exit)}: ${run.stderr.trim().slice(-300)}`);
  if (run.thread === undefined) throw new Error("codex named no thread; nowhere to look for the image");
  const file = imagesOf(run.env, run.thread)[0];
  if (file === undefined) throw new Error(`codex exited 0 with no image: ${(run.lastMessage ?? "no message").slice(0, 300)}`);
  const png = await readFile(file);
  const why = notAPicture(inspectPng(png));
  if (why !== undefined) throw new Error(why);
  return { png: new Uint8Array(png), seed: 0 };
};

async function fileBoard(id: NightId, cid: CandidateId, fn: (c: StoryboardCandidate) => StoryboardCandidate): Promise<void> {
  await mutateNight(id, (n) => {
    const c = n.candidates.find((x): x is StoryboardCandidate => x.id === cid && x.kind === "storyboard");
    return c === undefined ? n : withCandidate(n, fn(c));
  });
}

/**
 * Draw every panel of `made` in order, in this process. A panel that fails is recorded as failed and the others carry
 * on; a storyboard with any frame is `rendered` and the failures stay in its `error`, as on the job path. Returns
 * "done", or "failed" when some storyboard drew nothing.
 */
export async function drawInProcess(ctx: Pick<ActContext, "say">, id: NightId, made: readonly StoryboardCandidate[], draw: StoryboardDraw): Promise<"done" | "failed"> {
  let outcome: "done" | "failed" = "done";
  for (const c of made) {
    const of = c.panels.length;
    const aspect = c.aspect === "9:16" ? "9:16" : "16:9";
    for (const [i, prompt] of c.panels.entries()) {
      const k = i + 1;
      try {
        const got = await draw(prompt, { aspect });
        const rel = panelFile(c.id, k);
        const abs = resolveInNight(id, rel);
        await mkdir(path.dirname(abs), { recursive: true });
        await writeFile(abs, got.png);
        await fileBoard(id, c.id, (b) => withPanel(b, of, k, rel, got.seed));
        ctx.say(`  ${c.id} panel ${k}/${of}: drawn by codex`);
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        await fileBoard(id, c.id, (b) => withPanel(b, of, k, null, 0, why));
        ctx.say(`  ${c.id} panel ${k}/${of}: failed: ${why}`);
      }
    }
    await fileBoard(id, c.id, (b) => settledCodexBoard(b, "done", `codex:${id}/${c.id}`));
    const now = (await readNight(id)).candidates.find((x) => x.id === c.id);
    if (now?.status === "failed") outcome = "failed";
  }
  return outcome;
}
