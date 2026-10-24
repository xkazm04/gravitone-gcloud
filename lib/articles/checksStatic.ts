// THE CHECK, STATIC ITEMS — the items measured from the post's files, with no browser.
//
// Split out of checks.ts (the door) for the 200-line limit. staticItems is kept
// whole: it is one function that pushes its items in order into one list, and
// this move changes no code. Its banners group the items (structure, figures,
// voice, medium fidelity, truth). StaticInput is the one input it takes.

import path from "node:path";

import { THRESHOLDS } from "./checks";
import { absent, item } from "./checksItems";
import { citedNumbers, decode, firstPersonHits, htmlProse, ISO_DATE, mdProse, postWords, STATED_READ_TIME, wordCount } from "./checksText";
import { closingListItemWords, proseRuns, proseStats, skimSpine, sourceListProblems, wordsBeforeFirstSection } from "./checksProse";
import type { CheckItem, Claim, Source } from "./types";

/* ── the static items ──────────────────────────────────────────────────────── */

export interface StaticInput {
  html?: string;
  md?: string;
  sources: Source[];
  claims: Claim[];
  /** post/figures/* — name and SVG text. */
  figures: { name: string; svg: string }[];
  /** Every file under post/, post-relative with forward slashes. */
  postFiles: Set<string>;
}

