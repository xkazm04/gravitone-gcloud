// LANE — A CHORD IS NOT A VERDICT (dynamic + derived wiring).
//
// The foundry surfaces bind bare K / X / U / Enter on `window`. None checked a
// modifier, so Ctrl+K (the browser's search), Ctrl+X (cut) and Ctrl+U (view
// source) each also stamped keep / reject / clear on the focused plate, and a
// held K decided every tile the focus passed. Measured 2026-10-05: 5 of 5
// window keydown handlers under app/foundry had neither guard (moonshot backlog
// Q3). The Board's own handler already refuses both.
//
// The rule is `refusedKey` (app/foundry/keyGuard.ts), driven here; the second
// test holds every window keydown handler under app/foundry to calling it first,
// population derived from the directory, comments stripped.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { nextUndecided, refusedKey } from "@/app/foundry/keyGuard";

import { stripComments } from "./_helpers";

test("a chord is refused: Ctrl/Cmd/Alt + any key is the browser's or the OS's", () => {
  for (const key of ["k", "K", "x", "u", "Enter", "ArrowRight"]) {
    expect(refusedKey({ key, ctrlKey: true }), `Ctrl+${key}`).toBe(true);
    expect(refusedKey({ key, metaKey: true }), `Cmd+${key}`).toBe(true);
    expect(refusedKey({ key, altKey: true }), `Alt+${key}`).toBe(true);
  }
});

test("a held decision key is refused; a held arrow still walks", () => {
  for (const key of ["k", "x", "u", "Enter"]) expect(refusedKey({ key, repeat: true }), `held ${key}`).toBe(true);
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"]) expect(refusedKey({ key, repeat: true }), `held ${key}`).toBe(false);
});

test("a plain press is the surface's, Shift included (K and k both keep)", () => {
  for (const key of ["k", "K", "x", "X", "u", "Enter", "ArrowLeft"]) {
    expect(refusedKey({ key }), key).toBe(false);
    expect(refusedKey({ key, shiftKey: true } as { key: string }), `Shift+${key}`).toBe(false);
  }
});

test("every window keydown handler under app/foundry consults refusedKey before reading the key", () => {
  const dir = resolve(__dirname, "../../app/foundry");
  const files = readdirSync(dir).filter((f) => /\.tsx$/.test(f));
  expect(files.length, "the app/foundry walk found nothing — wrong tree").toBeGreaterThan(3);
  const handlers: string[] = [];
  const unguarded: string[] = [];
  for (const f of files) {
    const src = stripComments(readFileSync(join(dir, f), "utf8"));
    if (!/window\.addEventListener\("keydown"/.test(src)) continue;
    handlers.push(f);
    const guard = src.search(/\brefusedKey\(\s*e\s*\)/);
    const firstRead = src.search(/switch\s*\(\s*e\.key\s*\)|e\.key\s*===/);
    if (guard < 0 || firstRead < 0 || guard > firstRead) unguarded.push(f);
  }
  expect(handlers.length, "no window keydown handler found — the walk read nothing").toBeGreaterThanOrEqual(5);
  expect(unguarded).toEqual([]);
});

test("N: the next undecided item after the focus, wrapping round, skipping what cannot take a verdict", () => {
  const order = ["a", "b", "c", "d"];
  const open = new Set(["a", "c"]);
  const isOpen = (id: string) => open.has(id);
  expect(nextUndecided(order, "a", isOpen)).toBe("c");
  expect(nextUndecided(order, "c", isOpen)).toBe("a"); // wraps
  expect(nextUndecided(order, null, isOpen)).toBe("a"); // no focus: from the top
  expect(nextUndecided(order, "gone", isOpen)).toBe("a"); // a focus no longer listed
  expect(nextUndecided(order, "a", (id) => id === "a")).toBe("a"); // the only one left is itself
  expect(nextUndecided(order, "b", () => false)).toBeNull();
  expect(nextUndecided([], null, () => true)).toBeNull();
});
