// THE MEDIUM PACKAGE — a paste-ready copy of an approved post. Server only.
//
// This file sends nothing to Medium. There is no Medium API call; the only
// automation of Medium is lib/medium, which pastes this package into a PRIVATE
// draft at the gate (lib/articles/mediumDraft.ts) and never publishes. The
// package stays what a human can paste from by hand, plus the figure PNGs.
//
//   medium/story.html   clean HTML from post/post.md — no scripts, no styles,
//                       no classes; figures as <img> of PNGs, tables as <table>
//   medium/figures/     one PNG per post/figures/*.svg, rendered by Playwright,
//                       and one per Markdown table (table-NN.png): Medium's
//                       editor has no table element, so a table pastes as a
//                       paragraph of pipes unless it travels as a picture
//
// TWO FORMS OF A TABLE. story.html is copied into the registry, which is
// text-only: its publications lane fails any image that is not the render of a
// listed SVG figure (measured 2026-10-16, the 429 landing). So story.html keeps
// each table as text, and only the draft the driver pastes (`storyBody`) swaps
// it for its picture. The table PNGs stay in the run.
//   medium/tags.txt     up to five tags, one per line
//   medium/README.md    the paste steps
//
// WHY FROM post.md AND NOT index.html: the Markdown is the post's Medium-ready
// form by contract (pipeline/ARTICLE-POST-PROMPT.md), and Medium's editor keeps
// headings, paragraphs, emphasis, links, quotes, lists, code and images — which
// is exactly what a small Markdown converter emits. Stripping a designed page
// down to that would be a guess about which of its elements were chrome.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Browser } from "playwright";

import type { PostMeta } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Inline Markdown: code, images, links, strong, emphasis. Escapes first. */
function inline(text: string): string {
  const codes: string[] = [];
  let s = text.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${esc(c)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/!\[((?:[^[\]]|\[[^\]]*\])*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) => `<img src="${src}" alt="${alt}">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t: string, href: string) => `<a href="${href}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>").replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]);
}

/** One Markdown table, cells as inline HTML. */
export interface StoryTable {
  /** `table-NN.png`, numbered in story order from 01. */
  name: string;
  head: string[];
  rows: string[][];
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
// GFM's delimiter row: any run of hyphens per cell, with optional colons (`:--` is valid; a
// three-dash minimum left the figures-and-tables closing table as a paragraph of pipes).
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const cellsOf = (row: string) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => inline(c.trim().replace(/\\\|/g, "|")));
const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** In-page anchors, which a Medium story cannot hold: a citation written as a link to its
 *  source (`[[3]](#src-3)`) becomes `[3]`, an empty `<a id="…"></a>` target goes, a link
 *  to a `#…` target keeps its text, and a reference definition aimed at one (`[3]: #src-3`)
 *  is dropped. Some writers spell post.md this way (5 of the runs at the
 *  gate on 2026-10-16); the converter escapes raw HTML, so all three reached the draft as
 *  literal text. Fenced code is left alone. */
export function withoutPageAnchors(md: string): string {
  let fence = false;
  return md
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fence = !fence;
        return line;
      }
      if (fence) return line;
      // a reference definition aimed at an in-page target (`[1]: #src-1`) defines nothing Medium can follow
      if (/^\s{0,3}\[[^\]]+\]:\s*#\S*\s*$/.test(line)) return null;
      return line
        .replace(/\[\[(\d{1,3})\]\]\(#[^)\s]*\)/g, "[$1]")
        .replace(/<a\s+id=["'][^"']*["']\s*>\s*<\/a>\s*/gi, "")
        .replace(/(?<!!)\[([^\]]+)\]\(#[^)\s]*\)/g, "$1");
    })
    .filter((line) => line !== null)
    .join("\n");
}

/** One Markdown quote, read whole. Medium holds a quote paragraph by paragraph, and a
 *  `<blockquote>` per `>` line put an empty quote row where the Markdown had a blank `>`
 *  line and spread a list one padded row per item (the content preview of the eval-harness
 *  draft, 2026-10-18). So lines join into paragraphs, a list is one quote with a line
 *  break per item, and a blank line emits nothing. */
