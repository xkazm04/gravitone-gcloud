// THE FRAME-PURITY LINT — runs on an authored strip.html before any render.
//
// A strip's whole guarantee is that frame i is a pure function of i
// (registry: video-assembly/seek-stable-composition-authoring). That property
// is statically checkable for the constructs that break it, and a static check
// is cheaper and more reliable than watching 240 rendered frames for a snap.
// So the lint refuses here, before Chromium starts, and every error names its
// rule — "enforce at the layer that can see it".
//
// What it cannot see: a second writer that animates from the current value
// through a library call it does not recognise, or state carried in a closure
// between calls. The seek gate (render.mts) catches those by rendering cold
// and out of order; the two are complementary, not redundant.

export interface LintFinding {
  rule: string;
  excerpt: string;
}

interface Rule {
  rule: string;
  re: RegExp;
  /** Strip matches that are fine in context. */
  allow?: (match: string, around: string) => boolean;
}

const RULES: Rule[] = [
  { rule: "clock: Date.now", re: /\bDate\.now\s*\(/g },
  { rule: "clock: performance.now", re: /\bperformance\.now\s*\(/g },
  { rule: "clock: new Date() with no argument", re: /\bnew\s+Date\s*\(\s*\)/g },
  { rule: "randomness: Math.random (use a seeded PRNG)", re: /\bMath\.random\s*\(/g },
  { rule: "scheduler: requestAnimationFrame", re: /\brequestAnimationFrame\s*\(/g },
  { rule: "scheduler: setTimeout", re: /\bsetTimeout\s*\(/g },
  { rule: "scheduler: setInterval", re: /\bsetInterval\s*\(/g },
  { rule: "network: fetch", re: /\bfetch\s*\(/g },
  { rule: "network: XMLHttpRequest", re: /\bXMLHttpRequest\b/g },
  { rule: "network: WebSocket", re: /\bnew\s+WebSocket\b/g },
  {
    rule: "network: external src/href",
    re: /\b(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\/[^"']+["']/gi,
    // An SVG namespace URI is an identifier, not a load.
    allow: (m) => /w3\.org\/(?:2000\/svg|1999\/xlink|1999\/xhtml)/.test(m),
  },
  { rule: "network: CSS @import / url(http)", re: /@import\s+url|url\(\s*["']?https?:/gi },
  {
    rule: "time: running CSS transition",
    re: /\btransition\s*:\s*(?!none\b)[^;"'}]+/gi,
    allow: (m) => /:\s*(?:none|0s|all\s+0s)\s*$/i.test(m.trim()),
  },
  {
    rule: "time: CSS animation without a paused, t-driven delay",
    re: /\banimation(?:-name)?\s*:\s*(?!none\b)[^;"'}]+/gi,
    allow: (_m, around) => /animation-play-state\s*:\s*paused/i.test(around),
  },
];

const CONTEXT = 600;

export function lintStrip(html: string): LintFinding[] {
  const out: LintFinding[] = [];
  for (const r of RULES) {
    r.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.re.exec(html))) {
      const around = html.slice(Math.max(0, m.index - CONTEXT), m.index + m[0].length + CONTEXT);
      if (r.allow?.(m[0], around)) continue;
      const line = html.slice(0, m.index).split("\n").length;
      out.push({ rule: r.rule, excerpt: `line ${line}: ${m[0].slice(0, 80).replace(/\s+/g, " ")}` });
      if (out.filter((f) => f.rule === r.rule).length >= 3) break;
    }
  }
  if (!/window\.renderFrameAt\s*=/.test(html) && !/renderFrameAt\s*[:=]\s*(?:async\s*)?(?:function|\()/.test(html)) {
    out.push({ rule: "api: window.renderFrameAt is not defined", excerpt: "" });
  }
  if (!/STRIP_READY/.test(html)) out.push({ rule: "api: window.STRIP_READY is never set", excerpt: "" });
  if (!/strip-frame/.test(html)) out.push({ rule: "api: no strip-frame message listener", excerpt: "" });
  return out;
}

export const formatLint = (f: LintFinding[]) => f.map((x) => (x.excerpt ? `${x.rule} — ${x.excerpt}` : x.rule));

// Self-test: `npx tsx pipeline/strips/lint.mts --selftest`
if (process.argv.includes("--selftest")) {
  const bad = `<script>window.renderFrameAt=function(i){var x=Math.random();requestAnimationFrame(f);fetch("/x")};window.STRIP_READY=true;addEventListener("message",e=>{if(e.data.type==="strip-frame"){}})</script><style>.a{transition: opacity 1s}</style><img src="https://x.y/z.png">`;
  const good = `<svg xmlns="http://www.w3.org/2000/svg"></svg><style>.a{animation: spin 1s linear; animation-play-state: paused; transition: none}</style><script>window.renderFrameAt=function(i){};window.STRIP_READY=true;addEventListener("message",e=>{if(e.data&&e.data.type==="strip-frame")renderFrameAt(e.data.i)})</script>`;
  const b = lintStrip(bad).map((f) => f.rule);
  const g = lintStrip(good);
  const want = ["randomness: Math.random (use a seeded PRNG)", "scheduler: requestAnimationFrame", "network: fetch", "network: external src/href", "time: running CSS transition"];
  const missing = want.filter((w) => !b.includes(w));
  if (missing.length || g.length) {
    console.error("lint selftest FAILED", { missing, falsePositives: g });
    process.exit(1);
  }
  console.log(`lint selftest ok: ${b.length} findings on the planted page, 0 on the clean page`);
}
