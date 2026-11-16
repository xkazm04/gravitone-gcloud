// THE SONG LAB SPECIMENS' DATA (spark yue2-song-lab S2): literal views in the shapes the port hands the
// knockout desk, chosen so every state shows once - a bracket with a hold, an upset, a neither, a bye
// and the glowing match; a blind match and a cut-pending one; a reveal that names its upset; the
// band listening with three proposals and with nobody listening; a batch rendering; the field.
import type {
  BlindMatchView,
  BracketView,
  DirectorView,
  EntrantView,
  FieldTakeView,
  JobRowView,
  MatchView,
  NextRowView,
  RevealView,
} from "@gt/ui/components/songlab/songlab.ts";

const NC = { short: "NC", licence: "CC BY-NC 4.0" } as const;
const e = (seed: number, label: string, cond: string): EntrantView => ({ seed, label, cond, rights: NC });

const S1 = e(1, "off 1.5 r8 s8", "cot off · cfg 1.5 · rank8 ×0.5 · seed 8");
const S8 = e(8, "full 2.0 s1", "cot full · cfg 2.0 · seed 1");
const S4 = e(4, "full 1.5 s1", "cot full · cfg 1.5 · seed 1");
const S5 = e(5, "off 1.5 s4", "cot off · cfg 1.5 · seed 4");
const S3 = e(3, "off def r8 s2", "cot off · cfg def · rank8 ×0.5 · seed 2");
const S6 = e(6, "full 1.0 s1", "cot full · cfg 1.0 · seed 1");
const S2 = e(2, "off 1.5 s1", "cot off · cfg 1.5 · seed 1");

const m = (id: string, round: MatchView["round"], slot: number, status: MatchView["status"], a: MatchView["a"], b: MatchView["b"], extra: Partial<MatchView> = {}): MatchView => ({ id, round, slot, status, a, b, lit: false, ...extra });

export const KIT_BRACKET: BracketView = {
  rounds: [
    {
      round: "QF",
      name: "QF",
      matches: [
        m("QF-1", "QF", 1, "done", { kind: "entrant", entrant: S1, mark: "won" }, { kind: "entrant", entrant: S8, mark: "out" }, { outcome: "won", lit: true }),
        m("QF-2", "QF", 2, "done", { kind: "entrant", entrant: S4, mark: "out" }, { kind: "entrant", entrant: S5, mark: "upset" }, { outcome: "upset", lit: true }),
        m("QF-3", "QF", 3, "done", { kind: "entrant", entrant: S3, mark: "neither" }, { kind: "entrant", entrant: S6, mark: "neither" }, { outcome: "neither" }),
        m("QF-4", "QF", 4, "bye", { kind: "entrant", entrant: S2, mark: "walked" }, { kind: "ghost", text: "bye", seed: 7 }, { outcome: "walkover", lit: true }),
      ],
      decided: 3,
      of: 3,
      open: 0,
    },
    {
      round: "SF",
      name: "SF",
      matches: [
        m("SF-1", "SF", 1, "open", { kind: "entrant", entrant: S1 }, { kind: "entrant", entrant: S5 }),
        m("SF-2", "SF", 2, "walk", { kind: "ghost", text: "empty — no winner" }, { kind: "entrant", entrant: S2, mark: "walked" }, { outcome: "walkover", lit: true }),
      ],
      decided: 0,
      of: 1,
      open: 1,
    },
    { round: "F", name: "final", matches: [m("F-1", "F", 1, "tbd", { kind: "ghost", text: "winner of SF 1" }, { kind: "entrant", entrant: S2 })], decided: 0, of: 1, open: 0 },
  ],
  decided: 3,
  total: 5,
  upsets: 1,
  open: 1,
};

export const KIT_CHAMPION: BracketView = { ...KIT_BRACKET, champion: { entrant: S5 } };

export const KIT_MATCH: BlindMatchView = {
  matchId: "SF-1",
  title: "SF · match 1",
  drawName: "main draw",
  pairId: "0000000000000000",
  arms: [
    { arm: "a", src: "/api/sound/ab/0000000000000000/a" },
    { arm: "b", src: "/api/sound/ab/0000000000000000/b" },
  ],
  window: "cut",
  windowS: 25,
  vs: [S1, S5],
};

export const KIT_CUTTING: BlindMatchView = { ...KIT_MATCH, window: "cutting" };