function quoteBlocks(inner: string[]): string[] {
  const out: string[] = [];
  let para: string[] = [];
  let items: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<blockquote>${inline(para.join(" "))}</blockquote>`);
    if (items.length) out.push(`<blockquote>${items.join("<br>")}</blockquote>`);
    para = [];
    items = [];
  };
  for (const l of inner) {
    const li = /^\s*(?:[-*+]|(\d+\.))\s+(.+)$/.exec(l);
    if (!l.trim()) flush();
    else if (li) {
      if (para.length) flush();
      items.push(`${li[1] ?? "•"} ${inline(li[2])}`);
    } else {
      if (items.length) flush();
      para.push(l.trim());
    }
  }
  flush();
  return out;
}

/** A deliberately small Markdown-to-HTML converter: the subset Medium keeps.
 *  A table is a `<table>` (`tables: "html"`, the registry's text form) or a
 *  figure of its PNG (`"figures"`, the form a Medium draft can hold). */
export function markdownToStory(md: string, opts: { tables?: "html" | "figures" } = {}): { html: string; tables: StoryTable[] } {
  const asFigures = (opts.tables ?? "figures") === "figures";
  const lines = withoutPageAnchors(md.replace(/\r\n/g, "\n")).split("\n");
  const out: string[] = [];
  const tables: StoryTable[] = [];
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^(```|~~~)\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      flushPara();
      flushList();
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith(fence[1]); i++) body.push(lines[i]);
      out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      // Medium has two heading levels; h1 is the title, everything deeper is h3/h4.
      const level = h[1].length === 1 ? 1 : h[1].length === 2 ? 3 : 4;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    const img = /^!\[((?:[^[\]]|\[[^\]]*\])*)\]\(([^)\s]+)\)\s*$/.exec(line);
    if (img) {
      flushPara();
      flushList();
      const next = lines[i + 1]?.trim() ?? "";
      // The caption is the line under its image by contract, but writers leave a blank line
      // between them: 91 of 149 figures across the 12 runs on disk on 2026-10-18. The draft
      // then showed the image's long alt text as its caption and the real caption as a body
      // paragraph. So a one-line paragraph after one blank line is the caption when it cites
      // a source, as a caption must. Measured against each figure's index.html figcaption,
      // 147 of 149 come out right; the other 2 are one post's "Values as text" paragraphs,
      // body text by design, one of which cites a source and is taken.
      const after = !next && !lines[i + 3]?.trim() ? (lines[i + 2]?.trim() ?? "") : "";
      let caption = img[1];
      if (next && !/^(#|!\[|```|[-*]\s|\d+\.\s|>)/.test(next)) {
        caption = next;
        i++;
      } else if (after && !/^(#|!\[|```|[-*+]\s|\d+\.\s|>|\|)/.test(after) && /\[\d{1,3}\]/.test(after)) {
        caption = after;
        i += 2;
      }
      out.push(`<figure><img src="${esc(img[2])}" alt="${esc(img[1])}"><figcaption>${inline(caption)}</figcaption></figure>`);
      continue;
    }
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[i + 1] ?? "")) {
      flushPara();
      flushList();
      const head = cellsOf(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && TABLE_ROW.test(lines[i]); i++) rows.push(cellsOf(lines[i]));
      i--;
      const name = `table-${String(tables.length + 1).padStart(2, "0")}.png`;
      tables.push({ name, head, rows });
      out.push(
        asFigures
          ? `<figure><img src="figures/${name}" alt="${esc(`Table: ${head.map(plain).join(", ")}`)}"></figure>`
          : `<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
      );
      continue;
    }
    if (/^>/.test(line)) {
      flushPara();
      flushList();
      const inner: string[] = [];
      for (; i < lines.length && /^>/.test(lines[i]); i++) inner.push(lines[i].replace(/^>\s?/, ""));
      i--;
      out.push(...quoteBlocks(inner));
      continue;
    }
    const li = /^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/.exec(line);
    if (li) {
      flushPara();
      const tag = li[1] ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push(li[3]);
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flushPara();
      flushList();
      out.push("<hr>");
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return { html: out.join("\n"), tables };
}

export const markdownToStoryHtml = (md: string): string => markdownToStory(md).html;

/** Figures in the Markdown point at `figures/NN-name.png` by contract; an SVG
 *  reference is rewritten to its PNG so the story never embeds an SVG. */
const toPngRefs = (md: string) => md.replace(/(\]\(\s*(?:\.\/)?figures\/[^)\s]+?)\.svg(\s*\))/g, "$1.png$2");

/** The story's body as the Medium draft takes it on a paste: tables as pictures. */
export const storyBody = (md: string): string => markdownToStoryHtml(toPngRefs(md));

/** The figure files the story shows, in the order it shows them (`figures/NN.png`, `figures/table-NN.png`). */
export const storyFigures = (html: string): string[] => [...html.matchAll(/<img src="(figures\/[^"]+)"/g)].map((m) => m[1]);

export function storyDocument(title: string, body: string): string {
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${esc(title)}</title>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

export function readmeText(meta: PostMeta, figures: string[]): string {
  return [
    `# Medium package: ${meta.title}`,
    "",
    "Nothing in this package has been sent anywhere. It is pasted by hand.",
    "",
    "The figure PNGs live in the article run's `medium/figures/` (gravitone `foundry-out/articles/<runId>/`). The registry copy of this package carries no PNGs, because the registry is text-only; there, render them from `../figures/*.svg`.",
    "",
    "1. Open `story.html` in a browser (it has no scripts and needs no network).",
    "2. Select everything in the page and copy it.",
    "3. In Medium, start a new story and paste. The title and subtitle land as the first two lines; check that Medium styled them as Title and Subtitle.",
    "4. A paste cannot upload local image files. Where a figure belongs, drag in its PNG from `figures/` in this order, and check its caption from `story.html` sits under it. Medium has no table element, so a table pastes as text: replace each with its picture, `table-NN.png` (in the run only; the registry copy has the table as text):",
    ...figures.map((f) => `   - \`figures/${f}\``),
    "5. Code blocks: Medium keeps the block but not its colours. Leave them as plain code blocks.",
    "6. Before publishing, add the tags from `tags.txt` (Medium accepts at most five).",
    "7. Check every numbered citation `[n]` still sits next to its claim and that the Sources list survived as a numbered list.",
    "",
  ].join("\n");
}

