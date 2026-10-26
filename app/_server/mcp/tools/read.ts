import { z } from "zod";

import { ACTOR_KINDS } from "@gt/domain/event";
import { err, ok, type Result } from "@gt/domain/errors";
import { jobStateSchema } from "@gt/domain/job";
import { LIBRARY_KINDS, LIBRARY_SORTS } from "@gt/domain/library";
import { packetMachine } from "@gt/domain/packet.machine";
import { eventsAfter } from "@gt/kernel/events-query";

import { parseParams, type Params } from "../../../(studio)/ledger/_ledger/filter.ts";
import { readPage } from "../../../(studio)/ledger/_ledger/read.ts";
import { defineOp, READS, wrap, type McpToolSpec, type Obj } from "../op.ts";

// gt_read - what the studio holds, read through the same ports its screens read: the projects and
// their plans, the Runs queue and its holds, the Board's packets, the Library, the Ledger. Every
// listing is bounded; a cut listing says `truncated: true` and how to ask for the next page
// (budgeted-partial-response). A thing a screen shows carries its `view`, the path that screen
// opens it at.

const id = z.string().min(1).max(400);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a day is YYYY-MM-DD");
const none = z.object({}).strict();

const JOBS_MAX = 100;
const PACKETS_MAX = 100;
const LIBRARY_MAX = 50;
const LEDGER_MAX = 200;
const AFTER_MAX = 200;

/** The `t,seq` keyset cursor the Ledger and /api/ledger page by. */
const cursorText = z.string().regex(/^[^,]+,\d+$/, "a ledger cursor is <iso>,<seq>");

function cursorOf(text: string): Result<{ t: string; seq: number }> {
  const at = text.lastIndexOf(",");
  const t = text.slice(0, at);
  const seq = Number(text.slice(at + 1));
  return Number.isNaN(Date.parse(t)) || !Number.isSafeInteger(seq) || seq < 1 ? err("invalid", `ledger: cursor "${text}" is not <iso>,<seq>`) : ok({ t, seq });
}

