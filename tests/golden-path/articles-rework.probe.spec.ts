// LANE — THE REWORK EDGE AND THE LANDING CLOCK (lib/articles/engine.ts `reworkRun`,
// `landedAt`; lib/articles/store.ts TRANSITIONS).
//
// Offline: the writer and all four reviewers are tests/fixtures/articles/stub-agent.mjs,
// reached through a tee wrapper that records every prompt the stub RECEIVED (its stdin) and the
// entries of its inputs/ directory, so "the note reaches the draft turn" is read off what the
// agent got, not off the file the engine says it sent. Nothing spends; no live run.
//
// What is pinned:
//   · `landedAt` is absent on a run that has not landed (the key is not in run.json) and is
//     written by the landing, once
//   · awaiting-approval -> drafting exists, `rejected` stays terminal, nothing else moved
//   · reworkRun refuses a run not at the gate, an empty note and a note of 2001 characters
//   · a rework keeps research, sources and outline (research runs once), re-does draft,
//     critique and check, hands the draft turn the note under its own heading and the old
//     post as inputs/previous-post, and counts: a second rework says 2
//   · the old critique, check and step records are moved, not lost
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { approveRun, createRun, defaultDeps, driveRun, rejectRun, reworkRun, reworkSection, NOTE_MAX_CHARS } from "@/lib/articles/engine";
import { ArticleError, canTransition, readRun, runDir, TRANSITIONS } from "@/lib/articles/store";
import { ARTICLE_STATUSES, type ArticleRun } from "@/lib/articles/types";

import { keepEnv } from "./_helpers";
import { ARTICLE_ENV, STUB_AGENT, articleSandbox, type ArticleSandbox } from "./_articles";

keepEnv(ARTICLE_ENV);
test.describe.configure({ timeout: 180_000 });

let box: ArticleSandbox;
test.beforeEach(() => {
  box = articleSandbox();
});
test.afterEach(() => box.cleanup());

const deps = () => defaultDeps({ render: false });

/** Point the writer at a wrapper that logs what the stub received, then runs the stub. */
function teeWriter(): string {
  const log = path.join(box.dir, "received.jsonl");
  const wrapper = path.join(box.dir, "tee-agent.mjs");
  writeFileSync(
    wrapper,
    [
      'import fs from "node:fs";',
      'import { spawnSync } from "node:child_process";',
      "const chunks = [];",
      "for await (const c of process.stdin) chunks.push(c);",
      'const prompt = Buffer.concat(chunks).toString("utf8");',
      'const inputs = fs.existsSync("inputs") ? fs.readdirSync("inputs").sort() : [];',
      'const phase = /ARTICLE-PHASE:\\s*([\\w-]+)/.exec(prompt)?.[1] ?? "review";',
      `fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ phase, inputs, prompt }) + "\\n");`,
      `const r = spawnSync(process.execPath, [${JSON.stringify(STUB_AGENT)}, ...process.argv.slice(2)], { input: prompt, encoding: "utf8", env: process.env });`,
      "process.stdout.write(r.stdout ?? \"\");",
      "process.stderr.write(r.stderr ?? \"\");",
      "process.exit(r.status ?? 1);",
    ].join("\n"),
  );
  process.env.ARTICLES_AGENT_BIN = `node|${wrapper}`;
  return log;
}

const received = (log: string) =>
  existsSync(log)
    ? readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as { phase: string; inputs: string[]; prompt: string })
    : [];

async function toGate(text = "the token tax"): Promise<ArticleRun> {
  const run = await createRun({ topic: { kind: "free", text } }, deps());
  const done = await driveRun(run.id, deps());
  expect(done.status, done.error).toBe("awaiting-approval");
  return done;
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "resolved";
  } catch (e) {
    return e instanceof ArticleError ? `${e.status}:${e.code}` : `other:${(e as Error).message}`;
  }
};

