// EVERY COUNT IS A DOOR — a <Tally> or a <StackBar> segment can become the
// filter for the set it counts, with the selection held in the URL.
//
// Pure-props renders, as resize-keyboard does for ResizeHandle: Playwright's
// transform turns the JSX of any imported .tsx into plain {type, props} objects,
// so these call the component as a function (a stub dispatcher answers its
// useContext) and flatten the tree it returns to markup. No browser, no router.
// The URL half is proved through the pure reader/writer the hook is built on.
import { test, expect } from "@playwright/test";
import * as React from "react";
import Link from "next/link";

import { StackBar, Tally, type TabDef } from "@/components/ui/signal";
import { readCountFilter, writeCountFilter } from "@/components/ui/signal/useCountFilter";
import { matchesDoor } from "@/app/calendar/view";

type Node = unknown;
interface El {
  type: unknown;
  props: Record<string, unknown>;
}

/** A hook dispatcher that answers useContext with the context's default. */
function withContextDefaults<T>(run: () => T): T {
  const internals = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown } })
    .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const prev = internals.H;
  internals.H = { useContext: (c: { _currentValue: unknown }) => c._currentValue };
  try {
    return run();
  } finally {
    internals.H = prev;
  }
}

const isEl = (n: Node): n is El => typeof n === "object" && n !== null && "props" in n && "type" in n;

/** Flatten a returned tree to markup-ish text: tags, the attributes asserted on, text. */
function flat(n: Node): string {
  if (n === null || n === undefined || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(flat).join("");
  if (!isEl(n)) return "";
  const { children, ...rest } = n.props;
  if (typeof n.type === "function" && n.type !== (Link as unknown)) return flat(withContextDefaults(() => (n.type as (p: unknown) => Node)(n.props)));
  const attrs = Object.entries(rest)
    .filter(([, v]) => typeof v === "string" || typeof v === "boolean")
    .map(([k, v]) => ` ${k === "className" ? "class" : k}="${v}"`)
    .join("");
  const tag = typeof n.type === "string" ? n.type : "a"; // the only non-DOM, non-function type here is next/link
  return `<${tag}${attrs}>${flat(children as Node)}</${tag}>`;
}

const render = (f: (p: never) => Node, props: object) => withContextDefaults(() => f(props as never));
const html = (f: (p: never) => Node, props: object) => flat(render(f, props));
const TallyFn = Tally as unknown as (p: never) => Node;
const StackBarFn = StackBar as unknown as (p: never) => Node;

test("1. zero is not news: tone applies only above zero unless zero=keep", () => {
  const zero = html(TallyFn, { value: 0, tone: "amber" });
  expect(zero).toContain("text-white/60");
  expect(zero).not.toContain("amber");
  expect(html(TallyFn, { value: 0, tone: "amber", zero: "keep" })).toContain("amber");
  expect(html(TallyFn, { value: 2, tone: "amber" })).toContain("amber");
});

test("2. select renders a button with aria-pressed and the same spoken name", () => {
  const out = html(TallyFn, { value: 2, label: "missed", select: { pressed: false, onToggle: () => {} } });
  expect(out).toMatch(/^<button[^>]*aria-pressed="false"/);
  expect(out).toContain('<span class="sr-only">missed 2</span>');
  expect(html(TallyFn, { value: 2, label: "missed", select: { pressed: true, onToggle: () => {} } })).toContain(
    'aria-pressed="true"',
  );
});

test("2b. href renders a link with the same chip", () => {
  const out = html(TallyFn, { value: 2, label: "missed", href: "/calendar?only=missed" });
  expect(out).toMatch(/^<a[^>]*href="\/calendar\?only=missed"/);
  expect(out).toContain("missed 2");
});

test("3. StackBar onSegment: a non-empty segment is a button, a zero one is not", () => {
  const out = html(StackBarFn, {
    segments: [
      { n: 3, tone: "emerald", label: "kept" },
      { n: 0, tone: "rose", label: "rejected" },
    ],
    onSegment: () => {},
    selected: "kept",
  });
  expect(out.match(/<button/g)?.length).toBe(1);
  expect(out).toContain('aria-pressed="true"');
  expect(out).toContain("rejected 0");
  // without onSegment nothing is interactive
  expect(
    html(StackBarFn, { segments: [{ n: 3, tone: "emerald", label: "kept" }] }),
  ).not.toContain("<button");
});

test("4. useCountFilter's reader and writer round-trip through the URL", () => {
  const qs = writeCountFilter("tab=schedule", "only", "missed");
  expect(qs).toBe("tab=schedule&only=missed");
  expect(readCountFilter(qs, "only")).toBe("missed");
  expect(readCountFilter(writeCountFilter(qs, "only", null), "only")).toBeNull();
  expect(writeCountFilter(qs, "only", null)).toBe("tab=schedule");
  expect(readCountFilter("", "only")).toBeNull();
});

test("5. a TabRail tally cannot carry a select door", () => {
  const ok: TabDef<"a"> = { id: "a", label: "A", tally: { value: 1 } };
  const bad: TabDef<"a"> = {
    id: "a",
    label: "A",
    // @ts-expect-error select is a door on a standalone Tally, never inside a tab button
    tally: { value: 1, select: { pressed: false, onToggle: () => {} } },
  };
  expect(ok.tally?.value).toBe(1);
  expect(bad.id).toBe("a");
});

test("6. filtered to missed, exactly the missed slots match (2 of 9)", () => {
  const status = ["missed", "failed", "scheduled", "scheduled", "publishing", "published", "published", "scheduled", "cancelled"] as const;
  const slots = status.map((s) => ({ status: s }));
  expect(slots.filter((s) => matchesDoor(s, "missed"))).toHaveLength(2);
  expect(slots.filter((s) => matchesDoor(s, "booked"))).toHaveLength(4);
  expect(slots.filter((s) => matchesDoor(s, "aired"))).toHaveLength(2);
});