export const READ_OPS: readonly McpToolSpec[] = [
  defineOp({
    family: "read",
    op: "projects",
    title: "Projects",
    description: "Every listed project: id, title, recipe, state, revision and its plan's totals. Open one with plan{id}.",
    input: none,
    annotations: READS,
    writes: false,
    run: (_a, { deps }) => {
      const r = deps.produce().listProjects();
      return r.ok ? ok({ ...r.value, projects: r.value.projects.map((p) => ({ ...p, view: `/projects/${p.id}` })) }) : r;
    },
  }),
  defineOp({
    family: "read",
    op: "plan",
    title: "Project plan",
    description: "One project's plan at its current revision: parts, options, units, schedule, estimates and gates. `rev` is what set_part, rename, discard and plan_launch carry back.",
    input: z.object({ id }).strict(),
    annotations: READS,
    writes: false,
    run: ({ id: pid }, { deps }) => wrap(deps.produce().loadPlan({ id: pid }), "plan", { view: `/projects/${pid}` }),
  }),
  defineOp({
    family: "read",
    op: "jobs",
    title: "Jobs",
    description: "The Runs queue: each job's lane, state, mode (dry|live), attempt, stage, queue place and price, newest plan first. Filter by project or state; at most 100 per page.",
    input: z.object({ project: id.optional(), state: jobStateSchema.optional(), offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(JOBS_MAX).optional() }).strict(),
    annotations: READS,
    writes: false,
    run: ({ project, state, offset = 0, limit = 50 }, { deps }) => {
      const r = deps.produce().listJobs();
      if (!r.ok) return r;
      const all = r.value.filter((j) => (project === undefined || j.projectId === project) && (state === undefined || j.state === state));
      const jobs = all.slice(offset, offset + limit).map((j) => ({ ...j, view: `/projects/runs?job=${encodeURIComponent(j.id)}` }));
      const more = offset + jobs.length < all.length;
      return ok({ jobs, total: all.length, truncated: more, ...(more ? { next: { offset: offset + jobs.length } } : {}) });
    },
  }),
  defineOp({
    family: "read",
    op: "holds",
    title: "Held lanes",
    description: "Lanes a crash holds for one job, with the job and stage; a held lane's jobs wait until the operator acknowledges it.",
    input: none,
    annotations: READS,
    writes: false,
    run: (_a, { deps }) => wrap(deps.produce().listHolds(), "holds", { view: "/projects/runs" }),
  }),
  defineOp({
    family: "read",
    op: "packets",
    title: "Board packets",
    description: "Board packets awaiting or past a verdict: source, lane, mode, state, items and how many are decided. Filter by state (open|committed|returned).",
    input: z.object({ state: z.enum(packetMachine.states).optional(), limit: z.number().int().min(1).max(PACKETS_MAX).optional() }).strict(),
    annotations: READS,
    writes: false,
    run: async ({ state, limit = 50 }, { deps }) => {
      const r = await (await deps.board()).listPackets();
      if (!r.ok) return r;
      const all = r.value.packets.filter((p) => state === undefined || p.state === state);
      const packets = all.slice(0, limit).map((p) => ({ ...p, view: `/board/${p.id}` }));
      return ok({ packets, truncated: r.value.truncated || all.length > packets.length });
    },
  }),
  defineOp({
    family: "read",
    op: "packet",
    title: "Board packet",
    description: "One Board packet: its items, each candidate's decision and reasons, the reason vocabulary, and what a commit would apply.",
    input: z.object({ id }).strict(),
    annotations: READS,
    writes: false,
    run: async ({ id: pid }, { deps }) => wrap(await (await deps.board()).loadPacket({ id: pid }), "packet", { view: `/board/${pid}` }),
  }),
  defineOp({
    family: "read",
    op: "library",
    title: "Library",
    description: "Library items (images, plates, styles, motion, audio, video, docs, models) matching kind, words or key:value tokens, sorted newest|name|kind; at most 50 per page from `offset`.",
    input: z.object({ kind: z.enum(LIBRARY_KINDS).optional(), q: z.string().max(400).optional(), sort: z.enum(LIBRARY_SORTS).optional(), offset: z.number().int().nonnegative().max(10_000_000).optional(), limit: z.number().int().min(1).max(LIBRARY_MAX).optional() }).strict(),
    annotations: READS,
    writes: false,
    run: async ({ limit = 24, ...q }, { deps }) => {
      const r = (await deps.library()).query({ ...q, limit });
      if (!r.ok) return r;
      const offset = q.offset ?? 0;
      const more = offset + r.value.items.length < r.value.total;
      const items = r.value.items.map((i): Obj => ({ ...i, view: `/library?sel=${encodeURIComponent(i.id)}` }));
      return ok({ ...r.value, items, ...(more ? { next: { offset: offset + r.value.items.length } } : {}) });
    },
  }),
  defineOp({
    family: "read",
    op: "library_item",
    title: "Library item",
    description: "One Library item in full: its face, provenance, lineage, rights and what it can be used in.",
    input: z.object({ id }).strict(),
    annotations: READS,
    writes: false,
    run: async ({ id: iid }, { deps }) => wrap((await deps.library()).detail(iid, {}), "item", { view: `/library?sel=${encodeURIComponent(iid)}` }),
  }),
  defineOp({
    family: "read",
    op: "ledger",
    title: "Ledger",
    description: "Ledger events newest first, filtered as the Ledger page filters: words, actor kind, type, project, from/to day. At most 200 per page; `next.cursor` continues.",
    input: z
      .object({
        q: z.string().max(400).optional(),
        actor: z.enum(ACTOR_KINDS).optional(),
        type: z.string().max(400).optional(),
        project: z.string().max(400).optional(),
        from: day.optional(),
        to: day.optional(),
        cursor: cursorText.optional(),
        limit: z.number().int().min(1).max(LEDGER_MAX).optional(),
      })
      .strict(),
    annotations: READS,
    writes: false,
    run: ({ cursor, limit = 100, ...params }, { deps }) => {
      const s = deps.store();
      if (!s.ok) return s;
      const at = cursor === undefined ? undefined : cursorOf(cursor);
      if (at !== undefined && !at.ok) return at;
      const page = readPage(s.value, parseParams(params satisfies Params), at?.value);
      if (!page.ok) return page;
      const shown = page.value.events.slice(0, limit);
      const cut = shown.length < page.value.events.length;
      const last = shown.at(-1);
      const next = cut && last !== undefined ? { t: last.occurredAt ?? last.at, seq: last.seq } : page.value.cursor;
      const truncated = cut || page.value.capped;
      return ok({
        events: shown.map((e) => ({ ...e, view: `/ledger?ev=${e.seq}` })),
        truncated,
        ...(truncated && next !== undefined ? { next: { cursor: `${next.t},${next.seq}` } } : {}),
      });
    },
  }),
  defineOp({
    family: "read",
    op: "events_after",
    title: "Events after",
    description: "Every ledger event after seq `after`, oldest first, at most 200: poll with the last seq seen to follow jobs (job.progress, job.done, job.failed) without missing one.",
    input: z.object({ after: z.number().int().nonnegative(), limit: z.number().int().min(1).max(AFTER_MAX).optional() }).strict(),
    annotations: READS,
    writes: false,
    run: ({ after, limit = 100 }, { deps }) => {
      const s = deps.store();
      if (!s.ok) return s;
      const page = eventsAfter(s.value, after, limit);
      if (!page.ok) return page;
      const last = page.value.events.at(-1);
      return ok({ events: page.value.events, head: page.value.head, truncated: page.value.capped, next: { after: last?.seq ?? after } });
    },
  }),
  defineOp({
    family: "read",
    op: "composer_choices",
    title: "Floor composer choices",
    description: "What each Floor composer may be given: image styles (candidate, proven) and sweep size, article topics with their bundles, video subjects. composer_receipt and composer_run take these values.",
    input: none,
    annotations: READS,
    writes: false,
    run: (_a, { deps }) => wrap(deps.produce().composerChoices(), "choices", { view: "/floor" }),
  }),
  defineOp({
    family: "read",
    op: "compose_choices",
    title: "Compose choices",
    description: "What a new project may be composed from: recipes, styles, kept music takes, registry topics, and the take no project uses yet. compose takes these values.",
    input: none,
    annotations: READS,
    writes: false,
    run: (_a, { deps }) => wrap(deps.produce().composeChoices(), "choices", { view: "/projects" }),
  }),
];
