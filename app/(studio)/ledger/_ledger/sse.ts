// THE EVENT STREAM'S WIRE, read - pure, so the frame rules are tested without a socket.
//
// app/_server/sse.ts writes four things: an event frame (`id: <seq>` + `data: <Event>`), a
// control frame (`event: reset|rotate|fail` + `data:`), a `retry:` hint, and a HEARTBEAT
// COMMENT (`: hb`). A browser EventSource drops comments before application code, by the
// spec - which would make the heartbeat invisible to exactly the reader that needs it: the
// freshness edge reads silence past 35 s as "not live", and an idle ledger sends nothing BUT
// heartbeats. So the page reads the stream with fetch and parses frames itself; this is that
// parser. A comment is a frame of its own here, and the freshness edge counts it as contact.

export type Frame =
  | { readonly kind: "event"; readonly id: number | null; readonly data: string }
  | { readonly kind: "control"; readonly name: string; readonly data: string }
  | { readonly kind: "comment" }
  | { readonly kind: "retry"; readonly ms: number };

/**
 * Split `buffer` into complete frames and the incomplete tail to keep. A frame ends at a
 * blank line; `\r\n` and `\r` line ends are normalised first (the SSE spec allows all
 * three). A frame with no data and no comment (a lone `id:`) yields nothing.
 */
export function parseFrames(buffer: string): { readonly frames: readonly Frame[]; readonly rest: string } {
  const text = buffer.replace(/\r\n?/g, "\n");
  const blocks = text.split("\n\n");
  const rest = blocks.pop() ?? "";
  const frames: Frame[] = [];
  for (const block of blocks) {
    let id: number | null = null;
    let event: string | null = null;
    const data: string[] = [];
    let comment = false;
    for (const line of block.split("\n")) {
      if (line === "") continue;
      if (line.startsWith(":")) {
        comment = true;
        continue;
      }
      const at = line.indexOf(":");
      const field = at < 0 ? line : line.slice(0, at);
      const value = at < 0 ? "" : line.slice(at + 1).replace(/^ /, "");
      if (field === "id") {
        const n = Number(value);
        id = Number.isSafeInteger(n) ? n : null;
      } else if (field === "event") event = value;
      else if (field === "data") data.push(value);
      else if (field === "retry") {
        const ms = Number(value);
        if (Number.isSafeInteger(ms) && ms >= 0) frames.push({ kind: "retry", ms });
      }
    }
    if (data.length > 0) frames.push(event === null || event === "message" ? { kind: "event", id, data: data.join("\n") } : { kind: "control", name: event, data: data.join("\n") });
    else if (comment) frames.push({ kind: "comment" });
  }
  return { frames, rest };
}

/** Reconnect delay after the n-th consecutive failure: the server's hint, doubled, capped. */
export function backoff(failures: number, hintMs: number, capMs = 30_000): number {
  return Math.min(capMs, hintMs * 2 ** Math.max(0, failures - 1));
}
