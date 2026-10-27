// THE RETRIEVAL HALF: the retrieval schema and the cross-check of a retrieval run's
// notebook against the pages it actually fetched. Split out of validate.ts so the
// door can stay a short file.

import type { Notebook } from "@/lib/notebook/types";
import type { SourceReceipt } from "@/lib/text/types";
import { NotebookError } from "./failure";
import { NOTEBOOK_SCHEMA } from "./schema";

/* ───────────────────────────── the retrieval half ────────────────────────── */
//
// research-run-engine-B. Everything above judges a notebook as an OBJECT. A
// retrieval run makes one more thing checkable without knowing anything about
// the world: whether the pages a notebook cites are pages this run actually
// fetched. The run's receipts (lib/text/types.ts::SourceReceipt) are built from
// the engine's own tool calls, not from its prose — so a cited URL with no
// receipt is a citation the engine RECALLED, which is exactly what the
// reasoning path's prompt already forbids from being `high`. This is that rule,
// enforced after the fact rather than requested before it.
//
// Nothing here runs on a reasoned notebook. The route calls it only for a run
// served by the retrieval rung, so with TEXT_RETRIEVE off nothing above changes.

/**
 * The schema a RETRIEVAL run is asked to satisfy: NOTEBOOK_SCHEMA with one field
 * more on each fact source — the `url` it was fetched at.
 *
 * A separate object, not an edit to NOTEBOOK_SCHEMA, because that schema is in
 * the reasoning path's prompt byte for byte, and with the flag off that prompt
 * may not move.
 */
export const RETRIEVE_NOTEBOOK_SCHEMA: Record<string, unknown> = (() => {
  const s = JSON.parse(JSON.stringify(NOTEBOOK_SCHEMA)) as {
    properties: { facts: { items: { properties: { sources: { items: { properties: Record<string, unknown> } } } } } };
  };
  s.properties.facts.items.properties.sources.items.properties.url = {
    type: "string",
    description:
      "the address you FETCHED this source at, in this run, exactly as fetched. A URL you only remember, or only saw in a search result list, is not fetched.",
  };
  return s as unknown as Record<string, unknown>;
})();

/** The same page is the same page: scheme, `www.`, case of the host, a
 *  trailing slash and a fragment do not make two. The query string does. */
export function sameAddress(url: string): string {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${u.port ? `:${u.port}` : ""}${path}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Every http(s) address a fact cites: a source's `url`, and any address
 *  written into its `locator`. */
function citedUrls(sources: readonly { url?: string; locator?: string }[] | undefined): string[] {
  const out: string[] = [];
  for (const s of sources ?? []) {
    if (typeof s.url === "string" && /^https?:\/\//i.test(s.url.trim())) out.push(s.url.trim());
    // A locator is prose, so the sentence's own punctuation after an address
    // ("…/report, p. 4", "…/report.") is not part of the page's path.
    if (typeof s.locator === "string")
      for (const m of s.locator.matchAll(/https?:\/\/[^\s)"'<>]+/gi)) out.push(m[0].replace(/[.,;:!?]+$/, ""));
  }
  return [...new Set(out)];
}

/** Does this gap say the search did not happen? Searching, not fetching, is
 *  the word required: "earlier seasons were not fetched" is a gap about scope,
 *  not the confession that no search ran. */
const NAMES_MISSING_SEARCH =
  /\b(no|not|never|without|zero|none)\b[^.;]{0,80}\b(search\w*|retriev\w*|looked[- ]?up|look-?up)\b|\b(search\w*|retriev\w*)\b[^.;]{0,40}\b(not|never|none)\b/i;

/**
 * Check a retrieval run's notebook against what the run actually fetched.
 *
 * Returns a NEW notebook — the input is the record of what the engine said, the
 * output is what this app will stand behind — and one finding per change:
 *
 *   · a `high` fact citing any URL that matches no receipt is downgraded to
 *     `medium`, its `confidenceNote` opens with "cited, not fetched", and the
 *     finding names the fact and the address. Not `low`: the claim may well be
 *     right; what it has lost is the claim to have been checked in this run.
 *   · ZERO receipts means the retrieval rung ran and fetched nothing. Then the
 *     route's own rule for a run without search applies unchanged —
 *     researchGaps[0] must say so — and a notebook that does not is REFUSED
 *     (NotebookError), exactly as a reasoned notebook missing its tension is.
 */
export function crossCheckRetrieval(
  nb: Notebook,
  receipts: readonly SourceReceipt[],
): { notebook: Notebook; findings: string[] } {
  if (receipts.length === 0) {
    const g0 = nb.researchGaps?.[0] ?? "";
    // Addressed like every shape finding, and carrying the answer as its draft:
    // the turn records a refusal's draft, and a bare string had no path to repair.
    if (!NAMES_MISSING_SEARCH.test(g0))
      throw new NotebookError(
        [
          {
            path: "researchGaps[0]",
            rule:
              `This run fetched nothing, so researchGaps[0] must say that no search was run (it reads: "${g0.slice(0, 120)}"). ` +
              `A notebook with no fetched source that does not say so reads as researched.`,
            observed: g0.slice(0, 120),
          },
        ],
        nb,
      );
  }

  const fetched = new Set(receipts.map((r) => sameAddress(r.url)));
  const findings: string[] = [];
  const facts = nb.facts.map((f, i) => {
    if (f.confidence !== "high") return f;
    const missing = citedUrls(f.sources).filter((u) => !fetched.has(sameAddress(u)));
    if (!missing.length) return f;
    findings.push(
      `facts[${i}] (${f.id}): cited, not fetched — ${missing.join(", ")} is not among this run's ${receipts.length} ` +
        `fetched source${receipts.length === 1 ? "" : "s"}; confidence high → medium.`,
    );
    return {
      ...f,
      confidence: "medium" as const,
      confidenceNote: `cited, not fetched: ${missing.join(", ")} was not fetched in this run.${f.confidenceNote ? ` ${f.confidenceNote}` : ""}`,
    };
  });
  return { notebook: { ...nb, facts }, findings };
}
