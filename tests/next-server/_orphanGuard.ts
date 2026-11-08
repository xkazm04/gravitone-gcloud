// A TIMED-OUT TEST KEEPS RUNNING. Vitest fails the test at its deadline but cannot stop the body, so the
// orphan's next statements land in whatever test runs after it. Two ways that was measured to corrupt the next
// test (2026-11-08, one injected stall failing 6 of 11 in scout-direction): the orphan's runCli reaches its
// `finally` and closes the process kernel the next test has just opened (`store: closed`), and it goes on
// issuing CLI calls against the file's shared night. The original timeout stays exactly as it was reported;
// this only keeps it from becoming someone else's failure.

import { AsyncLocalStorage } from "node:async_hooks";

import { aroundEach } from "vitest";

/**
 * Wrap a test file's CLI caller. Each test runs in its own async context; when it ends, a call still in flight is
 * waited for before the next test starts, and a later call from that test's body is refused (the context, not the
 * clock, says whose body it is). Call this at the top of the file, not inside a test.
 */
export function guardOrphans<A extends unknown[], R>(call: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  const owner = new AsyncLocalStorage<{ ended: boolean }>();
  const running = new Set<Promise<unknown>>();
  aroundEach(async (runTest) => {
    const me = { ended: false };
    try {
      await owner.run(me, runTest);
    } finally {
      me.ended = true;
      while (running.size > 0) await Promise.allSettled([...running]);
    }
  });
  return (...args) => {
    if (owner.getStore()?.ended === true) return Promise.reject(new Error("this test already ended (it timed out); its body ran on and this call was refused"));
    const p = call(...args);
    running.add(p);
    const done = (): void => void running.delete(p);
    p.then(done, done);
    return p;
  };
}
