"use client";

// THE COVER DESK'S FIXTURE (spark track-mirror-studio, WP3): one cover per state, audio synthesized in the
// browser, and stand-in acts that move the fixture through the flow (receipt, a stale confirm once, five takes,
// a pick, a remix), so the three layouts are driven before the engine and the doors exist. Reached with
// `/audio?s=cover&fixture=<state>` on a development build only (./useDesk.ts reads the switch); a production
// build never honours it. Nothing here touches a store, a route or a vendor.
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { CoverCard, CoverDeskView, CoverRecord, CoverState, CoverTake } from "@gt/domain/cover";
import type { Receipt } from "@gt/domain/produce";

import type { CoverActs } from "../contract.ts";
import type { Sender } from "./send.ts";

// An act's success, in the ActionResult shape the contract answers.
const ok = <T,>(value: T) => ({ ok: true as const, value });

export const FIXTURE_STATES = ["empty", "draft", "queued", "rendering", "failed", "judging", "picked", "remixed"] as const;
export type FixtureState = (typeof FIXTURE_STATES)[number];

const RATE = 16_000;
const SONG_S = 64;
const SEEDS = [41_877_203, 9_020_114, 77_310_552, 3_405_918, 60_118_734];
const NOTES = [220, 246.9, 277.2, 329.6, 370, 440, 493.9, 554.4];

/** A 16-bit mono WAV of a little tune: phrases of eighth notes, louder in its middle third, the timbre the seed's. */
function wav(seconds: number, seed: number): string {
  const n = Math.floor(seconds * RATE);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  const beat = 0.25;
  const bright = 1 + (seed % 4);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const k = Math.floor(t / beat);
    const f = NOTES[(k * 3 + Math.floor(k / 8) + seed) % NOTES.length] ?? 220;
    const inNote = (t % beat) / beat;
    const env = Math.exp(-inNote * 4) * (0.35 + 0.65 * Math.abs(Math.sin((t / seconds) * Math.PI * 1.5)));
    let s = 0;
    for (let h = 1; h <= bright; h++) s += Math.sin(2 * Math.PI * f * h * t) / h;
    const kick = t % 1 < 0.08 ? Math.sin(2 * Math.PI * 55 * t) * (1 - (t % 1) / 0.08) : 0;
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s * env * 0.3 + kick * 0.5)) * 32_767, true);
  }
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

type Sounds = { readonly source: string; readonly takes: readonly string[]; readonly remix: string };

const at = (minutesAgo: number): string => new Date(Date.UTC(2026, 10, 7, 20, 0) - minutesAgo * 60_000).toISOString();

function takesFor(state: CoverState | "rendering-2" | "failed-1"): CoverTake[] {
  return SEEDS.map((seed, i): CoverTake => {
    const n = i + 1;
    const done: CoverTake = { n, seed, state: "done", file: `takes/s${seed}.flac`, renderS: 58 + i * 3 };
    if (state === "draft" || state === "queued") return { n, seed, state: "pending" };
    if (state === "rendering-2") return n <= 2 ? done : { n, seed, state: "pending" };
    if (state === "failed-1") return n === 4 ? { n, seed, state: "failed", error: "Prompt outputs failed validation: YuE2Sampler: CUDA out of memory. Tried to allocate 1.20 GiB" } : n === 5 ? { n, seed, state: "pending" } : done;
    return done;
  });
}

function card(sounds: Sounds, r: CoverRecord, dropped: ReadonlyMap<string, string>): CoverCard {
  const takeUrls: Record<number, string> = {};
  r.takes.forEach((t, i) => {
    if (t.file !== undefined) takeUrls[t.seed] = sounds.takes[i] ?? sounds.source;
  });
  return { record: r, sourceUrl: dropped.get(r.id) ?? sounds.source, takeUrls, ...(r.exportFile === undefined ? {} : { winnerUrl: sounds.takes[1] ?? sounds.source }), ...(r.remix === undefined ? {} : { remixUrl: sounds.remix }) };
}

const base = (id: string, title: string, minutesAgo: number): Omit<CoverRecord, "state" | "takes"> => ({
  id: `cov-${id}`,
  createdAt: at(minutesAgo),
  title,
  rights: "third-party-uncleared",
  holder: "Tears for Fears",
  source: { file: "source.mp3", mime: "audio/mpeg", name: `${title}.mp3`, durationS: SONG_S },
  section: { startS: 12, endS: 36 },
  style: "",
  lyrics: "",
});