/** The width every figure PNG is rendered at, in device pixels (2x a 1400 px column). */
const PNG_WIDTH = 2800;

/** An SVG's drawing size: its width/height attributes when they are plain
 *  numbers, else its viewBox, else 1400x900. */
export function svgSize(svg: string): { w: number; h: number } {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";
  const num = (name: string) => {
    const m = new RegExp(`\\s${name}=["']\\s*([\\d.]+)(px)?\\s*["']`, "i").exec(tag);
    return m ? Number(m[1]) : NaN;
  };
  const vb = /viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(tag);
  let w = num("width");
  let h = num("height");
  if (!(w > 0) || !(h > 0)) {
    w = vb ? Number(vb[1]) : 1400;
    h = vb ? Number(vb[2]) : 900;
  }
  return { w, h };
}

/** Starts the browser the PNG renders run in. A parameter so a probe can make it fail. */
export type LaunchBrowser = () => Promise<Browser>;

const launchChromium: LaunchBrowser = async () => (await import("playwright")).chromium.launch();

/** Render each SVG to a PNG of exactly its drawing, PNG_WIDTH wide. The page is
 *  the SVG's own size and the device scale makes up the width: a viewport wider
 *  than the SVG's width attribute left it in the top-left corner of a blank
 *  canvas, which Medium then showed cropped and small (2026-10-16). Returns the
 *  PNG names written; an SVG that will not render is named in `failed`. */
