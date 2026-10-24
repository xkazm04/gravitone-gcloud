// The decided desk's redrive (app/(studio)/board/_board/redrive.ts): every answer is said and the
// desk re-reads after it - a landed redrive, the kernel's refusal verbatim, and a Server Action
// that rejected instead of answering.

import { describe, expect, it } from "vitest";

import { redriveAndSay, type Redrive } from "../../app/(studio)/board/_board/redrive.ts";

async function run(redrive: Redrive): Promise<{ readonly said: string[]; readonly refreshed: number }> {
  const said: string[] = [];
  let refreshed = 0;
  await redriveAndSay(redrive, "pkt:forge:r1", (m) => said.push(m), () => void refreshed++);
  return { said, refreshed };
}

describe("the redrive", () => {
  it("a landed redrive is said and the desk re-reads", async () => {
    expect(await run(async ({ id }) => ({ ok: true, value: { id } }))).toEqual({ said: ["v1 apply · redriven"], refreshed: 1 });
  });

  it("a refusal says the kernel's sentence verbatim", async () => {
    const r = await run(async () => ({ ok: false, error: { error: "decision: packet pkt:forge:r1 has no stuck apply", code: "refused" } }));
    expect(r).toEqual({ said: ["decision: packet pkt:forge:r1 has no stuck apply"], refreshed: 1 });
  });

  it("an action that rejects is said, not left unhandled", async () => {
    const r = await run(() => Promise.reject(new Error("fetch failed")));
    expect(r).toEqual({ said: ["fetch failed"], refreshed: 1 });
  });
});
