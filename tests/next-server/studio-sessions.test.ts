// THE STUDIO'S SCRIPTED SESSIONS PASS THE AGENT'S DOOR (spark audio-agent-studio, stage S1): every turn
// of every fixture session parses through @gt/domain/audio.studio.door exactly as an agent's turn would,
// and the only pieces dropped are the two "vlog-beat" breaks on purpose - so a variant that shows the
// dropped-piece disclosure is exercised, and a fixture typo is caught here, not on screen.
import { describe, expect, it } from "vitest";

import { parseStudioTurn } from "@gt/domain/audio.studio.door";

import { FIXTURE_SESSIONS } from "../../app/(studio)/audio/studio/_port/fixtureSessions.ts";

describe("studio fixture sessions", () => {
  const all = FIXTURE_SESSIONS.flatMap((s) => s.turns.map((t, i) => ({ session: s.id, i, r: parseStudioTurn(t) })));

  it("every turn passes the envelope", () => {
    expect(all.filter((x) => !x.r.ok).map((x) => `${x.session}#${x.i}`)).toEqual([]);
  });

  it("drops exactly the two pieces broken on purpose", () => {
    const dropped = all.flatMap((x) => (x.r.ok ? x.r.value.dropped.map((d) => `${x.session}#${x.i} ${d.at} ${d.reason}`) : []));
    expect(dropped).toEqual([
      'vlog-beat#1 show[4] unknown kind "waterfall3d"',
      'vlog-beat#1 actions[4] names piece "no-such-duel", which is not on screen',
    ]);
  });

  it("alternates user and agent, in sequence, and every proposal a user turn answers exists before it", () => {
    for (const s of FIXTURE_SESSIONS) {
      const turns = s.turns.map((t) => parseStudioTurn(t)).flatMap((r) => (r.ok ? [r.value.turn] : []));
      expect(turns.map((t) => t.from)).toEqual(turns.map((_, i) => (i % 2 === 0 ? "user" : "agent")));
      expect(turns.map((t) => t.seq)).toEqual(turns.map((_, i) => i + 1));
      const proposed = new Set<string>();
      for (const t of turns) {
        if (t.action !== undefined) expect(proposed.has(t.action), `${s.id} ${t.id} answers ${t.action}`).toBe(true);
        t.actions.forEach((a) => proposed.add(a.id));
      }
    }
  });

  it("covers every node kind across the sessions, and marks the v2 arrangement illustrative", () => {
    const kinds = new Set(all.flatMap((x) => (x.r.ok ? x.r.value.turn.show.map((n) => n.kind) : [])));
    expect([...kinds].sort()).toEqual(["candidates", "duel", "heard", "measures", "pull", "sections", "stems", "suno_prompt", "taste", "track"]);
    const eight = all.flatMap((x) => (x.r.ok ? x.r.value.turn.show : [])).find((n) => n.kind === "stems" && n.rows.length === 8);
    expect(eight?.source).toBe("illustrative");
  });
});
