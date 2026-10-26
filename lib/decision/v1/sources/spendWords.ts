// THE SPEND CARD'S WORDS AND ITS FLOOR PILE (spark athena-control-mcp WP3), pure: what a day's spend
// requests say on the Board's cull and how they reach the Floor. No store, no vendor, no clock - the
// adapter (./spend.ts) reads, this module words what it read, so a test can hold the words alone.
//
// A REQUEST IS ITS WORDS. One row per request (`sr_...`) holding ONE words-only cell whose id IS the
// request id (./seeds.ts's shape): the row says what it makes, the cell says what it costs. The cell's
// label is the total - dollars as @gt/ui's receipt writes them (produce.ts costWords), or the unpriced
// reason verbatim - its meta the provider/model per receipt line, its two-line prompt the re-price
// (`filed $X · now $Y`, only when they differ) and who asked when (`agent:athena · <filedAt>`).
//
// THE PRICE IS READ TWICE (registry hitl-approval: what runs on approval is what was shown). The card
// shows the receipt re-priced at read time beside the one the agent filed; the price the operator pays
// at is the re-priced one, and the commit's digest (./spend.ts) holds it, so a price that moves between
// the preview and the commit refuses the commit rather than paying a figure nobody saw.

import type { MediaLane } from "@gt/domain/lane";
import type { SpendRequest, SpendSubject } from "@gt/domain/mcp";
import type { Receipt } from "@gt/domain/produce";
import type { Result } from "@gt/domain/errors";
import type { ItemWords, RowWords } from "@gt/ui/board/port";
import { costWords } from "@gt/ui/components/produce/produce.ts";

import { packetIdOf } from "../../../ledger/v1/packet.ts";
import type { WeirItem } from "../../../ledger/v1/types.ts";

/** A receipt as the card reads it now, and the project's own title when the subject is a project. */
export type Priced = { readonly receipt: Receipt; readonly title?: string };

/** One request on the card: as filed, and as it prices now (an error carries its sentence verbatim). */
export type SpendRow = { readonly req: SpendRequest; readonly now: Result<Priced> };

/** A run's first sentence, as the composer's text begins; the whole text when it has no stop. */
export function firstSentence(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  const m = /^(.+?[.!?])(\s|$)/.exec(t);
  return m?.[1] ?? t;
}

/** What the request makes: `<lane> · <first sentence>`, or the project's title (its id and revision when unread). */
export function whatOf(subject: SpendSubject, title?: string): string {
  if (subject.kind === "run") return `${subject.input.lane} · ${firstSentence(subject.input.text)}`;
  return title ?? `project ${subject.id} · rev ${subject.rev}`;
}

/** The unpriced lines' reasons, verbatim and each once. */
const unpricedReasons = (r: Receipt): string[] => [...new Set(r.lines.flatMap((l) => (l.usd === null && l.unpricedReason !== undefined ? [l.unpricedReason] : [])))];

/**
 * A receipt's total in words: the dollar figure or band, then every unpriced line's reason verbatim.
 * A receipt priced at nothing but unpriced lines is its reasons alone - a `$0` there would read as a
 * measurement (the Receipt's own rule, packages/ui/src/components/produce/Unpriced.tsx).
 */
export function totalWords(r: Receipt): string {
  const reasons = unpricedReasons(r);
  const t = r.totals;
  if (t.usd === 0 && t.usdRange === undefined && reasons.length > 0) return reasons.join(" · ");
  return [costWords({ usd: t.usd, ...(t.usdRange === undefined ? {} : { usdRange: t.usdRange }) }), ...reasons].join(" · ");
}

/** `provider/model` per receipt line, each pair once, in line order. */
export const linesWords = (r: Receipt): string => [...new Set(r.lines.map((l) => `${l.provider}/${l.model}`))].join(" · ");