function records(): Record<Exclude<FixtureState, "empty">, CoverRecord> {
  const styled = { style: "lo-fi hip hop, dusty rhodes, vinyl crackle, slow swung drums, warm bass", sourceStyle: "80s synth-pop, gated snare, driving bass, wide pads" };
  return {
    draft: { ...base("0000000000a1", "Mad World", 4), rights: "own", state: "draft", takes: [] },
    queued: { ...base("0000000000a2", "Shout", 30), ...styled, state: "queued", takes: takesFor("queued"), jobId: "job:cover:cov-0000000000a2" },
    rendering: { ...base("0000000000a3", "Head Over Heels", 60), ...styled, state: "rendering", score: "score.abc", takes: takesFor("rendering-2"), jobId: "job:cover:cov-0000000000a3" },
    failed: { ...base("0000000000a4", "Pale Shelter", 120), ...styled, rights: "licensed", state: "failed", score: "score.abc", takes: takesFor("failed-1"), jobId: "job:cover:cov-0000000000a4" },
    judging: { ...base("0000000000a5", "Everybody Wants to Rule the World", 200), ...styled, state: "judging", score: "score.abc", takes: takesFor("judging"), jobId: "job:cover:cov-0000000000a5" },
    picked: { ...base("0000000000a6", "Sowing the Seeds", 400), ...styled, state: "picked", score: "score.abc", takes: takesFor("picked"), winnerSeed: SEEDS[1] ?? 0, exportFile: "winner.mp3", jobId: "job:cover:cov-0000000000a6" },
    remixed: {
      ...base("0000000000a7", "Woman in Chains", 900),
      ...styled,
      state: "picked",
      score: "score.abc",
      takes: takesFor("picked"),
      winnerSeed: SEEDS[1] ?? 0,
      exportFile: "winner.mp3",
      remix: { file: "remix.mp3", mime: "audio/mpeg", name: "woman-in-chains-suno-v5.mp3", style: "lo-fi hip hop, tape-saturated rhodes, brushed drums, upright bass, 72 bpm" },
      jobId: "job:cover:cov-0000000000a7",
    },
  };
}

function receipt(id: string, startS: number, endS: number, salt: number): Receipt {
  const now = Date.UTC(2026, 10, 7, 20, 0);
  const iso = (s: number): string => new Date(now + s * 1000).toISOString();
  const step = (key: string, label: string, model: string, from: number, seconds: number) =>
    ({ key, label, lane: "gpu.local", provider: "comfy", model, units: 1, seconds, usd: 0, src: "illustrative", queuePos: 1 + salt, start: iso(from), end: iso(from + seconds) }) as const;
  const lines = [step("transcribe", "transcribe", "sheetsage2", 0, 40), ...[1, 2, 3, 4, 5].map((n) => step(`render-${n}`, `render-${n}`, "yue2", 40 + (n - 1) * 60, 60))];
  const seconds = lines.reduce((a, l) => a + l.seconds, 0);
  return { token: `fx-${id}-${startS}-${endS}-${salt}`, subject: { kind: "run", lane: "audio" }, mode: "dry", lines, totals: { seconds, usd: 0, unpriced: 0, src: "illustrative" }, queuePos: 1 + salt, etaAt: iso(seconds + salt * 60), overCeiling: false, readAt: iso(0) };
}

// One set of sounds per page load, kept for its life: a fixture is a development page, and its blob URLs go
// with the tab.
let made: Sounds | null = null;
const clientSounds = (): Sounds => (made ??= { source: wav(SONG_S, 0), takes: SEEDS.map((seed) => wav(24, seed)), remix: wav(30, 7) });
const serverSounds = (): Sounds | null => null;
const noSubscribe = (): (() => void) => () => undefined;

const recordsFor = (state: FixtureState): CoverRecord[] => (state === "empty" ? [] : Object.values(records()));
const currentFor = (state: FixtureState): string | undefined => (state === "empty" ? undefined : records()[state].id);

export type FixtureDesk = { readonly view: CoverDeskView | null; readonly acts: CoverActs; readonly sender: Sender; readonly refresh: () => void; readonly select: (id: string | undefined) => void };