export const KIT_REVEAL: RevealView = {
  matchId: "QF-2",
  title: "QF · match 2",
  drawName: "main draw",
  answers: { lyrics: "b", vocal: "a", release: "b" },
  arms: [
    { arm: "a", entrant: S4, gate: "pass", scores: [{ label: "wer", value: "1.9%", tone: "worse" }, { label: "diction", value: "1.9%" }, { label: "SongEval", value: "3.92", tone: "better" }, { label: "natural.", value: "3.78", tone: "worse" }, { label: "buzz dB", value: "7.5", tone: "worse" }] },
    { arm: "b", entrant: S5, gate: "pass", scores: [{ label: "wer", value: "1.9%", tone: "better" }, { label: "diction", value: "1.9%" }, { label: "SongEval", value: "3.90", tone: "worse" }, { label: "natural.", value: "3.80", tone: "better" }, { label: "buzz dB", value: "6.1", tone: "better" }] },
  ],
  winnerArm: "b",
  outcome: "upset",
  line: "seed 5 over seed 4, SongEval had it 3.92 to 3.90",
  verdicts: { lyrics: { agree: "meters tie", detail: "wer 1.9% vs 1.9%" }, vocal: { agree: "differs", detail: "natural. 3.78 vs 3.80" }, release: { agree: "differs", detail: "SongEval 3.90 vs 3.92" } },
  windowS: 25,
};

const { winnerArm: _winner, ...UNDECIDED } = KIT_REVEAL;
export const KIT_NEITHER: RevealView = {
  ...UNDECIDED,
  matchId: "QF-3",
  title: "QF · match 3",
  answers: { lyrics: "neither", vocal: "neither", release: "neither" },
  defect: "vocal-garble",
  arms: [
    { ...KIT_REVEAL.arms[0], entrant: S3 },
    { ...KIT_REVEAL.arms[1], entrant: S6, gate: "unscored", scores: [] },
  ],
  outcome: "neither",
  line: "QF · both out · vocal-garble",
  verdicts: { lyrics: { agree: "neither", detail: "" }, vocal: { agree: "neither", detail: "" }, release: { agree: "neither", detail: "" } },
};

export const KIT_DIRECTOR: DirectorView = {
  presence: "listening",
  line: { at: "15:53", text: "While you were away I seeded 16 of the 18 takes that pass the lyric gate and booked 15 matches; the first waits for your ear." },
  proposals: [
    { turnId: "t1", id: "p1", kind: "rule", label: "one render, one entry", why: "s1_cotfull and full 1.0 s1 match on all 16 scores", state: "open" },
    { turnId: "t1", id: "p2", kind: "launch", label: "wildcard · 8 seeds of cot off · cfg 1.5", why: "5 of 8 passed the gate there; ≥ 1 keeper ≈ 99%", state: "kept" },
    { turnId: "t1", id: "p3", kind: "post", label: "soft debuzz + master on the finalists", why: "heavy debuzz took s3_cotfull buzz 2.6 → 18.5 dB; soft → −2.4", state: "open" },
  ],
  ran: [
    { k: "takes", line: "18 of 23 renders pass the lyric gate (wer ≤ 0.10)" },
    { k: "queue_pairs", line: "booked 8 main-draw matches and 6 post-draw matches" },
  ],
  learned: [{ k: "meters", line: "cot off · cfg 1.5 passes the gate 5 of 8" }],
  ranSum: "35 takes · 18 past gate · 16 seeded · 2 cut",
  learnedSum: "upsets 1 of 3",
  inbox: 0,
};

export const KIT_AWAY: DirectorView = { ...KIT_DIRECTOR, presence: "nobody", waiting: "less chorus looping", proposals: [], inbox: 2, learnedSum: "ear: no votes yet" };

export const KIT_NEXT: readonly NextRowView[] = [
  { matchId: "R16-2", drawId: "000000000001", round: "R16", label: "8 full 2.0 s1 × 9 off 1.5 s7", field: "main" },
  { matchId: "QF-2", drawId: "000000000002", round: "QF", label: "4 v2·stems·master × 5 v0·master", field: "post" },
];

export const KIT_JOBS: readonly JobRowView[] = [
  { id: "job:yue2-render:k1", label: "render · wildcard · 8 seeds of cot off · cfg 1.5", state: "running", done: 3, total: 8, stage: "render" },
  { id: "job:yue2-post:k2", label: "post · ab-window", state: "queued", done: 0, total: 1 },
];

export const KIT_FIELD: readonly FieldTakeView[] = [
  { key: "1", label: "off 1.5 r8 s8", cond: "cot off · cfg 1.5 · rank8 ×0.5 · seed 8", gate: "pass", songEval: 4.062, wer: 0.0192, durationS: 48.2, rights: NC, seed: 1 },
  { key: "2", label: "off 1.5 r8 s3", cond: "cot off · cfg 1.5 · rank8 ×0.5 · seed 3", gate: "pass", songEval: 3.308, wer: 0.0385, durationS: 31.7, rights: NC },
  { key: "3", label: "off 2.0 s1", cond: "cot off · cfg 2.0 · seed 1", gate: "fail", songEval: 3.61, wer: 0.2308, durationS: 131.2, rights: NC },
  { key: "4", label: "off 1.5 s9", cond: "cot off · cfg 1.5 · seed 9", gate: "unscored", durationS: 46.1, rights: NC },
];
