// Shared fixtures for the golden-path dynamic probes.
import { test } from "@playwright/test";

import { PHASES, type PhaseKey, type PhaseState, type Project } from "@/lib/projects";

/**
 * Snapshot `vars` before each test and put them back after it.
 *
 * playwright.config.ts states this lane's independence contract out loud:
 * the probes share ONE Node process, they run serially, and "independence
 * here comes from state reset inside each probe, never from worker
 * isolation, because there is no worker isolation."
 *
 * Seven probes mutate `process.env`; three restored it and four only set up.
 * Nothing fails today — measured 2026-08-29, every one of the 37 files passes
 * alone as well as in the suite — but the four were leaving a configured
 * access secret, a deleted dev-auth flag and a spend ceiling behind them for
 * every later file in alphabetical order. The next probe that reads one of
 * those inherits a verdict somebody else set up, and because the lane is
 * serial it would not flake: it would just be quietly wrong, in one
 * direction, forever.
 *
 * Snapshot-and-restore rather than the blind `delete` the music probes use:
 * a variable the developer legitimately has in `.env.local` should come back,
 * not vanish for the rest of the run.
 *
 * Call it at FILE SCOPE, above the probe's own `beforeEach` — Playwright runs
 * hooks in registration order, so the snapshot has to be registered first.
 */
export function keepEnv(vars: readonly string[]): void {
  const saved: Record<string, string | undefined> = {};
  test.beforeEach(() => {
    for (const v of vars) saved[v] = process.env[v];
  });
  test.afterEach(() => {
    for (const v of vars) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
  });
}

const allEmpty = (): Record<PhaseKey, PhaseState> =>
  Object.fromEntries(PHASES.map((p) => [p, "empty"])) as Record<PhaseKey, PhaseState>;

/** A valid Project with the fields ProjectsMatrix actually reads. */
export function mkProject(
  id: string,
  updatedAt: number,
  progress: Partial<Record<PhaseKey, PhaseState>> = {},
): Project {
  return {
    id,
    uid: "u1",
    title: `Project ${id}`,
    logline: "",
    template: "explainer" as Project["template"],
    targetS: 90,
    createdAt: updatedAt - 10_000,
    updatedAt,
    phase: "research",
    progress: { ...allEmpty(), ...progress },
  } as Project;
}

/** Walk a Playwright/React element tree, counting elements and collecting testids. */
export function walkTree(node: unknown, acc: { n: number; testids: string[]; handlers: unknown[] }) {
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const c of node) walkTree(c, acc);
    return;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type !== undefined && el.props !== undefined) {
    acc.n++;
    const tid = el.props["data-testid"];
    if (typeof tid === "string") acc.testids.push(tid);
    if (typeof el.props.onClick === "function") acc.handlers.push(el.props.onClick);
    walkTree(el.props.children, acc);
  }
}

export const noopProps = {
  onOpen: () => {},
  onEdit: () => {},
  onDelete: () => {},
  onCreate: () => {},
};
