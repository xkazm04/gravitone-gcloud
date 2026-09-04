/* eslint-disable */
"use strict";

// THE STAMP — a dev-only bundler loader that writes each host JSX element's own
// source location into the DOM as `data-loc="<repo-relative>:LINE:COL"`, so the
// in-app DevInspector (app/_dev-inspector/) can turn a click on a pixel into a
// `app/.../File.tsx:88` you can paste into Claude Code.
//
// WHY A LOADER AND NOT REACT INTERNALS. The old click-to-component tools read
// the Fiber's `_debugSource`; React 19 removed that field, and 19.2 dropped the
// `source`/`self` arguments `jsxDEV` used to carry. There is no longer anything
// at runtime that knows where an element was written. So the location has to be
// put there at build time, and the DOM — not the Fiber tree — is what the
// inspector walks. That makes this version-independent: it needs no React
// internals at all.
//
// HOST ELEMENTS ONLY (`<div>`, `<button>`, … — a lowercase JSXIdentifier).
// A component element (`<Modal>`) cannot be stamped usefully: nothing guarantees
// it forwards an unknown prop to its root DOM node, so the attribute would
// vanish. Stamping every host element and walking the DOM ancestor chain at
// runtime recovers the component structure anyway — each enclosing file appears
// as a rung on the inspector's breadcrumb.
//
// WHY THE TYPESCRIPT PARSER, NOT BABEL. `typescript` is already a direct
// devDependency of this repo (`npm run typecheck` is a gate); @babel/core is
// not, and adding a toolchain to stamp an attribute is a dependency change for
// no gain. The transform here is a PURE TEXT INSERTION at a parsed offset —
// nothing is re-printed, so:
//   - the output is still the same TSX, which Turbopack's own SWC pipeline then
//     lowers exactly as it would have;
//   - no insertion contains a newline, so EVERY LINE NUMBER IS PRESERVED. The
//     incoming source map stays true for lines (columns after an insertion shift
//     by its width), which is what stack traces and HMR care about.
//
// COST: OPT-IN, TWICE. The matching `turbopack.rules` entry is only registered
// when DEV_INSPECT=1 (see next.config.ts), and this loader re-checks the flag
// and short-circuits otherwise — so a plain `npm run dev` and every production
// build pay nothing, and `typescript` is never even required here.

let ts; // lazily required only when actually stamping

const ATTR = "data-loc";

module.exports = function sourceLocLoader(source, inputMap, meta) {
  const callback = this.async();

  // Hard gate: do nothing unless explicitly launched in inspect mode.
  if (process.env.DEV_INSPECT !== "1") {
    return callback(null, source, inputMap, meta);
  }

  const resourcePath = (this.resourcePath || "").replace(/\\/g, "/");
  const base = resourcePath.slice(resourcePath.lastIndexOf("/") + 1);

  // Only this repo's own .tsx/.jsx — never dependencies or generated output.
  // Also skip Next's image-metadata routes (icon / apple-icon / opengraph-image
  // / twitter-image): they render through satori (ImageResponse), not the DOM,
  // so a `data-loc` there is meaningless and can confuse that renderer. This
  // repo has none today; the guard costs nothing and outlives that fact.
  if (
    !/\.[jt]sx$/.test(resourcePath) ||
    resourcePath.includes("/node_modules/") ||
    resourcePath.includes("/.next") ||
    /^(icon|apple-icon|opengraph-image|twitter-image)\d*\.[jt]sx$/.test(base)
  ) {
    return callback(null, source, inputMap, meta);
  }

  const opts = (typeof this.getOptions === "function" && this.getOptions()) || {};
  const rootDir = String(opts.rootDir || process.cwd()).replace(/\\/g, "/");

  // Repo-relative, forward-slashed: `app/_studio/AssetDrawer.tsx`. The loader is
  // the only thing that knows both the project root and the resource path, so
  // the path is computed here and the stamper stays layout-agnostic.
  const relPath = resourcePath.startsWith(rootDir + "/")
    ? resourcePath.slice(rootDir.length + 1)
    : resourcePath.replace(/^.*\//, "");

  try {
    callback(null, stamp(source, resourcePath, relPath), inputMap, meta);
  } catch {
    // A parse failure here is a DEV CONVENIENCE failing, never a reason the dev
    // server cannot compile a file: hand back the untouched source. The file
    // simply carries no stamps, and the HUD shows its ancestors instead.
    callback(null, source, inputMap, meta);
  }
};

/** Insert ` data-loc="path:line:col"` after the attribute list of every host element. */
function stamp(source, fileName, relPath) {
  if (!ts) ts = require("typescript");

  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    fileName.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.TSX,
  );

  const edits = [];
  const visit = (node) => {
    if (
      node.kind === ts.SyntaxKind.JsxOpeningElement ||
      node.kind === ts.SyntaxKind.JsxSelfClosingElement
    ) {
      const tag = node.tagName;
      // Host elements only: a plain identifier starting lowercase. Components
      // (<Modal>), member expressions (<Foo.Bar>) and namespaced names are out.
      if (tag.kind === ts.SyntaxKind.Identifier && /^[a-z]/.test(tag.text)) {
        // Idempotent — never double-stamp, and never overwrite a hand-written
        // data-loc (the inspector reads the first one it finds on an element).
        const already = node.attributes.properties.some(
          (p) =>
            p.kind === ts.SyntaxKind.JsxAttribute &&
            p.name &&
            p.name.kind === ts.SyntaxKind.Identifier &&
            p.name.escapedText === ATTR,
        );
        if (!already) {
          // `<` of this element, past any leading trivia — the position a human
          // reading the file would call "where this element is".
          const start = ts.skipTrivia(source, node.pos);
          const { line, character } = sf.getLineAndCharacterOfPosition(start);
          // AFTER the attribute list, so a spread that happens to carry data-loc
          // still wins — same precedence a hand-written last attribute has.
          // For `<div>` the empty attribute list ends right after `div`; for
          // `<br />` it ends before the ` />`. Both land correctly.
          edits.push({
            pos: node.attributes.end,
            text: ` ${ATTR}="${relPath}:${line + 1}:${character + 1}"`,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  if (edits.length === 0) return source;

  // Apply back-to-front so every recorded offset stays valid.
  edits.sort((a, b) => b.pos - a.pos);
  let out = source;
  for (const e of edits) out = out.slice(0, e.pos) + e.text + out.slice(e.pos);
  return out;
}
