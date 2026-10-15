// LANE - THE AST QUERY LAYER ANSWERS FROM THE PROGRAM, NOT THE TEXT (source).
//
// _ast.ts is the instrument the source probes migrate onto, so it is held to the
// failure modes that made the text scanners unsafe: a comment that looks like
// code, a comment that looks like a block opener, a rule written twice in one
// handler. Each case is seeded with the hazard and carries a negative control.
import { test, expect } from "@playwright/test";
import ts from "typescript";

import { callsTo, fn, fnIn, projectFiles, switchCase, walk } from "./_ast";

/** The unsound text strip, built from parts so this file does not itself carry
 *  the block-first pair that comment-strip-ratchet hunts for. */
function blockFirstStrip(src: string): string {
  const block = new RegExp([String.raw`\/`, String.raw`\*`, String.raw`[\s\S]*?`, String.raw`\*`, String.raw`\/`].join(""), "g");
  const line = /^\s*\/\/.*$/gm;
  return src.replace(block, "").replace(line, "");
}

/** Parse a fixture string as a standalone source file (no program needed). */
function fixture(src: string): ts.SourceFile {
  return ts.createSourceFile("fixture.tsx", src, ts.ScriptTarget.ES2017, true, ts.ScriptKind.TSX);
}

test("fn() returns commitRun's body with its status guard", () => {
  const text = fn("lib/foundry/store.ts", "commitRun").getText();
  expect(text).toContain("COMMITTABLE");
});

test("fn() survives a block-looking route glob in a line comment above the function", () => {
  // The hazard comment-strip-ratchet records: a route glob written in a LINE
  // comment contains a block opener; a block-first text strip treats it as real
  // and eats everything to the next genuine terminator, including the guard.
  const src = [
    "// every route under /api/foundry/* is gated",
    "export function guarded(x: number) {",
    "  if (x < 0) throw new Error('no');",
    "  return x;",
    "}",
    "/* a later, genuine block comment */",
  ].join("\n");
  const body = fnIn(fixture(src), "guarded").getText();
  expect(body).toContain("throw new Error");
  // Negative control: the text strip really does lose it, so the case above is
  // proving the layer's immunity and not a fixture that cannot hurt anything.
  const naive = blockFirstStrip(src);
  expect(naive).not.toContain("throw new Error");
});

test("a call that exists only in a comment is not a node", () => {
  const sf = fixture("function f() {\n  // preventDefault();\n  /* preventDefault(); */\n  return 1;\n}");
  const calls: string[] = [];
  walk(sf, (n) => {
    if (ts.isCallExpression(n)) calls.push(n.getText());
  });
  expect(calls).toEqual([]);
  expect(callsTo("preventDefault", sf)).toEqual([]);
  const live = fixture("function f(e: Event) { e.preventDefault(); }");
  expect(callsTo("preventDefault", live)).toHaveLength(1);
});

test("callsTo('addEventListener') with a \"keydown\" first argument is derived across app/ and components/", () => {
  const t0 = Date.now();
  const files = new Set(
    callsTo("addEventListener", ["app", "components"])
      .filter((c) => c.arg0 === "keydown")
      .map((c) => c.file),
  );
  console.log(`[ast] keydown population: ${Date.now() - t0}ms, ${files.size} files`);
  expect(projectFiles().length, "the file list is empty - wrong root set").toBeGreaterThan(100);
  // The foundry surfaces cull-keys used to hand-list (ExtractBoard, StripGrid) retired
  // in Phase 3; the population is still derived, and still not small.
  expect(files.size).toBeGreaterThan(3);
});

test("switchCase() returns the Enter case of EVERY switch in a handler, not the first", () => {
  const sf = fixture(
    [
      "function handler(e: KeyboardEvent, mode: string) {",
      "  switch (e.key) {",
      '    case "Enter": e.preventDefault(); break;',
      '    case "Escape": break;',
      "  }",
      "  switch (mode) {",
      '    case "a": switch (e.key) { case "Enter": go(); break; }',
      "  }",
      "}",
    ].join("\n"),
  );
  const handler = fnIn(sf, "handler");
  expect(switchCase(handler, "Enter")).toHaveLength(2);
  // Negative controls: an absent label is empty, and a comment spelling of a case
  // is not a clause.
  expect(switchCase(handler, "Tab")).toHaveLength(0);
  const commented = fixture('function h(k: string) {\n  // case "Enter":\n  switch (k) { case "x": break; }\n}');
  expect(switchCase(commented, "Enter")).toHaveLength(0);
});

test("fn() refuses a missing or ambiguous subject instead of returning nothing", () => {
  expect(() => fn("lib/foundry/store.ts", "noSuchFunctionAnywhere")).toThrow(/found 0/);
  expect(() => fnIn(fixture("function a() {}\nfunction a() {}"), "a")).toThrow(/found 2/);
});
