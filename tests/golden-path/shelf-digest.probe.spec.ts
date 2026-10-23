// LANE — SHELF-A: the shelf reads what a project holds (moonshots 2026-10-05 SHELF-A, retargeted
// by capture pass 5 onto ProjectSummary over the kernel's records).
//
// The digest is DERIVED at read from the project's own step records, in the list's snapshot:
//   1. two projects get different posters and runtimes from their own records;
//   2. a project with no picture or no cut reads null, and the list draws it as unknown, not 0;
//   3. a term found only in a project's content (notebook, script) filters the list to it.
// The real kernel over an in-memory store; no vendor, no file. The kernel is imported by relative
// path so the probe reads the tree it sits in, not a linked checkout of the workspace packages.
import { expect, test } from "@playwright/test";

import { ok } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { openKernel } from "../../packages/kernel/src/kernel.ts";
import { writePart } from "../../packages/kernel/src/parts/driver.ts";
import { listProjects } from "../../packages/kernel/src/records/read.ts";
import { compose } from "../../packages/kernel/src/records/write.ts";
import type { Store } from "../../packages/kernel/src/store.ts";

import { matches, posterSrc, runtimeWords } from "@/app/(studio)/projects/_plan/shelf";

const OP: Actor = { kind: "operator", id: "op" };
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function must<T>(r: { ok: true; value: T } | { ok: false; error: Error }): T {
  if (!r.ok) throw r.error;
  return r.value;
}

function put(s: Store, projectId: string, kind: string, records: Record<string, unknown>): void {
  const at = { projectId, partId: `${projectId}/${kind}` };
  must(writePart(s, { ...at, baseRev: 1, act: "op", op: {}, label: kind, by: OP, next: () => ok(records) }));
}

function shelf() {
  const k = must(openKernel(":memory:"));
  must(compose(k.store, { recipe: "album-video" }, OP, { id: "alb" }));
  must(compose(k.store, { recipe: "film/trailer", topic: "tidal harbour tariffs" }, OP, { id: "flm" }));
  put(k.store, "alb", "still", { still: { takes: [{ id: "t1", blob: { sha256: SHA_A, bytes: 10, mime: "image/png" } }], adopted: "t1" } });
  put(k.store, "flm", "frames", { frames: { renderId: "r", units: [{ id: "u1", plate: { state: "empty" }, elements: [], texts: [] }, { id: "u2", plate: { state: "ready", blob: { sha256: SHA_B, bytes: 10, mime: "image/jpeg" } }, elements: [], texts: [] }] } });
  put(k.store, "flm", "script", { "script-trailer": { cut: { beats: [{ id: "b1", at: "0:00", label: "open" }, { id: "b2", at: "1:30", label: "lighthouse reveal" }] } } });
  put(k.store, "flm", "research", { "research-notebook": { topic: "harbour", notebook: { findings: ["the quarantine ledger of 1893"] } } });
  const list = must(listProjects(k.store, { now: Date.parse("2026-10-19T08:00:00.000Z") }));
  const by = new Map(list.projects.map((p) => [p.id, p]));
  return { k, alb: by.get("alb")!, flm: by.get("flm")!, all: list.projects };
}

test("two projects get different posters and runtimes from their own records", () => {
  const { k, alb, flm } = shelf();
  try {
    expect(alb.poster).toEqual({ sha256: SHA_A, mime: "image/png" });
    expect(flm.poster).toEqual({ sha256: SHA_B, mime: "image/jpeg" });
    expect(posterSrc(alb.poster!)).not.toBe(posterSrc(flm.poster!));
    expect(flm.runtimeS).toBe(90);
    expect(flm.targetS).toBeGreaterThan(0);
    expect(runtimeWords(flm)).toMatch(/^1:30 \/ \d+:\d\d$/);
  } finally {
    k.close();
  }
});

test("a null runtime or poster is unknown, never zero", () => {
  const k = must(openKernel(":memory:"));
  try {
    must(compose(k.store, { recipe: "film/trailer" }, OP, { id: "bare" }));
    const p = must(listProjects(k.store, { now: Date.now() })).projects[0]!;
    expect(p.poster).toBeNull();
    expect(p.runtimeS).toBeNull();
    expect(runtimeWords(p)).toMatch(/^\? \/ /);
    expect(runtimeWords({ runtimeS: null, targetS: null })).toBeNull();
    expect(runtimeWords({ runtimeS: 0, targetS: 60 })).toBe("0:00 / 1:00");
  } finally {
    k.close();
  }
});

test("a term found only in a project's content filters the list to that project", () => {
  const { k, alb, flm, all } = shelf();
  try {
    expect(flm.title.toLowerCase()).not.toContain("quarantine");
    expect(all.filter((p) => matches(p, "quarantine")).map((p) => p.id)).toEqual(["flm"]);
    expect(all.filter((p) => matches(p, "lighthouse reveal")).map((p) => p.id)).toEqual(["flm"]);
    expect(all.filter((p) => matches(p, "tariffs")).map((p) => p.id)).toEqual(["flm"]);
    expect(matches(alb, "quarantine")).toBe(false);
    expect(all.filter((p) => matches(p, "")).length).toBe(2);
  } finally {
    k.close();
  }
});