test("landedAt: absent until the landing, written by it", async () => {
  process.env.STUB_GH_LOG = path.join(box.dir, "gh.log");
  const run = await toGate();
  expect("landedAt" in run).toBe(false);
  expect(readFileSync(path.join(runDir(run.id), "run.json"), "utf8")).not.toContain("landedAt");
  const approved = await approveRun(run.id, []);
  expect("landedAt" in approved, "approval is not landing").toBe(false);
  const before = Date.now();
  const landed = await driveRun(run.id, deps());
  expect(landed.status, landed.error).toBe("landed");
  expect(typeof landed.landedAt).toBe("string");
  expect(new Date(landed.landedAt!).toISOString()).toBe(landed.landedAt);
  expect(Date.parse(landed.landedAt!)).toBeGreaterThanOrEqual(before - 1000);
  expect((await readRun(run.id)).landedAt).toBe(landed.landedAt);
});

test("the transition table: awaiting-approval gains drafting; rejected and landed stay terminal", () => {
  expect([...TRANSITIONS["awaiting-approval"]]).toEqual(["approved", "rejected", "drafting"]);
  expect(TRANSITIONS.rejected).toEqual([]);
  expect(TRANSITIONS.landed).toEqual([]);
  // drafting is reachable from the gate only through the rework edge; no other state gained it
  const into = ARTICLE_STATUSES.filter((s) => s !== "drafting" && TRANSITIONS[s].includes("drafting"));
  expect(into.sort()).toEqual(["awaiting-approval", "failed", "researching"]);
  expect(canTransition("rejected", "drafting")).toBe(false);
});

test("reworkRun refuses a run not at the gate, an empty note and a note over 2000 characters", async () => {
  const run = await toGate();
  expect(await code(reworkRun(run.id, ""))).toBe("400:bad-note");
  expect(await code(reworkRun(run.id, "   \n  "))).toBe("400:bad-note");
  expect(await code(reworkRun(run.id, "x".repeat(NOTE_MAX_CHARS + 1)))).toBe("400:bad-note");
  // the refusals changed nothing
  const still = await readRun(run.id);
  expect(still.status).toBe("awaiting-approval");
  expect(still.rework).toBeUndefined();

  // not at the gate: a queued run, and a rejected one (terminal, and it stays so)
  const queued = await createRun({ topic: { kind: "free", text: "not yet driven" } }, deps());
  expect(await code(reworkRun(queued.id, "write it again"))).toBe("409:bad-transition");
  await rejectRun(run.id, "Thin.");
  expect(await code(reworkRun(run.id, "write it again"))).toBe("409:bad-transition");
  expect((await readRun(run.id)).status).toBe("rejected");
});

