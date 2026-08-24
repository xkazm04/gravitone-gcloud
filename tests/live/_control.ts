// THE HARNESS SIDE OF THE CONTROL SURFACE — a typed client, not a bag of
// `page.evaluate` strings.
//
// Both sides are checked against the SAME interface (lib/harness/protocol.ts):
// the product implements `HarnessControl`, and every method below returns one of
// its result types, so a command that changes shape breaks `tsc --noEmit` in CI
// rather than failing at 2am as `undefined is not a function`. The evaluate
// bodies are the only untyped inch and they are confined to this file — which is
// the whole point of having a client at all.

import { expect, type Page } from "@playwright/test";

import type { AccountSnapshot, ProjectReadback, ResetOutcome } from "@/lib/harness/protocol";

/** How long to wait for the control surface after a navigation. The bridge
 *  installs from an effect, so it lands a tick after hydration. */
const CONNECT_MS = 20_000;
/** The protocol this client speaks. Asserted on connect, so a harness/product
 *  skew is reported as a skew. */
const SPEAK = 1;

/** The refusal every command shares: reaching a command through a surface that
 *  is not there means the server is not the one this lane requires. */
const ABSENT =
  "HARNESS FAILURE: no control surface on window. The dev server must be `next dev` " +
  "with NEXT_PUBLIC_DEV_AUTH=1 — the surface is compiled out of any production build. " +
  "See playwright.config.ts's `live` project and components/ui/HarnessBridge.tsx.";

/**
 * Wait for the control surface, assert the protocol, hand back a typed client.
 * Call it after every navigation that reloads the document: a hard load tears
 * the React tree down and the surface with it.
 *
 * A missing surface is a HARNESS FAILURE, never a test failure, and it is
 * spelled as one — it means every assertion after it would be reporting on a
 * product this harness never reached.
 */
export async function connect(page: Page): Promise<Control> {
  try {
    await page.waitForFunction(() => Boolean(window.__gravitoneHarness), undefined, {
      timeout: CONNECT_MS,
    });
  } catch {
    throw new Error(`${ABSENT} (waited ${CONNECT_MS}ms at ${page.url()})`);
  }

  const protocol = await page.evaluate(() => window.__gravitoneHarness?.protocol);
  expect(
    protocol,
    "control-surface protocol skew — the product and tests/live/ are out of step",
  ).toBe(SPEAK);

  return new Control(page);
}

export class Control {
  constructor(private readonly page: Page) {}

  /** "What does the app think this account holds?" */
  snapshot(): Promise<AccountSnapshot> {
    return this.page.evaluate((absent) => {
      const h = window.__gravitoneHarness;
      if (!h) throw new Error(absent);
      return h.snapshot();
    }, ABSENT);
  }

  /** "What did this project actually write to disk?" */
  project(projectId: string): Promise<ProjectReadback> {
    return this.page.evaluate(
      ([id, absent]) => {
        const h = window.__gravitoneHarness;
        if (!h) throw new Error(absent);
        return h.project(id);
      },
      [projectId, ABSENT] as const,
    );
  }

  /** "Start this account from nothing." */
  reset(): Promise<ResetOutcome> {
    return this.page.evaluate((absent) => {
      const h = window.__gravitoneHarness;
      if (!h) throw new Error(absent);
      return h.reset();
    }, ABSENT);
  }

  /**
   * READBACK WITH A DEADLINE — the answer to fire-and-forget.
   *
   * Three outcomes, spelled differently on purpose (registry: live-app-harness,
   * "readback for fire-and-forget"): the predicate holds, and the snapshot comes
   * back; the deadline expires while the surface kept answering, which is a
   * FINDING — the product ran and never reached the state, and the last snapshot
   * is in the message; or the surface stops answering, which `snapshot()` throws
   * as a harness failure. Polling state the product owns is what keeps "no
   * error" from being read as success.
   */
  async until(
    predicate: (s: AccountSnapshot) => boolean,
    what: string,
    timeoutMs = 20_000,
  ): Promise<AccountSnapshot> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const now = await this.snapshot();
      if (predicate(now)) return now;
      if (Date.now() > deadline) {
        throw new Error(
          `READBACK DEADLINE: the product never reached "${what}" within ${timeoutMs}ms. ` +
            `Last snapshot: ${JSON.stringify(now)}`,
        );
      }
      await this.page.waitForTimeout(250);
    }
  }
}
