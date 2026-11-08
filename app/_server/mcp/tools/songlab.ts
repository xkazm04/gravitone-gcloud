import { z } from "zod";

import { AB_SOURCES, YUE2_POST_STAGES, YUE2_RECIPE } from "@gt/domain/audio.yue2";
import { LAB_MAX } from "@gt/domain/audio.yue2.lab";
import { labRuleSchema } from "@gt/domain/audio.yue2.lab.schema";
import { YUE2_SEEDS_MAX } from "@gt/domain/audio.yue2.jobs.schema";
import { yue2ConditionSchema } from "@gt/domain/audio.yue2.schema";
import { ok, type Result } from "@gt/domain/errors";

import type { Yue2Launch } from "../../../../lib/producers/yue2Jobs.ts";
import { defineOp, READS, WRITES, type McpToolSpec, type Obj, type ToolCtx } from "../op.ts";

// THE SONG LAB ON THE AGENT DOOR (spark yue2-song-lab WP3, S2): `gt_songlab` with six ops, or one tool each
// (`gt_songlab_launch`, `gt_songlab_takes`, `gt_songlab_queue_pairs`, `gt_songlab_post`, and S2's
// `gt_songlab_inbox` / `gt_songlab_turn`, the lab's relay: lib/yue2/labRelay.ts). The lab runs
// YuE2 on this machine's card in WSL for $0; a launch enqueues work on gpu.local and answers its job id
// and a $0 receipt - the worker renders it. The ops are the same lib functions the Server Actions call
// (app/(studio)/audio/_songlab/acts.ts), with `origin: "agent"` and the token's actor.
//
// NO VOTE. A blind pair's verdict is the owner's (the design brief): there is no op that records one,
// and queue_pairs answers pair ids and job ids only - never which take plays as A.
// NO KEEP, NO DROP. The agent proposes in a turn; only the owner keeps or removes a proposal
// (lib/yue2/proposals.ts through the song lab's Server Actions), and a keep is what runs the act.
//
// Its own family, not rows in read/launch: those families' tool descriptions (lead + op names) are at
// the 240-character limit (../projection.ts), and these four names would not fit.

const VIEW = "/audio?s=songlab";
const takeId = z.string().trim().min(1).max(80);
const c = yue2ConditionSchema.shape;
const labSession = z.string().regex(/^[a-z0-9][a-z0-9-]{2,47}$/);
const labTurnId = z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/);
/** The newest turns whose proposals the inbox lists with their keep/remove state. */
const RECENT_TURNS = 3;

const store = (ctx: ToolCtx) => ctx.deps.store();
const launched = (r: Result<Yue2Launch>): Result<Obj> => (r.ok ? ok({ jobId: r.value.jobId, receipt: r.value.receipt, view: VIEW }) : r);

