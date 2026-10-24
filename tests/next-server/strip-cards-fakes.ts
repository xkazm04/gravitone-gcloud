import { writeFileSync } from "node:fs";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";

import type { AgentResult, RunAgentInput } from "../../lib/agent/cliSeam.ts";
import type { Capture } from "../../lib/foundry/strips/steps.ts";
import { fakeCapture, fakeSeat, type SeatScript } from "./producer-strips-harness.ts";

// THE STRIP-CARDS PRODUCER'S FAKES - the strips harness's counted seat and capture
// (./producer-strips-harness.ts), each taught the one thing an explainer card adds:
//   the seat also writes out/caption.json (the explainer addendum's third file), the caption
//     chosen per card and per call so a test can hand one card a 12-word caption and its fix a
//     good one;
//   the capture also writes poster.png - what render.mts copies from the strip's LAST frame - as
//     a real flat-grey PNG, so the blob that lands is an image the cut's ffmpeg can decode and
//     whose luma names its card.
// Nothing here can reach a vendor or a browser.

/** A flat grey PNG, `w` x `h`, 8-bit greyscale: the smallest real image a decoder accepts. */
export function greyPng(level: number, w = 320, h = 180): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const rows = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) rows.fill(level, y * (w + 1) + 1, (y + 1) * (w + 1));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

export const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** `n` words of narration, distinct per card. */
export const captionOf = (card: string, n: number): string => ["Narration", "for", card, ...Array.from({ length: Math.max(0, n - 3) }, (_, i) => `word${i + 1}`)].slice(0, n).join(" ");

export type CardSeat = { calls: string[]; costs: number[]; seat: (input: RunAgentInput) => Promise<AgentResult> };

/** The harness seat, writing `words(card, call)` words of caption (null: no caption file). */
export function cardSeat(words: (card: string, fix: boolean) => number | null = () => 40, script: SeatScript = {}): CardSeat {
  const base = fakeSeat(script);
  return {
    calls: base.calls,
    costs: base.costs,
    seat: async (input) => {
      const r = await base.seat(input);
      const card = path.basename(input.cwd);
      const n = words(card, input.prompt.startsWith("You are revising"));
      if (r.outcome === "completed" && n !== null) writeFileSync(path.join(input.cwd, "out", "caption.json"), JSON.stringify({ caption: captionOf(card, n) }));
      return r;
    },
  };
}

export type CardCapture = { renders: string[]; capture: () => Promise<Capture> };

/** The harness capture, writing each card's poster.png at `grey(card)`; `failing` cards fail
 *  their legibility gate on their first n renders. */
export function cardCapture(grey: (card: string) => number = () => 128, failing: ReadonlyMap<string, number> = new Map()): CardCapture {
  const base = fakeCapture(failing);
  return {
    renders: base.renders,
    capture: async () => {
      const c = await base.capture();
      return {
        ...c,
        render: async (o) => {
          const r = await c.render(o);
          writeFileSync(path.join(o.outDir, "poster.png"), greyPng(grey(path.basename(o.outDir))));
          return r;
        },
      };
    },
  };
}
