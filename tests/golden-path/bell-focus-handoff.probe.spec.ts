// LANE — A BELL CONTROL THAT REMOVES ITSELF HANDS FOCUS TO THE TRAY.
// The tray lists unread events only, so mark-all-read, event dismiss, interrupted
// clear and storage-trouble dismiss each unmount the clicked element and focus
// falls to <body> (the cost Modal.tsx documents). The panel is tabIndex=-1.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const CALLS = ["markAllRead", "clearStorageTrouble", "clear(act.jobId)", "markRead(act.eventId)"];

test("each self-removing bell onClick also focuses the panel", () => {
  const s = stripComments(readFileSync(join(process.cwd(), "components/ui/NotificationBell.tsx"), "utf8"));
  expect(s.length).toBeGreaterThan(0);
  const missing: string[] = [];
  for (const call of CALLS) {
    const re = new RegExp("onClick=[{][^]{0,60}?" + call.replace(/[()]/g, "[$&]"));
    const m = re.exec(s);
    expect(m, `onClick using ${call}`).not.toBeNull();
    const handler = s.slice(m!.index, s.indexOf("className=", m!.index));
    if (!handler.includes("panelRef.current?.focus()")) missing.push(call);
  }
  expect(missing).toEqual([]);
});