export const SONGLAB_OPS: readonly McpToolSpec[] = [
  defineOp({
    family: "songlab",
    op: "launch",
    title: "Render a song batch",
    description: `Render YuE2 takes from style + lyrics on this machine, $0: one take per seed, each then scored. Defaults are the measured recipe (cot ${YUE2_RECIPE.cot}, cfg ${YUE2_RECIPE.cfg}, ${YUE2_RECIPE.seeds} seeds). Answers the job id and receipt.`,
    input: z
      .object({
        style: z.string().trim().min(1).max(1000),
        lyrics: z.string().trim().min(1).max(12000),
        seeds: z.array(c.seed).min(1).max(YUE2_SEEDS_MAX).optional(),
        cot: c.cot.optional(),
        cfg: c.cfg,
        adapter: c.adapter,
        adapterStrength: c.adapterStrength,
      })
      .strict(),
    annotations: WRITES,
    writes: true,
    run: async ({ seeds, cot, cfg, ...rest }, ctx) => {
      const s = store(ctx);
      if (!s.ok) return s;
      const { launchRender } = await import("../../../../lib/producers/yue2Jobs.ts");
      const recipeSeeds = Array.from({ length: YUE2_RECIPE.seeds }, (_, n) => n + 1);
      return launched(launchRender(s.value, { ...rest, seeds: seeds ?? recipeSeeds, cot: cot ?? YUE2_RECIPE.cot, cfg: cfg ?? YUE2_RECIPE.cfg, origin: "agent" }, { actor: ctx.agent.actor }));
    },
  }),
  defineOp({
    family: "songlab",
    op: "takes",
    title: "Song lab takes",
    description: "The newest YuE2 takes: condition, style, lyrics digest, lineage, href and newest scores (wer, werSd, SongEval, aesthetics, buzz; absent = not scored), with the lyric gate and the CC BY-NC rights line.",
    input: z.object({ limit: z.number().int().min(1).max(200).optional() }).strict(),
    annotations: READS,
    writes: false,
    run: async ({ limit }, ctx) => {
      const s = store(ctx);
      if (!s.ok) return s;
      const { labTakes, RIGHTS_LINE } = await import("../../../../lib/yue2/lab.ts");
      const r = await labTakes(s.value, limit ?? 50);
      if (!r.ok) return r;
      return ok({
        rights: RIGHTS_LINE,
        gate: { metric: "wer", max: YUE2_RECIPE.gateWer },
        takes: r.value.map((t) => {
          const { lyrics: _lyrics, ...facts } = t.facts;
          return { ...t, facts, ...(t.scores?.wer === undefined ? {} : { gated: t.scores.wer <= YUE2_RECIPE.gateWer }) };
        }),
        view: VIEW,
      });
    },
  }),
  defineOp({
    family: "songlab",
    op: "queue_pairs",
    title: "Queue blind pairs",
    description: "Queue blind A/B pairs of one source (post-variant, best-of-n, across-conditions) for the owner and cut both arms' loudness-matched windows. Answers pair and job ids only; the owner votes, never an agent.",
    input: z.object({ source: z.enum(AB_SOURCES), limit: z.number().int().min(1).max(20).optional() }).strict(),
    annotations: WRITES,
    writes: true,
    run: async ({ source, limit }, ctx) => {
      const s = store(ctx);
      if (!s.ok) return s;
      const { queueBlindPairs } = await import("../../../../lib/yue2/lab.ts");
      const r = await queueBlindPairs(s.value, source, limit ?? 4, ctx.agent.actor);
      return r.ok ? ok({ pairs: r.value, view: VIEW }) : r;
    },
  }),
  defineOp({
    family: "songlab",
    op: "post",
    title: "Post-chain a take",
    description: "Post-chain a YuE2 take on this machine, $0: stages in order stems, debuzz, master (master matches referenceTakeId when given, then -14 LUFS / -1 dBTP). A new take, parent the source, then scored.",
    input: z.object({ takeId, stages: z.array(z.enum(YUE2_POST_STAGES)).min(1).max(YUE2_POST_STAGES.length), referenceTakeId: takeId.optional() }).strict(),
    annotations: WRITES,
    writes: true,
    run: async (args, ctx) => {
      const s = store(ctx);
      if (!s.ok) return s;
      const { launchPost } = await import("../../../../lib/producers/yue2Jobs.ts");
      return launched(launchPost(s.value, { ...args, op: "chain", origin: "agent" }, { actor: ctx.agent.actor }));
    },
  }),
  defineOp({
    family: "songlab",
    op: "draw",
    title: "Draw a knockout",
    description: "Draw a knockout over the lyric-gate passers (field main) or one raw take's post variants (post:<takeId>), seeded by rules (only, exclude, seed-by, size; default SongEval, 8 or 16), and book its first round.",
    input: z.object({ field: z.string().regex(/^(main|post:[A-Za-z0-9_-]{1,80})$/).optional(), rules: z.array(labRuleSchema).max(12).optional() }).strict(),
    annotations: WRITES,
    writes: true,
    run: async (a, ctx) => {
      const s = store(ctx);
      if (!s.ok) return s;
      const { drawFor } = await import("../../../../lib/yue2/draw.ts");
      const field = (a.field ?? "main") as "main" | `post:${string}`;
      const d = await drawFor(s.value, field, a.rules ?? [], ctx.agent.actor);
      return d.ok ? ok({ drawId: d.value.drawId, version: d.value.version, size: d.value.size, entrants: d.value.entrants.length, view: VIEW }) : d;
    },
  }),
  defineOp({
    family: "songlab",
    op: "inbox",
    title: "Song lab inbox (long-poll)",
    description: "Wait up to waitS (0..25) s for the owner's song-lab directions newer than after (none given: the unanswered ones). Answers says, next (pass it back), the session's recent proposals with kept/dropped, and the draws.",
    input: z.object({ session: labSession.optional(), after: z.string().regex(/^\d{1,15}$/).optional(), waitS: z.number().int().min(0).max(25).optional() }).strict(),
    annotations: READS,
    writes: false,
    run: async (a, ctx) => {
      const s = store(ctx);
      if (!s.ok) return s;
      const { labInbox, labThread } = await import("../../../../lib/yue2/labRelay.ts");
      const { decisions } = await import("../../../../lib/yue2/proposals.ts");
      const { draws } = await import("../../../../lib/yue2/draw.ts");
      const r = await labInbox(s.value, a);
      if (!r.ok) return r;
      const thread = labThread(s.value, a.session ?? r.value.says.at(-1)?.session);
      const decided = decisions(s.value);
      const state = decided.ok ? decided.value : {};
      const proposals = thread.ok
        ? thread.value.turns.slice(-RECENT_TURNS).flatMap((t) => t.proposals.map((p) => ({ turnId: t.turnId, id: p.id, kind: p.kind, label: p.label, ...(state[p.id] === undefined ? {} : { state: state[p.id] }) })))
        : [];
      const d = draws(s.value);
      return ok({
        says: r.value.says,
        ...(r.value.next === undefined ? {} : { next: r.value.next }),
        ...(thread.ok ? { session: thread.value.session } : {}),
        proposals,
        ...(decided.ok ? {} : { decisionsNote: `keeps and removals could not be read: ${decided.error.message}` }),
        ...(d.ok ? { draws: d.value.map((x) => ({ drawId: x.drawId, version: x.version, field: x.field, size: x.size, entrants: x.entrants.length, rules: x.rules })) } : { drawsNote: `the draws could not be read: ${d.error.message}` }),
        view: VIEW,
      });
    },
  }),
  defineOp({
    family: "songlab",
    op: "turn",
    title: "Answer in the song lab",
    description: "Answer the owner in the song lab: one line, ran, learned and up to 3 proposals (rule, launch or post) the owner keeps or removes. answers = the say's turnId. Bad proposals are dropped and named. check:true appends nothing.",
    input: z
      .object({
        session: labSession,
        turnId: labTurnId.optional(),
        answers: labTurnId.optional(),
        line: z.string().trim().min(1).max(LAB_MAX.line),
        ran: z.array(z.string()).max(LAB_MAX.ran).optional(),
        learned: z.array(z.string()).max(LAB_MAX.learned).optional(),
        proposals: z.array(z.unknown()).max(LAB_MAX.proposals).optional(),
        check: z.boolean().optional(),
      })
      .strict(),
    annotations: WRITES,
    writes: true,
    run: async ({ check, ...turn }, ctx) => {
      const s = store(ctx);
      if (!s.ok) return s;
      const { appendLabTurn } = await import("../../../../lib/yue2/labRelay.ts");
      const r = appendLabTurn(s.value, turn, ctx.agent.actor, check);
      if (!r.ok) return r;
      const t = r.value.turn;
      return ok({ session: t.session, turnId: t.turnId, proposed: t.proposals.map((p) => p.id), dropped: r.value.dropped, ...(check === true ? { checked: true, appended: false } : { appended: true }), view: VIEW });
    },
  }),
];