test("a rework keeps the research and the outline, re-does draft, critique and check, and the note reaches the draft turn", async () => {
  const log = teeWriter();
  const run = await toGate();
  const dir = runDir(run.id);
  const sources = readFileSync(path.join(dir, "sources.json"), "utf8");
  const outline = readFileSync(path.join(dir, "outline.md"), "utf8");
  expect(existsSync(path.join(dir, "critique", "round-1", "closed.json"))).toBe(true);
  expect(existsSync(path.join(dir, "check.json"))).toBe(true);
  const firstDraft = received(log).filter((r) => r.phase === "draft");
  expect(firstDraft).toHaveLength(1);
  expect(firstDraft[0].prompt).not.toContain("REWORK");
  expect(firstDraft[0].inputs).not.toContain("previous-post");

  const note = "The opening is a chronicle. Open on the one invoice that surprised us and cut the second section.";
  const sent = await reworkRun(run.id, `  ${note}  `, deps());
  expect(sent.status).toBe("drafting");
  expect(sent.rework).toMatchObject({ note, count: 1 });
  expect(Number.isNaN(Date.parse(sent.rework!.at))).toBe(false);
  expect(sent.steps.map((s) => s.name)).toEqual(["research", "outline"]);
  expect(sent.critique).toBeUndefined();
  // moved, not deleted
  expect(existsSync(path.join(dir, "critique", "round-1"))).toBe(false);
  expect(existsSync(path.join(dir, "critique", "reviewers.json")), "the panel snapshot stays").toBe(true);
  expect(existsSync(path.join(dir, "check.json"))).toBe(false);
  expect(existsSync(path.join(dir, "rework", "1", "before", "critique", "round-1", "closed.json"))).toBe(true);
  expect(existsSync(path.join(dir, "rework", "1", "before", "check.json"))).toBe(true);
  expect(existsSync(path.join(dir, "rework", "1", "before", "post", "index.html"))).toBe(true);
  const oldSteps = JSON.parse(readFileSync(path.join(dir, "rework", "1", "before", "steps.json"), "utf8")) as { name: string }[];
  expect(oldSteps.map((s) => s.name)).toEqual(["research", "outline", "draft", "critique", "check"]);
  // the old post is still there for a rework that fails halfway
  expect(existsSync(path.join(dir, "post", "index.html"))).toBe(true);

  const done = await driveRun(run.id, deps());
  expect(done.status, done.error).toBe("awaiting-approval");
  expect(done.steps.map((s) => `${s.name}:${s.status}`)).toEqual(["research:done", "outline:done", "draft:done", "critique:done", "check:done"]);
  expect(readFileSync(path.join(dir, "sources.json"), "utf8")).toBe(sources);
  expect(readFileSync(path.join(dir, "outline.md"), "utf8")).toBe(outline);
  expect(existsSync(path.join(dir, "critique", "round-1", "closed.json")), "the critique ran again").toBe(true);
  expect(existsSync(path.join(dir, "check.json")), "the check ran again").toBe(true);

  const seen = received(log);
  const phases = (p: string) => seen.filter((r) => r.phase === p);
  expect(phases("research"), "research is not re-run").toHaveLength(1);
  expect(phases("outline"), "the outline is not re-run").toHaveLength(1);
  const drafts = phases("draft");
  expect(drafts).toHaveLength(2);
  // what the stub RECEIVED on the second draft turn
  expect(drafts[1].prompt).toContain("REWORK 1 OF THIS DRAFT: THE OPERATOR'S INSTRUCTION");
  expect(drafts[1].prompt).toContain(note);
  // the standing brief is carried over whole and the instruction follows it under its own heading
  expect(drafts[1].prompt.startsWith(drafts[0].prompt.trimEnd())).toBe(true);
  expect(drafts[1].inputs).toContain("previous-post");
  // the critique's reviewers and writer ran a second time
  expect(phases("critique").length).toBeGreaterThanOrEqual(2);
  // no other turn was handed the note
  for (const r of seen) if (r.phase !== "draft") expect(r.prompt, r.phase).not.toContain(note);
  expect(readFileSync(path.join(dir, "agent", "draft-prompt.md"), "utf8")).toContain(note);

  // a second rework counts, and replaces the note
  const again = await reworkRun(run.id, "Shorter. The closing table is doing too much.", deps());
  expect(again.rework).toMatchObject({ note: "Shorter. The closing table is doing too much.", count: 2 });
  expect(existsSync(path.join(dir, "rework", "2", "before", "steps.json"))).toBe(true);
  const second = await driveRun(run.id, deps());
  expect(second.status, second.error).toBe("awaiting-approval");
  expect(received(log).filter((r) => r.phase === "draft")).toHaveLength(3);
  expect(received(log).filter((r) => r.phase === "research")).toHaveLength(1);
});

test("a rejected run cannot be reworked: reject throws the piece away", async () => {
  const run = await toGate();
  await rejectRun(run.id, "Wrong angle.");
  expect(await code(reworkRun(run.id, "try again"))).toBe("409:bad-transition");
  expect((await readRun(run.id)).rework).toBeUndefined();
});

test("reworkSection names the instruction apart from the standing brief", () => {
  const s = reworkSection({ at: "2026-10-07T00:00:00.000Z", note: "Cut the second section.", count: 3 });
  expect(s).toContain("REWORK 3 OF THIS DRAFT");
  expect(s).toContain('"""\nCut the second section.\n"""');
  expect(s).toContain("inputs/previous-post/");
});
