// THE SHELL'S RECEIPT QUEUE (app/(studio)/_shell/toast.ts): one message at a time, a newer
// receipt replaces the older and restarts the TOAST_MS clock (the prototype's GT.toast), and a
// closed receipt keeps its words (the region fades them out) but not its ledger door.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { noReceipt, receipt, showToast, subscribeReceipts, TOAST_MS } from "../../app/(studio)/_shell/toast.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
});

describe("the shell's toast queue", () => {
  it("shows a receipt, then closes it after TOAST_MS keeping its words", () => {
    showToast("queued 3 jobs");
    expect(receipt()).toEqual({ message: "queued 3 jobs", open: true });
    vi.advanceTimersByTime(TOAST_MS);
    expect(receipt()).toEqual({ message: "queued 3 jobs", open: false });
  });

  it("a newer receipt replaces the older and restarts the clock", () => {
    showToast("first");
    vi.advanceTimersByTime(TOAST_MS - 100);
    showToast("second", { href: "/ledger?q=job_9", subject: "job_9" });
    vi.advanceTimersByTime(200);
    // The first receipt's clock must not close the second one early.
    expect(receipt().open).toBe(true);
    expect(receipt()).toEqual({ message: "second", open: true, ledger: { href: "/ledger?q=job_9", subject: "job_9" } });
    vi.advanceTimersByTime(TOAST_MS);
    expect(receipt()).toEqual({ message: "second", open: false });
  });

  it("tells every subscriber, and stops telling one that left", () => {
    let heard = 0;
    const leave = subscribeReceipts(() => heard++);
    showToast("a");
    expect(heard).toBe(1);
    leave();
    showToast("b");
    expect(heard).toBe(1);
  });

  it("the server snapshot is closed", () => {
    expect(noReceipt()).toEqual({ message: "", open: false });
  });
});