export function staticItems(input: StaticInput): CheckItem[] {
  const { html, md, sources, claims, figures, postFiles } = input;
  const items: CheckItem[] = [];
  const nums = new Set(sources.map((s) => s.n));

  // ── structure
  if (html) {
    const at = html.search(/data-role=["']content-preview["']/i);
    const firstH2 = html.search(/<h2\b/i);
    if (at < 0) items.push(item("structure", "content-preview", "Content preview present", false, { value: "none", expected: 'an element with data-role="content-preview" before the first <h2>' }));
    else {
      const block = html.slice(at, firstH2 > at ? firstH2 : at + 6000);
      const readTime = STATED_READ_TIME.exec(htmlProse(`<x ${block}`));
      const entries = (block.match(/<li\b/gi) ?? []).length;
      const problems = [
        ...(firstH2 >= 0 && at > firstH2 ? ["it comes after the first <h2>"] : []),
        ...(readTime ? [`it states a read time ("${readTime[0]}"); the platform shows its own`] : []),
        ...(entries >= 3 ? [] : [`lists ${entries} sections (≥ 3)`]),
      ];
      items.push(item("structure", "content-preview", "Content preview present", !problems.length, { value: problems.length ? "incomplete" : `${entries} sections`, expected: "before the first <h2>, ≥ 3 sections, no stated read time", ...(problems.length ? { detail: problems } : {}) }));
    }
  } else items.push(absent("structure", "content-preview", "Content preview present", "post/index.html is missing"));

  if (html || md) {
    const hay = `${html ? htmlProse(html) : ""}\n${md ? mdProse(md, { dropSources: true }) : ""}`;
    const hits = [...new Set([...hay.matchAll(new RegExp(STATED_READ_TIME.source, "gi"))].map((m) => m[0]))];
    items.push(item("structure", "read-time", "No stated reading time", !hits.length, { value: hits.length, expected: "0 (the platform shows its own read time)", ...(hits.length ? { detail: hits.slice(0, 6) } : {}) }));
  }

  const corpus = `${html ? htmlProse(html) : ""}\n${md ?? ""}`;
  const placeholders = [...corpus.matchAll(/lorem ipsum|\[(?:insert|placeholder|tbd|todo)[^\]]*\]|\bTODO\b|\bTBD\b/gi)].map((m) => m[0]);
  items.push(item("structure", "no-placeholders", "No placeholders", !placeholders.length, { value: placeholders.length, expected: "0", ...(placeholders.length ? { detail: [...new Set(placeholders)].slice(0, 10) } : {}) }));

  // ── figures
  if (html) {
    const blocks = [...html.matchAll(/<figure\b[\s\S]*?<\/figure>/gi)].map((m) => m[0]);
    items.push(item("figures", "figure-count", "Figures", blocks.length >= THRESHOLDS.minFigures, { value: blocks.length, expected: `≥ ${THRESHOLDS.minFigures}` }));
    const uncaptioned: string[] = [];
    const unsourced: string[] = [];
    const missingFiles: string[] = [];
    blocks.forEach((b, i) => {
      const cap = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(b);
      const capText = cap ? htmlProse(cap[1]) : "";
      if (!capText) uncaptioned.push(`figure ${i + 1}`);
      else {
        const cited = citedNumbers(capText);
        if (!cited.length || cited.some((n) => !nums.has(n))) unsourced.push(`figure ${i + 1}: ${capText.slice(0, 80)}`);
      }
      for (const m of b.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
        const src = m[1];
        if (/^[a-z]+:/i.test(src) || !postFiles.has(path.posix.normalize(src.replace(/^\.\//, "")))) missingFiles.push(src);
      }
    });
    items.push(item("figures", "figure-captions", "Every figure captioned", !uncaptioned.length && blocks.length > 0, { value: `${blocks.length - uncaptioned.length}/${blocks.length}`, expected: "all", ...(uncaptioned.length ? { detail: uncaptioned } : {}) }));
    items.push(item("figures", "figure-caption-sources", "Captions name their sources", !unsourced.length && blocks.length > 0, { value: `${blocks.length - unsourced.length}/${blocks.length}`, expected: "every caption cites a source that exists", ...(unsourced.length ? { detail: unsourced } : {}) }));
    items.push(item("figures", "figure-files", "Figure images resolve inside the post", !missingFiles.length, { value: missingFiles.length, expected: "0 missing", ...(missingFiles.length ? { detail: missingFiles } : {}) }));
  } else items.push(absent("figures", "figure-count", "Figures", "post/index.html is missing"));

  if (figures.length) {
    let worst = 0;
    const long: string[] = [];
    for (const f of figures) {
      for (const m of f.svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)) {
        const words = wordCount(decode(m[1].replace(/<[^>]+>/g, " ")));
        worst = Math.max(worst, words);
        if (words > THRESHOLDS.maxFigureLabelWords) long.push(`${f.name}: ${words} words`);
      }
    }
    items.push(item("figures", "figure-label-length", "Text inside figures is label-length", !long.length, { value: `longest ${worst} words`, expected: `≤ ${THRESHOLDS.maxFigureLabelWords} words per text run`, ...(long.length ? { detail: long.slice(0, 10) } : {}) }));
  }

  if (md) {
    const { longest, runs } = proseRuns(md);
    items.push(item("figures", "visual-cadence", "A visual at least after every second paragraph", longest <= 2, { value: `longest run ${longest} prose paragraphs`, expected: "≤ 2 consecutive prose paragraphs without a figure, table, code block or callout", ...(runs.length ? { detail: runs.slice(0, 12).map((r) => `run of 3+ reaching: "${r}"`) } : {}) }));
    const body = md.split(/^## Sources\b/m)[0];
    const sections = body.split(/^## /m);
    const last = sections.length > 1 ? sections[sections.length - 1] : body;
    const hasTable = /^\|.+\|\s*$\n^\|\s*:?-{2,}/m.test(last);
    const words = postWords(md);
    const stats = proseStats(md);
    items.push(item("figures", "prose-run-words", "No long stretch of prose between visuals", stats.longestRunWords <= THRESHOLDS.maxProseRunWords, { value: `longest ${stats.longestRunWords} words`, expected: `≤ ${THRESHOLDS.maxProseRunWords} words of prose between two visuals (counted in words so that splitting a paragraph does not meet it)`, ...(stats.longestRunWords > THRESHOLDS.maxProseRunWords ? { detail: [`the stretch starting at: "${stats.runExcerpt}"`] } : {}) }));
    items.push(item("figures", "padding-paragraphs", "Few one-line paragraphs", stats.share <= THRESHOLDS.maxPaddingShare, { value: `${stats.oneLiners} of ${stats.paragraphs} prose paragraphs (${Math.round(stats.share * 100)} percent)`, expected: `≤ ${Math.round(THRESHOLDS.maxPaddingShare * 100)} percent of the prose in one-sentence paragraphs of ≤ ${THRESHOLDS.maxPaddingWords} words (do not split paragraphs to make room for visuals)` }));
    const pre = wordsBeforeFirstSection(md);
    items.push(item("structure", "pre-section-words", "A short opening before the first section", pre <= THRESHOLDS.maxWordsBeforeFirstSection, { value: `${pre} words`, expected: `≤ ${THRESHOLDS.maxWordsBeforeFirstSection} words before the first section, the content preview included (one concrete incident, then the preview as one line per section)` }));
    const longItems = closingListItemWords(md).filter((n) => n > THRESHOLDS.maxClosingListItemWords);
    items.push(item("structure", "closing-list-items", "Closing list items are short", !longItems.length, { value: longItems.length ? `${longItems.length} over (longest ${Math.max(...longItems)} words)` : "all short", expected: `≤ ${THRESHOLDS.maxClosingListItemWords} words per list item in the closing section` }));
    const lp = sourceListProblems(md);
    const srcNums = sources.map((s) => s.n);
    const srcGaps: number[] = [];
    for (let k = 1; k <= Math.max(0, ...srcNums); k++) if (!srcNums.includes(k)) srcGaps.push(k);
    // N is sources.json's count: a list that stops short (or a page with no `#src-n` for a source)
    // is a source the reader cannot find, however cleanly what is there is numbered.
    const unanchored = html ? srcNums.filter((n) => !new RegExp(`id=["']src-${n}["']`).test(html)) : [];
    const numberingOk = !lp.gaps.length && !lp.repeats.length && !srcGaps.length && lp.listed === sources.length && !unanchored.length;
    items.push(item("truth", "source-numbering", "Sources are numbered without gaps", numberingOk, { value: numberingOk ? `${lp.listed} listed` : `post.md lists ${lp.listed} of ${sources.length}; gaps in the list: ${lp.gaps.join(", ") || "none"}; repeats: ${lp.repeats.join(", ") || "none"}; gaps in sources.json: ${srcGaps.join(", ") || "none"}; no #src-n in index.html for: ${unanchored.join(", ") || "none"}`, expected: "post.md's Sources list and sources.json numbered 1 to N with no number missing or repeated, and index.html carrying #src-1 to #src-N (renumber the citations when a source is dropped)" }));
    items.push(item("structure", "length-ceiling", "The post stays under its word ceiling", words <= THRESHOLDS.maxWords, { value: `${words} words`, expected: `≤ ${THRESHOLDS.maxWords} words (replacement, not addition: cut or tighten before adding)` }));
    const skim = skimSpine(md);
    // The page carries the same spans: every post.md span, as text, inside some <strong>.
    const norm = (s: string) => decode(s.replace(/<[^>]+>/g, "").replace(/`/g, "")).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
    const strong = html ? [...html.matchAll(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi)].map((m) => norm(m[1])) : [];
    const offPage = html ? skim.spans.filter((s) => !strong.some((t) => t === norm(s))) : [];
    const share = skim.proseWords ? skim.boldWords / skim.proseWords : 0;
    const skimOk = !skim.missing.length && !skim.doubled.length && !skim.badSpans.length && !offPage.length && share <= THRESHOLDS.skimMaxShare;
    items.push(
      item("structure", "skim-spine", "The bold spans alone carry the argument", skimOk, {
        value: `${skim.spans.length} spans, ${Math.round(share * 100)} percent of the prose; ${skim.missing.length} long paragraphs without one, ${skim.doubled.length} with two, ${skim.badSpans.length} off-length, ${offPage.length} missing from index.html`,
        expected: `one bold span per prose paragraph over ${THRESHOLDS.skimMinParagraphWords} words, ${THRESHOLDS.skimSpanWords[0]} to ${THRESHOLDS.skimSpanWords[1]} words, no citation inside, bold ≤ ${Math.round(THRESHOLDS.skimMaxShare * 100)} percent of the prose, the same spans as <strong> in index.html`,
        ...(skimOk ? {} : { detail: [...skim.missing, ...skim.doubled, ...skim.badSpans, ...offPage.map((s) => `not bold in index.html: "${s.slice(0, 80)}"`), ...(share > THRESHOLDS.skimMaxShare ? [`bold is ${Math.round(share * 100)} percent of the prose`] : [])] }),
      }),
    );
    items.push(item("structure", "closing-table", "The close carries a summary table", hasTable, { value: hasTable ? "table present" : "none", expected: "a Markdown table in the last section before Sources (skim readers read the opening and the ending)" }));
  }

  // ── voice
  const fp = [
    ...(md ? firstPersonHits(mdProse(md, { dropQuotes: true, dropSources: true })) : []),
    ...(html ? firstPersonHits(htmlProse(html, { dropQuotes: true })) : []),
  ];
  if (md || html) items.push(item("voice", "first-person", "No first person in prose", !fp.length, { value: fp.length, expected: "0", ...(fp.length ? { detail: fp.slice(0, 12) } : {}) }));
  if (md || html) {
    const where: string[] = [];
    // Decoded first: `&mdash;`, `&#8212;` and `&#x2013;` render as the characters the rule forbids.
    const scan = (label: string, text: string) => {
      const n = (decode(text).match(/[\u2014\u2013]/g) ?? []).length;
      if (n) where.push(`${label}: ${n}`);
    };
    scan("post.md", md ?? "");
    scan("index.html", html ?? "");
    for (const f of figures) scan(f.name, f.svg);
    items.push(item("voice", "no-em-dash", "No em or en dash", !where.length, { value: where.length ? where.join(", ") : 0, expected: "0 (house rule: ranges use \"to\"; use a period, comma, colon or parentheses)", ...(where.length ? { detail: where } : {}) }));
  }

  // ── medium fidelity (static half)
  if (html) {
    const external = [
      ...html.matchAll(/<(?:img|script|iframe|video|audio|source|embed)\b[^>]*\bsrc=["'](https?:)?\/\/[^"']*["']/gi),
      ...html.matchAll(/<link\b[^>]*\bhref=["'](https?:)?\/\/[^"']*["']/gi),
      ...html.matchAll(/@import\s+(?:url\()?["']?(https?:)?\/\//gi),
      ...html.matchAll(/url\(\s*["']?https?:\/\//gi),
    ].map((m) => m[0].slice(0, 100));
    items.push(item("medium-fidelity", "offline", "No network resources", !external.length, { value: external.length, expected: "0", ...(external.length ? { detail: external.slice(0, 10) } : {}) }));
    const pres = [...html.matchAll(/<pre\b[\s\S]*?<\/pre>/gi)].map((m) => m[0]);
    const plain = pres.filter((p) => !/<span\b[^>]*\b(class|style)=/i.test(p));
    items.push(item("medium-fidelity", "code-highlighted", "Code blocks highlighted", !plain.length, { value: `${pres.length - plain.length}/${pres.length}`, expected: "every <pre> carries highlight spans" }));
    const dark = /prefers-color-scheme\s*:\s*dark/i.test(html);
    items.push(item("medium-fidelity", "dark-mode", "Light and dark", dark, { value: dark ? "prefers-color-scheme: dark present" : "none", expected: "a dark scheme" }));
  }

  // ── truth
  const primary = sources.filter((s) => s.primary).length;
  const counter = sources.filter((s) => s.counter).length;
  items.push(item("truth", "source-count", "Sources", sources.length >= THRESHOLDS.minSources, { value: sources.length, expected: `≥ ${THRESHOLDS.minSources}` }));
  items.push(item("truth", "source-primary", "Primary sources", primary >= THRESHOLDS.minPrimary, { value: primary, expected: `≥ ${THRESHOLDS.minPrimary}` }));
  items.push(item("truth", "source-counter", "Counter-evidence", counter >= THRESHOLDS.minCounter, { value: counter, expected: `≥ ${THRESHOLDS.minCounter}` }));
  const undated = sources.filter((s) => !ISO_DATE.test(String(s.date ?? ""))).map((s) => `[${s.n}] ${s.title || s.url}: date ${JSON.stringify(s.date ?? null)}`);
  const badUrl = sources.filter((s) => !/^https?:\/\/[^\s/]+\.[^\s]+$/.test(String(s.url ?? ""))).map((s) => `[${s.n}] url ${JSON.stringify(s.url ?? null)}`);
  const dated = sources.map((s) => s.date).filter((d) => ISO_DATE.test(String(d))).sort();
  items.push(item("truth", "source-dates", "Every source dated, with a working URL shape", !undated.length && !badUrl.length && sources.length > 0, { value: dated.length ? `oldest ${dated[0]}, newest ${dated[dated.length - 1]}` : "no dates", expected: "a date and an http(s) URL on every source", ...(undated.length || badUrl.length ? { detail: [...undated, ...badUrl].slice(0, 12) } : {}) }));

  const cited = [
    ...(md ? citedNumbers(mdProse(md, { dropSources: true })) : []),
    ...(html ? citedNumbers(htmlProse(html)) : []),
  ];
  const unresolved = [...new Set(cited.filter((n) => !nums.has(n)))].sort((a, b) => a - b);
  const anchors = html ? [...html.matchAll(/href=["']#src-(\d+)["']/gi)].map((m) => Number(m[1])) : [];
  const missingTargets = html ? [...new Set(anchors)].filter((n) => !new RegExp(`id=["']src-${n}["']`).test(html)) : [];
  const uncited = sources.filter((s) => !cited.includes(s.n)).map((s) => s.n);
  if (md || html)
    items.push(
      item("truth", "citation-resolution", "Every citation resolves", cited.length > 0 && !unresolved.length && !missingTargets.length, {
        value: `${new Set(cited).size} cited of ${sources.length}`,
        expected: "every [n] names a source; every #src-n link has its target",
        ...(unresolved.length || missingTargets.length || uncited.length
          ? {
              detail: [
                ...(unresolved.length ? [`unresolved: ${unresolved.map((n) => `[${n}]`).join(" ")}`] : []),
                ...(missingTargets.length ? [`links without a target: ${missingTargets.map((n) => `#src-${n}`).join(" ")}`] : []),
                ...(uncited.length ? [`sources never cited: ${uncited.map((n) => `[${n}]`).join(" ")}`] : []),
              ],
            }
          : {}),
      }),
    );
  const orphanClaims = claims.filter((c) => !nums.has(c.source)).map((c) => `${c.text.slice(0, 80)} -> [${c.source}]`);
  items.push(item("truth", "claims-resolve", "Every research claim has its source", !orphanClaims.length, { value: `${claims.length - orphanClaims.length}/${claims.length}`, expected: "all", ...(orphanClaims.length ? { detail: orphanClaims.slice(0, 10) } : {}) }));

  return items;
}

/* ── a trial run's items ───────────────────────────────────────────────────── */

/** The per-arm n as a reader would meet it: `n=20` (any spacing), or `20 per arm`, `20 runs per
 *  arm`. A bare 20 is not enough: a date before the first section (`2026-10-20`) holds one. */
export function statesTrialN(text: string, n: number): boolean {
  return new RegExp(`\\bn\\s*=\\s*${n}(?![\\d.,]?\\d)|(?<![\\d.,])${n}\\s+(?:[A-Za-z-]+\\s+){0,2}per\\s+arm\\b`, "i").test(text);
}

/** The text of a page or a Markdown post before its first section, tags gone, code kept (a
 *  writer may set `n=20 per arm` in code type and still state it). */
function beforeFirstSection(file: "index.html" | "post.md", text: string): string {
  if (file === "post.md") {
    const at = text.search(/^## /m);
    return at < 0 ? text : text.slice(0, at);
  }
  const at = text.search(/<h2\b/i);
  const head = at < 0 ? text : text.slice(0, at);
  return decode(head.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|svg|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
}

/**
 * THE TRIAL ITEMS (truth), for a run written around a trial and for no other. A trial post rests
 * on its own measurement, so its opening says so: `trial-preview`, the text before the first
 * section of both files cites [1] (the trial's record) and states the per-arm n;
 * `trial-figure`, at least one figure caption cites [1]. Before trials, 17 of 17 previews
 * disclaimed any first-hand measurement.
 */
export function trialItems(input: { html?: string; md?: string; n: number }): CheckItem[] {
  const { html, md, n } = input;
  const items: CheckItem[] = [];
  const heads = [...(html ? [["index.html", beforeFirstSection("index.html", html)] as const] : []), ...(md ? [["post.md", beforeFirstSection("post.md", md)] as const] : [])];
  if (!heads.length) items.push(absent("truth", "trial-preview", "Preview cites the trial [1] and its n", "post/index.html and post/post.md are missing"));
  else {
    const problems = heads.flatMap(([file, text]) => [
      ...(citedNumbers(text).includes(1) ? [] : [`${file}: no [1] before the first section`]),
      ...(statesTrialN(text, n) ? [] : [`${file}: n=${n} is not stated before the first section`]),
    ]);
    items.push(
      item("truth", "trial-preview", "Preview cites the trial [1] and its n", !problems.length, {
        value: problems.length ? `${problems.length} missing` : `[1] and n=${n} in ${heads.map(([f]) => f).join(" and ")}`,
        expected: `before the first section of index.html and post.md: [1] cited and the per-arm n stated (n=${n})`,
        ...(problems.length ? { detail: problems } : {}),
      }),
    );
  }
  if (html) {
    const captions = [...html.matchAll(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/gi)].map((m) => htmlProse(m[1]));
    const citing = captions.filter((c) => citedNumbers(c).includes(1)).length;
    items.push(item("truth", "trial-figure", "A figure caption cites the trial [1]", citing > 0, { value: `${citing} of ${captions.length} captions`, expected: "≥ 1 figure caption cites [1]" }));
  } else items.push(absent("truth", "trial-figure", "A figure caption cites the trial [1]", "post/index.html is missing"));
  return items;
}