export async function renderFigurePngs(svgDir: string, pngDir: string, launch: LaunchBrowser = launchChromium): Promise<{ written: string[]; failed: string[] }> {
  let names: string[] = [];
  try {
    names = (await readdir(svgDir)).filter((n) => /\.svg$/i.test(n)).sort();
  } catch {
    return { written: [], failed: [] };
  }
  if (!names.length) return { written: [], failed: [] };
  await mkdir(pngDir, { recursive: true });
  // A box with no browser fails every figure by name, the way one figure that will not render
  // does: the landing rests on the registry gates, not on a PNG the registry copy does not carry.
  let browser: Browser;
  try {
    browser = await launch();
  } catch {
    return { written: [], failed: names };
  }
  const written: string[] = [];
  const failed: string[] = [];
  try {
    for (const name of names) {
      const { w, h } = svgSize(await readFile(path.join(svgDir, name), "utf8"));
      const width = Math.max(1, Math.round(w));
      const height = Math.max(1, Math.round(h));
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: PNG_WIDTH / width });
      const page = await ctx.newPage();
      await page.route("**/*", (route) => (/^https?:/i.test(route.request().url()) ? route.abort() : route.continue()));
      try {
        await page.goto(pathToFileURL(path.join(svgDir, name)).href, { waitUntil: "load" });
        const png = name.replace(/\.svg$/i, ".png");
        await page.screenshot({ path: path.join(pngDir, png) });
        written.push(png);
      } catch {
        failed.push(name);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  return { written, failed };
}

/** The table's page: the post's reading face, a ruled header, hairline rows,
 *  zebra stripes, nothing off the network. */
export function tableDocument(t: StoryTable): string {
  const row = (cells: string[], tag: "th" | "td") => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#fff}
table{border-collapse:collapse;width:1400px;font:28px/1.45 Georgia,"Times New Roman",serif;color:#242424}
th,td{text-align:left;vertical-align:top;padding:18px 22px;border-bottom:1px solid #e3e3e3}
th{font:600 26px/1.35 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;border-bottom:2px solid #242424}
tbody tr:nth-child(even) td{background:#f7f7f7}
code{font:24px/1.4 Menlo,Consolas,monospace;background:#f2f2f2;padding:1px 5px;border-radius:3px}
a{color:inherit}
</style></head><body><table><thead>${row(t.head, "th")}</thead><tbody>${t.rows.map((r) => row(r, "td")).join("")}</tbody></table></body></html>`;
}

/** Render each table to `<pngDir>/<table.name>`, PNG_WIDTH wide. */
export async function renderTablePngs(tables: StoryTable[], pngDir: string, launch: LaunchBrowser = launchChromium): Promise<{ written: string[]; failed: string[] }> {
  if (!tables.length) return { written: [], failed: [] };
  await mkdir(pngDir, { recursive: true });
  let browser: Browser;
  try {
    browser = await launch();
  } catch {
    return { written: [], failed: tables.map((t) => t.name) };
  }
  const written: string[] = [];
  const failed: string[] = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: PNG_WIDTH / 1400 });
    await ctx.route("**/*", (route) => (/^https?:/i.test(route.request().url()) ? route.abort() : route.continue()));
    const page = await ctx.newPage();
    for (const t of tables) {
      try {
        await page.setContent(tableDocument(t), { waitUntil: "load" });
        await page.locator("table").screenshot({ path: path.join(pngDir, t.name) });
        written.push(t.name);
      } catch {
        failed.push(t.name);
      }
    }
  } finally {
    await browser.close();
  }
  return { written, failed };
}

/** Build `<runDir>/medium/` from the run's post. Returns the files written,
 *  run-relative. */
export async function buildMediumPackage(runDir: string, meta: PostMeta): Promise<{ files: string[]; failedFigures: string[] }> {
  const postDir = path.join(runDir, "post");
  const medium = path.join(runDir, "medium");
  await mkdir(medium, { recursive: true });
  const md = await readFile(path.join(postDir, "post.md"), "utf8");
  const pngs = await renderFigurePngs(path.join(postDir, "figures"), path.join(medium, "figures"));
  const { html, tables } = markdownToStory(toPngRefs(md), { tables: "figures" });
  const tablePngs = await renderTablePngs(tables, path.join(medium, "figures"));
  const story = storyDocument(meta.title, markdownToStory(toPngRefs(md), { tables: "html" }).html);
  const tags = meta.tags.map((t) => t.trim()).filter(Boolean).slice(0, 5);
  await writeFile(path.join(medium, "story.html"), story, "utf8");
  await writeFile(path.join(medium, "tags.txt"), `${tags.join("\n")}\n`, "utf8");
  const written = new Set([...pngs.written, ...tablePngs.written]);
  const shown = storyFigures(html).map((f) => f.slice("figures/".length));
  await writeFile(path.join(medium, "README.md"), readmeText(meta, shown.filter((f) => written.has(f))), "utf8");
  return {
    files: ["medium/story.html", "medium/tags.txt", "medium/README.md", ...[...written].sort().map((p) => `medium/figures/${p}`)],
    failedFigures: [...pngs.failed, ...tablePngs.failed],
  };
}