/**
 * The stop point a K arms: the worst case the card showed (a band's top, else the figure). Absent
 * when it is no dollar at all - a ceiling is positive (@gt/domain/produce.schema ceilingUsdSchema),
 * and a credits line passes any ceiling anyway (kernel job-core `next`).
 */
export function shownUsd(r: Receipt): number | undefined {
  const usd = r.totals.usdRange?.[1] ?? r.totals.usd;
  return usd > 0 ? usd : undefined;
}

/** The receipt the card shows: the re-priced one, or the filed one when re-pricing failed. */
export const shownReceipt = (row: SpendRow): Receipt => (row.now.ok ? row.now.value.receipt : row.req.receipt);

/** The second prompt line's source: who asked, and when. */
const askedBy = (req: SpendRequest): string => `${req.actor.kind}:${req.actor.id} · ${req.filedAt}`;

/** `filed $X · now $Y` when the price moved, `filed $X · now: <why it could not be read>` when it could not be read. */
export function repriceWords(row: SpendRow): string | undefined {
  const filed = totalWords(row.req.receipt);
  if (!row.now.ok) return `filed ${filed} · now: ${row.now.error.message}`;
  const now = totalWords(row.now.value.receipt);
  return now === filed ? undefined : `filed ${filed} · now ${now}`;
}

export function rowWords(row: SpendRow): RowWords {
  return { id: row.req.id, label: whatOf(row.req.subject, row.now.ok ? row.now.value.title : undefined), group: "spend" };
}

export function itemWords(row: SpendRow): ItemWords {
  const shown = shownReceipt(row);
  const reprice = repriceWords(row);
  return { label: totalWords(shown), meta: linesWords(shown), prompt: [reprice, askedBy(row.req)].filter((x): x is string => x !== undefined).join("\n") };
}

/** What a K does, as the preview says it. */
export function keepWords(r: Receipt): string {
  const usd = shownUsd(r);
  return usd === undefined ? `launches live, unpriced: ${totalWords(r)}` : `launches live, stops at ${costWords({ usd })}`;
}

/** What an X does: the agent that asked reads the reasons back. */
export const rejectWords = (req: SpendRequest): string => `refused; ${req.actor.id} reads why`;

/** The text the cell's media digests: the request id, its subject and the filed receipt's token. */
export const cellBody = (req: SpendRequest): string => [req.id, req.day, JSON.stringify(req.subject), req.receipt.token].join("\n");

/* ── the Floor pile ────────────────────────────────────────────────────────── */

/**
 * The lane a day's pile is drawn in: the oldest run request's media lane. A project names no media
 * lane of its own (its receipt lines name resource lanes), so a day of project requests alone draws
 * in the image lane, as every other lane-less pile does (./seeds.ts, ./scout.ts).
 */
export function laneOf(reqs: readonly SpendRequest[]): MediaLane {
  const run = [...reqs].sort((a, b) => a.filedAt.localeCompare(b.filedAt)).find((r) => r.subject.kind === "run");
  return run?.subject.kind === "run" ? run.subject.input.lane : "image";
}

/**
 * One Floor pile per day with a request still `requested` (the caller hands those only), opening
 * `pkt:spend:<day>` by its bare day. Its age is the oldest pending request's, so the header's NEXT
 * (app/(studio)/_shell/facts.ts nextPile) reaches a day the operator has left waiting longest.
 */
export function spendPiles(requested: readonly SpendRequest[]): WeirItem[] {
  const byDay = new Map<string, SpendRequest[]>();
  for (const r of requested) if (r.state === "requested") byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
  return [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, reqs]): WeirItem => {
      const since = reqs.map((r) => r.filedAt).sort()[0];
      const packetId = packetIdOf("spend", day);
      return { source: "spend", id: day, title: `spend ${day}`, media: laneOf(reqs), kind: "cull", ...(since === undefined ? {} : { since }), decided: 0, pending: reqs.length, href: `/board/${packetId}`, packetId };
    });
}