export function useFixture(state: FixtureState): FixtureDesk {
  // The audio is made in the browser only: the server's snapshot is none, so hydration matches and the
  // client's first render after it carries the sounds.
  const sounds = useSyncExternalStore(noSubscribe, clientSounds, serverSounds);
  const [recs, setRecs] = useState<CoverRecord[]>(() => recordsFor(state));
  const [currentId, setCurrentId] = useState<string | undefined>(() => currentFor(state));
  // A new `?fixture=` starts the fixture over (React's reset-on-prop pattern, during render).
  const [forState, setForState] = useState(state);
  if (forState !== state) {
    setForState(state);
    setRecs(recordsFor(state));
    setCurrentId(currentFor(state));
  }
  const staleOnce = useRef(true);
  // A song dropped on the fixture plays as itself.
  const [dropped, setDropped] = useState<ReadonlyMap<string, string>>(new Map());

  const change = useCallback((id: string, f: (r: CoverRecord) => CoverRecord) => setRecs((rs) => rs.map((r) => (r.id === id ? f(r) : r))), []);

  const view = useMemo((): CoverDeskView | null => {
    if (sounds === null) return null;
    const covers = recs.map((r) => card(sounds, r, dropped));
    const current = covers.find((c) => c.record.id === currentId);
    return { covers, ...(current === undefined ? {} : { current }) };
  }, [sounds, recs, currentId, dropped]);

  const acts = useMemo(
    (): CoverActs => ({
      launch: async (plan, token) => {
        if (token === undefined) return ok({ kind: "receipt", receipt: receipt(plan.id, plan.startS, plan.endS, 0) });
        if (staleOnce.current) {
          staleOnce.current = false;
          return ok({ kind: "stale", fresh: receipt(plan.id, plan.startS, plan.endS, 1) });
        }
        change(plan.id, (r) => ({ ...r, state: "queued", section: { startS: plan.startS, endS: plan.endS }, style: plan.style, lyrics: plan.lyrics, ...(plan.sourceStyle === undefined ? {} : { sourceStyle: plan.sourceStyle }), takes: takesFor("queued"), jobId: `job:cover:${plan.id}` }));
        return ok({ kind: "launched", jobId: `job:cover:${plan.id}` });
      },
      // WP0 stand-in; WP-B makes the fixture walk queued -> running -> done and launch the cover.
      brief: async () => ok({ kind: "launched", jobId: "job:cover-brief:fixture" }),
      pick: async (id, seed) => {
        change(id, (r) => ({ ...r, state: "picked", winnerSeed: seed, exportFile: "winner.mp3" }));
        return ok({ winnerUrl: sounds?.takes[1] ?? "" });
      },
      saveStyles: async (id, styles) => {
        change(id, (r) => ({ ...r, ...(styles.sourceStyle === undefined ? {} : { sourceStyle: styles.sourceStyle }), ...(styles.remixStyle === undefined || r.remix === undefined ? {} : { remix: { ...r.remix, style: styles.remixStyle } }) }));
        return ok(undefined);
      },
    }),
    [change, sounds],
  );

  // A queued fixture advances one take per refresh, as the job would between two reads.
  const refresh = useCallback(() => {
    setRecs((rs) =>
      rs.map((r) => {
        if (r.state !== "queued" && r.state !== "rendering") return r;
        const next = r.takes.findIndex((t) => t.state === "pending");
        if (next < 0) return { ...r, state: "judging" };
        const takes = r.takes.map((t, i): CoverTake => (i === next ? { ...t, state: "done", file: `takes/s${t.seed}.flac`, renderS: 60 } : t));
        return { ...r, state: takes.every((t) => t.state === "done") ? "judging" : "rendering", score: "score.abc", takes };
      }),
    );
  }, []);

  const sender = useMemo(
    (): Sender => ({
      source: async (f) => {
        const id = `cov-${Date.now().toString(16).slice(-12).padStart(12, "0")}`;
        const r: CoverRecord = { ...base(id.slice(4), f.title, 0), id: `cov-${id.slice(4)}`, rights: f.rights, state: "draft", takes: [], source: { file: "source.mp3", mime: f.file.type, name: f.file.name, durationS: SONG_S } };
        const { holder: _h, ...rest } = r;
        setRecs((rs) => [{ ...rest, ...(f.holder.trim() === "" ? {} : { holder: f.holder.trim() }) }, ...rs]);
        setDropped((m) => new Map(m).set(r.id, URL.createObjectURL(f.file)));
        setCurrentId(r.id);
        return { ok: true, id: r.id };
      },
      remix: async (f) => {
        change(f.id, (r) => ({ ...r, remix: { file: "remix.mp3", mime: f.file.type, name: f.file.name, style: f.style } }));
        return { ok: true, id: f.id };
      },
    }),
    [change],
  );

  return { view, acts, sender, refresh, select: setCurrentId };
}
