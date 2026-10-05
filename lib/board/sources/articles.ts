// ARTICLES — a drafted post at the human gate, one item per run.
//
// Read through the /api/articles routes (app/articles/articlesClient.ts, the
// same seam /articles uses): GET /api/articles for the list, GET
// /api/articles/<id> for each run still at the gate (its check, its patches,
// its screenshot). A run that has not reached the gate is not an item; one the
// human decided stays an item with its verdict, read off its status
// (lib/board/verdicts.ts fromArticle).
//
// WHAT THE BOARD CANNOT DECIDE, IT REFUSES BY NAME:
//   · approve, when the run proposes registry patches. Approval is per post AND
//     per patch, and the Board has one key; approving the post alone would
//     decline patches nobody looked at. Those runs are approved on their page.
//   · reject with neither a reason nor a note. The engine requires a note;
//     reasons ride in it the way the cull's do (encodeNote).
//   · clear, always. Approval pushes a branch and opens a PR; rejection is
//     terminal. Neither has an inverse to undo into.
//
// Approve from here is the real act: POST /approve, which starts the landing.

import { approveRun, getRun, listRuns, rejectRun, runFileUrl, type Fetched, type RunDetail } from "@/app/articles/articlesClient";
import { CHECK_DIMENSIONS, type ArticleRun } from "@/lib/articles/types";

import type { BoardEntry, BoardSourceExt } from "../source";
import { itemId, itemsOf, keyOfItem, SourceUnavailable, VerdictRefused } from "../source";
import type { BoardMedia, BoardVerdict } from "../types";
import { encodeNote, fromArticle } from "../verdicts";

export const ARTICLE_CLEAR_REFUSAL = "an article verdict is final: approval opens a registry PR, rejection ends the run";
export const ARTICLE_DECIDED_REFUSAL = "this run is already decided";
export const articlePatchRefusal = (n: number) => `${n} registry patch${n === 1 ? "" : "es"} — approve per patch on the run's page`;
export const ARTICLE_NOTE_REFUSAL = "a rejection needs a reason or a note";

function must<T>(r: Fetched<T>): T {
  if (r.ok) return r.data;
  if (r.kind === "unavailable") throw new SourceUnavailable("/api/articles is not built here");
  if (r.status === 0 || r.status === 401 || r.status === 403) throw new SourceUnavailable(r.error);
  throw new Error(r.error);
}

const usd = (run: ArticleRun): string | null => {
  const priced = run.steps.filter((s) => s.costUsd !== undefined);
  return priced.length ? `$${priced.reduce((a, s) => a + (s.costUsd ?? 0), 0).toFixed(2)}` : null;
};

/** One run as a Board entry. `detail` is present for a run at the gate. */
export function articleEntry(run: ArticleRun, detail: RunDetail | null): BoardEntry | null {
  const verdict = fromArticle(run);
  if (verdict === undefined) return null;
  const media: BoardMedia[] = [];
  const shot = detail?.check?.screenshots.find((s) => /1440\.png$/.test(s)) ?? detail?.check?.screenshots[0];
  if (shot) media.push({ kind: "image", src: runFileUrl(run.id, shot) });
  const words = detail?.meta?.subtitle || run.rejection?.note || run.topic.angle || run.topic.text;
  media.push({ kind: "text", text: words });

  const items = detail?.check?.items ?? [];
  const fails = items.filter((i) => i.status === "fail").length;
  // storytelling and depth are never measured by code; they are listed, not itemised
  const unmeasured = items.filter((i) => i.status === "not-measured").length + (detail?.check?.notMeasured.length ?? 0);
  const patches = detail?.patches.length ?? 0;
  const cost = usd(run);

  return {
    item: {
      id: itemId("articles", run.id),
      source: "articles",
      title: detail?.meta?.title ?? run.topic.text,
      projectId: null,
      group: run.topic.kind === "subject" && run.topic.bundle ? run.topic.bundle : null,
      media,
      machinePick: detail?.check ? `check: ${fails} fail · ${unmeasured} not measured · ${items.filter((i) => i.status === "pass").length} pass` : null,
      verdict,
      reasons: [],
      note: run.rejection?.note ?? null,
      createdAt: run.createdAt,
    },
    href: `/articles/${encodeURIComponent(run.id)}`,
    facts: [
      { name: "status", value: run.status },
      { name: "model", value: run.model },
      ...(run.topic.kind === "subject" && run.topic.bundle && run.topic.subject ? [{ name: "subject", value: `${run.topic.bundle}/${run.topic.subject}` }] : []),
      ...(detail ? [{ name: "sources", value: String(detail.sources.length) }, { name: "patches", value: String(patches) }] : []),
      ...(cost ? [{ name: "cost", value: cost }] : []),
    ],
    refuse: {
      clear: ARTICLE_CLEAR_REFUSAL,
      ...(verdict !== null ? { approve: ARTICLE_DECIDED_REFUSAL, reject: ARTICLE_DECIDED_REFUSAL } : patches > 0 ? { approve: articlePatchRefusal(patches) } : {}),
    },
  };
}

export function makeArticlesSource(): BoardSourceExt {
  const loadEntries = async (): Promise<BoardEntry[]> => {
    const { runs } = must(await listRuns());
    const atGate = runs.filter((r) => fromArticle(r) !== undefined);
    const details = await Promise.all(atGate.map(async (r) => (r.status === "awaiting-approval" ? must(await getRun(r.id)) : null)));
    return atGate.map((r, i) => articleEntry(r, details[i])).filter((e): e is BoardEntry => e !== null);
  };
  return {
    id: "articles",
    label: "Articles",
    // The owner's seven quality dimensions (lib/articles/types.ts): what a
    // rejected post fell short on, in the words its check report uses.
    reasonAxes: [...CHECK_DIMENSIONS],
    native: { href: "/articles", label: "Articles" },
    exclusive: false,
    commitsOn: null,
    async count() {
      const { runs } = must(await listRuns());
      let total = 0;
      let pending = 0;
      let rejected = 0;
      for (const r of runs) {
        const v = fromArticle(r);
        if (v === undefined) continue;
        total++;
        if (v === null) pending++;
        else if (v === "reject") rejected++;
      }
      return { total, pending, decided: total - pending, rejected };
    },
    loadEntries,
    load: () => itemsOf(loadEntries()),
    async decide(id: string, verdict: BoardVerdict, reasons: string[] = [], note?: string) {
      const runId = keyOfItem(id);
      if (verdict === null) throw new VerdictRefused(ARTICLE_CLEAR_REFUSAL);
      // Read fresh: the run may have been decided on its page since the Board loaded.
      const detail = must(await getRun(runId));
      if (fromArticle(detail.run) !== null) throw new VerdictRefused(ARTICLE_DECIDED_REFUSAL);
      if (verdict === "approve") {
        if (detail.patches.length) throw new VerdictRefused(articlePatchRefusal(detail.patches.length));
        must(await approveRun(runId, []));
        return;
      }
      const written = encodeNote(reasons, note ?? null);
      if (!written) throw new VerdictRefused(ARTICLE_NOTE_REFUSAL);
      must(await rejectRun(runId, written));
    },
  };
}
