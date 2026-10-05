// THE MEDIUM PACKAGE — a paste-ready copy of an approved post. Server only.
//
// Nothing is sent to Medium. There is no Medium API call and no browser
// automation of Medium anywhere in this pipeline (both are non-goals): the
// package is three files a human pastes from, plus the figure PNGs.
//
//   medium/story.html   clean HTML from post/post.md — no scripts, no styles,
//                       no classes; figures as <img> of PNGs
//   medium/figures/     one PNG per post/figures/*.svg, rendered by Playwright
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

/** A deliberately small Markdown-to-HTML converter: the subset Medium keeps. */
export function markdownToStoryHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
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
      const caption = next && !/^(#|!\[|```|[-*]\s|\d+\.\s|>)/.test(next) ? next : img[1];
      if (caption === next && next) i++;
      out.push(`<figure><img src="${esc(img[2])}" alt="${esc(img[1])}"><figcaption>${inline(caption)}</figcaption></figure>`);
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushPara();
      flushList();
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
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
  return out.join("\n");
}

/** Figures in the Markdown point at `figures/NN-name.png` by contract; an SVG
 *  reference is rewritten to its PNG so the story never embeds an SVG. */
const toPngRefs = (md: string) => md.replace(/(\]\(\s*(?:\.\/)?figures\/[^)\s]+?)\.svg(\s*\))/g, "$1.png$2");

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
    "4. A paste cannot upload local image files. Where a figure belongs, drag in its PNG from `figures/` in order, and check its caption from `story.html` sits under it:",
    ...figures.map((f) => `   - \`figures/${f}\``),
    "5. Code blocks: Medium keeps the block but not its colours. Leave them as plain code blocks.",
    "6. Before publishing, add the tags from `tags.txt` (Medium accepts at most five).",
    "7. Check every numbered citation `[n]` still sits next to its claim and that the Sources list survived as a numbered list.",
    "",
  ].join("\n");
}

/** Render each SVG to a PNG at 1400 px wide (2x device scale). Returns the
 *  PNG names written; an SVG that will not render is named in `failed`. */
export async function renderFigurePngs(svgDir: string, pngDir: string): Promise<{ written: string[]; failed: string[] }> {
  let names: string[] = [];
  try {
    names = (await readdir(svgDir)).filter((n) => /\.svg$/i.test(n)).sort();
  } catch {
    return { written: [], failed: [] };
  }
  if (!names.length) return { written: [], failed: [] };
  await mkdir(pngDir, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const written: string[] = [];
  const failed: string[] = [];
  try {
    for (const name of names) {
      const svg = await readFile(path.join(svgDir, name), "utf8");
      const vb = /viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(svg);
      const w = 1400;
      const h = vb ? Math.max(100, Math.round((w * Number(vb[2])) / Number(vb[1]))) : 900;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
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

/** Build `<runDir>/medium/` from the run's post. Returns the files written,
 *  run-relative. */
export async function buildMediumPackage(runDir: string, meta: PostMeta): Promise<{ files: string[]; failedFigures: string[] }> {
  const postDir = path.join(runDir, "post");
  const medium = path.join(runDir, "medium");
  await mkdir(medium, { recursive: true });
  const md = await readFile(path.join(postDir, "post.md"), "utf8");
  const pngs = await renderFigurePngs(path.join(postDir, "figures"), path.join(medium, "figures"));
  const story = storyDocument(meta.title, markdownToStoryHtml(toPngRefs(md)));
  const tags = meta.tags.map((t) => t.trim()).filter(Boolean).slice(0, 5);
  await writeFile(path.join(medium, "story.html"), story, "utf8");
  await writeFile(path.join(medium, "tags.txt"), `${tags.join("\n")}\n`, "utf8");
  await writeFile(path.join(medium, "README.md"), readmeText(meta, pngs.written), "utf8");
  return {
    files: ["medium/story.html", "medium/tags.txt", "medium/README.md", ...pngs.written.map((p) => `medium/figures/${p}`)],
    failedFigures: pngs.failed,
  };
}
