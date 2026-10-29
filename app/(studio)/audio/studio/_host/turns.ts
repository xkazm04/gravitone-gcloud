// THE USER'S TURN, COMPOSED (spark audio-agent-studio, stage S2), pure. Everything the person sends
// to the agent is one user StudioTurn: words typed in the dock, a proposal pressed (`action` = its
// id, `text` = its label, or a `say` proposal's own words), or "keep this mix" (`mix` = the live
// mixer settings of the newest stems piece, by stem id, for the agent to bake into the score).
// The host (./StudioHost.tsx) composes it here; the `say` Server Action (../_live/say.ts) holds it
// to the door. Client-safe: types only from @gt/domain.
import type { StudioAction, StudioNodeOf, StudioTurn } from "@gt/domain/audio.studio";
import type { ParsedTurn } from "@gt/domain/audio.studio.door";
import type { StemMix } from "@gt/ui/components/audio/mix.ts";

/** What the person asks: words, or a pressed proposal (its id and words), or a mix to keep. */
export type UserAsk = { readonly text: string; readonly action?: string; readonly mix?: NonNullable<StudioTurn["mix"]> };

/** The ask a pressed agent-bound proposal makes: its id, and its words (`say` carries its own). */
export const askOf = (a: StudioAction): UserAsk => ({ text: a.kind === "say" ? a.text : a.label, action: a.id });

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

/** A turn id no other message has: `u-<time>-<4 random>` (the ledger key is `audio-say:<id>`). */
export function newTurnId(nowMs: number, random: () => number = Math.random): string {
  let tail = "";
  for (let i = 0; i < 4; i++) tail += BASE36[Math.floor(random() * 36) % 36] ?? "0";
  return `u-${nowMs.toString(36)}-${tail}`;
}

/** The raw user turn the `say` action receives; `seq` = how many turns the conversation holds. */
export function userTurn(ask: UserAsk, id: string, seq: number, at: string): Record<string, unknown> {
  return { v: 1, id, seq, at, from: "user", text: ask.text.trim(), ...(ask.action !== undefined ? { action: ask.action } : {}), ...(ask.mix !== undefined ? { mix: ask.mix } : {}) };
}

/** The newest stems piece across the conversation shown (an older answer's, when the newest has none). */
export function newestStems(turns: readonly ParsedTurn[]): { readonly turnId: string; readonly node: StudioNodeOf<"stems"> } | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]?.turn;
    const node = t?.show.find((n): n is StudioNodeOf<"stems"> => n.kind === "stems");
    if (t !== undefined && node !== undefined) return { turnId: t.id, node };
  }
  return null;
}

type Row = StudioNodeOf<"stems">["rows"][number];
type Kept = NonNullable<StudioTurn["mix"]>[string];

const asRendered = (r: Row): StemMix => ({ ...(r.muted !== undefined ? { muted: r.muted } : {}), ...(r.solo !== undefined ? { solo: r.solo } : {}), ...(r.levelDb !== undefined ? { levelDb: r.levelDb } : {}), ...(r.pan !== undefined ? { pan: r.pan } : {}) });
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round = (v: number, step: number): number => Math.round(v / step) * step;

/** The mix to keep: every stem's live setting (the as-rendered one where the person changed nothing). */
export function keptMix(node: StudioNodeOf<"stems">, mixOf: (id: string, base?: StemMix) => StemMix): NonNullable<StudioTurn["mix"]> {
  const out: Record<string, Kept> = {};
  for (const r of node.rows) {
    const m = mixOf(r.id, asRendered(r));
    out[r.id] = {
      ...(m.muted !== undefined ? { muted: m.muted } : {}),
      ...(m.solo !== undefined ? { solo: m.solo } : {}),
      ...(m.levelDb !== undefined ? { levelDb: round(clamp(m.levelDb, -60, 12), 0.5) } : {}),
      ...(m.pan !== undefined ? { pan: round(clamp(m.pan, -1, 1), 0.05) } : {}),
    };
  }
  return out;
}

const db = (v: number): string => `${v > 0 ? "+" : ""}${v} dB`;
const side = (p: number): string => (Math.abs(p) < 0.05 ? "in the middle" : `${p < 0 ? "left" : "right"}`);

/** What keeping the mix changes, stem by stem, in plain words; empty when nothing differs. */
export function mixChanges(node: StudioNodeOf<"stems">, mix: NonNullable<StudioTurn["mix"]>): readonly string[] {
  const out: string[] = [];
  for (const r of node.rows) {
    const k = mix[r.id];
    if (k === undefined) continue;
    const was = asRendered(r);
    const bits: string[] = [];
    if ((k.muted ?? false) !== (was.muted ?? false)) bits.push(k.muted === true ? "muted" : "back in");
    if ((k.solo ?? false) !== (was.solo ?? false)) bits.push(k.solo === true ? "on its own" : "no longer on its own");
    if ((k.levelDb ?? 0) !== (was.levelDb ?? 0)) bits.push(`at ${db(k.levelDb ?? 0)}`);
    if ((k.pan ?? 0) !== (was.pan ?? 0)) bits.push(`${Math.abs(k.pan ?? 0) < 0.05 ? "" : "panned "}${side(k.pan ?? 0)}`);
    if (bits.length > 0) out.push(`${r.label} ${bits.join(", ")}`);
  }
  return out;
}

/** The kept mix's message: what changes, said for a non-musician. */
export function mixText(changes: readonly string[]): string {
  return changes.length === 0 ? "Keep this mix as it is." : `Keep this mix: ${changes.join("; ")}.`;
}
